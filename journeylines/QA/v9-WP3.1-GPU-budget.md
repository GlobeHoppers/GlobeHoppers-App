# GlobeHoppers v9 — WP3.1 MapLibre GPU work-budget experiment

**Scope:** WP3 performance investigation only. **Branch:** `refactor/v9-core`. **Production, main, gh-pages:** unchanged. **Status:** opt-in preview; not a proposed production default until performance and visual tests pass.

## Root-cause hypothesis

The Chromium A/B test on 2026-11-20 used **SwiftShader software WebGL**, not a physical GPU. WP2 rendered at 2.47 JavaScript frames/sec, WP3 at 2.36; the difference was not meaningful because both paths spent hundreds of milliseconds between rendered frames. On the user's Windows system, WP3 reported ~15.7 JavaScript display updates/sec and hundreds of WebGL READ-usage buffer warnings. JavaScript render work was roughly 7 ms p95, suggesting significant unmeasured browser/graphics time.

Every cinematic `map.jumpTo` can invalidate MapLibre's globe rendering. By default a high-DPR monitor also shades multiple framebuffer pixels for each CSS pixel. The first optimization therefore targets WebGL raster area and camera-triggered redraws, **without changing route geometry, timeline progress, travel data, style, or overlay placement logic**.

## Implementation

`src/utils/mapRenderBudget.js` adds:

- `gpuRenderSettings`: cap internal MapLibre canvas pixel ratio at **1.25** in the experiment, never increasing the native DPR. A native DPR 2 map would shade ~39% as many pixels at ratio 1.25 as it would at ratio 2, before accounting for complexity and implementation. The user's globe can look slightly softer; this is an intentional quality/performance tradeoff, **not** the default.
- Reduce `maxTileCacheSize` from 1200 to 320 in experimental mode. This reduces worst-case retained tile memory but may increase tile re-downloads during rapid world travel; browser QA must check that tradeoff.
- `MapCameraWorkBudget`: a bounded, constant-size backpressure scheduler. It reduces map camera command frequency when measured synchronous camera work grows expensive. The DOM vessel/route state continues reading the authoritative WP2 clock at its usual schedule, and camera easing uses actual elapsed time when commands resume.
- Force map-camera updates for new trips/generations and explicit timeline seeks; never use this optional budget for overview, manual navigation, editor, intro or relocation animation commands.
- Profile command cost separately as `v9MapJumpToMs`, count `v9GpuCameraMoves` and `v9GpuCameraSkipped`, and expose actual requested/applied pixel ratios and canvas dimensions via diagnostics.

## A/B configuration

Serve the latest v9 preview on `http://localhost:8000/` or run the CI workflow. Compare these URLs at the same scene/speed/viewport:

| Mode | URL query |
|---|---|
| Original WP2 | `?v9Playback=1&v9Metrics=1` |
| WP3 baseline | `?v9Playback=1&v9Renderer=1&v9Metrics=1` |
| WP3 + GPU experiment | `?v9Playback=1&v9Renderer=1&v9GpuBudget=1&v9Metrics=1` |

Optional **benchmark-only** override: `&v9PixelRatio=0.75`, used in CI to observe a measurable shading reduction even on a DPR1 software GPU. This will visibly soften the globe; don't use that value for normal viewing.

In Chrome Console, enable metrics and run playback as before:

```js
window.__GLOBEHOPPERS_RENDERER__.enableMetrics()
// after 30s
const s = window.__GLOBEHOPPERS_RENDERER__.snapshot();
console.table({
  mode: s.mode,
  gpuBudget: s.gpu.enabled,
  pixelRatio: s.gpu.appliedPixelRatio,
  size: String(s.gpu.canvasPixels),
  clockFps: s.performance.estimatedFps,
  jsFps: s.performance.estimatedRenderedFps,
  cameraCommands: s.gpu.camera.issued,
  cameraSkipped: s.gpu.camera.skipped,
  cameraCostMs: s.gpu.camera.averageCameraCommandMs,
  mapJumpToP95: s.performance.durations.v9MapJumpToMs?.p95Ms ?? 0
});
```

## Automated acceptance

- Unit tests validate explicit opt-in, ratio clamps, DPR2 pixel-area savings, unchanged original tile cache, 30/45/60 Hz command decisions, command backpressure, forced handoff/seek, and no extra RAF.
- Existing WP0–WP3 baseline + 401 leg data/plan/worker parity tests remain required.
- GitHub Actions Chromium A/B generates three captures: WP2, WP3, and WP3 GPU mode at forced 0.75 pixel ratio. It writes the actual canvas resolution, command count, JS FPS, frame-time p95 and recorded warnings into the CI report.
- CI uses software graphics and cannot certify Windows GPU quality or frame rate. A performance win must be demonstrated under comparable browser conditions and checked visually on the final hardware before default-on.

## Controlled Chromium results and next validation

The first **exploratory** software-WebGL run at DPR1 measured:

| Headless mode | JS renderer FPS | Internal pixel ratio |
| --- | ---: | ---: |
| WP2 | 2.37 | 1.00 |
| WP3 | 2.65 | 1.00 |
| WP3 + GPU budget | 3.61 | 0.75 |

The resulting 36.2% increase relative to WP3 is **not an accepted performance gain** because the unconstrained screensaver selected different leg IDs. The GPU run did verify a reduction in physical framebuffer area from 1440×900 to 1080×675, 0.75× on each axis (56.25% of original pixels). Software-GPU frame rates are too low to reflect normal hardware.

The CI harness now uses an explicit `?v9Benchmark=1` route, available only when that preview flag is supplied, to start the **same first long-haul plane leg (at least 2,000 miles)** at 20% progress, quarter-speed playback, follow camera, globe projection and identical viewport. It records the selected composite `tripId::legId` and rejects comparisons when the legs do not match or playback advances away before measurement.

This is a three-way browser smoke test, not a statistically rigorous multi-run experiment. It isolates route mismatch as a confounder but cannot eliminate software-WebGL GPU sharing, tile-load timing or thermal variability.

## Controlled same-leg browser A/B — November 20

**Run:** `https://github.com/GlobeHoppers/GlobeHoppers-App/actions/runs/44842222257`

The corrected benchmark launched exactly **trip `nb429o`, leg `leg-c589d8b09818`**, a 2,252-mile plane flight, at 20% progress and 0.25× speed in all three cases. All runs remained on that same leg through their measurement windows.

| Mode | JS display FPS | p95 frame interval | Canvas pixels |
| --- | ---: | ---: | --- |
| WP2 | 2.24 | 1,683 ms | 1440×900 |
| WP3 normal | 1.75 | 1,883 ms | 1440×900 |
| WP3 GPU experiment | 3.09 | 417 ms | 1080×675 |

The experimental GPU-budget path was **76.6% higher JavaScript render FPS than WP3** in this single, controlled-headless session. It still ran at only 3.09 FPS because the CI renderer was SwiftShader **software WebGL**. This is evidence that the new lower-raster-area mode can reduce the workload, **not** a prediction of performance on a hardware-accelerated Windows GPU.

GPU mode issued 52 camera commands and skipped just 1. It is therefore **unlikely that camera backpressure explains most of this particular improvement**; reduced pixel count, cache effects or run variability remain potential contributors. Do not claim a causal gain from camera throttling. No WebGL console warnings or JavaScript console errors were captured in this CI environment. User's Windows WebGL warnings remain unverified/untreated.

The true production-quality release gate remains local/hardware GPU visual comparison (blur, trails, camera handoffs, input latency, tile reloads) and at least one sustained performance run on the target device. The experiment remains OFF by default.

## Release/rollback rule

Do **not** turn the GPU budget on automatically based on a single low-FPS sample. It changes visual sharpness and camera redraw cadence, so it needs controlled A/B acceptance. Removing `v9GpuBudget=1` immediately restores the previously verified WP3 code path. WP4 remains deferred until the rendering bottleneck is characterized.

In scope: bounded GPU workload, diagnostics and tests. Out of scope: upgrading MapLibre, changing globe projection, altering camera artwork or visuals, removing editor features, production deployment.
