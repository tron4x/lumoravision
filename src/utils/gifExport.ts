/**
 * GIF Export Utility using gif.js library
 */
import GIF from 'gif.js';

export interface GifExportOptions {
  startTime: number;
  endTime: number;
  fps?: number;
  width?: number;
  height?: number;
  quality?: number;
  onProgress?: (progress: number) => void;
}

export async function exportGif(
  video: HTMLVideoElement,
  options: GifExportOptions
): Promise<Blob> {
  const {
    startTime,
    endTime,
    fps = 10,
    width = 320,
    height,
    quality = 10,
    onProgress
  } = options;
  
  const duration = endTime - startTime;
  const frameCount = Math.ceil(duration * fps);
  const frameDelay = 1000 / fps;
  
  // Calculate height maintaining aspect ratio
  const aspectRatio = video.videoHeight / video.videoWidth;
  const gifHeight = height || Math.round(width * aspectRatio);
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = gifHeight;
  const ctx = canvas.getContext('2d')!;
  
  // Create GIF encoder with gif.js
  const gif = new GIF({
    workers: 2,
    quality: quality,
    width: width,
    height: gifHeight,
    workerScript: '/gif.worker.js',
  });

  // Capture frames
  for (let i = 0; i < frameCount; i++) {
    const time = startTime + (i / fps);
    video.currentTime = time;
    
    // Wait for frame to load
    await new Promise<void>(resolve => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
    });
    
    // Small delay to ensure frame is rendered
    await new Promise(r => setTimeout(r, 50));
    
    ctx.drawImage(video, 0, 0, width, gifHeight);
    gif.addFrame(ctx, { copy: true, delay: frameDelay });
    
    onProgress?.(((i + 1) / frameCount) * 50); // 0-50% for capturing
  }
  
  // Render GIF
  return new Promise((resolve, reject) => {
    gif.on('progress', (p: number) => {
      onProgress?.(50 + p * 50); // 50-100% for rendering
    });
    
    gif.on('finished', (blob: Blob) => {
      resolve(blob);
    });
    
    gif.on('error', (err: Error) => {
      reject(err);
    });
    
    gif.render();
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
