/**
 * WP3: Independent per-frame budgets for the GlobeHoppers read-only renderer.
 *
 * PlaybackEngine is the ONLY clock. This scheduler consumes its timestamps; it
 * never creates another timer, RAF, React update or camera command.
 *
 * Camera + vehicle share one display cadence to stay visually connected.
 * Trails and air arcs are slower because GeoJSON setData and SVG geometry are
 * costlier than a position/transform. A phase/leg change forces a sample.
 */
export const RENDER_PROFILES = Object.freeze({
  high: Object.freeze({ displayMs: 1000 / 60, trailMs: 90, arcMs: 50 }),
  medium: Object.freeze({ displayMs: 1000 / 45, trailMs: 110, arcMs: 66 }),
  low: Object.freeze({ displayMs: 1000 / 30, trailMs: 145, arcMs: 100 })
});

const asTime = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function isV9RendererRequested(search = typeof window === 'undefined' ? '' : window.location.search) {
  return new URLSearchParams(search).get('v9Renderer') === '1';
}

export class PlaybackRenderScheduler {
  constructor(profiles = RENDER_PROFILES) {
    this.profiles = profiles;
    this.reset();
  }

  reset() {
    this.routeKey = null;
    this.generation = null;
    this.nextDisplayAt = -1;
    this.nextTrailAt = -1;
    this.nextArcAt = -1;
    this.lastDisplayAt = -1;
    this.lastTickAt = -1;
    this.atEnd = false;
    this.counts = { ticks: 0, displays: 0, trails: 0, arcs: 0, skipped: 0, resets: 0 };
  }

  plan({ timestamp = 0, quality = 'high', routeKey = '', generation = 0, progress = 0 } = {}) {
    const now = asTime(timestamp);
    const profile = this.profiles[quality] || this.profiles.high;
    const newRoute = this.routeKey !== routeKey || this.generation !== generation;
    const suspended = this.lastTickAt >= 0 && now - this.lastTickAt > 500;
    if (newRoute || suspended || now < this.lastTickAt) {
      this.routeKey = routeKey;
      this.generation = generation;
      this.nextDisplayAt = now;
      this.nextTrailAt = now;
      this.nextArcAt = now;
      this.lastDisplayAt = -1;
      this.atEnd = false;
      this.counts.resets++;
    }
    this.lastTickAt = now;
    this.counts.ticks++;

    const isEnd = Number(progress) >= 1;
    const newlyCompleted = isEnd && !this.atEnd;
    this.atEnd = isEnd;

    // One millisecond of tolerance avoids accidental 30 Hz sampling on a
    // nominal 60 Hz monitor (many RAF timestamps differ by 16.65 ms).
    const display = newRoute || suspended || newlyCompleted || now + 1 >= this.nextDisplayAt;
    if (!display) {
      this.counts.skipped++;
      return { display: false, camera: false, vehicle: false, trail: false, arc: false, pulse: false, reset: false, deltaMs: 0 };
    }

    const deltaMs = this.lastDisplayAt >= 0
      ? Math.max(0, Math.min(250, now - this.lastDisplayAt))
      : profile.displayMs;
    this.lastDisplayAt = now;
    this.nextDisplayAt = now + profile.displayMs;
    this.counts.displays++;

    const trail = newRoute || suspended || newlyCompleted || now + 1 >= this.nextTrailAt;
    const arc = newRoute || suspended || newlyCompleted || now + 1 >= this.nextArcAt;
    if (trail) {
      this.nextTrailAt = now + profile.trailMs;
      this.counts.trails++;
    }
    if (arc) {
      this.nextArcAt = now + profile.arcMs;
      this.counts.arcs++;
    }
    return {
      display: true, camera: true, vehicle: true, pulse: true, trail, arc,
      reset: newRoute || suspended, deltaMs
    };
  }

  snapshot() {
    return { ...this.counts, routeKey: this.routeKey, generation: this.generation };
  }
}

/**
 * Display and secondary work share one timestamp and route identity.
 * The adapter is deliberately shallow: existing MapLibre render functions
 * remain unchanged while their per-frame scheduling moves out of TravelMap.
 */
export class PlaybackFramePipeline {
  constructor(scheduler = new PlaybackRenderScheduler()) {
    this.scheduler = scheduler;
  }

  render(frame, { routeKey, generation, progress, quality } = {}, adapter = {}) {
    const work = this.scheduler.plan({
      timestamp: frame?.timestamp,
      routeKey, generation, progress, quality
    });
    if (!work.display) return work;
    // Compute the scene ONCE for all stages, never once per subrenderer.
    const scene = adapter.sampleScene?.(frame);
    if (!scene) return { ...work, display: false };
    // Trail construction can trigger MapLibre GeoJSON setData, so keep it off
    // the camera/vehicle hot path whenever its slower budget isn't due.
    if (work.trail) adapter.renderTrail?.(scene, frame);
    adapter.renderPulse?.(scene, frame);
    if (work.camera) adapter.renderCamera?.(scene, frame, work);
    if (work.vehicle) adapter.renderVehicle?.(scene, frame);
    if (work.arc) adapter.renderArc?.(scene, frame);
    return work;
  }
}
