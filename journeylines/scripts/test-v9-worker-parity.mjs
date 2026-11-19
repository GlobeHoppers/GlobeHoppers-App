/**
 * WP1 migration gate: compare v9 compiler against the exact v7.5 worker
 * sampler and camera-lead algorithm for all existing travel legs.
 * This compares geometry numerically; a browser visual baseline is still needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { flattenLegs } from '../src/utils/tripExpansion.js';
import { compilePlaybackLeg } from '../src/utils/compiledPlaybackPlan.js';

// The worker registers an onmessage handler at import; no requests are fired.
globalThis.self ??= { postMessage() {} };
const { buildPlaybackPlan } = await import('../src/workers/routingWorker.js');

const root = path.resolve(import.meta.dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, 'src/data', file), 'utf8'));
const locations = read('locations.json');
const entries = flattenLegs(read('trips.json'), Object.fromEntries(locations.map(loc => [loc.id, loc])), read('homeBases.json'));
const details = read('routeDetails.json');
const angularDelta = (a, b) => ((b - a + 540) % 360) - 180;
const close = (a, b, tol = 0.0002) => Math.abs(Number(a) - Number(b)) <= tol;
const geometryForEntry = entry => {
  const key = `${entry.trip.id}::${entry.legId}`;
  const old = `${entry.trip.id}::leg-${entry.legIndex}`;
  const record = details.routes?.[key] || details.routes?.[old];
  const leg = entry.leg;
  if (!record || record.tripId !== entry.trip.id || String(record.legId) !== String(entry.legId) ||
      record.fromLocationId !== leg.from.id || record.toLocationId !== leg.to.id ||
      record.mode !== leg.mode || !close(record.coordinates?.from?.[0], leg.from.lon) ||
      !close(record.coordinates?.from?.[1], leg.from.lat) ||
      !close(record.coordinates?.to?.[0], leg.to.lon) ||
      !close(record.coordinates?.to?.[1], leg.to.lat)) return null;
  return Array.isArray(record.geometry) && record.geometry.length >= 2 ? record.geometry : null;
};

let maxPositionDegrees = 0, maxCameraDegrees = 0, maxHeadingDegrees = 0, maxTotalMilesDelta = 0;
let detailed = 0;
for (const entry of entries) {
  const saved = geometryForEntry(entry);
  if (saved?.length > 2) detailed++;
  const legacy = buildPlaybackPlan(entry.leg, saved, 0);
  const compiled = compilePlaybackLeg(entry.leg, saved);
  const key = `${entry.trip.id}::${entry.legId}`;
  assert.equal(compiled.sampleCount, legacy.sampleCount, `sample count changed: ${key}`);
  for (const keyArray of ['positions', 'camera', 'headings', 'cumulative']) {
    assert.equal(compiled[keyArray].length, legacy[keyArray].length, `${keyArray} length changed: ${key}`);
  }
  for (let i = 0; i < legacy.sampleCount; i++) {
    const p = i * 2;
    const position = Math.hypot(angularDelta(legacy.positions[p], compiled.positions[p]), legacy.positions[p + 1] - compiled.positions[p + 1]);
    const camera = Math.hypot(angularDelta(legacy.camera[p], compiled.camera[p]), legacy.camera[p + 1] - compiled.camera[p + 1]);
    const heading = Math.abs(angularDelta(legacy.headings[i], compiled.headings[i]));
    maxPositionDegrees = Math.max(maxPositionDegrees, position);
    maxCameraDegrees = Math.max(maxCameraDegrees, camera);
    maxHeadingDegrees = Math.max(maxHeadingDegrees, heading);
    assert.ok(position <= 0.06, `position parity exceeded 0.06°: ${key} at ${i} (${position})`);
    assert.ok(camera <= 0.06, `camera parity exceeded 0.06°: ${key} at ${i} (${camera})`);
  }
  maxTotalMilesDelta = Math.max(maxTotalMilesDelta, Math.abs(compiled.totalMiles - legacy.totalMiles));
}
assert.equal(entries.length, 401);
console.log(`PASS: compared legacy worker and v9 compiler across ${entries.length} legs, ${detailed} with detailed geometry`);
console.log(`Max drift: position ${maxPositionDegrees.toFixed(6)}°, camera ${maxCameraDegrees.toFixed(6)}°, heading ${maxHeadingDegrees.toFixed(3)}°, distance ${maxTotalMilesDelta.toFixed(3)} mi`);
