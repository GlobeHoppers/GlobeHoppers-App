/**
 * GlobeHoppers v9 WP2: single monotonic owner of playback time.
 *
 * Camera, vehicle and trails subscribe to the same timestamp. React is an
 * observer, never a second animation clock. All control commands invalidate
 * pending completion callbacks, including commands issued within the same leg.
 * The scheduling functions are injectable to test frame jitter/visibility.
 */
export class PlaybackEngine {
  constructor({
    now = () => performance.now(),
    requestFrame = callback => requestAnimationFrame(callback),
    cancelFrame = handle => cancelAnimationFrame(handle),
    enqueue = callback => queueMicrotask(callback)
  } = {}) {
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.enqueue = enqueue;
    this.subscribers = new Set();
    this.state = {
      playing: false,
      progress: 0,
      rawProgress: 0,
      elapsed: 0,
      duration: 1,
      settle: 0,
      frameMs: 16.7,
      quality: 'high',
      timestamp: 0,
      metadata: null,
      generation: 0
    };
    this.raf = 0;
    this.startTime = 0;
    this.onComplete = null;
    this.lastFrame = 0;
    this.frameAverage = 16.7;
    this.commandRevision = 0;
  }

  boundElapsed(value) {
    return Math.max(0, Math.min(this.state.duration + this.state.settle, Number(value) || 0));
  }

  syncElapsed(now) {
    if (!this.state.playing) return;
    this.state.elapsed = this.boundElapsed(Math.max(this.state.elapsed, now - this.startTime));
    this.state.rawProgress = this.state.elapsed / this.state.duration;
    this.state.progress = Math.max(0, Math.min(1, this.state.rawProgress));
  }

  configure({ duration = 1, settle = 0, progress = 0, metadata = null, onComplete = null } = {}) {
    const now = this.now();
    const wasPlaying = this.state.playing;
    const nextDuration = Math.max(1, Number(duration) || 1);
    const nextSettle = Math.max(0, Number(settle) || 0);
    const nextProgress = Math.max(0, Number(progress) || 0);
    const elapsed = Math.min(nextDuration + nextSettle, nextProgress * nextDuration);
    const generation = this.state.generation + 1;
    ++this.commandRevision;
    this.state = {
      ...this.state,
      playing: wasPlaying,
      duration: nextDuration,
      settle: nextSettle,
      elapsed,
      progress: Math.max(0, Math.min(1, elapsed / nextDuration)),
      rawProgress: elapsed / nextDuration,
      metadata: { ...(metadata || {}), generation },
      generation
    };
    this.onComplete = onComplete;
    if (wasPlaying) {
      this.startTime = now - elapsed;
      this.lastFrame = 0;
      this.ensureLoop();
    }
    this.notify(now);
    return generation;
  }

  play() {
    if (this.state.playing || this.state.elapsed >= this.state.duration + this.state.settle) return;
    ++this.commandRevision;
    const now = this.now();
    this.state.playing = true;
    this.startTime = now - this.state.elapsed;
    this.lastFrame = 0;
    this.ensureLoop();
    this.notify(now);
  }

  pause() {
    // Even an already-finished clock must cancel its queued completion if
    // the user seeks/pauses before the completion microtask is delivered.
    ++this.commandRevision;
    if (!this.state.playing) return;
    const now = this.now();
    this.syncElapsed(now);
    this.state.playing = false;
    this.cancelLoop();
    this.notify(now);
  }

  seek(progress = 0) {
    ++this.commandRevision;
    const now = this.now();
    const p = Math.max(0, Number(progress) || 0);
    this.state.elapsed = this.boundElapsed(p * this.state.duration);
    this.state.rawProgress = this.state.elapsed / this.state.duration;
    this.state.progress = Math.max(0, Math.min(1, this.state.rawProgress));
    if (this.state.playing) this.startTime = now - this.state.elapsed;
    this.notify(now);
  }

  stop(progress = 0) {
    ++this.commandRevision;
    this.cancelLoop();
    this.state.playing = false;
    this.seek(progress);
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    listener(this.state);
    return () => this.subscribers.delete(listener);
  }

  snapshot() {
    return this.state;
  }

  cancelLoop() {
    if (this.raf) this.cancelFrame(this.raf);
    this.raf = 0;
  }

  ensureLoop() {
    if (this.raf || !this.state.playing) return;
    this.raf = this.requestFrame(ts => this.tick(ts));
  }

  tick(timestamp) {
    this.raf = 0;
    if (!this.state.playing) return;
    const now = Number.isFinite(Number(timestamp)) ? Number(timestamp) : this.now();
    if (this.lastFrame) {
      const frame = Math.max(1, Math.min(100, now - this.lastFrame));
      this.frameAverage = this.frameAverage * 0.92 + frame * 0.08;
      this.state.frameMs = this.frameAverage;
      this.state.quality = this.frameAverage <= 20 ? 'high' : this.frameAverage <= 29 ? 'medium' : 'low';
    }
    this.lastFrame = now;
    this.syncElapsed(now);
    this.notify(now);

    // A subscriber can synchronously pause, seek, configure, or stop. Never
    // schedule the previous frame's completion or a stray RAF after that.
    if (!this.state.playing) return;
    if (this.state.elapsed >= this.state.duration + this.state.settle) {
      this.state.playing = false;
      const revision = ++this.commandRevision;
      const generation = this.state.generation;
      const callback = this.onComplete;
      const completionState = { ...this.state };
      this.notify(now);
      if (callback) {
        this.enqueue(() => {
          if (this.commandRevision !== revision || this.state.generation !== generation) return;
          callback(completionState);
        });
      }
      return;
    }
    this.ensureLoop();
  }

  notify(timestamp) {
    this.state.timestamp = timestamp;
    for (const listener of this.subscribers) {
      try { listener(this.state); } catch (error) {
        if (typeof console !== 'undefined') console.warn('[GlobeHoppers] Playback observer failed', error);
      }
    }
  }
}

export const playbackEngine = new PlaybackEngine();
