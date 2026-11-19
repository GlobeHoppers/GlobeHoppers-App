import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePlaybackLeg } from '../src/utils/compiledPlaybackPlan.js';

const place = (id, lon, lat) => ({ id, lon, lat });
const leg = (from, to, mode = 'plane', miles = 200) => ({ from, to, mode, miles });

test('same input produces exactly the same compiled output', () => {
  const input = leg(place('a', -117.16, 32.72), place('b', -73.94, 40.72));
  const one = compilePlaybackLeg(input);
  const two = compilePlaybackLeg(input);
  assert.deepEqual(one, two);
  assert.equal(one.positions.length, one.sampleCount * 2);
  assert.equal(one.camera.length, one.sampleCount * 2);
});

test('return legs preserve heading direction and start/end points', () => {
  const a = place('a', -117.16, 32.72), b = place('b', -118.24, 34.05);
  const forward = compilePlaybackLeg(leg(a, b, 'drive', 125));
  const reverse = compilePlaybackLeg(leg(b, a, 'drive', 125));
  assert.ok(Math.abs(forward.positions[0] - a.lon) < .00001);
  assert.ok(Math.abs(reverse.positions[0] - b.lon) < .00001);
  assert.ok(Math.abs(forward.positions.at(-2) - b.lon) < .00001);
  assert.ok(Math.abs(reverse.positions.at(-2) - a.lon) < .00001);
});

test('crossing the date line takes the short path, not a full globe revolution', () => {
  const from = place('a', 179, 15), to = place('b', -179, 15);
  const output = compilePlaybackLeg(leg(from, to));
  const shortestDelta = (a, b) => ((b - a + 540) % 360) - 180;
  for (let i = 2; i < output.positions.length; i += 2) {
    assert.ok(Math.abs(shortestDelta(output.positions[i - 2], output.positions[i])) < 1, 'teleport-like step');
  }
  assert.ok(Math.abs(shortestDelta(output.positions[0], output.positions.at(-2))) < 3);
});

test('saved surface geometry survives with expected endpoints and finite samples', () => {
  const a = place('a', -117.2, 32.7), b = place('b', -116.8, 33.4);
  const route = [[a.lon, a.lat], [-117.5, 32.9], [-117.0, 33.15], [b.lon, b.lat]];
  const output = compilePlaybackLeg(leg(a, b, 'drive', 100), route);
  assert.ok(output.presentation.length >= 4);
  assert.ok(output.positions.every(Number.isFinite));
  assert.ok(output.cumulative.every((distance, index) => index === 0 || distance >= output.cumulative[index - 1]));
});

test('mode-specific timing is compiled ahead of playback', () => {
  const a = place('a', 0, 0), b = place('b', 1, 1);
  const plane = compilePlaybackLeg(leg(a, b, 'plane', 250));
  const boat = compilePlaybackLeg(leg(a, b, 'boat', 250));
  assert.ok(boat.durationMs > plane.durationMs);
});

test('invalid endpoints are rejected before creating a playback package', () => {
  assert.throws(() => compilePlaybackLeg(leg(place('a', NaN, 0), place('b', 1, 1))), /invalid endpoints/);
});
