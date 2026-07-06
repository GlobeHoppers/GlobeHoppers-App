# JourneyLines Routing Notes — v2.9

## Driving

Driving routes use Mapbox Directions when a `VITE_MAPBOX_TOKEN` repository secret is injected at build time. The app requests `mapbox/driving` routes with GeoJSON geometry and caches successful routes in browser localStorage using cache version `v2.9`.

If a drive leg still looks straight or uses a rough manual route, open the browser console and look for:

- `JourneyLines: fetching ... Mapbox driving route(s)`
- `JourneyLines: Mapbox route cached ...`
- `JourneyLines Mapbox route fetch failed ...`
- `JourneyLines: Mapbox driving routes disabled ...`

Common causes:

1. The `VITE_MAPBOX_TOKEN` GitHub Actions secret was not present during the build.
2. The Mapbox token URL restriction does not include `https://jonathanjoelneptune.github.io`.
3. The token lacks access for Directions API requests.
4. Browser localStorage has older cached fallback data. v2.9 uses a new cache version to avoid most stale-route issues.

## Boat and Train

Boat and train routes still use manual route overrides in `src/data/routeOverrides.json`. This is intentional until a stronger marine/rail routing source is selected. Cruise-style routes are represented by curated waypoints.
