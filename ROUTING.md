# JourneyLines Routing

Driving routes are generated privately during GitHub Actions using the repository secret `VITE_MAPBOX_TOKEN` and written into `src/data/generatedRoutes.json`. The token is not published. Boat and train routes currently use manual route overrides.
