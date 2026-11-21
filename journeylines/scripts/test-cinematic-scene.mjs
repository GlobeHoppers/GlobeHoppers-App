import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCinematicScene, normalizeCinematicStops } from '../src/cinematic/scene.js';
import { cinematicStopsFromTrip } from '../src/cinematic/tripAdapter.js';

const pts = [
  { id: 'sd', name: 'San Diego', lon: -117.1611, lat: 32.7157 },
  { id: 'ny', name: 'New York', lon: -74.006, lat: 40.7128 },
  { id: 'tk', name: 'Tokyo', lon: 139.6503, lat: 35.6762 }
];
const dlon = (a, b) => ((b - a + 540) % 360) - 180;
const finitePose = p => [...p.center, p.zoom, p.pitch, p.bearing].every(Number.isFinite);

test('camera samples are deterministic and finite across 3-stop itinerary', () => {
  const one = buildCinematicScene(pts);
  const two = buildCinematicScene(pts);
  assert.equal(one.legs.length, 2);
  assert.ok(one.totalMs > 15000);
  for (let t = 0; t <= one.totalMs; t += 139) {
    const a = one.sample(t), b = two.sample(t);
    assert.deepEqual(a, b);
    assert.ok(finitePose(a));
  }
});

test('cinematic camera has no jumps at segment boundaries', () => {
  const scene = buildCinematicScene(pts);
  for (const seg of scene.segments.slice(1)) {
    const before = scene.sample(seg.startMs - 0.001);
    const after = scene.sample(seg.startMs);
    assert.ok(Math.abs(dlon(before.center[0], after.center[0])) < 0.0002, seg.type);
    assert.ok(Math.abs(before.center[1] - after.center[1]) < 0.0002, seg.type);
    assert.ok(Math.abs(before.zoom - after.zoom) < 0.001, seg.type);
    assert.ok(Math.abs(dlon(before.bearing, after.bearing)) < 0.001, seg.type);
  }
});

test('route lines are revealed in sync with the camera and never exceed segment path', () => {
  const scene = buildCinematicScene(pts);
  assert.equal(scene.revealedRoute(0).features.length, 0);
  assert.equal(scene.revealedRoute(scene.totalMs).features.length, 2);
  const mid = scene.legs[0].startMs + scene.legs[0].durationMs / 2;
  const half = scene.revealedRoute(mid);
  assert.equal(half.features.length, 1);
  assert.ok(half.features[0].geometry.coordinates.length > 2);
  assert.ok(half.features[0].geometry.coordinates.length < scene.legs[0].path.length);
});

test('dateline-crossing sample takes short geographic path', () => {
  const scene = buildCinematicScene([
    { id: 'a', lon: 179, lat: 17 },
    { id: 'b', lon: -179, lat: 17 }
  ]);
  const leg = scene.legs[0];
  let prev = null;
  for (let t = leg.startMs; t <= leg.endMs; t += 80) {
    const sample = scene.sample(t).center;
    if (prev) assert.ok(Math.abs(dlon(prev[0], sample[0])) < 1);
    prev = sample;
  }
});

test('rejects invalid and duplicate scene inputs', () => {
  assert.throws(() => normalizeCinematicStops([pts[0]]), /between 2 and 128/);
  assert.throws(() => buildCinematicScene([pts[0], { ...pts[1], lat: 93 }]), /Invalid/);
  assert.throws(() => buildCinematicScene([pts[0], { ...pts[0] }]), /duplicate/);
  assert.throws(() => buildCinematicScene([pts[0], { ...pts[0], id: 'different' }]), /indistinguishable/);
});

test('trip adapter reads versioned trip-route points through the existing v9 normalizer', () => {
  const trip = { id: 'demo', year: 2026, month: 11, label: 'Demo',
    route: [{ locationId: 'a' }, { locationId: 'b', modeFromPrevious: 'plane' }] };
  const stops = cinematicStopsFromTrip(trip, [
    { id: 'a', name: 'A', lon: 10, lat: 20 },
    { id: 'b', name: 'B', lon: 30, lat: 40 }
  ]);
  assert.equal(stops.length, 2);
  assert.equal(stops[0].name, 'A');
  assert.notEqual(stops[0].id, stops[1].id);
});
