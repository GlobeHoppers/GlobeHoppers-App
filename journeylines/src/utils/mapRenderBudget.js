/**
 * WP3 GPU workload experiment.
 *
 * Keep this separate from the authoritative playback clock and camera
 * director. Limiting the raster resolution reduces the number of WebGL
 * pixels/shader invocations, while reducing *issued* map-camera moves
 * avoids forcing an expensive globe redraw for every 60Hz DOM vehicle frame.
 *
 * Feature-gated and OFF by default. No map/render setting is changed for
 * normal WP2/WP3 playback.
 */

const CAMERA_HZ = Object.freeze({
  high: 60,
  medium: 45,
  low: 30
});

function finiteNumber(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function gpuBudgetRequested(search = typeof window === 'undefined' ? '' : window.location.search) {
  return new URLSearchParams(search).get('v9GpuBudget') === '1';
}

export function gpuRenderSettings({
  search = '',
  devicePixelRatio = 1,
  enabled = gpuBudgetRequested(search)
} = {}) {
  const params = new URLSearchParams(search);
  const dpr = clamp(finiteNumber(devicePixelRatio, 1), 0.5, 4);
  if (!enabled) return {
    enabled: false,
    effectivePixelRatio: dpr,
    maxTileCacheSize: 1200,
    source: 'legacy'
  };

  // A DPR of 2 normally shades four times as many pixels as a DPR of 1.
  // 1.25 retains reasonable text/edge quality while reducing the total
  // shading area to 39% of native DPR2. A lower ratio is only used when
  // explicitly requested in a controlled browser benchmark.
  const override = params.get('v9PixelRatio');
  const requested = override == null ? Math.min(dpr, 1.25) : finiteNumber(override, Math.min(dpr, 1.25));
  const pixelRatio = clamp(requested, 0.65, Math.min(dpr, 2));
  return {
    enabled: true,
    effectivePixelRatio: pixelRatio,
    maxTileCacheSize: 320,
    source: override == null ? 'auto-cap' : 'explicit-benchmark-override'
  };
}

/**
 * The camera and DOM vehicle retain the SAME playback timestamp, but a
 * slow MapLibre globe is allowed to skip camera redraws. This class does not
 * compute routes, interpolate camera poses or create a second RAF.
 *
 * Interval decisions are based only on already-observed synchronous command
 * costs. GPU presentation can finish later: performance counters must not
 * claim this estimates true GPU frame time.
 */
export class MapCameraWorkBudget {
  constructor() {
    this.reset();
  }

  reset() {
    this.lastIssuedAt = -1;
    this.lastCostMs = 0;
    this.costEwma = 0;
    this.samples = 0;
    this.issued = 0;
    this.skipped = 0;
    this.forced = 0;
    this.lastTargetHz = 60;
  }

  targetHz(quality = 'high') {
    const normal = CAMERA_HZ[quality] || CAMERA_HZ.high;
    if (this.samples < 3) return normal;
    const cost = this.costEwma;
    // A busy GPU/driver may block in MapLibre calls. Apply backpressure to
    // give the event loop space to update the vehicle and timeline.
    if (cost >= 55) return Math.min(normal, 12);
    if (cost >= 25) return Math.min(normal, 20);
    if (cost >= 12) return Math.min(normal, 30);
    if (cost >= 7) return Math.min(normal, 45);
    return normal;
  }

  shouldIssue(now, { quality = 'high', force = false } = {}) {
    const timestamp = finiteNumber(now, 0);
    const frequency = this.targetHz(quality);
    this.lastTargetHz = frequency;
    if (force || this.lastIssuedAt < 0 || timestamp < this.lastIssuedAt) {
      if (force) this.forced++;
      this.lastIssuedAt = timestamp;
      this.issued++;
      return true;
    }
    // Keep camera at its last actual pose until the next budgeted tick.
    // The later smoothing step uses the FULL elapsed time, avoiding a
    // slow-motion catchup when the globe is under load.
    if (timestamp - this.lastIssuedAt + 0.65 < 1000 / frequency) {
      this.skipped++;
      return false;
    }
    this.lastIssuedAt = timestamp;
    this.issued++;
    return true;
  }

  recordCommandCost(milliseconds) {
    const ms = clamp(finiteNumber(milliseconds, 0), 0, 500);
    this.lastCostMs = ms;
    this.costEwma = this.samples === 0 ? ms : this.costEwma * 0.82 + ms * 0.18;
    this.samples++;
  }

  snapshot() {
    return {
      issued: this.issued,
      skipped: this.skipped,
      forced: this.forced,
      costSamples: this.samples,
      lastCameraCommandMs: this.lastCostMs,
      averageCameraCommandMs: this.costEwma,
      targetCameraHz: this.lastTargetHz
    };
  }
}
