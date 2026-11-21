import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.CINEMATIC_BASE_URL || 'http://127.0.0.1:5173/cinematic/';
const out = process.argv[2] || '/tmp/cinematic-smoke';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1, reducedMotion: 'reduce' });
const runtimeErrors = [];
const unexpectedHosts = [];
page.on('pageerror', e => runtimeErrors.push(e.message));
page.on('request', request => {
  if (/(\.|^)mult\.dev$/.test(new URL(request.url()).hostname)) unexpectedHosts.push(request.url());
});
try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__CINEMATIC_GLOBEHOPPERS__,
    null, { timeout: 15000 });
  await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 30000 });
  await page.waitForFunction(() => {
    const play = document.querySelector('.cg-play');
    return play && play.disabled === false;
  }, null, { timeout: 45000 });

  const first = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.getState());
  const meta = await page.evaluate(() => {
    const api = window.__CINEMATIC_GLOBEHOPPERS__;
    return { version: api.version, stops: api.stopCount, duration: api.durationMs };
  });
  assert.equal(meta.stops, 8);
  assert.ok(meta.duration > 20000);
  assert.ok(first.ready);
  await page.screenshot({ path: path.join(out, 'cinematic-initial.png') });

  await page.getByRole('button', { name: 'Play cinematic route' }).click();
  await page.waitForTimeout(850);
  const advancing = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.getState());
  assert.ok(advancing.elapsedMs > first.elapsedMs + 200, 'playback clock did not advance');

  await page.getByRole('button', { name: 'Pause playback' }).click();
  const paused = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.getState());
  await page.waitForTimeout(180);
  const still = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.getState());
  assert.ok(Math.abs(still.elapsedMs - paused.elapsedMs) < 75, 'pause failed to hold the deterministic clock');
  const seek = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.seekMs(12000));
  assert.ok(Array.isArray(seek.center));
  assert.ok(Number.isFinite(seek.zoom));
  await page.screenshot({ path: path.join(out, 'cinematic-seek.png') });

  await page.goto(base + '?capture=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__CINEMATIC_GLOBEHOPPERS__,
    null, { timeout: 15000 });
  assert.equal(await page.locator('.cg-console').count(), 0, 'capture mode must hide playback UI');
  assert.deepEqual(unexpectedHosts, [], 'unexpected Mult.dev requests');
  assert.deepEqual(runtimeErrors, [], 'browser runtime exceptions');
  console.log(JSON.stringify({ status: 'PASS', meta, screenshots: out }, null, 2));
} catch (error) {
  console.error('Cinematic browser smoke failed:', error);
  console.error('Browser errors:', runtimeErrors);
  await page.screenshot({ path: path.join(out, 'cinematic-failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
