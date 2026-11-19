import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackEngine } from '../src/utils/playbackEngine.js';

function fakeClock() {
  let time = 0;
  let serial = 0;
  const frames = new Map();
  const completions = [];
  const engine = new PlaybackEngine({
    now: () => time,
    requestFrame: cb => { const id = ++serial; frames.set(id, cb); return id; },
    cancelFrame: id => frames.delete(id),
    enqueue: cb => completions.push(cb)
  });
  return {
    engine,
    advance(ms) {
      time += ms;
      const queue = [...frames.values()];
      frames.clear();
      for (const cb of queue) cb(time);
      return engine.snapshot();
    },
    advanceWithoutFrame(ms) { time += ms; },
    drain() { while (completions.length) completions.shift()(); },
    get pendingFrames() { return frames.size; },
    get pendingCompletions() { return completions.length; }
  };
}

test('one authoritative clock preserves elapsed time while paused', () => {
  const clock = fakeClock();
  clock.engine.configure({ duration: 1000, settle: 250 });
  clock.engine.play();
  assert.equal(clock.pendingFrames, 1);
  clock.advance(250);
  assert.equal(clock.engine.snapshot().progress, 0.25);
  clock.engine.pause();
  assert.equal(clock.pendingFrames, 0);
  clock.advance(800);
  assert.equal(clock.engine.snapshot().progress, 0.25);
  clock.engine.play();
  clock.advance(200);
  assert.equal(clock.engine.snapshot().progress, 0.45);
  clock.engine.pause();
});

test('seeking while playing instantly resets the same clock, not the wall time', () => {
  const clock = fakeClock();
  clock.engine.configure({ duration: 2000 });
  clock.engine.play();
  clock.advance(900);
  clock.engine.seek(0.2);
  assert.ok(Math.abs(clock.engine.snapshot().elapsed - 400) < 1e-9);
  clock.advance(120);
  assert.ok(Math.abs(clock.engine.snapshot().progress - 0.26) < 1e-9);
  clock.engine.seek(0.9);
  clock.advance(60);
  assert.ok(Math.abs(clock.engine.snapshot().progress - 0.93) < 1e-9);
});

test('stale completion cannot advance a different seek within the same generation', () => {
  const clock = fakeClock();
  let completed = 0;
  clock.engine.configure({ duration: 100, onComplete: () => completed++ });
  clock.engine.play();
  clock.advance(100);
  assert.equal(clock.pendingCompletions, 1);
  clock.engine.seek(0.25);
  clock.engine.play();
  clock.drain();
  assert.equal(completed, 0);
  clock.advance(75);
  clock.drain();
  assert.equal(completed, 1);
});

test('reconfiguring a new leg invalidates a pending completion', () => {
  const clock = fakeClock();
  const callbacks = [];
  clock.engine.configure({ duration: 100, metadata: { tripId: 'A' }, onComplete: () => callbacks.push('A') });
  clock.engine.play();
  clock.advance(100);
  clock.engine.configure({ duration: 300, metadata: { tripId: 'B' }, onComplete: () => callbacks.push('B') });
  clock.drain();
  assert.deepEqual(callbacks, []);
  assert.equal(clock.engine.snapshot().metadata.tripId, 'B');
  clock.engine.play();
  clock.advance(300);
  clock.drain();
  assert.deepEqual(callbacks, ['B']);
});

test('stop and pause invalidate queued completion and prevent stray frames', () => {
  const clock = fakeClock();
  let count = 0;
  clock.engine.configure({ duration: 100, onComplete: () => count++ });
  clock.engine.play();
  clock.advance(100);
  clock.engine.pause();
  clock.drain();
  assert.equal(count, 0);
  clock.engine.stop(0.5);
  assert.equal(clock.pendingFrames, 0);
  clock.advance(5000);
  assert.equal(clock.engine.snapshot().progress, 0.5);
});

test('settle remains part of clock, but leg progress clamps at 100%', () => {
  const clock = fakeClock();
  let completed = 0;
  clock.engine.configure({ duration: 100, settle: 50, onComplete: () => completed++ });
  clock.engine.play();
  clock.advance(120);
  assert.equal(clock.engine.snapshot().progress, 1);
  assert.equal(clock.engine.snapshot().rawProgress, 1.2);
  assert.equal(completed, 0);
  clock.advance(30);
  clock.drain();
  assert.equal(completed, 1);
  assert.equal(clock.pendingFrames, 0);
});

test('irregular frame cadence follows elapsed milliseconds, not frame count', () => {
  const clock = fakeClock();
  clock.engine.configure({ duration: 1000 });
  clock.engine.play();
  for (const ms of [16, 33, 8, 120, 1, 42, 80]) clock.advance(ms);
  assert.equal(clock.engine.snapshot().elapsed, 300);
  assert.equal(clock.engine.snapshot().progress, .3);
});

test('a subscriber stopping playback cannot be overridden by a stale frame', () => {
  const clock = fakeClock();
  let callbackCount = 0;
  clock.engine.configure({ duration: 100, onComplete: () => callbackCount++ });
  const unsub = clock.engine.subscribe(frame => {
    if (frame.playing && frame.elapsed >= 50) clock.engine.stop(.3);
  });
  clock.engine.play();
  clock.advance(100);
  clock.drain();
  assert.equal(callbackCount, 0);
  assert.equal(clock.pendingFrames, 0);
  assert.equal(clock.engine.snapshot().progress, .3);
  unsub();
});
