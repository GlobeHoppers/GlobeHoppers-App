import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCinematicCameraPlan, anchorCinematicCameraPlan, sampleCinematicCamera,
  blendCinematicCamera, cinematicMotionRequested
} from '../src/utils/cinematicCamera.js';

const sampleAt = t => ({
  camera: {
    center: [-120 + 40 * t, 32 + 10 * t],
    zoom: 5.5 + 0.1 * t,
    pitch: 55,
    bearing: 0
  }
});
const options = () => ({
  sampleAt, from: { lon: -120, lat: 32 }, to: { lon: -80, lat: 42 },
  mode: 'plane', distanceMiles: 2252
});
const within = (x, a, b, label) => assert.ok(x >= a && x <= b, `${label}: ${x} not in [${a}, ${b}]`);
const finite = camera => assert.ok([...(camera?.center || []), camera?.zoom, camera?.pitch, camera?.bearing].every(Number.isFinite));

test('cinematic spline samples a scene exactly once per knot, never per display frame', () => {
  let calls = 0;
  const plan = buildCinematicCameraPlan({ ...options(), sampleAt: t => { calls++; return sampleAt(t); } });
  assert.equal(calls, plan.knots.length);
  for (let i = 0; i <= 3600; i++) finite(sampleCinematicCamera(plan, i / 3600));
  assert.equal(calls, plan.knots.length, 'camera playback must consume precomputed knots only');
});

test('cinematic camera adds purposeful zoom, pitch, and restrained banking without altering the route', () => {
  const plan = buildCinematicCameraPlan(options());
  const start = sampleCinematicCamera(plan, 0);
  const cruise = sampleCinematicCamera(plan, .56);
  const approach = sampleCinematicCamera(plan, .95);
  assert.deepEqual(start, sampleAt(0).camera);
  assert.ok(cruise.zoom < start.zoom, 'cruise is a wider shot');
  assert.ok(approach.zoom > cruise.zoom + .65, 'approach pushes toward the destination');
  assert.ok(cruise.pitch < start.pitch - 3, 'cruise view relaxes its pitch');
  assert.ok(Math.abs(cruise.bearing) > 5 && Math.abs(cruise.bearing) <= 16);
  assert.equal(sampleCinematicCamera(plan, 0).center[0], -120);
  assert.equal(sampleCinematicCamera(plan, 1).center[0], -80);
  assert.deepEqual(sampleCinematicCamera(plan, -.5), start);
  assert.deepEqual(sampleCinematicCamera(plan, 1.5), sampleCinematicCamera(plan, 1));
});

test('connected legs begin from exact outgoing camera without overshoot or a jump', () => {
  const route = buildCinematicCameraPlan(options());
  const previous = { center: [-120.35, 31.89], zoom: 6.0, pitch: 51, bearing: -4 };
  const anchored = anchorCinematicCameraPlan(route, previous);
  assert.deepEqual(sampleCinematicCamera(anchored, 0), previous);
  assert.deepEqual(sampleCinematicCamera(route, 0), sampleAt(0).camera, 'anchoring does not mutate cached plan');
  const a = sampleCinematicCamera(anchored, .055), b = sampleCinematicCamera(anchored, .12);
  // Departure intentionally has a pitch/zoom peak at its first keyframe.
  // Check physical bounds and smooth interpolation between keyframes, not
  // monotonicity across the designed cinematic rise and fall.
  within(a.zoom, 3, 10, 'departure zoom');
  within(a.pitch, 0, 75, 'departure pitch');
  for (const ch of ['zoom', 'pitch']) {
    const midpoint = sampleCinematicCamera(anchored, (.055 + .12) / 2);
    within(midpoint[ch], Math.min(a[ch], b[ch]) - .001, Math.max(a[ch], b[ch]) + .001,
      'keyframe segment ' + ch);
  }
  const start = sampleCinematicCamera(anchored, 0);
  const next = sampleCinematicCamera(anchored, 1 / 10000);
  assert.ok(Math.abs(next.center[0] - start.center[0]) < .01, 'continuous start');
  assert.ok(Math.abs(next.zoom - start.zoom) < .01, 'no arrival zoom cut');
});

test('dateline crossing takes the short way without a 360-degree camera spin', () => {
  const plan = buildCinematicCameraPlan({
    ...options(),
    from: { lon: 173 }, to: { lon: -171 },
    sampleAt: t => ({ camera: {
      center: [t < .5 ? 173 + 16 * t : -187 + 16 * t, 24 + t * 3],
      zoom: 5.2, pitch: 54, bearing: t < .5 ? 177 + 5*t : -183 + 5*t
    } })
  });
  let previous = sampleCinematicCamera(plan, 0);
  for (let i = 1; i <= 1000; i++) {
    const next = sampleCinematicCamera(plan, i / 1000);
    assert.ok(Math.abs(next.center[0] - previous.center[0]) < 1.5, 'longitude must unwrap smoothly');
    assert.ok(Math.abs(next.bearing - previous.bearing) < 2, 'bearing must unwrap smoothly');
    finite(next);
    previous = next;
  }
});

test('cinematic director never exceeds MapLibre pitch guardrails on surface routes', () => {
  for (const mode of ['plane', 'drive', 'boat', 'train']) {
    const plan = buildCinematicCameraPlan({
      ...options(), mode, sampleAt: t => ({camera:{center:[10+t,20+t],zoom:7,pitch:73,bearing:0}})
    });
    for (let i = 0; i <= 100; i++) {
      const camera = sampleCinematicCamera(plan, i/100);
      within(camera.pitch, 0, 75, 'pitch');
    }
  }
});

test('profile change blends across shortest longitude and bearing paths', () => {
  const oldCamera = { center: [179, 21], zoom: 4, pitch: 50, bearing: 179 };
  const newCamera = { center: [-179, 23], zoom: 6, pitch: 60, bearing: -179 };
  const half = blendCinematicCamera(oldCamera, newCamera, .5);
  assert.deepEqual(half.center, [180, 22]);
  assert.equal(half.zoom, 5);
  assert.equal(half.pitch, 55);
  assert.equal(half.bearing, 180);
});

test('classic rescue URLs always disable cinematic camera', () => {
  assert.equal(cinematicMotionRequested(''), true);
  assert.equal(cinematicMotionRequested('?v9Cinematic=1'), true);
  assert.equal(cinematicMotionRequested('?v9Cinematic=0'), false);
  assert.equal(cinematicMotionRequested('?v9Legacy=1&v9Cinematic=1'), false);
  assert.equal(cinematicMotionRequested('?v9=0&v9Cinematic=1'), false);
});
