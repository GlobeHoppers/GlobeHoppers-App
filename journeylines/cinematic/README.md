# Cinematic GlobeHoppers — WP1

An independently authored, open-source cinematic camera prototype built on top of the GlobeHoppers v9 playback foundations. The main app and editor remain unchanged.

## Architecture and scope

- Separate Vite/React entry at /cinematic/; deploys alongside the main site on GitHub Pages after merging.
- First run uses eight demo locations from GlobeHoppers' existing locations catalog: San Diego, Los Angeles, Las Vegas, Miami, New York, Augusta, New Orleans and Chicago. These are not the user's private trip base.
- Scene planner (src/cinematic/scene.js) shares v9 compiled route geometry and is purely deterministic: sample(ms) and revealedRoute(ms) do not depend on wall-clock time.
- Playback uses v9's PlaybackEngine single-clock contract. React does not animate the camera.
- MapLibre GL JS is the open-source WebGL renderer. OpenFreeMap's Fiord vector basemap is the default external tile source; a network connection is required for tiles. No Mult.dev requests or code.
- Camera trajectory: continuous along v9 great-circle routes, distance-sensitive cruise zoom, fifth-order smooth easing, continuous zoom/pitch/bearing across stops, route reveal by the same playback timestamp.
- User drag/touch/wheel pauses playback, preventing camera ownership conflicts.
- Query flag ?capture=1 hides controls; window.__CINEMATIC_GLOBEHOPPERS__ exposes a deterministic timestamp seek/sample API for a future local headless capture tool.
- A cinematicStopsFromTrip adapter exists but is not connected to the user's trip base yet. Do not enable without read-only data-source QA.

- WP1.1 flight polish: camera is north-biased and limited to ±45°; aircraft orientation follows the actual geographic travel heading independently of the camera bearing.
- Flight geometry retains the great-circle basis but adds a small endpoint-preserving lateral arc to each leg. This is a visual flight-path bow, not a physically elevated 3D line. A true world-space altitude arc is a potential later refinement.
- Only the initial city is visible at time zero; each next destination marker, label and unrevealed route outline appears when its incoming leg begins. Seeking backward hides future markers and paths again.
- The aircraft is visible only during flight. On landing, the airplane disappears, two time-driven geographic ripple rings expand from the arrival point and a cinematic destination title appears, including in capture mode.
- Arrival dwell is 1.75 seconds so the ripple/title can read. These effects use scene time and can therefore be reproduced exactly during eventual fixed-FPS video export.
- MapLibre's route sources update at about 30 Hz while its camera transform follows the v9 playback refresh. Completed and upcoming-marker source updates are cached, avoiding redundant large GeoJSON writes.


## Run and verify

From journeylines/:

    npm ci
    npm run test:cinematic
    npm run dev

Open http://localhost:5173/cinematic/.

To build both main and cinematic entry points:

    npm run build

Verify the build contains dist/index.html and dist/cinematic/index.html. Existing v9 release gates should still run before production deployment.

## Later work, intentionally out of scope for WP1

1. Parity-check camera smoothness and frame timing against the 21-second cinematic reference.
2. Wire the trip-base adapter behind a permission-aware, versioned read-only snapshot boundary; do not import editor mutations or bypass Supabase RLS.
3. Offer licensed satellite imagery (vector tiles are not satellite imagery). Honor tile and imagery licenses/attribution.
4. Build video export locally through Playwright/Chromium frame capture and FFmpeg; render exact timestamps, not live screen recording. Never depend on Mult.dev services.

## License

The newly authored Cinematic-specific files under journeylines/src/cinematic and journeylines/cinematic, plus its dedicated tests, are offered under the MIT License in cinematic/LICENSE. This license does not relicense the existing GlobeHoppers v9 core modules imported by the prototype; those require their own applicable licensing review before republishing as a fully standalone open-source distribution.

## Security baseline

There is no remote scene submission endpoint in this prototype. Inputs are bounded to 2–128 valid stops; no private trip data is loaded. Avoid embedding private route datasets or service-account credentials in GitHub Pages builds. The current sample route is public demo data.

This module is independently written and does not incorporate Mult.dev's proprietary JS bundles.

WP1.1 uses a programmatically drawn aircraft glyph rather than a third-party airline asset.
