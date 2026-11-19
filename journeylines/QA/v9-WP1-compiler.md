# GlobeHoppers v9 — WP1 playback package integration

**Branch:** `refactor/v9-core` from v7.5.15. Production `main` and `gh-pages` are unchanged.

## Implemented

1. **Offline, deterministic compiler:** `src/utils/compiledPlaybackPlan.js` produces the same positions, headings, cumulative travel distance, camera lead and timing as the v7.5 routing worker.
2. **Independent trip packages:** `scripts/compile-v9-playback.mjs` emits `public/data/v9-playback/manifest.json` and `trips/{id}.json`; Vite copies these into `dist/data/v9-playback`. No generated JSON is committed to Git.
3. **Runtime loader:** `src/utils/compiledPlaybackLibrary.js` lazily reads the manifest and only the current/nearby trip bundles, caches at most eight trip bundles, deduplicates concurrent requests and verifies byte count, SHA-256 content and schema.
4. **Stale edit protection:** Every leg is identified by `tripId::legId`, rather than globally reused leg IDs. The runtime checks the live leg order, mode, endpoints, point IDs, distance and saved route geometry SHA-256 before using precompiled arrays.
5. **Opt-in viewer integration:** With `?v9Playback=1` in a **v9 preview build**, `TravelMap.jsx` uses the compiled plan if valid. If the manifest/package/geometry is unavailable, corrupt or outdated, the original routing worker remains the fallback. This flag is OFF by default.
6. **Avoid mid-leg plan changes:** A compiled plan loaded after the initial 1% of a flight is not promoted mid-leg from a null plan, preventing a late trajectory change.
7. **No production deployment:** The v9 validation GitHub Action builds the original viewer with compiled assets but only uploads a downloadable preview artifact; it does not modify `gh-pages` or `main`.

## Verified tests

- Baseline: 178 trips / 401 legs / 109 locations / 3 hoppers; frozen data blobs unchanged.
- Modes: 330 plane, 54 drive, 13 boat, 4 train.
- Source detail coverage: 71 detailed geometries; 330 simple source fallback geometries; 0 missing.
- Package integrity: every trip SHA-256, byte size, schema, 401 compiled plans and finite array dimensions checked.
- Runtime: fetch/cache deduplication, no eager network call in legacy mode, invalid package or digest rejection, edited endpoints, travel mode, distance, point IDs, route geometry and missing-trip fallback.
- **Numerical parity:** compared all 401 legs with the **actual legacy worker sampler**, not an independently estimated path. Greatest differences: position 0.000012°, camera 0.000012°, heading 0.080°, total distance 0.002 miles.
- CI: Node 24 `npm ci`, regression verifier, unit tests, compilation, post-build package verification and Vite build.

## How to preview

The GitHub Actions run on `refactor/v9-core` includes an artifact named `GlobeHoppers-v9-WP1-preview` (kept seven days). Extract it and serve it over a local HTTP server; opening `index.html` via `file://` will not support all browser resource fetches.

Alternatively, from the checked-out v9 branch:

```sh
cd journeylines
npm ci
node scripts/compile-v9-playback.mjs --out public/data/v9-playback
npm run dev
```

Open the Vite URL (normally `http://localhost:5173/`) as-is for original playback, and with `?v9Playback=1` for the compiled path. Check Browser DevTools Network for `data/v9-playback/manifest.json` and `data/v9-playback/trips/{id}.json`. Compiled packages are not downloaded when the flag is off. If an edited trip or package does not match, playback gracefully uses the legacy worker.

**Do not test `?v9Playback=1` on the current production GitHub Pages site; that deployment has not been updated with the v9 compiled asset pipeline.**

## Remaining gates before replacing the original playback engine

- Browser/visual parity: connected and disconnected route handoffs, manual camera exploration, screensaver, timeline scrubbing, all travel modes, route stacking and alternate projections.
- Benchmarks: cold/warm launch, frame-time and memory comparisons with v7.5.15, including unattended playback.
- `routeDetails.json` is still imported eagerly by App, Studio and TravelMap, and surface drawing still uses the legacy renderer. Removing that multi-megabyte dependency is **not** safe until the editor and path consumers have been separated.
- Move the new code to default only after the above measurements and end-to-end browser regression.

This work package establishes a verified data path, **not yet** a measured FPS improvement or a replacement CameraDirector.
