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

  // Verify that no future marker appears early, and inspect a flight in Chromium.
  const phase = await page.evaluate(() => {
    const api = window.__CINEMATIC_GLOBEHOPPERS__;
    const initial = api.getPresentationAtMs(0);
    let flightMs = -1;
    let arrivalMs = -1;
    for (let ms = 0; ms < api.durationMs; ms += 95) {
      const frame = api.getPresentationAtMs(ms);
      if (flightMs < 0 && frame.plane && frame.visibleStops.length === 2) flightMs = ms;
      if (arrivalMs < 0 && frame.arrival?.opacity > 0.85) arrivalMs = ms;
      const pose = api.sampleAtMs(ms);
      if (pose.bearing < -45.0001 || pose.bearing > 45.0001) {
        throw new Error('Camera exceeds north-up limit at ' + ms + 'ms');
      }
    }
    return { initial, flightMs, arrivalMs,
      flight: api.getPresentationAtMs(flightMs) };
  });
  assert.equal(phase.initial.visibleStops.length, 1);
  assert.equal(phase.initial.visibleRouteCount, 0);
  assert.ok(phase.flightMs > 0);
  assert.ok(phase.flight.plane);
  assert.equal(phase.flight.visibleStops.length, 2);
  assert.ok(phase.arrivalMs > phase.flightMs);
  await page.evaluate(ms => window.__CINEMATIC_GLOBEHOPPERS__.seekMs(ms), phase.flightMs);
  await page.screenshot({ path: path.join(out, 'cinematic-aircraft.png') });
  await page.evaluate(ms => window.__CINEMATIC_GLOBEHOPPERS__.seekMs(ms), phase.arrivalMs);
  await page.locator('.cg-arrival-name').getByText('Los Angeles').waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(out, 'cinematic-touchdown.png') });


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
