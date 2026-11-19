/**
 * v9 playback plan compiler, deliberately independent of React and browser state.
 * Output is a deterministic, serializable equivalent of the v7.5 routing
 * worker's prepared positions/headings/camera lead, without per-frame routing.
 * v7.5's worker remains untouched until parity tests justify the switchover.
 */
import { buildSurfacePresentationGeometry, isSurfaceRouteMode } from './routePresentation.js';
import { legDurationMs } from './routeTiming.js';

const RADIANS = Math.PI / 180;
const degrees = value => value / RADIANS;
const radians = value => value * RADIANS;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const deltaLon = (a, b) => ((b - a + 540) % 360) - 180;
const lerpLon = (a, b, t) => a + deltaLon(a, b) * t;
const float = value => Math.fround(value);

function cleanPoints(points) {
  const clean = [];
  for (const point of points || []) {
    if (!Array.isArray(point)) continue;
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) continue;
    if (!clean.length || Math.hypot(deltaLon(clean.at(-1)[0], lon), lat - clean.at(-1)[1]) > 0.00001) {
      clean.push([lon, lat]);
    }
  }
  return clean;
}

function greatCirclePoint(from, to, fraction) {
  const [lonA, latA] = from.map(radians);
  const [lonB, latB] = to.map(radians);
  const halfLat = Math.sin((latB - latA) / 2);
  const halfLon = Math.sin((lonB - lonA) / 2);
  const hav = clamp(halfLat ** 2 + Math.cos(latA) * Math.cos(latB) * halfLon ** 2, 0, 1);
  const arc = 2 * Math.asin(Math.sqrt(hav));
  if (arc < 1e-9) return [...from];
  // Nearly antipodal points need a deterministic fallback; avoid /sin(PI).
  if (Math.abs(Math.sin(arc)) < 1e-8) return [lerpLon(from[0], to[0], fraction), from[1] + (to[1] - from[1]) * fraction];
  const a = Math.sin((1 - fraction) * arc) / Math.sin(arc);
  const b = Math.sin(fraction * arc) / Math.sin(arc);
  const x = a * Math.cos(latA) * Math.cos(lonA) + b * Math.cos(latB) * Math.cos(lonB);
  const y = a * Math.cos(latA) * Math.sin(lonA) + b * Math.cos(latB) * Math.sin(lonB);
  const z = a * Math.sin(latA) + b * Math.sin(latB);
  return [degrees(Math.atan2(y, x)), degrees(Math.atan2(z, Math.hypot(x, y)))];
}

function distanceDegrees(a, b) {
  return Math.hypot(deltaLon(a[0], b[0]), b[1] - a[1]);
}
function haversineMiles(a, b) {
  const latA = radians(a[1]), latB = radians(b[1]);
  const dLat = radians(b[1] - a[1]), dLon = radians(deltaLon(a[0], b[0]));
  const h = clamp(Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2, 0, 1);
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function bearing(a, b) {
  const latA = radians(a[1]), latB = radians(b[1]);
  const lon = radians(deltaLon(a[0], b[0]));
  const y = Math.sin(lon) * Math.cos(latB);
  const x = Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(lon);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

function resample(route, count) {
  const points = cleanPoints(route);
  if (points.length < 2) throw new Error('Playback geometry needs at least two distinct points');
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distanceDegrees(points[i - 1], points[i]));
  const total = cumulative.at(-1);
  if (total <= 0) throw new Error('Playback route has no length');
  const out = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const target = total * (i / Math.max(1, count - 1));
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment++;
    const a = points[segment - 1], b = points[segment];
    const span = Math.max(1e-9, cumulative[segment] - cumulative[segment - 1]);
    const u = clamp((target - cumulative[segment - 1]) / span, 0, 1);
    out.push([lerpLon(a[0], b[0], u), a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}
function flatten(points) {
  const out = [];
  for (const [lon, lat] of points) out.push(float(lon), float(lat));
  return out;
}
function downsample(points, limit) {
  if (points.length <= limit) return points;
  return Array.from({ length: limit }, (_, i) => points[Math.round(i * (points.length - 1) / Math.max(1, limit - 1))]);
}

export function compilePlaybackLeg(leg, suppliedGeometry = null) {
  const mode = leg?.mode || 'plane';
  const from = [Number(leg?.from?.lon), Number(leg?.from?.lat)];
  const to = [Number(leg?.to?.lon), Number(leg?.to?.lat)];
  if (![...from, ...to].every(Number.isFinite)) throw new Error('Playback leg has invalid endpoints');
  let route = cleanPoints(suppliedGeometry);
  if (route.length < 2) {
    route = mode === 'plane' || mode === 'move'
      ? Array.from({ length: 220 }, (_, i) => greatCirclePoint(from, to, i / 219))
      : [from, to];
  }
  // Same presentation shaping as the legacy worker, moved out of playback.
  if (isSurfaceRouteMode(mode) && route.length > 2) route = buildSurfacePresentationGeometry(route, mode, { profile: 'playback' });
  route = cleanPoints(route);
  if (route.length < 2) throw new Error('Compiled route collapsed to one point');
  const miles = Math.max(0, Number(leg?.miles || 0));
  const count = clamp(Math.round(72 + Math.sqrt(miles) * 4), 72, 320);
  const samples = resample(route, count);
  const positions = flatten(samples);
  const headings = [];
  const camera = [];
  const cumulative = [0];
  const leadSamples = ['boat', 'train'].includes(mode) ? Math.max(1, Math.round(count * .015)) : Math.max(1, Math.round(count * .025));
  const bias = ['boat', 'train'].includes(mode) ? .18 : ['drive', 'car'].includes(mode) ? .25 : .28;
  for (let i = 0; i < samples.length; i++) {
    if (i) cumulative.push(float(cumulative[i - 1] + haversineMiles(samples[i - 1], samples[i])));
    const previous = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(count - 1, i + 1)];
    headings.push(float(bearing(previous, next)));
    const ahead = samples[Math.min(count - 1, i + leadSamples)];
    camera.push(float(lerpLon(samples[i][0], ahead[0], bias)), float(samples[i][1] + (ahead[1] - samples[i][1]) * bias));
  }
  return {
    sampleCount: count,
    durationMs: legDurationMs(miles, 1, mode),
    totalMiles: cumulative.at(-1),
    positions,
    headings,
    camera,
    cumulative,
    overview: flatten(downsample(samples, 64)),
    regional: flatten(downsample(samples, 180)),
    presentation: flatten(route)
  };
}
