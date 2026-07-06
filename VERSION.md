# JourneyLines v2.14 — Token Workflow + Stable Pin Drop Reapply

- Reverts drag-while-playing behavior from earlier versions by keeping playback camera ownership.
- Re-applies a stable stylized pin drop animation that animates the inner pin/nameplate only.
- Hardens GitHub Actions Mapbox token handling with support for either repository secret or repository variable named `VITE_MAPBOX_TOKEN`.
- Workflow now fails clearly if the Mapbox token is not available or does not start with `pk.`.
- Runtime config is written before build and directly into `dist/runtime-config.js` after build.
- Mapbox route cache fallback version bumped to v2.14.
- No `package-lock.json` is included.
