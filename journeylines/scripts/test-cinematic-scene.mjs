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


test('north-biased camera remains within 45 degrees for every segment and stop', () => {
  const scene = buildCinematicScene(pts);
  for (let t = 0; t <= scene.totalMs; t += 67) {
    const camera = scene.sample(t);
    assert.ok(camera.bearing >= -45.00001 && camera.bearing <= 45.00001,
      'north-up limit violated at ' + t + 'ms');
  }
  assert.ok(scene.headings.some(angle => Math.abs(angle) > 10),
    'test should cover nontrivial rotation');
});

test('destinations and unflown routes appear only at the start of their incoming leg', () => {
  const scene = buildCinematicScene(pts);
  assert.deepEqual(scene.visibleStops(0).map(stop => stop.id), ['sd']);
  assert.equal(scene.visibleRoutes(0).length, 0);
  const start = scene.legs[0].startMs;
  assert.deepEqual(scene.visibleStops(start - 1).map(stop => stop.id), ['sd']);
  assert.deepEqual(scene.visibleStops(start).map(stop => stop.id), ['sd', 'ny']);
  assert.equal(scene.visibleRoutes(start).length, 1);
  assert.equal(scene.visibleRoutes(scene.legs[1].startMs - 1).length, 1);
  assert.equal(scene.visibleRoutes(scene.legs[1].startMs).length, 2);
  assert.deepEqual(scene.visibleStops(scene.totalMs).map(stop => stop.id), ['sd', 'ny', 'tk']);
  // Rewinding also hides those locations and legs.
  assert.equal(scene.visibleStops(0).length, 1);
});

test('aircraft position and heading follow the curved flight arc, disappearing at landing', () => {
  const scene = buildCinematicScene(pts);
  const leg = scene.legs[0];
  assert.equal(scene.planeAt(0), null);
  assert.equal(scene.planeAt(leg.endMs), null);
  const ms = (leg.startMs + leg.endMs) / 2;
  const plane = scene.planeAt(ms);
  assert.ok(plane);
  assert.equal(plane.legIndex, 0);
  assert.ok(plane.bearing >= 0 && plane.bearing <= 360);
  assert.ok(plane.coordinates.every(Number.isFinite));
  const revealed = scene.revealedRoute(ms).features[0].geometry.coordinates.at(-1);
  assert.ok(Math.abs(dlon(plane.coordinates[0], revealed[0])) < 0.0001);
  assert.ok(Math.abs(plane.coordinates[1] - revealed[1]) < 0.0001);
});

test('curved routes preserve exact endpoints and add a subtle lateral bow', async () => {
  const { compilePlaybackLeg } = await import('../src/utils/compiledPlaybackPlan.js');
  const { milesBetween } = await import('../src/utils/distanceUtils.js');
  const scene = buildCinematicScene(pts);
  for (const leg of scene.legs) {
    assert.ok(Math.abs(dlon(leg.path[0][0], leg.from.lon)) < 0.0001);
    assert.ok(Math.abs(leg.path[0][1] - leg.from.lat) < 0.0001);
    assert.ok(Math.abs(dlon(leg.path.at(-1)[0], leg.to.lon)) < 0.0001);
    assert.ok(Math.abs(leg.path.at(-1)[1] - leg.to.lat) < 0.0001);
  }
  const first = scene.legs[0];
  const direct = compilePlaybackLeg({ from: first.from, to: first.to,
    mode: 'plane', miles: milesBetween(first.from, first.to) });
  const midpoint = Math.floor(first.path.length / 2);
  const curved = first.path[midpoint];
  const directCenter = [direct.positions[midpoint * 2], direct.positions[midpoint * 2 + 1]];
  assert.ok(Math.hypot(dlon(directCenter[0], curved[0]), curved[1] - directCenter[1]) > .008,
    'air route should have a visible mid-flight bend');
});

test('touchdown title and ripple state are deterministic and time-bounded', () => {
  const scene = buildCinematicScene(pts);
  const landing = scene.stopTimesMs[1];
  assert.equal(scene.arrivalAt(landing - 1), null);
  assert.equal(scene.planeAt(landing), null);
  const immediately = scene.arrivalAt(landing);
  const during = scene.arrivalAt(landing + 440);
  assert.equal(immediately.stop.id, 'ny');
  assert.ok(during.opacity > 0.8);
  assert.equal(during.stopIndex, 1);
  assert.deepEqual(scene.arrivalAt(landing + 440), during);
  assert.equal(scene.arrivalAt(landing + scene.preset.arrivalEffectMs), null);
  assert.equal(scene.arrivalAt(scene.totalMs), null);
});

test('north-up limit is configurable only within the 0 to 45 degree safety envelope', () => {
  assert.throws(() => buildCinematicScene(pts, { northLimitDegrees: 60 }), /outside/);
  const scene = buildCinematicScene(pts, { northLimitDegrees: 15 });
  for (const leg of scene.legs) {
    const pose = scene.sample((leg.startMs + leg.endMs) / 2);
    assert.ok(Math.abs(pose.bearing) <= 15);
  }
});
