# JourneyLines v2.15 — Direct Pin Drop + GitHub Secret Token Hardening

- Replaces the pin arrival animation with a direct single-phase drop.
- Removes bounce/overshoot/reposition behavior from the pin drop.
- Simplifies GitHub Actions token handling to read `secrets.VITE_MAPBOX_TOKEN` directly in each step.
- Workflow now fails if the token is missing or not a Mapbox public `pk.` token.
- `runtime-config.js` is written before build and directly into `dist/` after build.
- Route cache version bumped to v2.15.
- Keeps gh-pages branch deployment.
- No package-lock.json.
