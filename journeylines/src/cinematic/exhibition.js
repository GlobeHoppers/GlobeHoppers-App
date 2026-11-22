/**
 * WP4 dedicated-display policies. These helpers never own camera time.
 * GlobeHoppers v9 PlaybackEngine remains the single monotonic playback clock.
 */
export const EXHIBITION_IDLE_MS = 6500;
export const EXHIBITION_WATCHDOG_MS = 22000;

export function exhibitionRetryDelay(attempt) {
  const step = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return Math.min(30000, 1400 * 2 ** Math.min(step, 6));
}

export function createExhibitionUi({
  show, hide,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = id => clearTimeout(id),
  idleMs = EXHIBITION_IDLE_MS
}) {
  if (typeof show !== 'function' || typeof hide !== 'function' ||
      !Number.isFinite(idleMs) || idleMs < 100) throw new Error('Invalid exhibition UI configuration');
  let timeout = null;
  let disposed = false;
  function clear() {
    if (timeout != null) cancel(timeout);
    timeout = null;
  }
  return {
    wake() {
      if (disposed) return;
      clear();
      show();
      timeout = schedule(() => {
        timeout = null;
        if (!disposed) hide();
      }, idleMs);
    },
    close() {
      if (disposed) return;
      disposed = true;
      clear();
    }
  };
}

/** Bound a visibility resumption to an explicit earlier playback state. */
export function shouldResumeAfterVisibility({ pausedByVisibility, hidden, userPaused }) {
  return Boolean(pausedByVisibility && !hidden && !userPaused);
}
