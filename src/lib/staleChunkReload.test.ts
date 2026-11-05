import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaleChunkReload, RELOAD_COOLDOWN_MS } from './staleChunkReload';
import { getLastChunkReloadAt, setLastChunkReloadAt } from './storage';

function firePreloadError(): Event {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('installStaleChunkReload', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  it('reloads the page and suppresses the error on a failed chunk load', () => {
    const reload = vi.fn();
    uninstall = installStaleChunkReload(reload, () => 1_000_000);

    const event = firePreloadError();

    expect(reload).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(getLastChunkReloadAt()).toBe(1_000_000);
  });

  it('reloads only once when several chunks fail together', () => {
    const reload = vi.fn();
    uninstall = installStaleChunkReload(reload, () => 1_000_000);

    firePreloadError();
    const second = firePreloadError();

    expect(reload).toHaveBeenCalledOnce();
    expect(second.defaultPrevented).toBe(true);
  });

  it('lets the error through instead of looping when a reload just happened', () => {
    setLastChunkReloadAt(1_000_000);
    const reload = vi.fn();
    uninstall = installStaleChunkReload(reload, () => 1_000_000 + RELOAD_COOLDOWN_MS - 1);

    const event = firePreloadError();

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('reloads again once the cooldown has passed', () => {
    setLastChunkReloadAt(1_000_000);
    const reload = vi.fn();
    uninstall = installStaleChunkReload(reload, () => 1_000_000 + RELOAD_COOLDOWN_MS);

    firePreloadError();

    expect(reload).toHaveBeenCalledOnce();
  });
});
