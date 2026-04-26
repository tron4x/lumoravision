/**
 * Global thumbnail generation queue.
 * Limits concurrent canvas/video decode operations to MAX_JOBS
 * to prevent CPU spikes when opening large folders.
 */

const MAX_JOBS = 3;
let active = 0;
const queue: Array<() => void> = [];

export function runThumbJob(fn: () => Promise<void>): void {
  if (active < MAX_JOBS) {
    active++;
    fn().finally(() => {
      active--;
      if (queue.length > 0) {
        const next = queue.shift()!;
        next();
      }
    });
  } else {
    queue.push(() => runThumbJob(fn));
  }
}
