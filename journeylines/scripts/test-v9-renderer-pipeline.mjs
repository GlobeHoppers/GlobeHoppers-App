import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackFramePipeline, PlaybackRenderScheduler, isV9RendererRequested } from '../src/utils/playbackFramePipeline.js';
import { timeBasedCameraAlpha } from '../src/utils/cameraDirector.js';

const frame = timestamp => ({ timestamp, rawProgress: timestamp / 2000, generation: 7 });

test('WP3 renderer is opt-in and never enabled implicitly', () => {
  assert.equal(isV9RendererRequested(''), false);
  assert.equal(isV9RendererRequested('?v9Playback=1'), false);
  assert.equal(isV9RendererRequested('?v9Renderer=1'), true);
  assert.equal(isV9RendererRequested('?v9Renderer=0'), false);
});

test('120Hz source clock targets 60Hz display; camera and vehicle share exact frames', () => {
  const pipeline = new PlaybackFramePipeline();
  const counts = { scenes: 0, camera: 0, vehicle: 0, trail: 0, arc: 0 };
  const observed = [];
  for (let i = 0; i <= 120; i++) {
    const timestamp = i * 1000 / 120;
    const adapters = {
      sampleScene: () => { counts.scenes++; return { marker: timestamp }; },
      renderCamera: scene => { assert.equal(scene.marker, timestamp); counts.camera++; observed.push(['camera', timestamp]); },
      renderVehicle: scene => { assert.equal(scene.marker, timestamp); counts.vehicle++; observed.push(['vehicle', timestamp]); },
      renderTrail: () => counts.trail++,
      renderArc: () => counts.arc++
    };
    pipeline.render(frame(timestamp), { routeKey: 'trip-a::leg-1', generation: 7, quality: 'high', progress: timestamp / 2000 }, adapters);
  }
  assert.ok(counts.scenes >= 57 && counts.scenes <= 62, JSON.stringify(counts));
  assert.equal(counts.scenes, counts.camera);
  assert.equal(counts.camera, counts.vehicle);
  assert.ok(counts.trail >= 9 && counts.trail <= 15, JSON.stringify(counts));
  assert.ok(counts.arc >= 17 && counts.arc <= 24, JSON.stringify(counts));
  assert.ok(counts.scenes < 121, 'scene must not be computed on every 120Hz tick');
  for (let i = 0; i < observed.length; i += 2) {
    assert.deepEqual(observed.slice(i, i + 2), [['camera', observed[i][1]], ['vehicle', observed[i][1]]]);
  }
});

test('60Hz input remains approximately 60Hz without accidental half rate', () => {
  const scheduler = new PlaybackRenderScheduler();
  let scenes = 0;
  for (let i = 0; i <= 60; i++) {
    if (scheduler.plan({ timestamp: i * (1000 / 60), generation: 1, routeKey: 'a', quality: 'high' }).display) scenes++;
  }
  assert.ok(scenes >= 58 && scenes <= 61, `scenes=${scenes}`);
});

test('adaptive profiles reduce render budgets on lower-quality frames', () => {
  for (const [quality, min, max] of [['high', 57, 62], ['medium', 43, 47], ['low', 29, 32]]) {
    const s = new PlaybackRenderScheduler();
    let count = 0;
    for (let i = 0; i <= 120; i++)
      if (s.plan({ timestamp: i * 1000 / 120, quality, routeKey: 'a', generation: 1 }).display) count++;
    assert.ok(count >= min && count <= max, `quality=${quality}, samples=${count}`);
  }
});

test('transitions and new generations force a frame even inside the throttle window', () => {
  const s = new PlaybackRenderScheduler();
  const first = s.plan({ timestamp: 1000, routeKey: 'trip1', generation: 1, progress: 0.1 });
  assert.equal(first.display, true);
  assert.equal(first.trail, true);
  assert.equal(first.arc, true);
  const skipped = s.plan({ timestamp: 1004, routeKey: 'trip1', generation: 1, progress: 0.2 });
  assert.equal(skipped.display, false);
  const connected = s.plan({ timestamp: 1005, routeKey: 'trip2', generation: 2, progress: 0 });
  assert.equal(connected.display, true);
  assert.equal(connected.trail, true);
  const seek = s.plan({ timestamp: 1006, routeKey: 'trip2', generation: 3, progress: 0.5 });
  assert.equal(seek.display, true);
});

test('final arrival forces exactly one additional trail update, not repeated setData', () => {
  const s = new PlaybackRenderScheduler();
  s.plan({ timestamp: 1000, routeKey: 'a', generation: 1, progress: 0.98 });
  const end = s.plan({ timestamp: 1002, routeKey: 'a', generation: 1, progress: 1 });
  assert.equal(end.display, true);
  assert.equal(end.trail, true);
  const second = s.plan({ timestamp: 1003, routeKey: 'a', generation: 1, progress: 1.2 });
  assert.equal(second.display, false);
  assert.equal(second.trail, false);
});

test('a long inactive gap resets budgets rather than replaying queued frames', () => {
  const s = new PlaybackRenderScheduler();
  s.plan({ timestamp: 1, routeKey: 'a', generation: 1 });
  const resumed = s.plan({ timestamp: 1600, routeKey: 'a', generation: 1 });
  assert.equal(resumed.display, true);
  assert.equal(resumed.reset, true);
  assert.equal(resumed.trail, true);
  assert.equal(s.snapshot().displays, 2);
});

test('no extra RAF, React state, or per-frame timer exists in renderer scheduling', () => {
  const source = new PlaybackRenderScheduler();
  assert.equal('requestAnimationFrame' in source, false);
  assert.equal('setTimeout' in source, false);
  assert.equal('subscribe' in source, false);
});

test('vehicle turn damping is time-consistent at 30, 60 and 120Hz', () => {
  for (const blend of [0.34, 0.42, 0.48]) {
    const p120 = timeBasedCameraAlpha(blend, 1000 / 120, 1000 / 60);
    const p60 = timeBasedCameraAlpha(blend, 1000 / 60, 1000 / 60);
    const p30 = timeBasedCameraAlpha(blend, 1000 / 30, 1000 / 60);
    assert.ok(Math.abs(p60 - blend) < 1e-12);
    assert.ok(Math.abs(1 - (1 - p120) ** 4 - p30) < 1e-12);
    assert.ok(Math.abs(1 - (1 - p60) ** 2 - p30) < 1e-12);
  }
});

test('30 minute unattended playback schedule has constant-size state', () => {
  const scheduler = new PlaybackRenderScheduler();
  // 30 min of 120Hz clock frames, with a leg handoff each 3 minutes.
  const totalTicks = 120 * 60 * 30;
  for (let i = 0; i < totalTicks; i++) {
    const timestamp = i * 1000 / 120;
    scheduler.plan({ timestamp, quality: 'high',
      routeKey: 'trip-' + Math.floor(timestamp / 180000), generation: 1 + Math.floor(timestamp / 180000),
      progress: (timestamp % 180000) / 180000 });
  }
  const stats = scheduler.snapshot();
  assert.equal(stats.ticks, totalTicks);
  assert.ok(stats.displays >= 107000 && stats.displays <= 108100, JSON.stringify(stats));
  assert.ok(stats.trails < 22000, JSON.stringify(stats));
  assert.ok(stats.arcs < 40000, JSON.stringify(stats));
  assert.ok(stats.skipped > 100000, JSON.stringify(stats));
  assert.equal(Object.keys(stats).length, 8, 'scheduler should not accumulate per-frame records');
});
