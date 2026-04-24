/**
 * Scene Detection & Auto-Chapters
 * Uses Canvas API to analyze video frames - runs 100% in the browser, no server needed.
 *
 * Strategy:
 * - Always generate exactly `maxChapters` chapters spread evenly across the full video duration
 * - Additionally detect real scene changes and snap chapter boundaries to them when close
 * - Result: 20 chapters covering the entire video, with boundaries aligned to actual scene cuts
 */

export interface SceneChapter {
  time: number;       // seconds
  thumbnail?: string; // base64 data URL of the frame
  label: string;      // "Chapter 1", "Chapter 2", ...
}

export interface SceneDetectionResult {
  chapters: SceneChapter[];
  totalScenes: number;
}

// Sample a video frame at a given time and return ImageData
async function sampleFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  time: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch (e) {
        reject(e);
      }
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

// Compute mean luminance difference between two frames
function frameDifference(a: ImageData, b: ImageData): number {
  const data1 = a.data;
  const data2 = b.data;
  const len = data1.length;
  let diff = 0;
  for (let i = 0; i < len; i += 16) {
    const r1 = data1[i], g1 = data1[i + 1], b1 = data1[i + 2];
    const r2 = data2[i], g2 = data2[i + 1], b2 = data2[i + 2];
    diff += Math.abs(0.299 * (r1 - r2) + 0.587 * (g1 - g2) + 0.114 * (b1 - b2));
  }
  return diff / (len / 16);
}

function extractThumbnail(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.65);
}

export async function detectScenes(
  sourceVideo: HTMLVideoElement,
  options: {
    sampleInterval?: number;   // seconds between analysis samples (default: 2)
    threshold?: number;        // scene change threshold 0-255 (default: 25)
    maxChapters?: number;      // exact number of chapters to generate (default: 20)
    onProgress?: (pct: number) => void;
  } = {}
): Promise<SceneDetectionResult> {
  const {
    sampleInterval = 2,
    threshold = 25,
    maxChapters = 20,
    onProgress,
  } = options;

  const duration = sourceVideo.duration;
  if (!duration || isNaN(duration) || duration < 2) {
    return { chapters: [{ time: 0, label: 'Chapter 1' }], totalScenes: 1 };
  }

  // Create a SEPARATE hidden video element so the visible player is not disturbed
  const video = document.createElement('video');
  video.src = sourceVideo.src;
  video.muted = true;
  video.preload = 'auto';
  video.style.display = 'none';
  document.body.appendChild(video);

  // Wait for seekable
  await new Promise<void>(resolve => {
    if (video.readyState >= 1) { resolve(); return; }
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });

  // Offscreen canvas (small = fast)
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    document.body.removeChild(video);
    return { chapters: [], totalScenes: 0 };
  }

  // --- Phase 1: Detect scene changes by sampling every sampleInterval seconds ---
  const sceneChangeTimes = new Set<number>([0]);
  let prevFrame: ImageData | null = null;
  const totalSamples = Math.floor(duration / sampleInterval);

  for (let i = 0; i <= totalSamples; i++) {
    const t = Math.min(i * sampleInterval, duration - 0.1);
    try {
      const frame = await sampleFrame(video, canvas, ctx, t);
      if (prevFrame) {
        const diff = frameDifference(prevFrame, frame);
        if (diff > threshold) {
          sceneChangeTimes.add(t);
        }
      }
      prevFrame = frame;
    } catch {
      // skip
    }
    onProgress?.(Math.round((i / totalSamples) * 50)); // first 50% = analysis
  }

  // --- Phase 2: Generate exactly maxChapters evenly spaced across full duration ---
  // Then snap each boundary to the nearest detected scene change (within a tolerance)
  const snapTolerance = duration / maxChapters / 2; // snap within half a chapter interval
  const sortedSceneTimes = Array.from(sceneChangeTimes).sort((a, b) => a - b);

  const chapterTimes: number[] = [];
  for (let i = 0; i < maxChapters; i++) {
    const idealTime = (i / maxChapters) * duration;

    // Find nearest scene change within tolerance
    let best = idealTime;
    let bestDist = snapTolerance;
    for (const st of sortedSceneTimes) {
      const dist = Math.abs(st - idealTime);
      if (dist < bestDist) {
        bestDist = dist;
        best = st;
      }
    }

    // Avoid duplicates
    if (chapterTimes.length === 0 || best - chapterTimes[chapterTimes.length - 1] > 0.5) {
      chapterTimes.push(best);
    } else {
      // Use ideal time if snapped position is duplicate
      const fallback = idealTime;
      if (chapterTimes.length === 0 || fallback - chapterTimes[chapterTimes.length - 1] > 0.5) {
        chapterTimes.push(fallback);
      }
    }
  }

  // --- Phase 3: Extract thumbnails for each chapter ---
  const chapters: SceneChapter[] = [];
  for (let i = 0; i < chapterTimes.length; i++) {
    const t = chapterTimes[i];
    let thumbnail: string | undefined;
    try {
      await sampleFrame(video, canvas, ctx, t);
      thumbnail = extractThumbnail(canvas);
    } catch {
      // no thumbnail
    }
    chapters.push({
      time: t,
      thumbnail,
      label: `Chapter ${i + 1}`,
    });
    onProgress?.(50 + Math.round((i / chapterTimes.length) * 50));
  }

  // Cleanup
  document.body.removeChild(video);
  onProgress?.(100);

  return { chapters, totalScenes: chapters.length };
}
