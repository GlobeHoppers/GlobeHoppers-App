# JourneyLines Routing Notes

## Cars
Driving routes are generated at build time using the repository secret `VITE_MAPBOX_TOKEN` and Mapbox Directions. The token is not published to GitHub Pages. Generated route geometry is bundled into `src/data/generatedRoutes.json`.

## Boats
Boat routes currently use curated manual overrides in `src/data/routeOverrides.json`. v2.28 improves Carnival-style Caribbean cruise routing so routes from the Port Canaveral/Melbourne area to Nassau, Grand Cayman, and Jamaica stay offshore and do not cut through Florida or Cuba. Longer-term, this can be replaced or supplemented with a cruise/ferry routing database.

## Trains
Train routes currently use curated manual rail waypoint overrides. Future work can add imported GPX/KML/GeoJSON route geometry or a server-side rail/transit routing provider.
