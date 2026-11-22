# Cinematic GlobeHoppers — WP1

An independently authored, open-source cinematic camera prototype built on top of the GlobeHoppers v9 playback foundations. The main app and editor remain unchanged.

## Architecture and scope

- Separate Vite/React entry at /cinematic/; deploys alongside the main site on GitHub Pages after merging.
- The original WP1 fixture uses eight demo locations from GlobeHoppers' existing locations catalog: San Diego, Los Angeles, Las Vegas, Miami, New York, Augusta, New Orleans and Chicago. These are not the user's private trip base.
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

WP4 unattended exhibition and looping is implemented below. Live authenticated trip snapshots remain intentionally excluded. WP5 MP4 export is separate work.


## WP4: Unattended Exhibition Mode

### Start the dedicated display

- /cinematic/?exhibition=1&map=earth : auto-start the full chronological trip snapshot on map-ready, hiding control chrome until a person moves the cursor, touches the screen, or presses a key.
- /cinematic/?exhibition=1&map=earth&reset=1 : ignore the saved checkpoint and start at the first trip.
- /cinematic/?demo=1&exhibition=1&map=earth&reset=1 : eight-stop exhibition fixture for testing.
- /cinematic/ : regular interactive player; no automatic playback or looping.
- ?capture=1 : deterministic, UI-free capture; explicitly disables exhibition autoplay even if exhibition=1 is also present.

The exhibition shows the map, scene labels, vehicle, arrival treatment, and a subtle three-pixel progress rail. Top controls, playback panel, and footer remain hidden by default. Moving the cursor, touching the screen, or using the keyboard reveals them. After 6.5 seconds of inactivity, they hide again. Space toggles play/pause when focus is not on an input or button.

The on-screen Fullscreen button works only following a user gesture, as browsers require. Where supported, that same gesture requests a screen wake lock and reacquires it when the fullscreen page returns to the foreground. Configure your operating system, display and Chromium kiosk session not to sleep; a web page cannot override OS-level power policies or automatic browser tab suspension.

### Loop architecture

The full history retains WP3's trip-sized playback planner and three-scene LRU. WP4 appends a 3.6-second closing globe camera transition from the end of the last trip back to the first frame. The closing frame is numerically equal to the opening camera pose, so a new pass does not create a geographic jump. There is no extra vehicle or fabricated travel leg during this closing transition.

The existing v9 PlaybackEngine handles completion. Its generation-guarded completion callback resets to zero, increments a loop counter, and starts playing again. There is no second animation owner or duplicate React clock.

### Unattended recovery

- Every 12 seconds, the exhibition writes a bounded progress checkpoint to browser local storage; a same-browser reload resumes at the saved location if the snapshot duration and trip count match, and the checkpoint is less than seven days old.
- On a hidden tab, the player pauses without jumping ahead by wall-clock time. It resumes on visibility only if it had previously been playing and the user has not explicitly paused.
- A lost WebGL context, failed initial map, or stalled rendering for more than 22 seconds initiates a MapLibre rebuild from the exact playback time. Retry delays increase from 1.4 seconds and cap at 30 seconds. The playback clock pauses during recovery and resumes only when it should.
- A restored network connection clears destination tile preflight results and recreates the WebGL map so missing tiles can be requested again. Offline status appears unobtrusively.
- The MapLibre tile cache has a bounded size (maxTileCacheSize: 80), while WP3's route geometry remains limited to three trip scenes. No full-world tile downloading or background exporter runs.

For diagnostics, window.__CINEMATIC_GLOBEHOPPERS__.getExhibitionDetails() reports looping and renderer generation. requestRendererRecovery() tests the controlled renderer rebuild. These hooks are local to this independent viewer and don't send data to Mult.dev.

### Validation and limitations

The Node test suite checks wrap-camera continuity, full-history closure, bounded scene cache, inactivity hiding, recovery backoff and visibility-resume policy. The Chromium smoke suite tests automatic start, control reveal, manual pause, loop completion, renderer recovery, idle hide, checkpoint resume, and capture isolation.

CI smoke tests exercise accelerated loop boundaries, not a literal hour of runtime. A dedicated-display soak test (several full cycles) is still required before claiming uninterrupted 24/7 operation. Tile sources still require Internet access; this implementation is resilient to short outages but does not ship a licensed offline global satellite dataset. The snapshot is versioned and deployed with the repository; Supabase is not used.

WP5 MP4 export remains deferred.


## WP4.1: Regional camera, reviewed surface routes and zoom-out imagery

The WP4 cinematic viewer now favors local/regional views over repeated deep-orbital pullbacks. Flight cruise zoom has a floor of 3.85, the intro/outro stays near zoom 4.25–4.35, and inter-trip transitions use a maximum pullback of zoom 4.25. The arrival lens uses pitch 54°, while the vehicle-follow camera uses pitch 58–61° and zoom 8.35–9.0. The camera remains north-oriented within ±45°.

The v9 canonical routeDetails.json contains approved, reviewed road/water/rail geometry but was not previously supplied to Cinematic GlobeHoppers. A deterministic build script now extracts *only* these surface geometries, simplifies them with the existing v9 surface presentation rules, and writes public/data/cinematic/surface-routes.json. The client loads this lightweight read-only derived artifact **before** building the first full-history scene. This is important: synthetic endpoint-to-endpoint car and boat tracks are replaced with real v9 routes. If the asset fails to load, the viewer retains the previous endpoint fallback and records zero reviewed surface legs in diagnostics; it never invents an unreviewed road route.

The vehicle continues to travel on exactly the same sampled route as its luminous trail, while the camera looks a short distance ahead along the path and follows each bend. No routing requests are made at playback time. Flight geometry remains the same curved geodesic approach. All modes use the same deterministic single-clock playback.

The imagery warmup previously fetched only zoom 7–8 destination tiles, which offered little protection against zoom-out pop-in. It now prioritizes NASA Blue Marble zoom 4, regional satellite zoom 6, destination satellite zoom 8 and one zoom 9 center tile; the preflight remains capped at 28 URLs and four concurrent requests per destination. The next trip's starting area is warmed during the current outro and during inter-trip bridges. At wide zooms, the always-present lower-resolution Earth raster remains visible underneath the detailed tiles.

Validation now includes full-history reviewed surface coverage, road/boat/train camera and route tracking, zoom floors, regional tile warmup, the full-history browser run, existing v9 playback tests, and production build of the derived geometry asset. It does **not** guarantee every map tile is resident in every network/GPU environment; an unattended-display multi-cycle soak test is still required.


## WP4.2: Camera continuity and fully preloaded Local Earth

The dedicated-display default is now ?exhibition=1&map=local. The local basemap uses a self-contained MapLibre style with no OpenFreeMap, EOX, NASA tile-service or remote glyph dependency. A NASA Blue Marble Next Generation global JPEG is fetched only during the deployment build and copied into the application's /data/cinematic/earth-blue-marble.jpg. On startup, the browser reprojects that one first-party image into a complete 341-tile z0–z4 Web Mercator image pyramid held in memory. A custom MapLibre protocol serves the prepared tile bytes with no subsequent imagery requests. Playback starts after the complete source is prepared. Local Earth uses a continuous soft zoom ceiling of about 6.73, preventing huge city-level enlargements of the finite-resolution global image.

The original detailed styles are still available at ?map=earth, ?map=satellite, ?map=hybrid and ?map=midnight. Switching between Local Earth and remote styles performs one controlled renderer rebuild while preserving playback timestamp and playing state. Switching among remote styles remains in-place. In normal standalone viewing, Local Earth is the default unless the user has saved another style. Exhibition mode always defaults to Local Earth unless the URL explicitly selects something else.

Surface-camera continuity: the polyline stores a cumulative-mileage lookup, so vehicle motion and active route reveal use distance-normalized sampling instead of vertex-index interpolation. For roads and boats, the camera director builds a 121-knot, time-indexed spatially smoothed spline, with an actual-distance bounded look-ahead rather than a percentage of the full route. Camera knots use clamped cubic Hermite interpolation to avoid discontinuities at turns. Vehicles remain attached to their exact reviewed route geometry, rather than moving along the slightly smoothed camera path.

Build and attribution: npm run dev and npm run build execute scripts/build-cinematic-local-earth.mjs. The script uses a cached image when available, otherwise tries NASA's July Blue Marble topography composite, NASA's January composite, and an attributed NASA mirror in that order. Invalid or missing JPEGs fail the build. A provenance file records source URL, length and SHA-256. The texture is a lightweight global source; no offline copy of commercial or detailed Sentinel-2 imagery is included. Image credit: NASA Earth Observatory, Blue Marble: Next Generation.

Validation covers local tile count, geographic reprojection, offline preflight, soft-zoom continuity and distance-normalized camera motion. Browser tests verify local startup, no external imagery requests, and style switching without restarting the timeline. An actual dedicated-display soak test is still required to characterize long-running memory and GPU behavior.

Local Earth also projects the visible trip-stop names as small DOM labels using the same camera frame as the vehicles. This preserves map-anchored names without requesting any remote font PBF glyphs. Its MapLibre raster tile cache is set above the 341-tile local pyramid size so previously rendered regions need not be repeatedly evicted.

The surface-leg director also extends long car, boat and train segments to roughly 9–18.5 seconds according to route distance. The user-approved exhibition runtime is not capped at one hour; giving the smooth camera spline enough screen time prevents hundreds of miles being traversed in a few seconds. Plane pacing remains unchanged.


## WP4.3: North-up, accurate reviewed routes, accumulated trip history and sharper Earth

The cinematic camera now defaults to a **25° maximum absolute heading from north** in every scene and inter-trip bridge. Actual vehicle bearings remain unrestricted.

The previous surface geometry build ran v9's aggressively stylized presentation simplifier on already-reviewed provider geometry and then invoked the same simplifier again during scene compilation. This introduced broad off-road chords on detailed drives such as the Melbourne–Key West Overseas Highway. The build now uses a coordinate-preserving, bounded Douglas–Peucker simplification for v9 reviewed provider routes, retaining up to 680 road, 360 rail or 180 marine anchors. The cinematic scene consumes those authoritative source coordinates directly; it no longer simplifies them again. The moving vehicle, active route, and stored historical route use exactly the same road/water line. A v9 marine route with only three points remains a coarse reviewed water-route approximation, not fabricated precise ship navigation; its review confidence may be lower than a provider-backed road route.

**All completed trips persist:** the full-history planner builds a small static archive of completed routes and unique destination positions, independently of its bounded three-scene playback LRU. The map displays subdued historical route lines and destination dots beneath the current highlighted trip. History updates only on trip boundaries or when seeking. Future trip lines and destinations remain hidden; rewinding appropriately removes future history. The archive includes routes from previous trips even when the current trip's MapLibre layers are cleared for an inter-trip transition. The local globe also shows small labels for past destinations at regional zooms while limiting overlap.

**Sharper self-contained globe:** The build now prefers NASA's official 21,600 × 10,800 July Blue Marble global JPEG (approximately 19 MiB) with the previous 5,400 × 2,700 NASA source retained solely as a fallback. The browser downscales this to an 8,192 × 4,096 working bitmap and builds the complete z0–z5 local pyramid (1,365 images) before starting the clock. It keeps that pyramid cached across all playback, avoiding live satellite and vector-map tile requests, with a correspondingly conservative camera zoom ceiling. The tradeoff is a longer initial load and additional CPU/memory use; do not describe this as equivalent to city-level satellite maps. Use the satellite presets when high-detail street-level terrain is the priority.

Regression tests specifically cover the Key West road geometry, history accumulation and backward seeking, north limit, and local tile count. Production v9 is untouched.


## WP4.4: Scenic Earth, selectively detailed globe

- **Scenic Earth** is the new default. Keep the full 8K NASA atlas
  locally preloaded while selectively requesting regional EOX Sentinel-2
  satellite tiles at native zooms 5–8 only when the camera needs them.
  The NASA globe stays beneath unavailable tiles and shows through until
  the new tiles fade in. Provider credit and CC BY 4.0 attribution remain.
- Strict **Local Earth** (`?map=local`) remains the zero-remote-tile
  offline-ready exhibition mode. Use `?map=scenic` to explicitly request
  the hybrid quality mode; this mode needs Internet for regional detail.
- Scenic detail uses zoom hysteresis and 620 ms fades. Its destination
  warmup is bounded to 10 EOX tile URLs rather than the 28 of full remote
  styles. A failed or late remote tile never pauses the cinematic clock.
- Scenic's higher, smoothly limited zoom restores regional camera
  movement suppressed by the strict offline atlas ceiling. Preset changes
  preserve playback timestamp and playing state across renderer rebuilds.
- Full-history soak testing, remote imagery throughput and visual acceptance
  remain requirements before production promotion.


### WP4.4: Continuous camera and ground/water vehicle motion

- Cars, boats and trains now grow from 49% to full visual scale during the
  first 16% of travel and shrink again near arrival. A subtle bounded
  perspective tilt reinforces motion. World coordinates stay exactly on the
  reviewed route, just as aircraft do; sprites vanish at arrival.
- Camera track uses distance-bounded anticipation and monotone cubic Hermite
  tangent interpolation. It avoids the old clamped-knot velocity flattening
  without smoothing the actual road or water path used by the vehicle.
- Travel camera adds a small route-relative side-dolly, a single end-tapered
  bearing sweep (still within ±25° of north), and mild zoom/pitch depth.
  Endpoint dolly, sweep and lens offsets are all exactly zero, so adjacent
  holds and trips remain connected without hidden camera cuts.
- Between-trip globe bridges now use one continuous zoom envelope instead of
  two easing halves that stopped at the midpoint. All motion is deterministic
  from the existing playback timestamp; no extra animation loop.


### Compact Scenic atlas (resource budget)

- Scenic Earth now rasterizes only **341 planetary z0–z4 tiles** (4K working
  image) rather than the full **1,365 z0–z5 tiles** of strict Local Earth.
  This reduces Scenic's first-load atlas work and resident image memory while
  keeping the globe complete under the selective regional imagery overlay.
- `?map=local` still generates all 1,365 tiles at 8K for fully offline
  quality. Switching from Scenic to Local reuses z0–z4 and builds only the
  missing z5 level. Switching back cannot discard already cached detail.
- The WebGL map tile-cache limit is 520 for Scenic and 1500 for Local;
  no remote tile pyramid is downloaded at build time. Browser regression
  checks both mode-specific budgets and the zoom-triggered regional source.


## WP4.5: Flight-paced surface travel and shared home-base visits

- Drive, boat and train legs now use the *airplane's presentation pacing*
  with modest mode-specific duration factors. Long surface corridors also
  pull the camera back slightly to prevent high apparent pixel velocities.
  All routes remain the reviewed provider geometry; travel miles unchanged.
- Chronological trip indexing detects a shared preceding arrival and next
  departure within 0.5 miles, or with the same city name within 12 miles.
  It retains both real trips, their independent route legs and historical
  bookkeeping, but compresses presentation-only adjacent scene holds to zero,
  keeps the close-up lens and uses a 380 ms camera-angle handoff rather than
  a 3.6-second far-zoom bridge. The final trip does not get a fictional
  shared endpoint.
- Stop chips for the following trip omit its redundant opening home-base stop.
  The scene still contains its actual opening point for route calculation.
  All timing and camera poses remain deterministic under seeking/reverse seeking.
- Unrelated consecutive trip endpoints preserve the full geographic bridge.
