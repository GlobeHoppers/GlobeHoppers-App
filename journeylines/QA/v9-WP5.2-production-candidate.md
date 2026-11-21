# GlobeHoppers v9 — Single-user production candidate

**Release source:** validated v9 architectural rewrite of the original v7.5.15 single-user application, 178 trips, 401 legs, 109 locations, 3 hoppers.

**Candidate branch:** `release/v9-single-user-candidate`.

**Prior production archived:** `archive/main-v8.2.8-pre-v9` at `9e7fc251a456acbdb6f2edfc8b976f72a310c2dc`.

## Scope and architecture

- v8.2.8 Supabase, accounts, authentication, and other post-v7.5.15 features are deliberately excluded.
- The v9 authoritative playback clock, compiled travel plans, independent renderer, and read-only viewer/Studio separation are all **default on** together.
- All modes use a common runtime switch: `?v9Legacy=1` (or `?v9=0`) returns to the legacy renderer, canonical routes, and traditional playback plans. It wins over component flags.
- Individual `?v9Renderer=0`, `?v9Viewer=0`, and `?v9Playback=0` are retained for isolated regression testing.
- The optional reduced-resolution GPU budget remains OFF by default.
- The candidate preserves all single-user editing and repository-save mechanisms.

## Evidence reviewed

Windows Chrome 157 / NVIDIA RTX 3090 / 3840x2033 application canvas: three same-flight 60-second checks completed, with zero reported frame intervals over 100 ms and without playback stalls. The v9 viewer delivered around 58 JavaScript display updates per second at near-4K. These measurements are **not physical GPU-presented FPS**. No additional FPS tuning is required for this release gate.

## Must pass before main cutover

1. The same-sha v7.5.15 feature inventory, compiled route hashes, playback/camera parity, renderer, and viewer/editor unit tests.
2. Browser smoke: no URL flags chooses v9; legacy URL returns all three components to legacy; pause/resume/seek, Studio open/close, manifest failure fallback, screensaver.
3. Same-trip four-mode software-Chromium smoke for regression signals (not performance optimization).
4. **30-minute unattended headless browser test** with no playback stalls or uncaught errors; inspect heap and WebGL warnings. Candidate branch automatically runs full duration.
5. **Single-user Add/Edit Hop save and reload**, using a disposable repository/token or isolated mock. The current compiled viewer data is immutable and must not overwrite saved edits or silently serve stale routes.
6. Visual check: connected leg handoffs, route trails, vehicle sprites, scrolling timeline, and screensaver as in v7.5.15.
7. Explicit approval to replace main after all evidence is reviewed.

## Production cutover — deliberately not executed

1. Confirm current `main` SHA, archive the exact previous production ref, and preserve `archive/main-v8.2.8-pre-v9`.
2. Record the approved candidate SHA, preview artifact, and browser QA evidence.
3. **Do not use a normal merge or GitHub PR merge.** Main contains unrelated v8 history.
4. With explicit authorization, replace the main ref using a guarded force-with-lease expecting its old SHA. The ref becomes the accepted v9 commit directly.
5. Monitor main-only Pages deployment and smoke test the live globe and one single-user edit/save/reload.
6. On failure, restore the recorded old main SHA and corresponding deployment. Keep candidate for root-cause analysis.

**Current status:** main and gh-pages remain unchanged. Candidate validation must finish before promotion. CI never performs the branch replacement automatically.

## Production deployment manifest gate

The production `deploy.yml` must run `compile-v9-playback.mjs` (401 legs) and verify `dist/data/v9-playback/manifest.json` plus `dist/data/v9-viewer/manifest.json` before publishing to `gh-pages`. The pre-release workflow now enforces this rule. Missing these assets would silently bypass the intended v9 precompiled-playback architecture.

The `?v9Legacy=1` recovery URL disables the WP1 compiled loader, WP3 renderer and WP4 viewer. The WP2 authoritative clock remains in the source; complete historical rollback requires restoring the archived prior production branch rather than only using the URL switch.
