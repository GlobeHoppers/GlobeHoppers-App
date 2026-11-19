# GlobeHoppers v9 — WP2: Deterministic playback and camera authority

**Branch:** `refactor/v9-core` (v7.5.15 source). **Deployment:** validation-only; production `main` and `gh-pages` unchanged.

## Implementation

1. **Authoritative timeline clock:** `src/utils/playbackEngine.js` now owns elapsed time, segment progress, settle, pause/resume, seek, and exactly-once completion. Clock time comes from a single monotonic requestAnimationFrame clock; renderers and React observe it. The unused React `tRef` elapsed-time scaffold was removed.
2. **Race-free completion:** All control commands invalidate queued completion callbacks. Reconfiguration changes the playback generation, and seeking or pausing invalidates any completion that had already reached the microtask queue.
3. **Stable navigation:** Explicit timeline jumps pause and invalidate the prior leg *before* the fade. Same-leg scrubs seek the already-configured clock immediately; different-leg navigation waits for React's new-leg configuration, never seeking the old leg with new progress. Intro and relocation transitions are cancelled on deliberate seeks.
4. **One connection definition:** `src/utils/playbackTransitions.js` centralizes a leg-to-leg connection rule (matching location ID or within 3.5 miles), used by the timeline transition decision **and** the cinematic camera. An automatic connected return leg preserves camera continuity; a disconnected leg performs the legacy smooth relocation.
5. **Exact seek placement:** `App.jsx` sends a numbered `playbackSeekRequest` to `TravelMap.jsx`, which derives the camera from the requested leg and *its requested progress*, rather than jumping to the origin and then correcting to midflight. Stale requests are ignored after the timeline advances.
6. **Camera arbitration:** `src/utils/cameraDirector.js` grants cinematic camera authority to exactly one lifecycle phase: relocation, intro, tuning, idle, globe overview, active playback, or paused scene. Playback updates must also match the active leg generation. Existing manual gesture/return behavior remains supported.
7. **Time-consistent follow smoothing:** Camera damping is normalized for elapsed milliseconds, so 28/35/44 ms camera update intervals do not cause different smoothing durations solely because of frame cadence. A camera/overview timer from an earlier phase can no longer steal control after a seek.

## Automated checks

- 178 baseline trips; 401 legs; 109 locations; immutable data SHA verification.
- 393 connected automatic handoffs, 7 intentional relocations, 1 final completion in the frozen v7.5.15 history.
- Playback-clock tests: frame jitter, pause/resume, exact seeking, queued completion suppression, generation changes, settle, stop and observer reentrancy.
- Camera-director tests: phase precedence, invalid/stale generation rejection, deferred callback invalidation and time-based smoothing equivalence.
- Transition tests: return flights, disconnected hops, proximity tolerance, exact 100% timeline seek and duplicate leg IDs across trips.
- WP1 compiled plan/worker-parity tests remain active: max position drift 0.000012°, camera 0.000012°, heading 0.080° across all 401 compiled legs.
- GitHub Actions runs Node 24 `npm ci`, 7 test/verification stages, and a Vite build, then uploads an isolated preview. **No publication**.

## Preview

GitHub Actions → run on `refactor/v9-core` → **Artifacts** → `GlobeHoppers-v9-WP2-preview`.

Extract the artifact to a local folder and use `py -m http.server 8000` from that folder. Visit:

- `http://localhost:8000/`: WP2 controller + original route plan loading
- `http://localhost:8000/?v9Playback=1`: WP2 controller + precompiled route plan loading

Compare to the saved WP1 preview on a separate port if visual parity is in doubt.

### Browser acceptance checklist (still required)

- Connected out-and-back legs: no zoom snap/cut at the handoff.
- Disconnected legs: a smooth relocation ends exactly at the next leg's launch camera, followed by playback.
- Seek to 25%, 50%, 95%, and 100% while paused and while playing; camera and vehicle must agree on location.
- Rapid consecutive scrubs or timeline marker clicks, including a scrub during arrival/settle; only the final request must win.
- Pause for 5+ seconds and resume; no elapsed-time drift or duplicate advance.
- Change playback speed mid-flight; preserve relative progress.
- Drag/rotate/zoom the globe during playback, then release it; manual return-to-follow must be smooth.
- Open and close Add/Edit Hop, activate View Globe, idle, screensaver and alternate projection during/after playback.
- Repeat for plane, driving, train and boat; compare with v7.5.15/WP1 visuals.

## Deliberate scope limits and next work package

- **WP2 has not demonstrated higher FPS.** MapLibre rendering, trail updates and camera sampling still use the original adaptive 28/35/44 ms and 84/100/125 ms budgets. WP3 is responsible for renderer/frame-cadence separation and benchmarking.
- The app still imports `routeDetails.json` eagerly into React/MapLibre. Isolating editor/viewer bundles is part of later work.
- Automated tests confirm deterministic clocks/geometry and successful builds, **not** interactive visual parity. Browser acceptance is required before default-on promotion or production merge.
- WP2 does not redesign the editor, add accounts, publish a website, or alter saved travel history.

Do not merge into production until browser acceptance and later work packages are complete.
