# JourneyLines routing notes

Driving routes are generated privately during GitHub Actions using the `VITE_MAPBOX_TOKEN` repository secret. The browser does not publish or require the token. Generated driving route geometry is stored in `src/data/generatedRoutes.json` during the build.

Boat and train routes currently use manual route overrides in `src/data/routeOverrides.json`.

v2.24 focuses on playback performance: completed routes become static map data and are rebuilt only when the completed timeline changes, while the active leg remains dynamic.
