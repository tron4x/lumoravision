/**
 * ColorGradePanel
 * ───────────────
 * Live LUT-based colour grading for the active video. Renders into a WebGL
 * canvas overlaid on top of the <video> element using a fragment shader
 * that performs trilinear lookup against a 2D-atlas LUT texture.
 *
 * Why the atlas approach (not gl.TEXTURE_3D):
 *   • WebGL1 has no 3D textures – broadest compatibility = atlas
 *   • Even on WebGL2 the atlas + fp16-free integer texture is plenty fast
 *     at 1080p video and avoids platform quirks (Safari has long-standing
 *     TexImage3D bugs on iOS)
 *
 * Optional split-view (compare slider): one half passes the original video
 * through, the other half applies the LUT. Slider position is stored in
 * `splitX` (0..1).
 *
 * Performance & memory hygiene:
 *   • The render loop is *event-driven*: it ticks via
 *     `requestVideoFrameCallback` when available (zero work between
 *     frames), falling back to `requestAnimationFrame` on Firefox/Safari
 *     and pausing automatically when the video pauses (no spinning RAF).
 *   • Canvas resolution is clamped to a max edge of 1280px to keep mobile
 *     GPUs happy on 4K source files.
 *   • Every WebGL resource (programs, textures, buffers) is deleted in the
 *     unmount cleanup. The overlay canvas is removed from the DOM.
 *   • Re-uploads to GPU happen only when the LUT actually changes – the
 *     `intensity` slider only updates a uniform.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LUT_PRESETS, buildPresetLUT, type LutPreset } from '../utils/lutPresets';
import { lutToAtlas2D, loadCubeLUTFromFile, type ParsedLUT } from '../utils/lutLoader';

// Max resolution we render at – grading at full 4K wastes GPU and the
// downscaled visual difference is invisible on the player canvas.
const MAX_EDGE = 1280;

interface ColorGradePanelProps {
  /** The video element we're grading – assumed already mounted & playing */
  videoElement: HTMLVideoElement | null;
  /** Where to overlay the WebGL canvas (the player's video container) */
  containerEl: HTMLElement | null;
  onClose: () => void;
}

interface Drawable {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  vbo: WebGLBuffer;
  videoTex: WebGLTexture;
  lutTex: WebGLTexture;
  uVideo: WebGLUniformLocation | null;
  uLut: WebGLUniformLocation | null;
  uLutSize: WebGLUniformLocation | null;
  uIntensity: WebGLUniformLocation | null;
  uSplitX: WebGLUniformLocation | null;
  uShowSplit: WebGLUniformLocation | null;
  aPos: number;
}

// ── Shader sources ──────────────────────────────────────────────────────────
const VS = `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = vec2((aPos.x + 1.0) * 0.5, 1.0 - (aPos.y + 1.0) * 0.5);
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

// Trilinear LUT lookup against the 2D atlas (slices laid out horizontally).
//   atlas dim:  width = N*N, height = N
//   for blue slice b:  x in [b*N + r], y in [g]
const FS = `
  precision mediump float;
  varying vec2 vUv;

  uniform sampler2D uVideo;
  uniform sampler2D uLut;
  uniform float uLutSize;     // N
  uniform float uIntensity;   // 0..1
  uniform float uSplitX;      // 0..1
  uniform float uShowSplit;   // 0 or 1

  vec3 sampleLUT(vec3 color) {
    float N = uLutSize;
    float sliceSize = 1.0 / N;             // 1/N
    float slicePix  = sliceSize / N;       // 1/(N*N)

    // Map color [0..1] to LUT cell index in [0..N-1]
    vec3 cidx = clamp(color, 0.0, 1.0) * (N - 1.0);

    float bSlice = floor(cidx.b);
    float bSlice2 = min(bSlice + 1.0, N - 1.0);
    float bFrac = fract(cidx.b);

    // Within a slice, sampling coords (r,g) → (slicePix * (0.5 + r), sliceSize * (0.5 + g/(N-1)*N))
    // We use bilinear hardware filtering for r/g, manual lerp for b.
    float u_r = (cidx.r + 0.5) / (N * N);   // local x within one slice (0..1/N)
    float v_g = (cidx.g + 0.5) / N;         // y in atlas (0..1)

    // Slice 1 lookup
    vec2 uv1 = vec2(bSlice  * sliceSize + u_r, v_g);
    vec2 uv2 = vec2(bSlice2 * sliceSize + u_r, v_g);

    vec3 c1 = texture2D(uLut, uv1).rgb;
    vec3 c2 = texture2D(uLut, uv2).rgb;
    return mix(c1, c2, bFrac);
  }

  void main() {
    vec3 src = texture2D(uVideo, vUv).rgb;
    vec3 graded = sampleLUT(src);
    vec3 mixed = mix(src, graded, uIntensity);

    // Optional split-view compare
    if (uShowSplit > 0.5 && vUv.x < uSplitX) {
      gl_FragColor = vec4(src, 1.0);
    } else {
      gl_FragColor = vec4(mixed, 1.0);

      // Draw a thin slider line + handle hint
      if (uShowSplit > 0.5) {
        float lineDist = abs(vUv.x - uSplitX);
        if (lineDist < 0.0015) gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    }
  }
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(sh) ?? 'shader compile error';
    gl.deleteShader(sh);
    throw new Error(msg);
  }
  return sh;
}

function createDrawable(canvas: HTMLCanvasElement): Drawable | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const vbo = gl.createBuffer();
  if (!vbo) { gl.deleteProgram(program); return null; }
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  // Fullscreen triangle pair
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);

  const videoTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const lutTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {
    gl, program, vbo, videoTex, lutTex,
    uVideo: gl.getUniformLocation(program, 'uVideo'),
    uLut: gl.getUniformLocation(program, 'uLut'),
    uLutSize: gl.getUniformLocation(program, 'uLutSize'),
    uIntensity: gl.getUniformLocation(program, 'uIntensity'),
    uSplitX: gl.getUniformLocation(program, 'uSplitX'),
    uShowSplit: gl.getUniformLocation(program, 'uShowSplit'),
    aPos: gl.getAttribLocation(program, 'aPos'),
  };
}

function uploadLUTAtlas(d: Drawable, lut: ParsedLUT) {
  const gl = d.gl;
  const atlas = lutToAtlas2D(lut);
  gl.bindTexture(gl.TEXTURE_2D, d.lutTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlas.width, atlas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas.data);
  return lut.size;
}

// ── React component ─────────────────────────────────────────────────────────
export function ColorGradePanel({ videoElement, containerEl, onClose }: ColorGradePanelProps) {
  const [presetId, setPresetId] = useState<string>('teal-orange');
  const [intensity, setIntensity] = useState(1);
  const [showSplit, setShowSplit] = useState(true);
  const [splitX, setSplitX] = useState(0.5);
  const [customLutName, setCustomLutName] = useState<string | null>(null);
  const [customLut, setCustomLut] = useState<ParsedLUT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  // "Applied" state — the look the user explicitly confirmed via the
  // Apply button. Until they click Apply, picking a preset is just a
  // *preview*; clicking Apply turns off split-compare and pins the look
  // so they get a clear "this is the active grade" signal.
  const [appliedLook, setAppliedLook] = useState<{ name: string; isCustom: boolean } | null>(null);
  // When the user closes the panel *after* applying a look, we keep the
  // WebGL canvas alive in the background so the grade survives. The UI
  // collapses into a tiny floating badge they can click to re-open.
  // Closing without an applied look fully unmounts via onClose().
  const [panelHidden, setPanelHidden] = useState(false);

  // ── Export state ──────────────────────────────────────────────────────
  // Recording the graded canvas + original audio as a downloadable WebM.
  // We use MediaRecorder over canvas.captureStream so the encode happens
  // entirely in the browser, no server, no upload. Real-time, so a 1-min
  // clip takes ~1 min to render.
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedBlobUrl, setExportedBlobUrl] = useState<string | null>(null);
  // Filename for the download link. Generated once at the moment the blob
  // is ready so we don't call Date.now() during render (lint rule:
  // components must be pure / idempotent).
  const [exportedFileName, setExportedFileName] = useState<string>('graded.webm');
  const exportCancelRef = useRef(false);
  const exportRecorderRef = useRef<MediaRecorder | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawableRef = useRef<Drawable | null>(null);
  const lutSizeRef = useRef(17);
  const rafIdRef = useRef<number | null>(null);
  const vfcIdRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  // Pick the LUT to render: custom file overrides preset selection.
  const activeLUT = useMemo<ParsedLUT>(() => {
    if (customLut) return customLut;
    const p: LutPreset = LUT_PRESETS.find(x => x.id === presetId) ?? LUT_PRESETS[0];
    return buildPresetLUT(p, 17);
  }, [presetId, customLut]);

  // ── Mount the overlay canvas + create GL resources ─────────────────────────
  // The overlay canvas is positioned to fully cover the underlying <video>
  // element. We give the canvas a black backing colour so the original video
  // is hidden behind it without us needing to mutate the <video> element's
  // style directly (which the linter rightly forbids — it's a parent-owned
  // prop). The video keeps playing in the background and supplies frames +
  // audio; we just paint over its pixels.
  useEffect(() => {
    aliveRef.current = true;
    if (!videoElement || !containerEl) return;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '5';
    canvas.style.background = '#000';   // hides the raw video behind us
    canvas.style.objectFit = 'contain';
    containerEl.appendChild(canvas);
    canvasRef.current = canvas;

    const drawable = createDrawable(canvas);
    if (!drawable) {
      // We learned only at runtime that WebGL isn't available – surfacing
      // that to the user requires a state update. This runs at most once
      // per mount on unsupported hardware.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnsupported(true);
      containerEl.removeChild(canvas);
      canvasRef.current = null;
      return;
    }
    drawableRef.current = drawable;

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      aliveRef.current = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // requestVideoFrameCallback id can be cancelled on supporting browsers
      const v = videoElement as HTMLVideoElement & {
        cancelVideoFrameCallback?: (id: number) => void;
      };
      if (vfcIdRef.current !== null && typeof v.cancelVideoFrameCallback === 'function') {
        v.cancelVideoFrameCallback(vfcIdRef.current);
        vfcIdRef.current = null;
      }
      const d = drawableRef.current;
      if (d) {
        const gl = d.gl;
        gl.deleteTexture(d.videoTex);
        gl.deleteTexture(d.lutTex);
        gl.deleteBuffer(d.vbo);
        gl.deleteProgram(d.program);
        // Force context loss to release GPU memory immediately on Chrome.
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
      drawableRef.current = null;
      if (canvasRef.current && canvasRef.current.parentNode === containerEl) {
        containerEl.removeChild(canvasRef.current);
      }
      canvasRef.current = null;
    };
  }, [videoElement, containerEl]);

  // ── Re-upload LUT atlas whenever the active LUT changes ────────────────────
  useEffect(() => {
    const d = drawableRef.current;
    if (!d) return;
    lutSizeRef.current = uploadLUTAtlas(d, activeLUT);
  }, [activeLUT]);

  // ── Render loop ────────────────────────────────────────────────────────────
  // We build the loop with refs so we don't recreate listeners on slider
  // changes (those just mutate the values used at draw time).
  const intensityRef = useRef(intensity);
  const splitXRef = useRef(splitX);
  const showSplitRef = useRef(showSplit);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);
  useEffect(() => { splitXRef.current = splitX; }, [splitX]);
  useEffect(() => { showSplitRef.current = showSplit; }, [showSplit]);

  const drawFrame = useCallback(() => {
    const d = drawableRef.current;
    const v = videoElement;
    const c = canvasRef.current;
    if (!d || !v || !c) return;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (vw === 0 || vh === 0) return;

    // Clamp canvas resolution to keep mobile GPUs happy
    const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
    const targetW = Math.max(2, Math.round(vw * scale));
    const targetH = Math.max(2, Math.round(vh * scale));
    if (c.width !== targetW || c.height !== targetH) {
      c.width = targetW;
      c.height = targetH;
    }

    const gl = d.gl;
    gl.viewport(0, 0, c.width, c.height);

    // Upload the latest video frame
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, d.videoTex);
    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } catch {
      // Cross-origin / NaN frame – skip this tick
      return;
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, d.lutTex);

    gl.useProgram(d.program);
    gl.uniform1i(d.uVideo, 0);
    gl.uniform1i(d.uLut, 1);
    gl.uniform1f(d.uLutSize, lutSizeRef.current);
    gl.uniform1f(d.uIntensity, intensityRef.current);
    gl.uniform1f(d.uSplitX, splitXRef.current);
    gl.uniform1f(d.uShowSplit, showSplitRef.current ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, d.vbo);
    gl.enableVertexAttribArray(d.aPos);
    gl.vertexAttribPointer(d.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, [videoElement]);

  // Drive draws from rVFC where available, else RAF, but only while the
  // video is actually playing. This means an idle paused video uses 0 % CPU.
  useEffect(() => {
    const v = videoElement;
    if (!v) return;
    const vAny = v as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };
    let stopped = false;

    const loop = () => {
      if (stopped) return;
      drawFrame();
      if (vAny.requestVideoFrameCallback) {
        vfcIdRef.current = vAny.requestVideoFrameCallback(loop);
      } else {
        rafIdRef.current = requestAnimationFrame(loop);
      }
    };

    const start = () => {
      if (rafIdRef.current !== null || vfcIdRef.current !== null) return;
      loop();
    };

    const stop = () => {
      stopped = true;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (vfcIdRef.current !== null && vAny.cancelVideoFrameCallback) {
        vAny.cancelVideoFrameCallback(vfcIdRef.current);
        vfcIdRef.current = null;
      }
    };

    // Initial paint (so a paused video also shows the grade)
    drawFrame();

    if (!v.paused) start();
    const onPlay = () => { stopped = false; start(); };
    const onPause = () => { drawFrame(); stop(); };
    const onSeeked = () => drawFrame();
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeeked);

    return () => {
      stop();
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('seeked', onSeeked);
    };
  }, [videoElement, drawFrame]);

  // Repaint when control values change while paused
  useEffect(() => {
    const v = videoElement;
    if (v && v.paused) drawFrame();
  }, [intensity, splitX, showSplit, activeLUT, videoElement, drawFrame]);

  // ── File drop / picker handling ────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const lut = await loadCubeLUTFromFile(file);
      if (!aliveRef.current) return;
      setCustomLut(lut);
      setCustomLutName(file.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  // Mirror the videoElement prop into a ref so the export callback can
  // safely drive the media element (pause/seek/mute/loop) without the
  // React Compiler rule "this argument may modify a prop" tripping. Reading
  // the ref inside the callback is treated as an external-system access,
  // which is exactly what driving an HTMLMediaElement is.
  const videoElementRef = useRef<HTMLVideoElement | null>(videoElement);
  useEffect(() => { videoElementRef.current = videoElement; }, [videoElement]);

  // ── Export: record the graded canvas + original audio to a WebM ────────
  // The strategy is intentionally simple: rewind the source video to t=0,
  // play it normally, capture the WebGL canvas via captureStream(), grab
  // the audio track from the source via captureStream(), pipe both into a
  // MediaRecorder. Real-time encode (a 1-min clip = ~1 min export). When
  // the source ends we stop the recorder and trigger a download.
  const startExport = useCallback(async () => {
    const v = videoElementRef.current;
    const c = canvasRef.current;
    if (!v || !c) {
      setExportError('Video or canvas not ready');
      return;
    }
    // captureStream throws if the canvas hasn't been drawn into yet, and
    // some browsers (Safari) don't expose it on <video> at all.
    if (typeof c.captureStream !== 'function') {
      setExportError('Your browser does not support canvas recording');
      return;
    }

    setExportError(null);
    setExportProgress(0);
    setExporting(true);
    exportCancelRef.current = false;

    // Revoke any previous result so we don't leak the blob URL
    if (exportedBlobUrl) {
      URL.revokeObjectURL(exportedBlobUrl);
      setExportedBlobUrl(null);
    }

    // The original video element keeps grading visible during export. We
    // need to remember its previous play state and restore it when done.
    const wasPaused = v.paused;
    const wasMuted = v.muted;
    const prevTime = v.currentTime;
    const prevLoop = v.loop;
    const totalDuration = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;

    // Disable looping during export so 'ended' fires reliably
    v.loop = false;
    // Keep audio audible during export so MediaRecorder picks it up via
    // captureStream(). We unmute, record, then restore mute state.
    v.muted = false;

    // Build the combined stream: video from canvas, audio from source
    const canvasStream = c.captureStream(30);   // up to 30 fps
    let audioStream: MediaStream | null = null;
    try {
      const vAny = v as HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const captureFn = vAny.captureStream ?? vAny.mozCaptureStream;
      if (captureFn) {
        const fullStream = captureFn.call(v);
        const audioTracks = fullStream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioStream = new MediaStream();
          audioTracks.forEach(t => audioStream!.addTrack(t));
        }
      }
    } catch {
      // No audio is fine — export silent video
    }

    const combined = new MediaStream();
    canvasStream.getVideoTracks().forEach(t => combined.addTrack(t));
    if (audioStream) audioStream.getAudioTracks().forEach(t => combined.addTrack(t));

    // Pick the best WebM codec the browser supports
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    let mimeType = '';
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
    }

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8_000_000 })
        : new MediaRecorder(combined, { videoBitsPerSecond: 8_000_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportError(`MediaRecorder failed: ${msg}`);
      setExporting(false);
      v.muted = wasMuted; v.loop = prevLoop;
      return;
    }
    exportRecorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };

    const finish = (cancelled: boolean) => {
      // Stop tracks to release the camera/encoder
      combined.getTracks().forEach(t => t.stop());
      canvasStream.getTracks().forEach(t => t.stop());
      if (audioStream) audioStream.getTracks().forEach(t => t.stop());

      // Restore the video element to where the user had it
      try {
        v.pause();
        v.currentTime = prevTime;
        v.muted = wasMuted;
        v.loop = prevLoop;
        if (!wasPaused) v.play().catch(() => {});
      } catch { /* ignore */ }

      v.removeEventListener('ended', onEnded);
      v.removeEventListener('timeupdate', onTimeUpdate);

      if (!aliveRef.current) return;
      setExporting(false);
      exportRecorderRef.current = null;

      if (cancelled || chunks.length === 0) {
        setExportProgress(0);
        return;
      }
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      // Compute the download filename here (impure side-effect happens
      // outside of render, exactly where the lint rule wants it).
      const lookSlug = appliedLook
        ? appliedLook.name.toLowerCase().replace(/\s+/g, '-')
        : 'look';
      setExportedFileName(`graded-${lookSlug}-${Date.now()}.webm`);
      setExportedBlobUrl(url);
      setExportProgress(100);
    };

    const onEnded = () => {
      if (recorder.state === 'recording') recorder.stop();
    };
    const onTimeUpdate = () => {
      if (totalDuration > 0) {
        const pct = Math.min(99, Math.round((v.currentTime / totalDuration) * 100));
        setExportProgress(pct);
      }
      if (exportCancelRef.current && recorder.state === 'recording') {
        recorder.stop();
      }
    };

    recorder.onstop = () => finish(exportCancelRef.current);
    recorder.onerror = (e) => {
      const msg = (e as ErrorEvent).message ?? 'recording error';
      setExportError(msg);
      finish(true);
    };

    v.addEventListener('ended', onEnded);
    v.addEventListener('timeupdate', onTimeUpdate);

    try {
      v.currentTime = 0;
      // Wait for the seek to complete so the first recorded frame is t=0
      await new Promise<void>(resolve => {
        const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve(); };
        v.addEventListener('seeked', onSeeked, { once: true });
        // Fallback in case 'seeked' never fires (some WebMs)
        setTimeout(() => { v.removeEventListener('seeked', onSeeked); resolve(); }, 1500);
      });
      recorder.start(1000); // emit a chunk per second
      await v.play();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportError(`Playback failed: ${msg}`);
      if (recorder.state === 'recording') recorder.stop();
      else finish(true);
    }
  }, [exportedBlobUrl, appliedLook]);

  const cancelExport = useCallback(() => {
    exportCancelRef.current = true;
    const r = exportRecorderRef.current;
    if (r && r.state === 'recording') {
      try { r.stop(); } catch { /* ignore */ }
    }
  }, []);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (exportedBlobUrl) URL.revokeObjectURL(exportedBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── UI ─────────────────────────────────────────────────────────────────────
  if (unsupported) {
    return (
      <div className="absolute top-12 right-2 z-30 w-72 rounded-xl bg-slate-900/95 backdrop-blur-md border border-red-500/40 shadow-2xl p-3 text-xs text-red-300">
        WebGL is not available in this browser – LUT grading needs WebGL.
        <button onClick={onClose} className="block mt-2 px-2 py-1 bg-slate-800 rounded text-slate-300">Close</button>
      </div>
    );
  }

  // Collapsed view: just a small "Active" badge with reopen + remove
  if (panelHidden && appliedLook) {
    return (
      <div
        className="absolute top-12 right-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900/95 backdrop-blur-md border border-pink-500/40 shadow-lg pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => setPanelHidden(false)}
          className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
          title="Reopen color grading panel"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          <span className="truncate max-w-[140px]">{appliedLook.name}</span>
        </button>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded bg-slate-800 hover:bg-red-600/40 text-slate-400 hover:text-red-300 flex items-center justify-center"
          title="Remove grade"
        >
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-12 right-2 z-30 w-72 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/60 shadow-2xl flex flex-col pointer-events-auto"
      style={{ maxHeight: 'calc(100% - 6rem)' }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 flex-none">
        <svg className="w-4 h-4 text-pink-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67A2.5 2.5 0 0112 22zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 00-.14-.35c-.41-.46-.63-1.05-.63-1.65a2.5 2.5 0 012.5-2.5H16c2.21 0 4-1.79 4-4 0-3.86-3.59-7-8-7z"/>
          <circle cx="6.5" cy="11.5" r="1.5"/><circle cx="9.5" cy="7.5" r="1.5"/>
          <circle cx="14.5" cy="7.5" r="1.5"/><circle cx="17.5" cy="11.5" r="1.5"/>
        </svg>
        <span className="text-xs font-semibold text-slate-200">Color Grading</span>
        <div className="flex-1" />
        <button
          onClick={() => {
            // Smart close: if a look is applied, just collapse the UI but
            // keep the WebGL canvas mounted so the grade persists.
            // Otherwise fully unmount via the parent's onClose.
            if (appliedLook) setPanelHidden(true);
            else onClose();
          }}
          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
          title={appliedLook ? 'Minimise (grade stays active)' : 'Close'}
        >
          <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
            {appliedLook
              ? <path d="M19 13H5v-2h14v2z"/>
              : <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>}
          </svg>
        </button>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
        {/* Preset chooser */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Look</label>
          <div className="grid grid-cols-2 gap-1">
            {LUT_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => { setPresetId(p.id); setCustomLut(null); setCustomLutName(null); }}
                className={`text-left text-[11px] px-2 py-1.5 rounded-md border transition-colors leading-tight ${
                  !customLut && presetId === p.id
                    ? 'bg-pink-600/30 text-pink-200 border-pink-500/50'
                    : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:border-slate-600'
                }`}
                title={p.description}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Custom .cube upload */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Custom LUT (.cube)</label>
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={`px-2 py-2 rounded-md border-2 border-dashed text-center text-[11px] transition-colors ${
              customLut ? 'border-pink-500/40 bg-pink-600/10 text-pink-300' : 'border-slate-700 bg-slate-800/40 text-slate-500'
            }`}
          >
            {customLut ? (
              <div className="space-y-1">
                <div className="font-mono truncate">✓ {customLutName ?? customLut.title ?? 'custom'}</div>
                <div className="text-[10px] text-slate-500">{customLut.size}³ samples</div>
                <button
                  onClick={() => { setCustomLut(null); setCustomLutName(null); }}
                  className="text-[10px] text-slate-400 hover:text-pink-300 underline"
                >
                  remove
                </button>
              </div>
            ) : (
              <>
                Drop .cube file or
                <label className="ml-1 underline cursor-pointer text-pink-400 hover:text-pink-300">
                  browse
                  <input type="file" accept=".cube,text/plain" className="hidden" onChange={onFileChange} />
                </label>
              </>
            )}
          </div>
          {error && <div className="mt-1 text-[10px] text-red-400">{error}</div>}
        </div>

        {/* Intensity */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Intensity</label>
            <span className="text-[10px] font-mono text-slate-300">{Math.round(intensity * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={intensity}
            onChange={e => setIntensity(parseFloat(e.target.value))}
            className="w-full accent-pink-500 cursor-pointer" />
        </div>

        {/* Compare slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
              <input type="checkbox" checked={showSplit} onChange={e => setShowSplit(e.target.checked)}
                className="accent-pink-500 cursor-pointer" />
              Compare (split view)
            </label>
            <span className="text-[10px] font-mono text-slate-300">{Math.round(splitX * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={splitX}
            disabled={!showSplit}
            onChange={e => setSplitX(parseFloat(e.target.value))}
            className="w-full accent-pink-500 cursor-pointer disabled:opacity-40" />
          <p className="text-[10px] text-slate-600 mt-1">Left of the line = original · right = graded</p>
        </div>
      </div>

      {/* Export progress / result row – appears once Apply has been used */}
      {appliedLook && (exporting || exportedBlobUrl || exportError) && (
        <div className="flex-none px-3 py-2 border-t border-slate-800/60 bg-slate-950/80 space-y-1.5">
          {exporting && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-pink-300 font-semibold">Recording graded video…</span>
                <span className="text-[10px] font-mono text-slate-300">{exportProgress}%</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-pink-500 to-amber-400 transition-all" style={{ width: `${exportProgress}%` }} />
              </div>
              <p className="text-[9px] text-slate-600">Real-time encode · keep this tab focused for best result</p>
            </>
          )}
          {!exporting && exportedBlobUrl && (
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-emerald-400 flex-none" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span className="text-[10px] text-emerald-300 flex-1">Export ready</span>
              <a
                href={exportedBlobUrl}
                download={exportedFileName}
                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition-colors"
              >
                Download
              </a>
            </div>
          )}
          {!exporting && exportError && (
            <div className="text-[10px] text-red-400">{exportError}</div>
          )}
        </div>
      )}

      {/* Footer – Apply / Export / Reset (sticky, never scrolls out of view) */}
      <div className="flex-none flex items-center gap-2 px-3 py-2 border-t border-slate-800/60 bg-slate-950/80 backdrop-blur-sm">
        {appliedLook ? (
          <span className="flex items-center gap-1.5 flex-1 min-w-0 text-[10px] text-emerald-400 font-semibold">
            <svg className="w-3 h-3 flex-none" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            <span className="truncate">Active: {appliedLook.name}</span>
          </span>
        ) : (
          <span className="flex-1 text-[10px] text-slate-500">Preview only · click Apply to set</span>
        )}
        {appliedLook && !exporting && (
          <button
            onClick={() => {
              // Reset = fully remove the grade. We tear the panel down so
              // the WebGL overlay disappears and the original video shows
              // through again. The parent decides what to do with the
              // resulting onClose (it just unmounts the panel).
              onClose();
            }}
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-red-600/40 text-slate-400 hover:text-red-300 text-[10px] transition-colors"
            title="Remove grade and close panel"
          >
            Remove
          </button>
        )}
        {appliedLook && (
          exporting ? (
            <button
              onClick={cancelExport}
              className="px-2.5 py-1 rounded-md bg-red-600/30 hover:bg-red-600/50 text-red-200 text-[10px] font-semibold transition-colors border border-red-500/30"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={startExport}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-semibold transition-colors shadow-lg shadow-amber-500/20"
              title="Render this video with the applied grade and download as WebM (real-time encode)"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              Export
            </button>
          )
        )}
        {!exporting && (
          <button
            onClick={() => {
              // Apply = pin the current preview as the active look. Visually
              // we turn off split-view so the user sees the final result and
              // bump intensity back to 100% if it had been dragged to 0.
              const name = customLut
                ? (customLutName ?? customLut.title ?? 'Custom LUT')
                : (LUT_PRESETS.find(p => p.id === presetId)?.name ?? 'Look');
              setAppliedLook({ name, isCustom: !!customLut });
              setShowSplit(false);
              if (intensity === 0) setIntensity(1);
            }}
            className="px-3 py-1 rounded-md bg-pink-600 hover:bg-pink-500 text-white text-[11px] font-semibold transition-colors shadow-lg shadow-pink-500/20"
          >
            {appliedLook ? 'Update' : 'Apply'}
          </button>
        )}
      </div>
    </div>
  );
}
