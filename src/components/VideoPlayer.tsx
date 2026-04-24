import { useRef, useState, useEffect, useCallback } from 'react';
import type { VideoFile } from '../types/video';
import { formatDuration } from '../utils/format';
import { detectScenes } from '../utils/sceneDetection';
import type { SceneChapter } from '../utils/sceneDetection';
import { exportGif, downloadBlob } from '../utils/gifExport';
interface VideoPlayerProps {
  video: VideoFile;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function VideoPlayer({ video, onClose, onPrev, onNext, hasPrev, hasNext }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoop, setIsLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hoveredChapter, setHoveredChapter] = useState<SceneChapter | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showScreenshotPanel, setShowScreenshotPanel] = useState(false);
  
  // GIF export state
  const [showGifPanel, setShowGifPanel] = useState(false);
  const [gifStartTime, setGifStartTime] = useState(0);
  const [gifEndTime, setGifEndTime] = useState(5);
  const [gifFps, setGifFps] = useState(10);
  const [gifWidth, setGifWidth] = useState(320);
  const [isExportingGif, setIsExportingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);

  // Scene detection state
  const [sceneKey, setSceneKey] = useState(video.url);
  const [chapters, setChapters] = useState<SceneChapter[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzed, setAnalyzed] = useState(false);

  // Reset scene state when video changes
  if (video.url !== sceneKey) {
    setSceneKey(video.url);
    setChapters([]);
    setIsAnalyzing(false);
    setAnalyzeProgress(0);
    setAnalyzed(false);
  }

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) {
      vid.loop = isLoop;
      vid.playbackRate = playbackRate;
      vid.play().then(() => setIsPlaying(true)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.url]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) vid.loop = isLoop;
  }, [isLoop]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid) vid.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, []);

  // Scene detection
  const runSceneDetection = useCallback(async () => {
    const vid = videoRef.current;
    if (!vid || analyzed || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalyzeProgress(0);
    try {
      const result = await detectScenes(vid, {
        sampleInterval: 2, threshold: 28, maxChapters: 20,
        onProgress: (pct: number) => setAnalyzeProgress(pct),
      });
      setChapters(result.chapters);
    } catch { /* ignore */ }
    finally { setIsAnalyzing(false); setAnalyzed(true); }
  }, [analyzed, isAnalyzing]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current) setShowControls(false);
    }, 3000);
  }, []);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) { vid.play().then(() => setIsPlaying(true)).catch(() => {}); }
    else { vid.pause(); setIsPlaying(false); }
    resetControlsTimer();
  }, [resetControlsTimer]);

  const toggleMute = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setIsMuted(vid.muted);
  }, []);

  const toggleLoop = useCallback(() => { setIsLoop(prev => !prev); }, []);

  const skip = useCallback((seconds: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = Math.max(0, Math.min(vid.duration, vid.currentTime + seconds));
  }, []);

  function jumpToChapter(chapter: SceneChapter) {
    const vid = videoRef.current;
    if (vid) vid.currentTime = chapter.time;
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const bar = progressRef.current;
    const vid = videoRef.current;
    if (!bar || !vid) return;
    const rect = bar.getBoundingClientRect();
    vid.currentTime = ((e.clientX - rect.left) / rect.width) * vid.duration;
  }

  function handleProgressHover(e: React.MouseEvent<HTMLDivElement>) {
    const bar = progressRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const hoverTime = ratio * duration;
    setHoverX(e.clientX - rect.left);
    const nearest = chapters.reduce<SceneChapter | null>((best, ch) => {
      const dist = Math.abs(ch.time - hoverTime);
      if (dist < 3) return best === null || dist < Math.abs(best.time - hoverTime) ? ch : best;
      return best;
    }, null);
    setHoveredChapter(nearest);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const vid = videoRef.current;
    if (!vid) return;
    const val = parseFloat(e.target.value);
    vid.volume = val; setVolume(val); setIsMuted(val === 0); vid.muted = val === 0;
  }

  function handleSpeedChange(rate: number) { setPlaybackRate(rate); setShowSpeedMenu(false); }
  function toggleMaximize() { setIsMaximized(prev => !prev); }
  function toggleFullscreen() {
    const vid = videoRef.current;
    if (!vid) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else vid.requestFullscreen().catch(() => {});
  }

  const takeScreenshot = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    // Pause first so user sees exactly which frame is captured
    if (!vid.paused) { vid.pause(); setIsPlaying(false); }
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth || vid.clientWidth;
    canvas.height = vid.videoHeight || vid.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    const timestamp = formatDuration(vid.currentTime).replace(/:/g, '-');
    const name = video.name.replace(/\.[^/.]+$/, '');
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}_${timestamp}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [video.name]);

  // Step one frame forward/backward (approx. 1/30s)
  const stepFrame = useCallback((direction: 1 | -1) => {
    const vid = videoRef.current;
    if (!vid) return;
    if (!vid.paused) { vid.pause(); setIsPlaying(false); }
    vid.currentTime = Math.max(0, Math.min(vid.duration, vid.currentTime + direction * (1 / 30)));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const vid = videoRef.current;
      if (!vid) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft' && !e.altKey) { e.preventDefault(); skip(-10); }
      else if (e.key === 'ArrowRight' && !e.altKey) { e.preventDefault(); skip(10); }
      else if (e.key === 'j') skip(-10);
      else if (e.key === 'l') skip(10);
      else if (e.key === 'ArrowLeft' && e.altKey) { if (hasPrev) onPrev?.(); }
      else if (e.key === 'ArrowRight' && e.altKey) { if (hasNext) onNext?.(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); vid.volume = Math.min(1, vid.volume + 0.1); setVolume(parseFloat(vid.volume.toFixed(1))); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); vid.volume = Math.max(0, vid.volume - 0.1); setVolume(parseFloat(vid.volume.toFixed(1))); }
      else if (e.key === 'm') toggleMute();
      else if (e.key === 'r') toggleLoop();
      else if (e.key === ',') stepFrame(-1);
      else if (e.key === '.') stepFrame(1);
      else if (e.key === 's') takeScreenshot();
      else if (e.key === 'Escape') { if (showSpeedMenu) setShowSpeedMenu(false); else onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasPrev, hasNext, onPrev, onNext, onClose, showSpeedMenu, togglePlay, toggleMute, toggleLoop, skip, stepFrame, takeScreenshot]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const activeChapterIdx = chapters.reduce((best, ch, i) => ch.time <= currentTime ? i : best, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative flex flex-col bg-slate-950 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-slate-800/60 w-full transition-all duration-300 ${isMaximized ? 'max-w-full rounded-none' : 'max-w-5xl'}`}
        style={{ height: isMaximized ? '100vh' : 'calc(100vh - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/60 flex-none">
          <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 flex-none" title="Close (Esc)" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />

          <p className="flex-1 text-slate-300 text-sm font-medium truncate ml-2">
            {video.name.replace(/\.[^/.]+$/, '')}
          </p>

          {chapters.length > 1 && (
            <span className="text-xs text-cyan-400 flex-none">{chapters[activeChapterIdx]?.label}</span>
          )}

          {/* AI Buttons */}
          <div className="flex items-center gap-1.5 flex-none">
            {/* Detect Chapters */}
            {!analyzed && !isAnalyzing && (
              <button onClick={runSceneDetection} className="flex items-center gap-1 px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 text-xs rounded-lg border border-cyan-500/30 transition-colors">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" /></svg>
                Chapters
              </button>
            )}
            {isAnalyzing && <span className="text-xs text-cyan-400 flex-none">{analyzeProgress}%</span>}

          </div>

          <div className="flex items-center gap-1 flex-none">
            <button onClick={onPrev} disabled={!hasPrev} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center transition-colors" title="Previous (Alt+←)">
              <svg className="w-3.5 h-3.5 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </button>
            <button onClick={onNext} disabled={!hasNext} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center transition-colors" title="Next (Alt+→)">
              <svg className="w-3.5 h-3.5 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
          </div>

          <span className="flex-none text-xs font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">{video.extension}</span>
          <button onClick={onClose} className="flex-none w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>

        {/* Video */}
        <div className="relative bg-black overflow-hidden flex-1 min-h-0" onMouseMove={resetControlsTimer} onMouseEnter={resetControlsTimer}>
          <video
            ref={videoRef}
            src={video.url}
            className="w-full h-full object-contain"
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { if (!isLoop) { setIsPlaying(false); if (hasNext) onNext?.(); } }}
            onClick={togglePlay}
            style={{ cursor: showControls ? 'default' : 'none' }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: showControls && !isPlaying ? 1 : 0, transition: 'opacity 0.2s' }}>
            <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
          {isLoop && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-cyan-600/80 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
              Loop
            </div>
          )}
        </div>

        {/* Chapter strip – fixed height, scrollable, does not push video */}
        {chapters.length > 1 && (
          <div className="flex-none bg-slate-900/60 border-t border-slate-800/40 px-4 py-2" style={{ height: '88px', overflowX: 'auto', overflowY: 'hidden' }}>
            <div className="flex gap-2 h-full items-center">
              {chapters.map((ch, i) => (
                <button key={ch.time} onClick={() => jumpToChapter(ch)}
                  className={`flex-none flex flex-col items-center gap-1 transition-all ${i === activeChapterIdx ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}>
                  {ch.thumbnail
                    ? <img src={ch.thumbnail} alt={ch.label} className={`w-16 h-9 object-cover rounded border-2 ${i === activeChapterIdx ? 'border-cyan-500' : 'border-slate-700'}`} />
                    : <div className={`w-16 h-9 rounded border-2 bg-slate-800 flex items-center justify-center ${i === activeChapterIdx ? 'border-cyan-500' : 'border-slate-700'}`}><span className="text-slate-600 text-xs">{i + 1}</span></div>
                  }
                  <span className="text-xs text-slate-500 font-mono">{formatDuration(ch.time)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex-none bg-slate-900/90 px-4 py-3 border-t border-slate-800/60">
          {/* Progress bar */}
          <div ref={progressRef} className="relative w-full h-1.5 bg-slate-700 rounded-full cursor-pointer mb-3 group/progress hover:h-2.5 transition-all"
            onClick={handleProgressClick} onMouseMove={handleProgressHover} onMouseLeave={() => setHoveredChapter(null)}>
            <div className="h-full bg-cyan-500 rounded-full relative" style={{ width: `${progress}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 shadow-lg" />
            </div>

            {/* Chapter markers */}
            {chapters.map((ch, i) => i > 0 && duration > 0 && (
              <div key={ch.time} className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-white/60 rounded-full" style={{ left: `${(ch.time / duration) * 100}%` }} />
            ))}

            {hoveredChapter && (
              <div className="absolute bottom-5 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white pointer-events-none shadow-xl z-10 whitespace-nowrap" style={{ left: Math.max(0, hoverX - 30) }}>
                {hoveredChapter.label} · {formatDuration(hoveredChapter.time)}
              </div>
            )}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            {/* -10s */}
            <button onClick={() => skip(-10)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors" title="-10s (←)">
              <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
            </button>
            {/* -1 Frame */}
            <button onClick={() => stepFrame(-1)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors" title="1 Frame back (,)">
              <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
            </button>
            {/* Play/Pause */}
            <button onClick={togglePlay} className="w-9 h-9 rounded-lg bg-cyan-600 hover:bg-cyan-500 flex items-center justify-center transition-colors">
              {isPlaying
                ? <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                : <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              }
            </button>
            {/* +1 Frame */}
            <button onClick={() => stepFrame(1)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors" title="1 Frame forward (.)">
              <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
            {/* +10s */}
            <button onClick={() => skip(10)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors" title="+10s (→)">
              <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" /></svg>
            </button>
            <span className="text-slate-400 text-xs font-mono tabular-nums ml-1">{formatDuration(currentTime)} / {formatDuration(duration)}</span>
            <div className="flex-1" />

            <button onClick={toggleLoop} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isLoop ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`} title="Loop (R)">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" /></svg>
            </button>

            <div className="relative">
              <button onClick={() => setShowSpeedMenu(p => !p)} className={`h-8 px-2.5 rounded-lg text-xs font-bold transition-colors ${playbackRate !== 1 ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                {playbackRate === 1 ? '1×' : `${playbackRate}×`}
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-10 right-0 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl z-10 min-w-20">
                  {PLAYBACK_RATES.map(rate => (
                    <button key={rate} onClick={() => handleSpeedChange(rate)} className={`w-full px-4 py-1.5 text-xs text-left transition-colors ${rate === playbackRate ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                      {rate === 1 ? '1× (Normal)' : `${rate}×`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={toggleMaximize} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isMaximized ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`} title="Maximize">
              {isMaximized
                ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
                : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
              }
            </button>
            {/* Screenshot button – toggles the screenshot panel */}
            <button
              onClick={() => { setShowScreenshotPanel(p => !p); setShowGifPanel(false); if (isPlaying) { videoRef.current?.pause(); setIsPlaying(false); } }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showScreenshotPanel ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
              title="Screenshot mode (S)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 14H4V7h4.05l1.83-2h4.24l1.83 2H20v12zM12 8c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/></svg>
            </button>
            {/* GIF Export button */}
            <button
              onClick={() => { 
                setShowGifPanel(p => !p); 
                setShowScreenshotPanel(false);
                if (isPlaying) { videoRef.current?.pause(); setIsPlaying(false); }
                // Set default range from current position
                setGifStartTime(Math.max(0, currentTime - 1));
                setGifEndTime(Math.min(duration, currentTime + 4));
              }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showGifPanel ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
              title="GIF Export (G)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.5 9H13v6h-1.5V9zM9 9H6c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-2H8.5v1.5h-2v-3H10V10c0-.55-.45-1-1-1zm10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1h3z"/></svg>
            </button>
            <button onClick={toggleFullscreen} className="w-8 h-8 rounded-lg bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300 flex items-center justify-center transition-colors" title="Fullscreen">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm16 5h-5v2h7v-7h-2v5z" /></svg>
            </button>

            <div className="flex items-center gap-1.5">
              <button onClick={toggleMute} className="text-slate-500 hover:text-slate-300 transition-colors" title="Mute (M)">
                {isMuted || volume === 0
                  ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" /></svg>
                  : volume < 0.5
                  ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" /></svg>
                  : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                }
              </button>
              <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={handleVolumeChange} className="w-20 accent-cyan-500 cursor-pointer" />
            </div>
          </div>

          {/* ── Screenshot Panel – shown only when user clicks the camera button ── */}
          {showScreenshotPanel && duration > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-800/60">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-3.5 h-3.5 text-cyan-400 flex-none" fill="currentColor" viewBox="0 0 24 24"><path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 14H4V7h4.05l1.83-2h4.24l1.83 2H20v12zM12 8c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/></svg>
                <span className="text-xs font-semibold text-slate-300">Screenshot – Select frame:</span>
                <span className="text-xs text-cyan-400 font-mono ml-auto">{formatDuration(currentTime)}</span>
              </div>

              {/* 1. Frame-Slider */}
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => stepFrame(-1)} className="flex-none w-8 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center transition-colors" title="1 Frame back (,)">‹</button>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={1 / 30}
                  value={currentTime}
                  onChange={e => { const vid = videoRef.current; if (vid) vid.currentTime = parseFloat(e.target.value); }}
                  className="flex-1 accent-cyan-500 cursor-pointer"
                />
                <button onClick={() => stepFrame(1)} className="flex-none w-8 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center transition-colors" title="1 Frame forward (.)">›</button>
              </div>

              {/* 2. Quick-Jump + Save button in one row */}
              <div className="flex items-center gap-1.5">
                {[-60, -10, -1, 1, 10, 60].map(s => (
                  <button key={s} onClick={() => skip(s)} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors">
                    {s > 0 ? `+${s}s` : `${s}s`}
                  </button>
                ))}
                <div className="flex-1" />
                {/* 3. Save button */}
                <button
                  onClick={takeScreenshot}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-cyan-500/20"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
                  Save as PNG
                </button>
              </div>
            </div>
          )}

          {/* ── GIF Export Panel ── */}
          {showGifPanel && duration > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-800/60">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-3.5 h-3.5 text-purple-400 flex-none" fill="currentColor" viewBox="0 0 24 24"><path d="M11.5 9H13v6h-1.5V9zM9 9H6c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-2H8.5v1.5h-2v-3H10V10c0-.55-.45-1-1-1zm10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1h3z"/></svg>
                <span className="text-xs font-semibold text-slate-300">GIF Export – Select range:</span>
                <span className="text-xs text-purple-400 font-mono ml-auto">{(gifEndTime - gifStartTime).toFixed(1)}s duration</span>
              </div>

              {/* Range sliders */}
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-500">Start:</label>
                    <span className="text-xs text-slate-400 font-mono">{formatDuration(gifStartTime)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={gifStartTime}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setGifStartTime(v);
                      if (v >= gifEndTime) setGifEndTime(Math.min(duration, v + 1));
                      if (videoRef.current) videoRef.current.currentTime = v;
                    }}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-500">End:</label>
                    <span className="text-xs text-slate-400 font-mono">{formatDuration(gifEndTime)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={gifEndTime}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setGifEndTime(v);
                      if (v <= gifStartTime) setGifStartTime(Math.max(0, v - 1));
                      if (videoRef.current) videoRef.current.currentTime = v;
                    }}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Settings row */}
              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">FPS:</label>
                  <select
                    value={gifFps}
                    onChange={e => setGifFps(Number(e.target.value))}
                    className="bg-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1 border border-slate-700"
                    disabled={isExportingGif}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={20}>20</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Width:</label>
                  <select
                    value={gifWidth}
                    onChange={e => setGifWidth(Number(e.target.value))}
                    className="bg-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1 border border-slate-700"
                    disabled={isExportingGif}
                  >
                    <option value={240}>240px</option>
                    <option value={320}>320px</option>
                    <option value={480}>480px</option>
                    <option value={640}>640px</option>
                  </select>
                </div>
                <div className="flex-1" />
                <span className="text-xs text-slate-600">
                  ~{Math.round((gifEndTime - gifStartTime) * gifFps)} frames
                </span>
              </div>

              {/* Progress bar */}
              {isExportingGif && (
                <div className="mb-3">
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 transition-all duration-150"
                      style={{ width: `${gifProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-purple-400 text-center mt-1">{Math.round(gifProgress)}% – Capturing frames...</p>
                </div>
              )}

              {/* Export button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = gifStartTime;
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs transition-colors"
                >
                  Preview Start
                </button>
                <button
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = gifEndTime;
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs transition-colors"
                >
                  Preview End
                </button>
                <div className="flex-1" />
                <button
                  onClick={async () => {
                    const vid = videoRef.current;
                    if (!vid || isExportingGif) return;
                    setIsExportingGif(true);
                    setGifProgress(0);
                    try {
                      const blob = await exportGif(vid, {
                        startTime: gifStartTime,
                        endTime: gifEndTime,
                        fps: gifFps,
                        width: gifWidth,
                        onProgress: setGifProgress,
                      });
                      const name = video.name.replace(/\.[^/.]+$/, '');
                      downloadBlob(blob, `${name}_${formatDuration(gifStartTime).replace(/:/g, '-')}.gif`);
                    } catch (err) {
                      console.error('GIF export failed:', err);
                    } finally {
                      setIsExportingGif(false);
                      setGifProgress(0);
                    }
                  }}
                  disabled={isExportingGif || gifEndTime <= gifStartTime}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white text-xs font-semibold transition-colors shadow-lg shadow-purple-500/20"
                >
                  {isExportingGif ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
                      Export GIF
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Shortcuts – only shown when playing */}
          {isPlaying && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-800/60 flex-wrap">
              <span className="text-slate-700 text-xs">Shortcuts:</span>
              {[['Space','Play/Pause'],['← →','±10s'],['M','Mute'],['R','Loop'],['Alt+← →','Prev/Next'],['Esc','Close']].map(([key, label]) => (
                <span key={key} className="text-slate-700 text-xs">
                  <kbd className="bg-slate-800 text-slate-500 px-1 py-0.5 rounded text-xs font-mono">{key}</kbd> {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
