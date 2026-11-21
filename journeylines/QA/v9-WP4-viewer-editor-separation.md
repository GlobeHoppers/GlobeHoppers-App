# GlobeHoppers v9 — WP4: Read-only Viewer, Timeline and Studio separation

**Branch:** `refactor/v9-core` (original v7.5.15 data preserved). **Production:** `main` and `gh-pages` are not modified. **Migration:** v9 viewer mode remains opt-in.

## Architectural boundaries

- `src/viewer/PlaybackViewer.jsx`: read-only presentation boundary. Receives travel data and a verified route snapshot; does not import the editor. It waits for route readiness before mounting MapLibre, preventing a blank/partial initial route cache.
- `src/viewer/viewerRouteStore.js`: single-flight loader for the immutable route projection. Validates schema, byte count, SHA-256 and all 401 expected routes. A failed/missing/corrupt projection falls back to a **dynamic** import of the complete canonical route source, not a broken map.
- `scripts/build-v9-viewer-data.mjs`: generates the compact route geometry projection from the canonical `src/data/routeDetails.json`. It copies route geometry, source cache identity, stacking/direction, trip-scoped leg ID and matching endpoints **without rounding or changing the original coordinates**. It checks all 401 legs and all 401 saved route records. No input files are modified.
- `src/editor/StudioBoundary.jsx`: asynchronously imports `AdminPanel.jsx` only when editing is requested. Studio keeps its own **full canonical** route metadata. The viewer's slim object is never used as the base for a Studio save/rebuild.
- `src/timeline/TripTimelineDrawer.jsx`: extracted timeline drawer, right-click edit menu, year grouping, row borders, existing look/feel and scrolling logic.
- `src/timeline/timelineModel.js`: extracted deterministic markers, year bands, month ticks, year span and card projection. No renderer or Studio imports.
- `src/App.jsx`: high-level playback + editing orchestration (React states, seek, save events and screensaver) remains here. This avoids a disruptive rewrite of proven WP2 camera transitions.
- `src/components/TravelMap.jsx`: same MapLibre renderer and all visual algorithms. It no longer statically imports `routeDetails.json` and now accepts its route snapshot from the viewer boundary. Studio route-save events refresh its cache without forcing a globe remount.

## Data contract and measured package size

The source route file is **10,332,116 bytes**. The generated read-only payload is **3,811,380 bytes**, **63.1% smaller**. The preview build places it at `dist/data/v9-viewer/route-details.json`, with a SHA-256 `manifest.json`.

The original canonical source is emitted by Vite as a **lazy-loaded, separate** JS chunk rather than embedded in the initial entry. On the first successful WP4 Vite build the application entry chunk was ~1.45 MB uncompressed, while the full route-details chunk was ~3.98 MB uncompressed. Do not interpret these as network-transfer sizes or as proof of a frame-rate gain.

**Production build:** `npm run build` now runs the viewer projection compiler before Vite. This ensures that a subsequent Studio commit to canonical routes is reflected in the next deployment automatically. Generated assets are ignored by Git; history and metadata remain authoritative under `src/data/`.

For local Vite dev mode (which does not run the build script automatically), generate the projection first:

```sh
cd journeylines
node scripts/build-v9-viewer-data.mjs --out public/data/v9-viewer
npm run dev
```

## Preview mode

- WP3 comparison with original full source: `?v9Playback=1&v9Renderer=1`
- WP4 compact viewer + WP1 precompiled plans: `?v9Viewer=1&v9Playback=1&v9Renderer=1`
- Optional GPU-budget experiment: append `&v9GpuBudget=1` (still off by default)

The same timeline, modal, hopper, alternate-projection and screensaver controls remain accessible. `v9Viewer` changes the **data loading boundary**; it does not hide or remove editing functionality.

Read-only browser diagnostics: `window.__GLOBEHOPPERS_VIEWER__.snapshot()` reports compact/full/fallback mode, readiness and route count. The benchmarking-only `v9Benchmark=1` query enables deterministic flight and Studio open/close controls for CI; it is not part of normal UX.

## Verification and remaining acceptance

- Existing WP0 frozen source hashes: 178 trips, 401 legs, 109 locations, 3 hoppers.
- WP1: all plan packages and numerical worker parity.
- WP2: clock, camera ownership, handoffs and deterministic seeks.
- WP3: renderer schedule and opt-in GPU budget.
- WP4: all 401 source route identities, endpoints, complete geometries, stacking and cache metadata checked during build; SHA256 distributed artifact verification; loader deduplication, missing/corrupt fallback, and lazy-editor boundary tests.
- WP4: timeline marker/year/month/card model tests ensure the extraction has not changed displayed positions or ordering.
- Chromium smoke checks: compact route asset loads while the full route and Studio JS chunks are **not requested**; playback starts; Studio is opened on explicit command and requests the canonical source; closing Studio restores the viewer and screenshots are saved.

**Open browser acceptance:** Test an actual Add/Edit Hop save with a repository token in an isolated development environment; review multi-mode / screensaver visuals and performance on hardware WebGL. CI smoke does **not** save to a real repository. Long-running memory certification and production deployment remain WP5.

## Rollback

Remove `v9Viewer=1` to use the original canonical source through a lazy async import. The source files, compiled playback plans, original routing worker and existing controls remain intact. Studio always retains canonical metadata.

Do not merge to `main`, change `gh-pages`, or enable the GPU budget by default until WP5 acceptance and explicit approval.
