class PlaybackEngine {
  constructor() {
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
      metadata: null
    };
    this.raf = 0;
    this.startTime = 0;
    this.onComplete = null;
    this.lastFrame = 0;
    this.frameAverage = 16.7;
  }

  configure({ duration = 1, settle = 0, progress = 0, metadata = null, onComplete = null } = {}) {
    const wasPlaying = this.state.playing;
    const p = Math.max(0, Number(progress) || 0);
    this.state = {
      ...this.state,
      duration: Math.max(1, Number(duration) || 1),
      settle: Math.max(0, Number(settle) || 0),
      progress: p,
      rawProgress: p,
      elapsed: p * Math.max(1, Number(duration) || 1),
      metadata
    };
    this.onComplete = onComplete;
    if (wasPlaying) {
      this.startTime = performance.now() - this.state.elapsed;
      this.ensureLoop();
    }
    this.notify(performance.now());
  }

  play() {
    if (this.state.playing) return;
    this.state.playing = true;
    this.startTime = performance.now() - this.state.elapsed;
    this.lastFrame = 0;
    this.ensureLoop();
    this.notify(performance.now());
  }

  pause() {
    if (!this.state.playing) return;
    const now = performance.now();
    this.state.elapsed = Math.max(0, now - this.startTime);
    this.state.rawProgress = this.state.elapsed / this.state.duration;
    this.state.progress = Math.max(0, Math.min(1, this.state.rawProgress));
    this.state.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.notify(now);
  }

  seek(progress = 0) {
    const p = Math.max(0, Number(progress) || 0);
    this.state.elapsed = p * this.state.duration;
    this.state.rawProgress = p;
    this.state.progress = Math.max(0, Math.min(1, p));
    if (this.state.playing) this.startTime = performance.now() - this.state.elapsed;
    this.notify(performance.now());
  }

  stop(progress = 0) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
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

  ensureLoop() {
    if (this.raf || !this.state.playing) return;
    this.raf = requestAnimationFrame(ts => this.tick(ts));
  }

  tick(ts) {
    this.raf = 0;
    if (!this.state.playing) return;
    if (this.lastFrame) {
      const frame = Math.max(1, Math.min(100, ts - this.lastFrame));
      this.frameAverage = this.frameAverage * 0.92 + frame * 0.08;
      this.state.frameMs = this.frameAverage;
      this.state.quality = this.frameAverage <= 20 ? 'high' : this.frameAverage <= 29 ? 'medium' : 'low';
    }
    this.lastFrame = ts;
    this.state.elapsed = Math.max(0, ts - this.startTime);
    this.state.rawProgress = this.state.elapsed / this.state.duration;
    this.state.progress = Math.max(0, Math.min(1, this.state.rawProgress));
    this.state.timestamp = ts;
    this.notify(ts);

    if (this.state.elapsed >= this.state.duration + this.state.settle) {
      this.state.playing = false;
      this.notify(ts);
      const callback = this.onComplete;
      if (callback) queueMicrotask(() => callback(this.state));
      return;
    }
    this.ensureLoop();
  }

  notify(ts) {
    this.state.timestamp = ts;
    for (const listener of this.subscribers) {
      try { listener(this.state); } catch {}
    }
  }
}

export const playbackEngine = new PlaybackEngine();
