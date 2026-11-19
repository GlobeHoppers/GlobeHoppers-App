import test from 'node:test';
import assert from 'node:assert/strict';
import {
  playbackDiagnosticsEnabled, setPlaybackDiagnosticsEnabled,
  recordPlaybackFrame, recordRenderedFrame,
  resetPlaybackPerformanceDiagnostics, playbackPerformanceSnapshot
} from '../src/utils/playbackPerformance.js';

test('diagnostics are explicitly enabled; zero measurements do not claim zero rendering', () => {
  setPlaybackDiagnosticsEnabled(false);
  resetPlaybackPerformanceDiagnostics();
  const empty = playbackPerformanceSnapshot();
  assert.equal(empty.diagnosticsEnabled, false);
  assert.equal(empty.frameCount, 0);
  assert.equal(empty.renderedFrameCount, 0);
});

test('120Hz playback clock and 60Hz render pipeline report separate cadence', () => {
  setPlaybackDiagnosticsEnabled(true);
  resetPlaybackPerformanceDiagnostics();
  for (let i = 0; i <= 120; i++) recordPlaybackFrame(1000 + i * 1000 / 120);
  for (let i = 0; i <= 60; i++) recordRenderedFrame(1000 + i * 1000 / 60);
  const snapshot = playbackPerformanceSnapshot();
  assert.equal(playbackDiagnosticsEnabled(), true);
  assert.equal(snapshot.diagnosticsEnabled, true);
  assert.equal(snapshot.frameCount, 120);
  assert.equal(snapshot.renderedFrameCount, 60);
  assert.ok(Math.abs(snapshot.estimatedFps - 120) < .1, 'playback source clock frequency');
  assert.ok(Math.abs(snapshot.estimatedRenderedFps - 60) < .1, 'actual JS rendering frequency');
  assert.ok(Math.abs(snapshot.p95RenderedFrameMs - 1000 / 60) < .001);
});

test('disabling metrics stops sampling without affecting any render or clock state', () => {
  const before = playbackPerformanceSnapshot();
  setPlaybackDiagnosticsEnabled(false);
  recordPlaybackFrame(3000);
  recordRenderedFrame(3000);
  const after = playbackPerformanceSnapshot();
  assert.equal(after.diagnosticsEnabled, false);
  assert.equal(after.frameCount, before.frameCount);
  assert.equal(after.renderedFrameCount, before.renderedFrameCount);
  setPlaybackDiagnosticsEnabled(true);
  resetPlaybackPerformanceDiagnostics();
  assert.equal(playbackPerformanceSnapshot().renderedFrameCount, 0);
  setPlaybackDiagnosticsEnabled(false);
});
