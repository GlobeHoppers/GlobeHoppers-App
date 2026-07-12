# GlobeHoppers v7.1 QA

## Release scope

- Remove mandatory approval for car, train, and boat routes.
- Use Valhalla/OpenStreetMap as the primary live driving router.
- Retain Mapbox and local routing as ordered fallbacks.
- Keep route diagnostics optional and compact.
- Preserve route caching, saved-route precedence, worker recovery, and managed data exclusions.

## Required verification

- Valhalla request payload uses `auto` costing and ordered origin/destination coordinates.
- Precision-six route geometry decoding reproduces coordinates within tolerance.
- Sequential endpoint failover uses the next configured server after transport or HTTP failure.
- Invalid or empty Valhalla responses are rejected before caching.
- Source order is current v7.1 cache, Valhalla, Mapbox live, Mapbox build cache, local worker.
- TravelMap has no parallel Mapbox-only route fetch path.
- Add/Edit Hop contains no route approval control or approval save gate.
- A valid automatic route can be saved with warnings.
- Missing endpoints and failed geometry still block save.
- Runtime configuration merges defaults with existing deployment overrides.
- QA files remain under `journeylines/QA/`.
- Production Vite build passes.

## Updated-files deployment cleanup

When applying the v7.1 updated-files archive over v7.0, delete the obsolete hashed assets listed in the release response. The complete repository archive already contains the correct clean `dist` folder.
