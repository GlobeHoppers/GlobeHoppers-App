# GlobeHoppers v9 — WP0 baseline and migration contract

**Baseline:** `refactor/v9-core` from `f88bfb21da987fbb610570d81471b16c228a10af` (v7.5.15, last working pre-account production source).

**Purpose:** Restore a reliable single-user baseline, then refactor the playback architecture without losing travel data, visual identity, or existing workflows. Multiuser, authentication, and Supabase are explicitly out of scope.

## Verified source-data inventory

| Data | Baseline |
| --- | ---: |
| Trips | 178 |
| Legs | 401 |
| Air / drive / boat / train | 330 / 54 / 13 / 4 |
| Locations | 109 |
| Hoppers | 3 |
| Home bases | 4 |

Authoritative history: `journeylines/src/data/trips.json`. The old repository-root `src/data/trips.json` is not authoritative. All trip IDs are unique and all referenced locations and travelers resolve. Four `legId` strings repeat **across different trips**: playback identity must use `(tripId, legId)`, not `legId` alone.

The accompanying `v9-baseline-manifest.json` captures the original IDs and Git blob IDs for core data. The validation script must reject accidental data mutation or deletions; intentional trip edits require a reviewed manifest update. Never automatically rewrite the user's history while refactoring.

## Feature-parity contract

Preserve chronological travel history; dates, captions and notes; multi-leg and return travel; mode-specific paths and icons; traveler colors; route trails; 3D globe and alternate projections; camera follow and free exploration; timeline zoom/pan/seek/search; controls and speed; queue cards and location markers; single-user Add/Edit Hop and saving; screensaver, idle and repeat modes; and smooth connected-leg handoffs.

## Architectural ownership

1. **Editing and data:** Single-user Studio and authoritative trip data.
2. **Offline compiler:** Prepares versioned geometry, route metadata, camera cues and compact travel packages ahead of playback.
3. **Playback clock/state machine:** Owns time, transitions, seek, pause/resume, completion and leg identity.
4. **CameraDirector:** Sole owner of camera updates while playing, with explicit manual-control arbitration.
5. **Renderer:** Updates vehicles and camera at display cadence; budgets trails and overlays independently.
6. **React UI:** Reads throttled snapshots; never drives the per-frame camera.

Precompute trajectories, **not video frames**; viewport projection and camera sampling remain live.

## Work packages and release gates

- **WP0:** Immutable baseline, reproducible install/build, data-integrity verification and isolated CI.
- **WP1:** Deterministic playback compiler; versioned packages and route-geometry parity.
- **WP2:** Single clock and transitions; deterministic seek/pause/resume; no connected-leg cuts.
- **WP3:** Independent CameraDirector, route renderer, vehicle animator and overlays, adaptive rendering.
- **WP4:** Isolated editor and responsive UI while preserving single-user workflows and screensaver.
- **WP5:** Golden visual captures, functional/performance regression, long unattended playback, deliberate production cutover.

Performance goals are **targets until measured**: approach 60 FPS on a reference desktop, consistent frame-time smoothing at 30/60/120 Hz, no connected-leg camera jumps, and reliable long-running screensaver operation. Compare against v7.5.15 under matched conditions.

Do **not** change the default branch, production deployment, or `gh-pages` without an explicit release decision.