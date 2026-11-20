/**
 * Automated GlobeHoppers v9 browser acceptance on GitHub Actions.
 *
 * Runs identical WP2 and WP3 screensaver playback sessions against the just-
 * built Vite app. Captures browser console/WebGL errors, CPU/GPU identity,
 * clock/render frame intervals, staged render costs and screenshots.
 *
 * A headless CI browser (typically software WebGL) cannot certify a user's
 * discrete GPU; reports explicitly record the environment and limitations.
 * No production URL, saved travel data or deployment is modified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFlag = process.argv.indexOf('--out');
const output = path.resolve(outFlag >= 0 && process.argv[outFlag + 1]
  ? process.argv[outFlag + 1] : path.join(root, '.v9-browser-report'));
fs.mkdirSync(output, { recursive: true });
const baseUrl = process.env.V9_BROWSER_URL || 'http://127.0.0.1:4173/';
const sampleDurationMs = Math.max(8000, Math.min(30000, Number(process.env.V9_BROWSER_SAMPLE_MS) || 15000));
const entryTimeoutMs = Math.max(30000, Math.min(90000, Number(process.env.V9_BROWSER_BOOT_MS) || 50000));
const now = () => new Date().toISOString();
const report = { schema: 'globehoppers.v9.browser-benchmark.v1', createdAt: now(),
  approach: 'Headless Chromium, software graphics preferred; sequential A/B',
  sampleDurationMs, modes: {}, caveats: [] };
const consoleLimit = 30;
let server = null;
let browser = null;
let runFailure = null;

function writeReport() {
  report.finishedAt = now();
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  // A concise machine-readable record can be retrieved directly from the job
  // logs when connector artifact downloads are not available.
  const modes = Object.fromEntries(Object.entries(report.modes).map(([key, item]) => [key, {
    status: item.status,
    gpu: item.gpu,
    metrics: item.metrics,
    warnings: item.browserWarnings?.length ?? 0,
    consoleErrors: item.consoleErrors?.length ?? 0,
    failure: item.failure
  }]));
  console.log('V9_BROWSER_REPORT ' + JSON.stringify({ modes, comparison: report.comparison, caveats: report.caveats }));
}
async function startServer() {
  if (process.env.V9_BROWSER_URL) return;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'pipe' });
  let stderr = '';
  server.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error('Vite preview server exited: ' + stderr.slice(-1000));
    try {
      const r = await fetch(baseUrl, { signal: AbortSignal.timeout(800) });
      if (r.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error('Vite preview server did not start: ' + stderr.slice(-1000));
}

async function inspectGPU(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      webgl: Boolean(gl),
      api: gl instanceof WebGL2RenderingContext ? 'WebGL2' : gl ? 'WebGL1' : 'unavailable',
      vendor: gl && (info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      renderer: gl && (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      userAgent: navigator.userAgent,
      visibility: document.visibilityState,
      dpr: devicePixelRatio
    };
  });
}

async function runMode(label, query) {
  const result = { startedAt: now(), status: 'starting', pageUrl: baseUrl + query,
    browserWarnings: [], consoleErrors: [], jsErrors: [], requestFailures: [], screenshots: [] };
  report.modes[label] = result;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  let totalWarnings = 0;
  let totalErrors = 0;
  page.on('console', msg => {
    if (msg.type() === 'warning') {
      totalWarnings++;
      if (result.browserWarnings.length < consoleLimit) result.browserWarnings.push(msg.text().slice(0, 400));
    } else if (msg.type() === 'error') {
      totalErrors++;
      if (result.consoleErrors.length < consoleLimit) result.consoleErrors.push(msg.text().slice(0, 400));
    }
  });
  page.on('pageerror', error => {
    if (result.jsErrors.length < consoleLimit) result.jsErrors.push(String(error).slice(0, 400));
  });
  page.on('requestfailed', req => {
    if (result.requestFailures.length < consoleLimit) result.requestFailures.push({
      url: req.url().slice(0, 200), failure: req.failure()?.errorText
    });
  });
  try {
    const response = await page.goto(result.pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    result.httpStatus = response?.status() ?? null;
    await page.waitForFunction(() => window.__GLOBEHOPPERS_RENDERER__?.snapshot,
      { timeout: 30000 });
    result.gpu = await inspectGPU(page);
    const preSnapshot = await page.evaluate(() => window.__GLOBEHOPPERS_RENDERER__.snapshot());
    result.initialMode = preSnapshot.mode;
    const expectedMode = label === 'wp3' ? 'v9-pipeline' : 'wp2-legacy';
    if (result.initialMode !== expectedMode) throw new Error('Wrong renderer mode: ' + result.initialMode);

    const ready = await page.waitForFunction(() => {
      const s = window.__GLOBEHOPPERS_RENDERER__?.snapshot();
      return s && s.schedule?.displays >= 20;
    }, null, { timeout: entryTimeoutMs }).then(() => true, () => false);
    result.playbackStarted = ready;
    if (!ready) {
      result.status = result.gpu?.webgl ? 'no-playback' : 'webgl-unavailable';
      result.failure = 'No 20-frame playback after timeout; inspect console and screenshot';
    } else {
      await page.evaluate(() => window.__GLOBEHOPPERS_RENDERER__.enableMetrics());
      await sleep(sampleDurationMs);
      const snapshot = await page.evaluate(() => window.__GLOBEHOPPERS_RENDERER__.snapshot());
      result.metrics = {
        diagnosticsStatus: snapshot.diagnosticsStatus,
        clockFps: Number(snapshot.performance.estimatedFps?.toFixed(2) || 0),
        rendererFps: Number(snapshot.performance.estimatedRenderedFps?.toFixed(2) || 0),
        p50FrameMs: Number(snapshot.performance.p50RenderedFrameMs?.toFixed(2) || 0),
        p95FrameMs: Number(snapshot.performance.p95RenderedFrameMs?.toFixed(2) || 0),
        p99FrameMs: Number(snapshot.performance.p99RenderedFrameMs?.toFixed(2) || 0),
        maxFrameMs: Number(snapshot.performance.maxRenderedFrameMs?.toFixed(2) || 0),
        gapsOver100Ms: snapshot.performance.renderedGapsOver100Ms,
        p95RenderWorkMs: Number(snapshot.performance.durations.v9RenderFrame?.p95Ms?.toFixed(2) || 0),
        p95CameraWorkMs: Number(snapshot.performance.durations.v9CameraFrame?.p95Ms?.toFixed(2) || 0),
        p95TrailWorkMs: Number(snapshot.performance.durations.v9TrailFrame?.p95Ms?.toFixed(2) || 0),
        webglWarnings: totalWarnings,
        consoleErrors: totalErrors,
        longTaskCount: snapshot.performance.longTasks?.length || 0,
        schedule: snapshot.schedule
      };
      result.status = result.metrics.rendererFps > 0 ? 'measured' : 'no-render-samples';
      if (result.metrics.rendererFps === 0) result.failure = 'No displayed JS renderer frames recorded';
    }
    await page.screenshot({ path: path.join(output, label + '.png'), fullPage: false, timeout: 15000 })
      .then(() => result.screenshots.push(label + '.png'), () => null);
  } catch (error) {
    result.status = 'error';
    result.failure = String(error?.stack || error).slice(0, 2000);
    await page.screenshot({ path: path.join(output, label + '-error.png'), timeout: 10000 })
      .then(() => result.screenshots.push(label + '-error.png'), () => null);
  } finally {
    result.finishedAt = now();
    result.warningCount = totalWarnings;
    result.errorCount = totalErrors;
    await page.close().catch(() => {});
  }
}

try {
  await startServer();
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--enable-unsafe-swiftshader',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--disable-dev-shm-usage', '--no-sandbox']
  });
  report.browserVersion = browser.version();
  await runMode('wp2', '?screensaver=1&v9Playback=1&v9Metrics=1');
  await runMode('wp3', '?screensaver=1&v9Playback=1&v9Renderer=1&v9Metrics=1');
  const a = report.modes.wp2?.metrics;
  const b = report.modes.wp3?.metrics;
  if (a?.rendererFps > 0 && b?.rendererFps > 0) {
    report.comparison = {
      wp2JsRendererFps: a.rendererFps, wp3JsRendererFps: b.rendererFps,
      percentChange: Math.round((b.rendererFps - a.rendererFps) / a.rendererFps * 1000) / 10,
      note: 'Headless shared CI runner; indicative relative signal, not discrete-GPU FPS'
    };
  } else {
    report.caveats.push('A/B comparison incomplete; one or both browser modes did not produce rendered frames.');
  }
  if (!report.modes.wp3?.gpu?.webgl || !report.modes.wp2?.gpu?.webgl) {
    report.caveats.push('WebGL unavailable in this browser; screenshot or performance output cannot establish globe rendering parity.');
  } else {
    report.caveats.push('CI uses software-rendered WebGL; cannot reproduce the user Windows GPU, monitor refresh or driver warnings.');
  }
} catch (error) {
  runFailure = String(error?.stack || error);
  report.caveats.push('Browser harness failure: ' + runFailure.slice(0, 700));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill('SIGTERM');
  writeReport();
}
if (runFailure) {
  console.error(runFailure);
  process.exitCode = 1;
} else if (!report.modes.wp2 || !report.modes.wp3) {
  process.exitCode = 1;
} else if (report.modes.wp2.status === 'error' || report.modes.wp3.status === 'error') {
  process.exitCode = 1;
} else {
  console.log('Browser benchmark completed. Results can be limited by CI software WebGL; inspect summary.json.');
}
