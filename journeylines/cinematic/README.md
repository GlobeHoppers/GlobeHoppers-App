# Cinematic GlobeHoppers — WP1

An independently authored, open-source cinematic camera prototype built on top of the GlobeHoppers v9 playback foundations. The main app and editor remain unchanged.

## Architecture and scope

- Separate Vite/React entry at /cinematic/; deploys alongside the main site on GitHub Pages after merging.
- First run uses eight demo locations from GlobeHoppers' existing locations catalog: San Diego, Los Angeles, Las Vegas, Miami, New York, Augusta, New Orleans and Chicago. These are not the user's private trip base.
- Scene planner (src/cinematic/scene.js) shares v9 compiled route geometry and is purely deterministic: sample(ms) and revealedRoute(ms) do not depend on wall-clock time.
- Playback uses v9's PlaybackEngine single-clock contract. React does not animate the camera.
- MapLibre GL JS is the open-source WebGL renderer. WP2 defaults to a natural-color Cinematic Earth preset: NASA Blue Marble Next Generation (up to zoom 8) crossfades into 2016 EOX Sentinel-2 cloudless imagery (zoom 5–14) without resetting the scene. OpenFreeMap Fiord remains the underlying vector map and the optional Midnight preset. An internet connection is required for imagery. No Mult.dev requests or code.
- Camera trajectory: continuous along v9 great-circle routes, distance-sensitive cruise zoom, fifth-order smooth easing, continuous zoom/pitch/bearing across stops, route reveal by the same playback timestamp.
- User drag/touch/wheel pauses playback, preventing camera ownership conflicts.
- Query flag ?capture=1 hides controls; window.__CINEMATIC_GLOBEHOPPERS__ exposes a deterministic timestamp seek/sample API for a future local headless capture tool.
- A cinematicStopsFromTrip adapter exists but is not connected to the user's trip base yet. Do not enable without read-only data-source QA.

- WP1.1 flight polish: camera is north-biased and limited to ±45°; aircraft orientation follows the actual geographic travel heading independently of the camera bearing.
- Flight geometry retains the great-circle basis but adds a small endpoint-preserving lateral arc to each leg. This is a visual flight-path bow, not a physically elevated 3D line. A true world-space altitude arc is a potential later refinement.
- Only the initial city is visible at time zero; each next destination marker, label and unrevealed route outline appears when its incoming leg begins. Seeking backward hides future markers and paths again.
- The aircraft uses the actual existing GlobeHoppers v9 `Airplane - Blue.png` (nose-up artwork), rendered in a compositor-only DOM overlay on the same frame as the camera. It takes its screen rotation from the projected route tangent on the pitched globe, and reuses v9-style `rotateX` perspective attitudes (-56° takeoff, 0° cruise, +76° landing) and scale shaping. Its center stays projected to the geographic route coordinate at all times: no artificial screen-space climb or lift. It disappears at the arrival coordinate.
- Arrivals use small map-anchored destination labels and restrained geographic ripple rings. The large centered TOUCHDOWN popup has been removed; the accent remains visible in capture mode.
- Arrival dwell is 1.75 seconds so the ripple/title can read. These effects use scene time and can therefore be reproduced exactly during eventual fixed-FPS video export.
- The map camera and DOM airplane use the v9 refresh clock. Expensive GeoJSON updates run about every 65 ms, separate active-flight trails from cached completed legs, and only update destination labels and route outlines when a flight starts. The marker is never quantized to that slower update cadence.


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

## WP1.2 playback smoothness acceptance criteria

- Chromium browser smoke confirms an airplane overlay, map-anchored arrival label, per-frame deterministic seeking and a descending aircraft in the final approach.
- Scene unit tests verify low initial altitude, higher cruise, lower final approach, and that active route geometry excludes completed legs.
- Browser automation verifies correctness but is not an objective FPS/stutter measurement on every GPU. Continue visual testing on the actual deployment and hardware before treating the performance issue as fully resolved.

## WP1.3 airplane PNG / route anchor correction

- Shares the same airplane PNG and nose-up sprite orientation used by the current GlobeHoppers v9 map renderer. No additional aircraft artwork or off-route lift layer.
- Plane anchor is always exactly MapLibre's projection of the current curved-route coordinate. View rotation comes from the *projected* forward and backward path samples rather than geographic heading alone, so it points along its drawn route even on tilted maps.
- The airplane's 3D takeoff/landing impression is purely local perspective rotation of the PNG and scaling. World latitude/longitude and the route line never shift as a consequence of that visual effect.
- The browser smoke test checks that PNG pixels actually load, sprite attitude transforms exist and the rendered aircraft anchor matches the map-projected route point within a fraction of a pixel, including during approach.

## WP2: Cinematic Earth Visual System

### Globe appearances

The globe selector offers four modes without calling map.setStyle(), reconstructing a route, or changing the playback clock.

- **Cinematic Earth (default):** NASA Blue Marble at planetary distances, crossfading to 2016 Sentinel-2 cloudless imagery near zoom 5–6.35. Light geographic labels.
- **Satellite:** The same imagery with underlying basemap labels hidden; GlobeHoppers' own stop labels remain.
- **Satellite + Labels:** Satellite imagery with stronger geographic labels for context.
- **Midnight:** The original OpenFreeMap Fiord vector presentation. Raster sources are hidden, avoiding needless tile requests in this mode.

The selected appearance is stored in local browser settings (where available). For a reproducible kiosk or video-capture startup, URL parameters override that setting: /cinematic/?map=earth, ?map=satellite, ?map=hybrid, ?map=midnight. ?capture=1&map=earth hides the playback UI, but retains the map, aircraft, trip geometry and selected imagery. Invalid map IDs default to Cinematic Earth.

### Tile sources and rights

- NASA Blue Marble Next Generation: publicly available NASA EOSDIS GIBS WMTS. https://gibs.earthdata.nasa.gov/ and https://earthobservatory.nasa.gov/features/BlueMarble
- EOX Sentinel-2 Cloudless **2016**: 10 m cloudless satellite composite, CC BY 4.0; attribution is displayed using the imagery source attribution in MapLibre. https://cloudless.eox.at/documentation/license and https://cloudless.eox.at/pricing
- OpenFreeMap Fiord: vector labels and the Midnight basemap. https://openfreemap.org/

The NASA source is designed for orbital views, not street-level orthophotography. EOX Sentinel-2 2016 improves land detail to 10 m, but does not provide sub-meter buildings/airports. A future production imagery provider may offer more detail; any provider integration must respect tile access and video/export license terms. The public EOX tile server's throughput and usage policies must be considered for a full-time installation. Do not download entire tile pyramids or assume permission to resell imagery.

The renderer's own code is independently authored; imagery sources have their own attribution and license terms. MapLibre layers are installed **under** destination and route overlays. Styles only change their raster visibility and basemap-label opacity so the camera and airplane always continue from their exact scene timestamp.

### WP2 validation

- Run npm run test:cinematic for camera continuity and map-style source/selection tests.
- Run the existing cinematic Chromium smoke workflow for visible map, aerial styles, switching without clock resets, airplane alignment, arrival labels and capture mode.
- Confirm browser requests remain on expected external hosts: NASA GIBS, EOX, OpenFreeMap; none go to Mult.dev.
- Visually review orbital Earth, regional flight, and close-up arrival. Tile availability and network performance can differ in exhibition deployments.

### Explicitly deferred to WP3/WP4

Full trip database integration and multi-trip preloading are not included in WP2. The existing eight demo points remain unchanged. Continuous one-hour exhibition playback, offline caching and MP4 export remain later work packages.

## WP3: Full chronological history + tile preflight

### Full history playback

The default /cinematic/ view now reads the existing repository-backed v9 trip and location snapshot, normalized through tripModel.js. This is **not a direct Supabase query**, and is not a mechanism for bypassing account row-level security. Trip editing and per-account live database sync remain outside this work package.

All valid trips are sorted chronologically. The lightweight manifest stores only stops, modes, dates, durations and offsets. The camera and route positions are compiled on demand using a **3-scene least-recently-used cache**. It prepares current, previous and next trips in idle periods.

Between trips, the view performs a 3.2-second globe-level camera repositioning with a continuous great-circle camera path. This does not invent a flight: route and airplane disappear during the inter-trip transition. The playback clock and timeline remain continuous.

All four recorded leg modes are preserved: plane, drive, boat and train, using existing GlobeHoppers v9 vehicle PNGs and the same route-anchored overlay. The camera director is independent from vehicle selection.

### Dedicated-screen and test modes

- /cinematic/ : full historical playlist (178-trips snapshot when authored).
- /cinematic/?demo=1 : original isolated 8-stop validation fixture.
- /cinematic/?map=earth : rich-color natural Earth preset.
- /cinematic/?capture=1 : UI-free rendering at a deterministic timestamp.

The player exposes window.__CINEMATIC_GLOBEHOPPERS__.getPlaylistDetails() for bounded-cache, timeline and imagery-preflight diagnostics.

### Tile pop-in reduction

The independent imageryPreflight module computes a bounded, small neighborhood of exact future tile URLs around each destination. It uses the browser HTTP cache to request up to 27 tiles from NASA/EOX sources at z5/z7/z8, limited to four concurrent requests per destination and three destination records. It never bulk downloads entire map datasets.

The preflight starts during the previous hold or on travel departure. If the destination request is still in flight at the start of the close approach, the shared playback clock pauses for the preflight or a four-and-a-half-second budget before continuing. User seeking cancels automatic resume. This is a controlled-quality tradeoff: it avoids zooming straight into wholly unrequested imagery but cannot guarantee that **every** tile covering a tilted 1440p/4K viewport is already cached. Tile providers can rate-limit or fail; playback continues rather than freezing indefinitely.

Provider caching is HTTP/browser-dependent. On a full-time dedicated display, we should test observed tile hits and memory pressure and consider a permitted local tile cache before claiming no visible tile pop-in.

### Tests and release boundaries

- npm run test:cinematic includes history-index, chronological ordering, continuous bridge, bounded scene cache, mode preservation and imagery-preflight tests.
- The Chromium smoke workflow keeps the 8-stop deterministic visual tests via ?demo=1, then opens full history to check the 178-trip playlist, random seeking and bounded cache.
- Production GlobeHoppers v9 remains unchanged; all changes stay on the Cinematic development branch.

WP4 unattended exhibition and looping, live authenticated trip snapshots and WP5 MP4 export remain separate work.
