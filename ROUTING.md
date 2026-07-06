# JourneyLines Routing Plan

JourneyLines currently includes a manual/offline waypoint fallback for known drive, boat, and train legs. To support true turn-by-turn paths, we need to connect route providers.

## What is needed

### Driving
Recommended options:
- Mapbox Directions API
- OpenRouteService Directions API
- self-hosted OSRM

Needed from you:
- Choose the provider.
- Provide a browser-safe public token if using Mapbox/OpenRouteService, restricted to your GitHub Pages domain.

### Boats
Boat routing is not the same as driving directions. It needs marine/nav routing data. Practical options:
- Keep curated manual waypoints for cruises/boat legs.
- Use a commercial marine-routing API if you find one you like.

Needed from you:
- Decide whether boat paths should be manually curated or API-backed.
- For cruises, provide itinerary ports when known.

### Trains
Rail routing requires either scheduled transit data or curated rail paths. Practical options:
- Manual waypoint routes for known train segments.
- OpenTripPlanner/GTFS-based solution for specific regions.

Needed from you:
- Confirm whether train routes can use curated waypoint paths.
- Provide preferred station/city-level routing for known train trips if exact rail alignment matters.

## Recommended next step
For v2.6, add a `routeOverrides.json` editor/import workflow so car/boat/train paths can be corrected directly in the app while we evaluate provider options.
