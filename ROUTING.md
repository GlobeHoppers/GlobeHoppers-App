# JourneyLines Routing — v2.16

JourneyLines now uses Mapbox Directions at build time only.

## Driving routes

1. `VITE_MAPBOX_TOKEN` is stored as a GitHub Actions repository secret.
2. The workflow runs `npm run generate:routes` before `npm run build`.
3. `scripts/generate-mapbox-routes.mjs` calls Mapbox Directions for every drive leg.
4. The output is written to `src/data/generatedRoutes.json`.
5. The deployed app reads that generated route geometry and does not need a browser token.

## Why runtime-config.js is empty

`runtime-config.js` intentionally contains no Mapbox token. GitHub push protection blocks publishing token-like values to `gh-pages`, even for public `pk.` Mapbox tokens.

## Boat and train routes

Boat and train routes still use `src/data/routeOverrides.json` manual route waypoints for now.
