import { getLastChunkReloadAt, setLastChunkReloadAt } from './storage';

// After a deploy, GitHub Pages no longer serves the previous build's hashed
// chunks. A tab opened before the deploy still references them, so its first
// lazy route load fails. Reloading picks up the new index.html and chunks.
//
// If a chunk is still missing right after such a reload, the deploy itself is
// broken; reloading again would loop, so the error is let through instead.
export const RELOAD_COOLDOWN_MS = 10_000;

export function installStaleChunkReload(
  reload: () => void = () => window.location.reload(),
  now: () => number = Date.now,
): () => void {
  let reloading = false;

  function onPreloadError(event: Event): void {
    if (reloading) {
      // Several chunks can fail at once; the reload is already on its way.
      event.preventDefault();
      return;
    }
    const last = getLastChunkReloadAt();
    if (last !== null && now() - last < RELOAD_COOLDOWN_MS) return;

    reloading = true;
    setLastChunkReloadAt(now());
    event.preventDefault();
    reload();
  }

  window.addEventListener('vite:preloadError', onPreloadError);
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}
