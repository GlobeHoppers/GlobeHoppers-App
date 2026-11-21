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
    benchmark: item.benchmark,
    benchmarkEnd: item.benchmarkEnd,
    gpu: item.gpu,
    metrics: item.metrics,
    warnings: item.browserWarnings?.length ?? 0,
    consoleErrors: item.consoleErrors?.length ?? 0,
    failure: item.failure
  }]));
  console.log('V9_BROWSER_REPORT ' + JSON.stringify({ modes, comparison: report.comparison, gpuComparison: report.gpuComparison, caveats: report.caveats }));
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
    await page.waitForFunction(() => window.__GLOBEHOPPERS_RENDERER__?.snapshot
      && window.__GLOBEHOPPERS_BENCHMARK__?.start,
      { timeout: 30000 });
    result.gpu = await inspectGPU(page);
    const preSnapshot = await page.evaluate(() => window.__GLOBEHOPPERS_RENDERER__.snapshot());
    result.initialMode = preSnapshot.mode;
    const expectedMode = label.startsWith('wp3') ? 'v9-pipeline' : 'wp2-legacy';
    if (result.initialMode !== expectedMode) throw new Error('Wrong renderer mode: ' + result.initialMode);

    // Every browser run starts the SAME long-haul flight, exact progress,
    // camera mode and speed, instead of launching the screensaver and
    // accidentally sampling different legs or transition states.
    result.benchmark = await page.evaluate(() =>
      window.__GLOBEHOPPERS_BENCHMARK__.start({ progress: .20, speed: .25 }));
    const ready = await page.waitForFunction(({ tripId, legId }) => {
      const state = window.__GLOBEHOPPERS_BENCHMARK__?.snapshot();
      const perf = window.__GLOBEHOPPERS_RENDERER__?.snapshot();
      return state?.playing && state.tripId === tripId
        && String(state.legId) === String(legId)
        && Number(perf?.performance?.counters?.frames || 0) >= 5;
    }, { tripId: result.benchmark.tripId, legId: result.benchmark.legId },
    { timeout: entryTimeoutMs }).then(() => true, () => false);
    result.playbackStarted = ready;
    if (!ready) {
      result.status = result.gpu?.webgl ? 'no-playback' : 'webgl-unavailable';
      result.failure = 'No 5-frame controlled flight playback after timeout; inspect console and screenshot';
    } else {
      await page.evaluate(() => window.__GLOBEHOPPERS_RENDERER__.enableMetrics());
      await sleep(sampleDurationMs);
      const snapshot = await page.evaluate(() => window.__GLOBEHOPPERS_RENDERER__.snapshot());
      result.benchmarkEnd = await page.evaluate(() => window.__GLOBEHOPPERS_BENCHMARK__.snapshot());
      if (result.benchmarkEnd?.tripId !== result.benchmark.tripId ||
          String(result.benchmarkEnd?.legId) !== String(result.benchmark.legId)) {
        result.status = 'route-changed-during-test';
        result.failure = 'Trip advanced during sample; results are not comparable';
      }
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
        schedule: snapshot.schedule,
        gpuBudget: snapshot.gpu || null
      };
      if (result.status !== 'route-changed-during-test') result.status = result.metrics.rendererFps > 0 ? 'measured' : 'no-render-samples';
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
  await runMode('wp2', '?v9Benchmark=1&v9Playback=1&v9Metrics=1');
  await runMode('wp3', '?v9Benchmark=1&v9Playback=1&v9Renderer=1&v9Metrics=1');
  // Force a lowered internal canvas ratio even on CI DPR1 so we can isolate
  // raster fill-rate costs. On a normal HiDPI screen the auto cap is 1.25.
  await runMode('wp3gpu', '?v9Benchmark=1&v9Playback=1&v9Renderer=1&v9GpuBudget=1&v9PixelRatio=0.75&v9Metrics=1');
  // Verify the exact same travel leg was exercised in all variants.
  const chosen = ['wp2', 'wp3', 'wp3gpu'].map(mode => report.modes[mode]?.benchmark);
  const sameLeg = chosen.every(x => x?.tripId && x?.legId &&
    x.tripId === chosen[0].tripId && String(x.legId) === String(chosen[0].legId));
  if (!sameLeg) report.caveats.push('Benchmark leg mismatch; relative FPS comparison invalid.');
  const a = report.modes.wp2?.status === 'measured' && sameLeg ? report.modes.wp2.metrics : null;
  const b = report.modes.wp3?.status === 'measured' && sameLeg ? report.modes.wp3.metrics : null;
  if (a?.rendererFps > 0 && b?.rendererFps > 0) {
    report.comparison = {
      wp2JsRendererFps: a.rendererFps, wp3JsRendererFps: b.rendererFps,
      percentChange: Math.round((b.rendererFps - a.rendererFps) / a.rendererFps * 1000) / 10,
      note: 'Headless shared CI runner; indicative relative signal, not discrete-GPU FPS'
    };
  } else {
    report.caveats.push('A/B comparison incomplete; one or both browser modes did not produce rendered frames.');
  }
  const c = report.modes.wp3gpu?.status === 'measured' && sameLeg ? report.modes.wp3gpu.metrics : null;
  const expectedRatio = Number(c?.gpuBudget?.requestedPixelRatio ?? NaN);
  if (expectedRatio !== .75 || !c?.gpuBudget?.enabled) {
    report.caveats.push('GPU budget could not be verified; low-DPR comparison is not valid.');
  }
  if (b?.rendererFps > 0 && c?.rendererFps > 0 && c.gpuBudget?.enabled && expectedRatio === .75) {
    report.gpuComparison = {
      wp3JsRendererFps: b.rendererFps,
      wp3ReducedPixelJsRendererFps: c.rendererFps,
      percentChange: Math.round((c.rendererFps - b.rendererFps) / b.rendererFps * 1000) / 10,
      pixelRatio: expectedRatio,
      cameraIssued: c.gpuBudget.camera?.issued,
      cameraSkipped: c.gpuBudget.camera?.skipped,
      note: 'CI software GPU: tests renderer cost under lower raster area; cannot predict discrete-GPU gains'
    };
  } else {
    report.caveats.push('WP3 GPU A/B incomplete; one or both modes did not measure playback.');
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
} else if (!report.modes.wp2 || !report.modes.wp3 || !report.modes.wp3gpu) {
  process.exitCode = 1;
} else if (report.modes.wp2.status === 'error' || report.modes.wp3.status === 'error' || report.modes.wp3gpu.status === 'error') {
  process.exitCode = 1;
} else {
  console.log('Browser benchmark completed. Results can be limited by CI software WebGL; inspect summary.json.');
}
