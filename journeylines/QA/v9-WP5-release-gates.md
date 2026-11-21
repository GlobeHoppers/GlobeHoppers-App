# GlobeHoppers v9 — WP5 Release Acceptance & Cutover

**Source baseline:** v7.5.15 (commit f88bfb21da987fbb610570d81471b16c228a10af). **Development:** refactor/v9-core.

**Decision:** v8.x/v8.2.8 and its authentication, Supabase, multi-account data model and private ordering are intentionally discarded. No v8 integration is required.

**Scope:** finish automated regression evidence, candidate visual goldens, endurance and controlled A/B; create a production release gate. **WP5 does not change defaults, main, gh-pages or production deployment.**

## Automated WP5 verification

The non-deploying .github/workflows/release-v9.yml executes on changes to the v9 branch:

1. Recheck frozen v7.5.15 travel source (178 trips, 401 legs, 109 locations, 3 hoppers) and run the complete pre-account feature verification.
2. Compile the v9 playback library and the 401-route compact viewer, then verify distributed manifests.
3. Run WP1–WP4 numerical, clock, camera, renderer, GPU-budget, viewer and timeline regression tests.
4. Run the existing WP4 browser test of compact-route loading, editor chunk isolation, canonical Studio loading and viewer restoration.
5. Run a new browser functional test: legacy path remains off by default before release; v9 renderer/viewer load with explicit flags; play and seek a fixed long-haul leg; pause and resume with visible controls; open/close the single-user Studio; inject compact-asset failure and confirm full canonical fallback; launch screensaver mode. Save candidate screenshots.
6. Run the controlled WP2/WP3/WP3-GPU same-leg Chromium A/B benchmark, preserving the software WebGL limitation.
7. Run the playback watchdog for two minutes on every v9 WP5 workflow, recording JavaScript heap, DOM nodes, event listeners, WebGL warnings, route/clock health and stalls. A manually dispatched full 30-minute run is mandatory before release approval.
8. Create a machine-readable release-readiness.json containing automated check outcomes and a separate list of pending manual gates.

A passing short CI run means **automated acceptance only**, not production readiness. Headless Chromium typically uses SwiftShader, so its measured FPS is not a physical GPU's FPS. Candidate screenshots are evidence, **not** approved golden images.

## Mandatory acceptance before proposing a new main

| Gate | Method | Required disposition |
| --- | --- | --- |
| Automated regression | WP5 GitHub Actions short run and evidence bundle | Pass |
| 30-minute unattended playback | Manually trigger workflow on refactor/v9-core with full_endurance=true | Pass, inspect memory and WebGL reports |
| True desktop graphics | Windows hardware-accelerated Chrome, identical route/speed/viewport for WP2 and WP3 | No material regression; aim for 60 FPS on reference desktop |
| Visual parity | Side-by-side screenshots/video against v7.5.15 | Approve globe, trails, style, vehicle, projection, timeline |
| Camera correctness | Long haul, connected outbound/return, dateline and disconnected relocation | No jump, zoom pump, missing vehicle or stale trail |
| Screensaver | Actual target PC / monitor, 30 minutes | No blank screen, long-term stall, WebGL context loss or uncontrolled memory growth |
| Single-user editing | Isolated GitHub test repository/token, Add/Edit Hop, save, rebuild, reload | Confirm all trips and route metadata remain correct |
| Optional GPU budget | Compare default WP3 and reduced pixel ratio, both performance and image quality | Explicitly accept any sharpness or tile-cache tradeoff |
| Cutover/rollback | Explicit user approval after all accepted gates | Required |

Browser A/B addresses: legacy WP2 `?v9Playback=1&v9Metrics=1`; WP3 `?v9Playback=1&v9Renderer=1&v9Metrics=1`; GPU experiment adds `&v9GpuBudget=1`; compact viewer adds `&v9Viewer=1`. Enable diagnostics using `window.__GLOBEHOPPERS_RENDERER__.enableMetrics()`. Compare at least 60 seconds per mode, using one playing browser tab at a time, same monitor and camera, and record Chrome Performance traces plus chrome://gpu identity, display resolution, refresh and DPR.

## Running the 30-minute CI check

GitHub > Actions > **GlobeHoppers v9 WP5 Release Validation (No Deploy)** > Run workflow > branch **refactor/v9-core** > set **full_endurance=true**. The resulting **GlobeHoppers-v9-WP5-release-evidence** artifact contains screenshots, reports and readiness assessment. A 30-minute CI run is still not a substitute for real Windows GPU acceptance.

## Only after explicit approval: deliberate main replacement

1. Record accepted v9 SHA and preserve the original v7.5.15 base.
2. Back up the current v8.2.8 main ref under a separate archive reference. This is historical preservation, **not** a request to merge v8.
3. In a separately reviewed release commit, make the validated v9 viewer, compiled playback and renderer defaults. Retain a tested legacy rollback switch; keep optional GPU-budget optimization opt-in until individually accepted.
4. Re-run the entire acceptance suite against the release commit. Verify resulting compiled assets, no Supabase dependencies or auth, and the main-only GitHub Pages deployment workflow.
5. Promote the accepted v9 history by a controlled main ref replacement rather than an ordinary merge with v8.2.8. Deploy only with explicit authorization.
6. Check the live globe, playback and editor. On a severe regression, restore the recorded prior main/deployment reference and investigate on an isolated branch.

**Status:** WP5 release tooling implemented; full readiness remains pending until acceptance evidence is reviewed. Never describe passing unit tests or SwiftShader snapshots as hardware performance certification.
