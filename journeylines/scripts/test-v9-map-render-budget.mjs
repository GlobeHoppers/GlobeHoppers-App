import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gpuBudgetRequested, gpuRenderSettings, MapCameraWorkBudget } from '../src/utils/mapRenderBudget.js';

test('GPU budget is opt-in; existing WP2/WP3 visual behavior is untouched by default', () => {
  assert.equal(gpuBudgetRequested(''), false);
  assert.equal(gpuBudgetRequested('?v9Renderer=1'), false);
  assert.equal(gpuBudgetRequested('?v9GpuBudget=1'), true);
  const original = gpuRenderSettings({ enabled:false, devicePixelRatio:2 });
  assert.equal(original.maxTileCacheSize, 1200);
  assert.equal(original.effectivePixelRatio, 2);
});

test('DPR2 caps to 1.25, lowering shaded pixels to under 40% of native area', () => {
  const proposed = gpuRenderSettings({ enabled:true, search:'?v9GpuBudget=1', devicePixelRatio:2 });
  assert.equal(proposed.effectivePixelRatio, 1.25);
  assert.equal(proposed.maxTileCacheSize, 320);
  assert.ok((proposed.effectivePixelRatio / 2) ** 2 <= .40);
});

test('DPR1 retains full map resolution unless user explicitly selects benchmark ratio', () => {
  assert.equal(gpuRenderSettings({ enabled:true, devicePixelRatio:1 }).effectivePixelRatio, 1);
  assert.equal(gpuRenderSettings({
    enabled:true, devicePixelRatio:1, search:'?v9GpuBudget=1&v9PixelRatio=0.75'
  }).effectivePixelRatio, 0.75);
  assert.equal(gpuRenderSettings({
    enabled:true, devicePixelRatio:2, search:'?v9PixelRatio=9'
  }).effectivePixelRatio, 2);
  assert.equal(gpuRenderSettings({
    enabled:true, devicePixelRatio:2, search:'?v9PixelRatio=0.1'
  }).effectivePixelRatio, 0.65);
});

test('normal 120Hz source clock emits 60Hz camera requests with no extra RAF', () => {
  const b = new MapCameraWorkBudget();
  let issued = 0;
  for(let i=0;i<120;i++){
    const now=i * 1000 / 120;
    if(b.shouldIssue(now,{quality:'high'})){
      issued++;
      b.recordCommandCost(2);
    }
  }
  assert.ok(issued>=58 && issued<=61, 'camera frequency '+issued);
  assert.equal(b.snapshot().issued,issued);
  assert.ok(b.snapshot().skipped > 50);
});

test('busy MapLibre commands apply backpressure while keeping playback clock independent', () => {
  const budget = new MapCameraWorkBudget();
  for(let i=0;i<8;i++) budget.recordCommandCost(80);
  assert.equal(budget.targetHz('high'),12);
  assert.equal(budget.targetHz('low'),12);
  const frames = [];
  for(let i=0;i<=60;i++){
    const now=i*1000/60;
    if (budget.shouldIssue(now,{quality:'high'})) frames.push(now);
  }
  assert.ok(frames.length>=10 && frames.length<=14, 'adaptive GPU camera frames '+frames.length);
  assert.ok(frames.at(-1) > 800);
  assert.ok(budget.snapshot().costSamples>=8);
});

test('route handoff / timeline seek is forced immediately even inside camera cooldown', () => {
  const b = new MapCameraWorkBudget();
  b.recordCommandCost(100); b.recordCommandCost(100); b.recordCommandCost(100);
  assert.equal(b.shouldIssue(1000, {quality:'low'}), true);
  assert.equal(b.shouldIssue(1001, {quality:'low'}), false);
  assert.equal(b.shouldIssue(1002, {quality:'low',force:true}), true);
  assert.equal(b.snapshot().forced, 1);
  assert.equal(b.shouldIssue(1003, {quality:'low'}), false);
  assert.equal(b.shouldIssue(500, {quality:'low'}), true, 'clock going backwards resets budget');
});

test('GPU budget does not take independent camera ownership or create timers', () => {
  const source=fs.readFileSync(path.resolve(import.meta.dirname,'../src/utils/mapRenderBudget.js'),'utf8');
  assert.equal(source.includes('requestAnimationFrame('),false);
  assert.equal(source.includes('setTimeout('),false);
  assert.equal(source.includes('map.jumpTo('),false);
});

test('new MapLibre settings and camera commands are conditional on the GPU flag', () => {
  const source=fs.readFileSync(path.resolve(import.meta.dirname,'../src/components/TravelMap.jsx'),'utf8');
  assert.ok(source.includes('const V9_GPU_BUDGET_ENABLED = V9_RENDERER_ENABLED && gpuBudgetRequested()'));
  assert.ok(source.includes('...(V9_GPU_BUDGET_ENABLED ? { pixelRatio: V9_GPU_SETTINGS.effectivePixelRatio } : {})'));
  assert.ok(source.includes('V9_GPU_BUDGET_ENABLED && !gpuCameraBudgetRef.current.shouldIssue'));
  assert.ok(source.includes('gpuCameraBudgetRef.current.recordCommandCost('));
});
