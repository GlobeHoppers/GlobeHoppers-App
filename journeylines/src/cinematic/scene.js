/**
 * Cinematic GlobeHoppers: independent presentation planner over v9 compiled route geometry.
 * No network calls, React state, animation timer, or MapLibre side effects.
 * A given (scene, elapsedMs) always produces the same camera pose and route reveal.
 */
import { compilePlaybackLeg } from '../utils/compiledPlaybackPlan.js';
import { milesBetween } from '../utils/distanceUtils.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const mix = (a, b, u) => a + (b - a) * u;
const smooth = x => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const deltaAngle = (a, b) => ((b - a + 540) % 360) - 180;
const radians = d => d * Math.PI / 180;
const degrees = r => r * 180 / Math.PI;

export const CINEMATIC_PRESET = Object.freeze({
  introMs: 1900,
  holdMs: 680,
  outroMs: 2200,
  arrivalZoom: 7.6,
  arrivalPitch: 47,
  cruisingPitch: 26
});

export function normalizeCinematicStops(source) {
  if (!Array.isArray(source) || source.length < 2 || source.length > 128) {
    throw new Error('Cinematic scene requires between 2 and 128 stops.');
  }
  const ids = new Set();
  return source.map((stop, i) => {
    const lon = Number(stop?.lon);
    const lat = Number(stop?.lat);
    const id = String(stop?.id || 'stop-' + i);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 ||
        Math.abs(lat) > 90 || id.length > 128 || ids.has(id)) {
      throw new Error('Invalid or duplicate stop at index ' + i);
    }
    ids.add(id);
    return { id, name: String(stop?.name || id).slice(0, 100), lon, lat };
  });
}

function bearingBetween(a, b) {
  const first = radians(a.lat), second = radians(b.lat);
  const longitude = radians(deltaAngle(a.lon, b.lon));
  const y = Math.sin(longitude) * Math.cos(second);
  const x = Math.cos(first) * Math.sin(second) -
            Math.sin(first) * Math.cos(second) * Math.cos(longitude);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

function positionAlong(leg, u) {
  if (u <= 0) return [leg.from.lon, leg.from.lat];
  if (u >= 1) return [leg.to.lon, leg.to.lat];
  const points = leg.path;
  const location = u * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(location));
  const t = location - i;
  const a = points[i], b = points[i + 1];
  return [a[0] + deltaAngle(a[0], b[0]) * t, mix(a[1], b[1], t)];
}

function poseAtStop(stop, heading, preset) {
  return { center: [stop.lon, stop.lat], zoom: preset.arrivalZoom,
           pitch: preset.arrivalPitch, bearing: heading };
}

export function buildCinematicScene(rawStops, overrides = {}) {
  const preset = { ...CINEMATIC_PRESET, ...overrides };
  const stops = normalizeCinematicStops(rawStops);
  for (const field of ['introMs', 'holdMs', 'outroMs', 'arrivalZoom', 'arrivalPitch', 'cruisingPitch']) {
    if (!Number.isFinite(preset[field])) throw new Error('Invalid cinematic setting: ' + field);
  }
  if (preset.introMs < 100 || preset.outroMs < 100 || preset.holdMs < 0 ||
      preset.arrivalZoom < 0 || preset.arrivalZoom > 14 ||
      preset.arrivalPitch < 0 || preset.arrivalPitch > 65 ||
      preset.cruisingPitch < 0 || preset.cruisingPitch > 65) {
    throw new Error('Cinematic settings outside supported range.');
  }

  const headings = stops.map((stop, i) => i < stops.length - 1
    ? bearingBetween(stop, stops[i + 1])
    : bearingBetween(stops[i - 1], stop));

  const legs = stops.slice(1).map((to, index) => {
    const from = stops[index];
    const miles = milesBetween(from, to);
    if (!(miles > 0.001)) throw new Error('Adjacent cinematic stops are indistinguishable.');
    // This is GlobeHoppers v9's deterministic geometry compiler, not third-party code.
    const compiled = compilePlaybackLeg({ from, to, mode: 'plane', miles });
    const path = Array.from({ length: compiled.sampleCount }, (_, p) => [
      Number(compiled.positions[p * 2]),
      Number(compiled.positions[p * 2 + 1])
    ]);
    const durationMs = clamp(4400 + 45 * Math.sqrt(miles), 4600, 7700);
    const cruiseZoom = clamp(6.35 - 0.7 * Math.log2(Math.max(miles, 70) / 70), 2.65, 5.5);
    return { index, from, to, miles, path, durationMs, cruiseZoom, startMs: 0, endMs: 0 };
  });

  const segments = [];
  const stopTimesMs = [];
  let elapsed = 0;
  function append(type, durationMs, extra = {}) {
    const s = { type, startMs: elapsed, endMs: elapsed + durationMs, ...extra };
    segments.push(s);
    elapsed += durationMs;
    return s;
  }

  append('intro', preset.introMs, { stopIndex: 0 });
  stopTimesMs.push(elapsed);
  append('hold', preset.holdMs, { stopIndex: 0 });
  for (const leg of legs) {
    const travel = append('travel', leg.durationMs, { legIndex: leg.index });
    leg.startMs = travel.startMs;
    leg.endMs = travel.endMs;
    stopTimesMs.push(elapsed);
    append('hold', preset.holdMs, { stopIndex: leg.index + 1 });
  }
  append('outro', preset.outroMs, { stopIndex: stops.length - 1 });
  const totalMs = elapsed;

  function sample(ms) {
    const timeMs = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    const segment = segments.find(s => timeMs < s.endMs) || segments[segments.length - 1];
    const u = clamp((timeMs - segment.startMs) / Math.max(1, segment.endMs - segment.startMs), 0, 1);
    const eased = smooth(u);
    if (segment.type === 'intro') {
      const at = poseAtStop(stops[0], headings[0], preset);
      return { ...at, zoom: mix(2.25, at.zoom, eased),
               pitch: mix(7, at.pitch, eased), elapsedMs: timeMs,
               segmentType: 'intro', stopIndex: 0, legIndex: -1, travelProgress: 0 };
    }
    if (segment.type === 'outro') {
      const last = stops.length - 1;
      const at = poseAtStop(stops[last], headings[last], preset);
      return { ...at, zoom: mix(at.zoom, 2.8, eased),
               pitch: mix(at.pitch, 12, eased), elapsedMs: timeMs,
               segmentType: 'outro', stopIndex: last, legIndex: legs.length - 1, travelProgress: 1 };
    }
    if (segment.type === 'hold') {
      return { ...poseAtStop(stops[segment.stopIndex], headings[segment.stopIndex], preset),
               elapsedMs: timeMs, segmentType: 'hold', stopIndex: segment.stopIndex,
               legIndex: segment.stopIndex - 1, travelProgress: 1 };
    }
    const leg = legs[segment.legIndex];
    // Zoom peak stays broad through the middle of travel, then settles without a camera cut.
    const departure = smooth(u / 0.37);
    const arrival = smooth((u - 0.61) / 0.39);
    const highAltitude = departure * (1 - arrival);
    const bearing = headings[leg.index] +
      deltaAngle(headings[leg.index], headings[leg.index + 1]) * eased +
      Math.sin(Math.PI * u) ** 2 * 6;
    return {
      center: positionAlong(leg, eased),
      zoom: mix(preset.arrivalZoom, leg.cruiseZoom, highAltitude),
      pitch: mix(preset.arrivalPitch, preset.cruisingPitch, highAltitude),
      bearing,
      elapsedMs: timeMs,
      segmentType: 'travel',
      stopIndex: leg.index,
      legIndex: leg.index,
      travelProgress: eased
    };
  }

  function revealedRoute(ms) {
    const timeMs = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    const features = [];
    for (const leg of legs) {
      if (timeMs <= leg.startMs) break;
      const u = timeMs >= leg.endMs ? 1 : smooth((timeMs - leg.startMs) / leg.durationMs);
      const end = Math.min(leg.path.length - 1, Math.floor(u * (leg.path.length - 1)));
      const coords = leg.path.slice(0, end + 1);
      if (u > 0 && u < 1) coords.push(positionAlong(leg, u));
      if (coords.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: { legIndex: leg.index },
        geometry: { type: 'LineString', coordinates: coords }
      });
    }
    return { type: 'FeatureCollection', features };
  }

  return { stops, legs, segments, headings, stopTimesMs, totalMs,
           totalMiles: legs.reduce((sum, leg) => sum + leg.miles, 0),
           preset, sample, revealedRoute };
}
