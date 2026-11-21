/**
 * v9 cinematic camera director: deterministic camera choreography sampled once
 * per leg. PlaybackEngine remains the sole clock; no RAF/timers/map mutations.
 *
 * The vehicle and route line continue using the authoritative playback scene.
 * This module only transforms the camera's planned position/zoom/orientation.
 */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const normalized = x => clamp(Number(x) || 0, 0, 1);
const shortest = a => ((a + 540) % 360 + 360) % 360 - 180;
const KNOT_TIMES = Object.freeze([0, 0.055, 0.12, 0.19, 0.30, 0.43, 0.56, 0.69, 0.79, 0.88, 0.95, 1]);
const ZOOM_SHAPE = [[0, 0], [.055, .5], [.12, .32], [.30, -.32], [.56, -.42], [.74, -.14], [.88, .44], [.95, .57], [1, .34]];
const PITCH_SHAPE = [[0, 0], [.055, 5], [.22, -7], [.60, -6], [.79, 1], [.93, 6], [1, 0]];
const BANK_SHAPE = [[0, 0], [.10, .7], [.35, 1], [.68, .8], [.88, .4], [1, 0]];

function curve(stops, progress) {
  const t = normalized(progress);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [startT, startV] = stops[i - 1];
      const [endT, endV] = stops[i];
      const u = normalized((t - startT) / (endT - startT));
      const ease = u * u * (3 - 2 * u);
      return startV + (endV - startV) * ease;
    }
  }
  return stops.at(-1)[1];
}
function unwrap(previous, next) { return previous + shortest(next - previous); }
function parts(camera) {
  return [Number(camera.center[0]), Number(camera.center[1]), Number(camera.zoom),
    Number(camera.pitch), Number(camera.bearing)];
}
function cameraOf(values) {
  return { center: [values[0], values[1]], zoom: values[2],
    pitch: clamp(values[3], 0, 75), bearing: values[4] };
}
function assertCamera(camera) {
  const p = camera?.center && parts(camera);
  if (!p || !p.every(Number.isFinite)) throw new Error('Invalid cinematic camera sample');
}

// Monotone Hermite slopes: continuous velocity, no overshoot in zoom, pitch,
// latitude or dateline-unwrapped longitude when a segment changes direction.
function slopes(knots, index, channel) {
  if (index === 0 || index === knots.length - 1) return 0;
  const a = knots[index - 1], b = knots[index], c = knots[index + 1];
  const left = (b.values[channel] - a.values[channel]) / (b.t - a.t);
  const right = (c.values[channel] - b.values[channel]) / (c.t - b.t);
  if (left * right <= 0) return 0;
  return Math.sign(left) * Math.min(Math.abs((left + right) / 2), 3 * Math.abs(left), 3 * Math.abs(right));
}
function finalize(knots) {
  for (let i = 1; i < knots.length; i++) {
    knots[i].values[0] = unwrap(knots[i - 1].values[0], knots[i].values[0]);
    knots[i].values[4] = unwrap(knots[i - 1].values[4], knots[i].values[4]);
  }
  for (let i = 0; i < knots.length; i++) {
    knots[i].slopes = Array.from({ length: 5 }, (_, channel) => slopes(knots, i, channel));
  }
  return { knots };
}

/**
 * sampleAt(progress) returns the existing GlobeHoppers getScene result.
 * Build is called at leg acquisition, never inside the frame's hot path.
 */
export function buildCinematicCameraPlan({ sampleAt, mode = 'plane', distanceMiles = 0, from, to } = {}) {
  if (typeof sampleAt !== 'function') throw new Error('Cinematic camera needs a scene sampler');
  const surface = ['drive', 'car', 'train', 'boat'].includes(mode);
  const intensity = mode === 'drive' || mode === 'car' ? 0.57 : mode === 'train' ? 0.7 : mode === 'boat' ? 0.78 : 1;
  const lonDelta = Number(to?.lon) - Number(from?.lon);
  const bankSign = Number.isFinite(lonDelta) && Math.abs(shortest(lonDelta)) > 0.5
    ? Math.sign(shortest(lonDelta)) : 1;
  const bankDegrees = (surface ? 9 : 14) * intensity * bankSign;
  const lead = (surface ? .011 : Number(distanceMiles) > 1500 ? .035 : .021);
  const knots = KNOT_TIMES.map(t => {
    // Preplanned anticipatory framing avoids a sluggish camera chasing the
    // vehicle. Arrival/departure remain aligned with the canonical scene.
    const ahead = lead * Math.pow(Math.sin(Math.PI * t), 2);
    const scene = sampleAt(Math.min(1, t + ahead));
    assertCamera(scene?.camera);
    const values = parts(scene.camera);
    values[2] += intensity * curve(ZOOM_SHAPE, t);
    values[3] = clamp(values[3] + intensity * curve(PITCH_SHAPE, t), 0, 75);
    values[4] += bankDegrees * curve(BANK_SHAPE, t);
    return { t, values };
  });
  return finalize(knots);
}

/**
 * Start a connected next leg at the camera actually displayed on the
 * previous leg. The spline rejoins the new route without a new camera owner.
 */
export function anchorCinematicCameraPlan(plan, startCamera) {
  if (!plan?.knots?.length || !startCamera) return plan;
  assertCamera(startCamera);
  const knots = plan.knots.map(knot => ({ t: knot.t, values: [...knot.values] }));
  knots[0].values = parts(startCamera);
  return finalize(knots);
}

export function sampleCinematicCamera(plan, progress) {
  if (!plan?.knots?.length) return null;
  const t = normalized(progress), knots = plan.knots;
  if (t <= 0) return cameraOf(knots[0].values);
  if (t >= 1) return cameraOf(knots.at(-1).values);
  let index = 1;
  while (index < knots.length - 1 && t > knots[index].t) index++;
  const a = knots[index - 1], b = knots[index], span = b.t - a.t;
  const u = (t - a.t) / span, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const values = a.values.map((v, ch) =>
    h00 * v + h10 * span * a.slopes[ch] + h01 * b.values[ch] + h11 * span * b.slopes[ch]);
  return cameraOf(values);
}

export function blendCinematicCamera(from, to, fraction) {
  if (!from || !to) return to || from || null;
  assertCamera(from); assertCamera(to);
  const t = normalized(fraction);
  const f = parts(from), dest = parts(to);
  dest[0] = unwrap(f[0], dest[0]);
  dest[4] = unwrap(f[4], dest[4]);
  return cameraOf(f.map((v, i) => v + (dest[i] - v) * t));
}

export function cinematicMotionRequested(search = '') {
  const params = new URLSearchParams(search);
  return params.get('v9Cinematic') !== '0' && params.get('v9Legacy') !== '1' && params.get('v9') !== '0';
}
