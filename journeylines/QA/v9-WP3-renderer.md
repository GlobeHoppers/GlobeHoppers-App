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

## Release gate

WP3 provides modular frame **scheduling and stage ownership** while retaining legacy MapLibre DOM/GeoJSON drawing code in `TravelMap.jsx` for visual parity. Extraction of all editor and projection modules is deferred to WP4. Do not switch WP3 on by default or merge without browser parity and actual resource/performance comparison.

The core WP3 architectural benefit is decoupled work budgets: avoid expensive route/arc geometry reconstruction at every camera/vehicle frame. Measured FPS gains remain unproven until browser acceptance.
