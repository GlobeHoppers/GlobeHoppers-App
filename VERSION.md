# JourneyLines v2.9 — Persistent Pins + Driving Route Diagnostics

Date: 2026-07-06

## Changes

- Restored persistent colored visited pins on the globe.
- Visited pins now keep their own traveler color instead of recoloring when a different traveler trip becomes active.
- Destination pin now drops in as a simple dot when the vehicle arrives, then remains visible as a persistent map-anchored pin/label.
- Previous route legs remain visible with stronger glow.
- Added an active airplane air-arc overlay so the live flight trail feels less flat against the terrain.
- Plane route trail endpoint is offset farther behind the aircraft to better align with the tail.
- Mapbox driving route fetching now runs in parallel and logs cache/fetch status to the browser console.
- Mapbox route cache version bumped to v2.9 so old fallback routes do not mask newly fetched Directions routes.
- Keeps GitHub secret token support via `VITE_MAPBOX_TOKEN`.
- Keeps working `gh-pages` deployment workflow.
- Keeps `package-lock.json` out of the repo.
