# GlobeHoppers v7.5.6 QA

Release date: 2026-07-13

- Pinned every direct dependency to the exact version validated in v7.5.5.
- Rewrote all package-lock download URLs to the public npm registry.
- Changed deployment installation from `npm install` to deterministic `npm ci`.
- Added npm caching and a four-minute install timeout.
- Disabled lifecycle scripts during CI dependency installation.
- Confirmed the lockfile contains no environment-specific registry URLs.
- Confirmed a production Vite build succeeds using the locked dependency tree.
