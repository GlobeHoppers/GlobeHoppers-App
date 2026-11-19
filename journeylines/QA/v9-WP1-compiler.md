# GlobeHoppers v9 — WP1 compiler, initial implementation

**Branch:** `refactor/v9-core`. Production `main` and `gh-pages` remain untouched.

## What is implemented

- `src/utils/compiledPlaybackPlan.js`: deterministic, serializable samples, headings, cumulative path distances, camera-lead coordinates, and cinematic leg duration. Uses the existing surface presentation shaping logic. Does not change the live renderer.
- `scripts/compile-v9-playback.mjs`: reads authoritative 178-trip history, 109 locations, home bases and saved route geometry. Outputs an index and one independently loadable JSON package per trip. The input sources are never rewritten.
- `scripts/verify-v9-playback.mjs`: checks all leg plans, array dimensions, numeric validity, trip-scoped IDs, package content hashes and mode totals.
- `scripts/test-v9-playback.mjs`: deterministic compilation, return-direction, antimeridian, surface geometry, duration and invalid-input tests.
- `validate-v9.yml`: compiles and tests in temporary CI storage, builds the original viewer, and **does not deploy**.

## Verified baseline compilation

- 178 trip packages, 401 legs
- 330 plane / 54 drive / 13 boat / 4 train
- 71 saved detailed route geometries
- 330 saved `simpleFallback` geometries
- 0 missing route geometries
- All compiled package integrity checks passed in GitHub Actions.

The 330 simple-fallback routes correspond to the plane legs in the current dataset. The compiler **retains their legacy source behavior** for parity. We should not silently substitute a new great-circle or cinematic arc interpretation until the camera and path visuals are compared in browser.

## Output contract

`manifest.json` contains the source SHA-256, trip list, per-trip byte size and SHA-256 digest, and coverage counts. Each `trips/{id}.json` contains its existing trip-scoped leg identity, mode, location references and the precomputed plan arrays. The packages are deterministic and can later be versioned, browser-cached and fetched only for the visible/active journey.

**Current limitation:** The experimental packages are generated into temporary CI storage. The v7.5.15 viewer still runs its original routing/plan stack. There is no proven FPS or startup improvement yet, and the compiled output is not published as a production asset.

## Next acceptance gate before runtime switch

1. Establish numerical/visual parity against the old routing worker for representative plane, driving, rail, boat, dateline and return legs.
2. Add lazy, validated loading of the per-trip packages with a graceful, observable fallback.
3. Connect the viewer behind an opt-in feature flag, initially without touching normal production playback.
4. Remove the monolithic `routeDetails.json` import from the viewer only after all current features work from the new packages.
5. Benchmark cold start, memory, route handoff, camera continuity and a long idle/screensaver session on a reference browser.

Do not switch the default viewer or merge until this gate is complete.
