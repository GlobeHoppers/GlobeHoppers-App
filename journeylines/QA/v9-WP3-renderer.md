# GlobeHoppers v9 — WP3 Renderer Work Package

**Branch:** `refactor/v9-core`. **Production:** untouched. The WP2 renderer remains the default in every build.

## Scope delivered

- The single WP2 playback clock remains authoritative. WP3 adds no independent RAF, timer, state store or duplicate camera owner.
- `src/utils/playbackFramePipeline.js` provides one deterministic display scheduler with bounded, independent budgets for the scene/camera/vehicle, route trail, and flight-arc stages.
- The MapLibre globe uses explicit `sampleScene`, `renderTrail`, `renderPulse`, `renderCamera`, `renderVehicle` and `renderArc` passes. They all use **one** sampled leg state per displayed frame, not separate route/camera progress.
- WP3 runs **only** with `?v9Renderer=1`. The WP2 comparison path continues to use its previous camera/trail budgets. WP1 precompiled plans can be enabled separately using `?v9Playback=1`.
- On the WP3 path, camera/vehicle aim for **60 Hz high / 45 Hz medium / 30 Hz low**. The browser playback clock and render-time conditions determine quality; the scheduler does not invent output frames or claim physical display refresh.
- Trail geometry is updated at about 90/110/145 ms high/medium/low and airborne arcs at 50/66/100 ms. A changed leg/generation or the first arrival frame forces a synchronized display and one final trail flush.
- Camera follow and vehicle rotation smoothing account for actual elapsed time, so half-rate monitors do not produce twice the apparent lag. Existing route, style, color, vehicle sprite and MapLibre camera targeting algorithms are preserved.
- Frame scheduling retains deadline phase on high-refresh monitors. This avoids turning a desired 45 Hz stream into 40 Hz on a 120 Hz display.
- The renderer stores only constant-sized counters and deadlines. The 30-minute CI scheduler test is a **simulated scheduling stress test**, not browser memory or screensaver certification.
- A diagnostics interface exposes recent frame intervals and timing of scene, camera, vehicle, trail and arc passes without changing the visible UI.

## Automated verification

The v9 validation workflow executes:
1. Frozen source-trip and route SHA verification (178 trips, 401 legs).
2. Original v7.5.15 checks and the WP1 compiler/worker numerical parity suite.
3. WP2 playback clock, leg connection and camera authority tests.
4. WP3 frame pipeline unit tests (60/120Hz, 45Hz and 30Hz adaptive budgets, completion flush, route transitions, idle gaps, single-scene sampling and stage order, continuous vehicle turn smoothing).
5. 30-minute simulated 120Hz source-clock stress test; renderer state remains constant-size.
6. Production Vite build, compiled bundle hash checks and an **isolated** preview artifact. The workflow does not deploy.

## A/B browser acceptance (required before enabling by default)

Download `GlobeHoppers-v9-WP3-preview` from the latest successful `refactor/v9-core` GitHub Actions validation run, extract the folder, and serve from PowerShell:

```powershell
py -m http.server 8000
```

Compare in separate tabs on the same monitor and hardware:

- **WP2 baseline:** `http://localhost:8000/?v9Playback=1&v9Metrics=1`
- **WP3 renderer:** `http://localhost:8000/?v9Playback=1&v9Renderer=1&v9Metrics=1`

For a consistent sample, use the same timeline position and playback speed in each tab, keeping only one playing at a time. After starting playback, open DevTools Console:

```js
window.__GLOBEHOPPERS_RENDERER__.reset()
```

After at least 30 seconds of steady playback:

```js
const report = window.__GLOBEHOPPERS_RENDERER__.snapshot();
console.table({
  mode: report.mode,
  sampledFPS: report.performance.estimatedFps,
  p95FrameMs: report.performance.p95FrameMs,
  p95RenderWorkMs: report.performance.durations.v9RenderFrame?.p95Ms ?? 'legacy',
  p95CameraMs: report.performance.durations.v9CameraFrame?.p95Ms ?? 'legacy',
  p95VehicleMs: report.performance.durations.v9VehicleFrame?.p95Ms ?? 'legacy',
  p95TrailMs: report.performance.durations.v9TrailFrame?.p95Ms ?? 'legacy'
});
console.log(report.schedule);
```

**Interpretation:** sampledFPS reflects the JS render sampling cadence, not GPU presentation FPS. Use Chrome Performance/Rendering tools to confirm actual visual smoothness, frame budgets and long tasks. A 60 Hz target is not evidence that the browser sustains 60 rendered FPS.

### Visual parity checklist

- Play long-haul plane routes with ocean/date-line crossings and both globe and camera follow modes.
- Connected outbound/return hops: no cuts or zoom pumps between legs.
- Surface modes (drive, boat, rail): vehicle remains on the trail and turns smoothly.
- Trails on/off, thick multi-color styles, route stacking, queue cards and persistent placards remain unchanged.
- Seek rapidly while playing and paused; look for duplicate camera updates, jumps, missing routes or stale arcs.
- Drag/zoom/rotate during playback and verify smooth cinematic return.
- Test a disconnected-leg relocation, intro and end-of-timeline globe return.
- Exercise screensaver, tab-hidden/resume, idle behavior, and a sustained 30-minute browser run.
- Compare behavior on 60 Hz and high-refresh displays if possible.

## Browser diagnostics correction (November 19)

The first WP3 user test returned an active schedule (`ticks=7136`, `displays=6956`) but empty performance arrays. This means diagnostics **were not recording**. It does not mean 0 FPS. In the earlier implementation, a URL flag or separate localStorage setting could silently disable measurement while the frame scheduler continued normally.

The revised `window.__GLOBEHOPPERS_RENDERER__` API now reports `diagnosticsStatus`:

- `disabled`: the recorder is off, no measured FPS can be inferred
- `awaiting-rendered-frames`: enabled but no JS render stages sampled yet
- `collecting`: both clock and display pipeline can be measured

**Enable recording from the browser Console without page reload:**

```js
window.__GLOBEHOPPERS_RENDERER__.enableMetrics()
```

Play the timeline for 30 seconds, then run:

```js
const s = window.__GLOBEHOPPERS_RENDERER__.snapshot();
console.table({
  status: s.diagnosticsStatus,
  playbackClockHz: s.performance.estimatedFps,
  jsDisplayHz: s.performance.estimatedRenderedFps,
  p95DisplayMs: s.performance.p95RenderedFrameMs,
  p95RenderWorkMs: s.performance.durations.v9RenderFrame?.p95Ms,
  p95TrailWorkMs: s.performance.durations.v9TrailFrame?.p95Ms
});
console.log(s.schedule);
```

`estimatedFps` is the clock's RAF rate; `estimatedRenderedFps` is the number of actual **JavaScript pipeline display updates**, not the number of frames the GPU successfully presented. Repeated map calls, browser compositing, and WebGL error recovery can reduce visible FPS below both measures. Use DevTools Performance for GPU/compositor interpretation.

The first user also observed a Chromium/MapLibre WebGL warning about a READ-usage buffer's shadow copy, along with the WebGL message limit. This same warning is recorded upstream in maplibre-gl-js issue #7872 and Chromium issues #558254911 / #573671133. It is **not evidence, by itself**, that the WP3 renderer caused a regression. Compare the WP2 and WP3 tabs with the same scene/Chrome version; if errors persist, inspect the *first* WebGL error after a clean reload rather than the final "too many errors" message. Do not attempt a major GPU/MapLibre dependency upgrade under WP3 solely to suppress warnings.

### Performance investigation update — November 20

A WP3 preview measurement showed `rendererFPS≈15.73`, `p95RenderedFrameMs≈33.3` and `p95RenderWorkMs≈7`, alongside 256 identical WebGL READ-usage buffer warnings. The attached console output shows one benign `favicon.ico` 404 as well. This establishes real low JavaScript display cadence, **not** why Chrome delivers fewer ticks.

**Measurement bug fixed:** `recordPlaybackFrame` formerly lived inside `sampleScene`, which runs only after the WP3 scheduler accepts a display tick. As a result, `playbackClockFPS` copied the renderer's frequency; this did not measure RAF independently. It now records each validated playback clock tick *before* display throttling. A regression test checks the ordering.

**Long-gap instrumentation added:** `p50RenderedFrameMs`, `p99RenderedFrameMs`, `maxRenderedFrameMs`, `renderedGapsOver50Ms`, `renderedGapsOver100Ms`, `renderedGapsOver250Ms`, and separate clock-gap statistics. This can explain a mean ~64 ms interval despite a p95 around 33 ms, which otherwise implies occasional very long stalls.

**Controlled A/B protocol:** Compare WP2 `?v9Playback=1&v9Metrics=1` with WP3 `?v9Playback=1&v9Renderer=1&v9Metrics=1` using the same trip, camera, playback speed, viewport and hardware. Open only one playback tab at a time, enable recording after entering playback, then collect at least 30 seconds without hiding the tab. Compare independent clock/render FPS, p99/max gaps, MapLibre/DevTools GPU traces, and the GPU acceleration status in `chrome://gpu`. Console logging and warning floods can distort measurements; use a clean load and a Chrome Performance capture if needed. Neither short-term low FPS nor the upstream Chromium warning alone establishes causality.

## Release gate

WP3 provides modular frame **scheduling and stage ownership** while retaining legacy MapLibre DOM/GeoJSON drawing code in `TravelMap.jsx` for visual parity. Extraction of all editor and projection modules is deferred to WP4. Do not switch WP3 on by default or merge without browser parity and actual resource/performance comparison.

The core WP3 architectural benefit is decoupled work budgets: avoid expensive route/arc geometry reconstruction at every camera/vehicle frame. Measured FPS gains remain unproven until browser acceptance.
