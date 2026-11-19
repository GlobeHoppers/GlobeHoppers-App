import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraDirector, resolveCameraOwner, timeBasedCameraAlpha } from '../src/utils/cameraDirector.js';

test('cinematic camera authority has one clear owner', () => {
  assert.equal(resolveCameraOwner({}), 'scene');
  assert.equal(resolveCameraOwner({ playing: true }), 'playback');
  assert.equal(resolveCameraOwner({ intro: true, playing: true }), 'intro');
  assert.equal(resolveCameraOwner({ relocating: true, playing: true }), 'relocation');
  assert.equal(resolveCameraOwner({ tuning: true, playing: true }), 'tuning');
  assert.equal(resolveCameraOwner({ relocating: true, tuning: true, playing: true }), 'relocation');
  assert.equal(resolveCameraOwner({ intro: true, tuning: true }), 'intro');
  assert.equal(resolveCameraOwner({ idle: true, playing: true }), 'idle');
  assert.equal(resolveCameraOwner({ overview: true, playing: true }), 'overview');
});

test('stale playback generations cannot write the new leg camera', () => {
  const director = new CameraDirector();
  director.reconcile({ playing: true }, 3);
  assert.equal(director.allows('playback', 3), true);
  assert.equal(director.allows('playback', 2), false);
  director.reconcile({ playing: true }, 4);
  assert.equal(director.allows('playback', 3), false);
  assert.equal(director.allows('playback', 4), true);
});

test('the manual/intro/relocation states exclude competing render writers', () => {
  const director = new CameraDirector();
  director.reconcile({ intro: true }, 1);
  assert.equal(director.allows('scene'), false);
  assert.equal(director.allows('playback', 1), false);
  assert.equal(director.allows('intro'), true);
  director.reconcile({ relocating: true }, 2);
  assert.equal(director.allows('intro'), false);
  assert.equal(director.allows('relocation'), true);
  director.reconcile({}, 2);
  assert.equal(director.allows('scene'), true);
  assert.equal(director.allows('relocation'), false);
});

test('stale delayed camera operations lose authority', () => {
  const director = new CameraDirector();
  director.reconcile({ intro: true }, 1);
  const ticket = director.ticket('intro');
  assert.ok(director.valid(ticket));
  director.reconcile({ playing: true }, 2);
  assert.equal(director.valid(ticket), false);
  const newer = director.ticket('playback');
  director.reconcile({ playing: true }, 3);
  assert.equal(director.valid(newer), false);
});

test('same elapsed time gives same smoothing at different camera frame cadences', () => {
  for (const amount of [0.01, 0.028, 0.082, 0.35]) {
    const alpha28 = timeBasedCameraAlpha(amount, 28);
    const alpha56 = timeBasedCameraAlpha(amount, 56);
    assert.ok(Math.abs(alpha28 - amount) < 1e-12);
    assert.ok(Math.abs(1 - Math.pow(1 - alpha28, 2) - alpha56) < 1e-12);
    const alpha35 = timeBasedCameraAlpha(amount, 35);
    const alpha70 = timeBasedCameraAlpha(amount, 70);
    assert.ok(Math.abs(1 - Math.pow(1 - alpha35, 2) - alpha70) < 1e-12);
  }
});
