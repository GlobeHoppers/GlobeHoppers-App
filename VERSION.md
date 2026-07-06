# JourneyLines v2.16 — Build-Time Mapbox Route Cache

This version keeps the Mapbox token private inside GitHub Actions and no longer publishes it to GitHub Pages.

## Key changes

- Uses the `VITE_MAPBOX_TOKEN` repository secret only inside the GitHub Actions workflow.
- Generates `src/data/generatedRoutes.json` during the workflow using Mapbox Directions.
- Publishes only route geometry, not the token.
- Keeps `/runtime-config.js` intentionally token-free to avoid GitHub push protection.
- Removes Vite/browser-side token exposure from the production build.
- Bumps route cache version to `v2.16`.

## Expected deploy behavior

The GitHub Action should print safe checks showing the token prefix and length, generate driving routes, verify no `pk.` token exists in `dist`, and then publish to `gh-pages` without push-protection failures.
