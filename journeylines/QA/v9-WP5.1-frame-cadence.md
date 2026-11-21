# GlobeHoppers v9 WP5.1 — High-refresh frame-pacing audit

**Baseline:** single-user v7.5.15. **Branch:** refactor/v9-core. This is an opt-in renderer correction; main, gh-pages, accounts and production are unchanged.

## Evidence from the actual Windows GPU

Hardware: NVIDIA RTX 3090, Chrome 157 / Direct3D11, DPR 1, 1912 × 966 canvas, 3840 × 2160 desktop. The three user-supplied 60-second WP5 samples used the identical 2,252-mile flight and progress/speed configuration.

Averaging steady-state samples from 15 seconds onward:

| Mode | Source RAF callbacks/s | JS display stage updates/s | Average p95 JS render work |
| --- | ---: | ---: | ---: |
| WP2 comparison | 97.97 | 97.97 | Not separately instrumented |
| WP3 renderer | 110.03 | 59.31 | 6.2 ms |
| WP4 compact viewer | 97.59 | 57.59 | 6.27 ms |

**Root cause verified in source:** RENDER_PROFILES.high.displayMs was 1000/60. WP3 explicitly skipped every other animation callback on high-refresh displays. WP2 counted every callback, **not GPU presentation**. Therefore the 98 vs 59 difference was largely artificial scheduler throttling and a metrics-semantic mismatch, not evidence that v9's map GPU was slower by 40%.

**WP4 investigation:** Both WP3 and WP4 use the exact same TravelMap rendering component and scheduler, with the same pixel ratio and GPU budget off. WP4's viewer boundary changes how verified route data is loaded, not the live renderer. The 1–2 FPS gap in a single run correlates with WP4's lower source RAF clock (97.59 vs 110.03) and should not be attributed to a separate WP4 rendering algorithm without repeated controlled measurements.

## Correction

- High-quality rendering now **follows each animation callback** (60, 90, 120, 144, 165 Hz and other browser-delivered rates). It creates **no additional RAF or timer**.
- Camera and vehicle retain one sampled scene/time to avoid handoff cuts, jitter, or decoupling.
- Costly trail (90 ms) and arc (50 ms) updates keep their previous independent pacing.
- Medium and low quality remain capped at 45/30 Hz for fallbacks under load. The authoritative PlaybackEngine still controls quality based on sustained frame latency.
- The first transition frame retains its prior 60 Hz reference interval for stable camera smoothing, then the elapsed-time damping follows actual display intervals.
- The CI benchmark now includes a fourth mode, the compact WP4 viewer, on the **same long-haul leg**, alongside WP2, WP3 and the experimental GPU-budget mode. It records source-clock speed to separate viewer startup noise from renderer work.

## Acceptance / honest limits

Run WP5 automated tests and the four-mode browser benchmark; collect hardware captures with one active tab at a time. The old WP5 local runner was built before the correction: use the new build after this commit to compare WP3 and WP4. Compare **source tick rate** and **JS display update rate** separately; count of MapLibre redraws/GPU-presented frames requires Chrome's GPU/Rendering tools.

No claim of achieving 120/144/165 visible FPS is made until the RTX 3090 re-test. Driving camera updates each RAF consumes more GPU/CPU work, so the result might become slower under sustained load; the quality fallback protects responsiveness but does not guarantee high refresh. Keep the reduced-resolution GPU budget optional. Do not promote main until the revised browser benchmark, GPU visual parity, 30-minute playback and single-user save/reload acceptance pass.
