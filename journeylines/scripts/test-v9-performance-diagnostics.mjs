import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('renderer integration records clock ticks before display budget filtering', () => {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../src/components/TravelMap.jsx'), 'utf8');
  const clockTick = source.indexOf("recordPlaybackFrame(Number(frame.timestamp || performance.now())");
  const sampler = source.indexOf("const sampleScene = () => {");
  const scheduler = source.indexOf("framePipelineRef.current.scheduler.plan(");
  assert.ok(clockTick >= 0 && sampler > clockTick && scheduler > sampler,
    'clock FPS must be measured before the renderer samples/skips display frames');
});

test('rare long stalls are visible even when p95 looks good', () => {
  setPlaybackDiagnosticsEnabled(true);
  resetPlaybackPerformanceDiagnostics();
  let t = 1000;
  recordRenderedFrame(t);
  for (let i = 0; i < 25; i++) {
    t += 33.3;
    recordRenderedFrame(t);
  }
  t += 1000;
  recordRenderedFrame(t);
  const report = playbackPerformanceSnapshot();
  assert.equal(report.renderedFrameCount, 26);
  assert.ok(report.p95RenderedFrameMs < 100);
  assert.ok(report.maxRenderedFrameMs >= 999);
  assert.equal(report.renderedGapsOver250Ms, 1);
  assert.equal(report.renderedGapsOver100Ms, 1);
  setPlaybackDiagnosticsEnabled(false);
});
