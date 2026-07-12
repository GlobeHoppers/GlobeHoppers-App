# GlobeHoppers v6.1 Data Migration

## Existing trips

No manual migration is required before deployment.

At runtime, older trips are converted deterministically into the v6.1 route model:

- Every route point receives a stable `pointId`.
- Every leg receives a stable `legId`.
- Simple trips and multi-leg trips use the same explicit ordered `route` representation.
- Existing trip IDs remain unchanged.

Because `trips.json` is intentionally excluded from this update package, deploying v6.1 does not replace your current travel history. The next successful Add/Edit/Delete repository save writes the current timeline back in the normalized v6.1 format.

## Existing routeDetails

v6.1 reads both:

- new keys: `<tripId>::<legId>`
- legacy keys: `<tripId>::leg-<index>`

Legacy geometry is applied only when its origin, destination, mode, and coordinates still match. The next successful repository save rewrites routeDetails using stable leg IDs.

## Cache behavior

New route cache keys include:

- routing version
- leg ID
- origin ID and coordinates
- destination ID and coordinates
- transportation mode

Old cache records are ignored when coordinates or routing identity change.

## Custom locations

Arbitrary text is no longer converted into a placeholder at latitude 0, longitude 0.

A destination must be one of:

- a saved location
- a selected city suggestion
- a custom destination with a name and valid latitude/longitude

## Auto-play behavior

- New Hop: auto-plays after required detailed route geometry is ready.
- Route or date edit: auto-plays after required geometry is ready.
- Notes, title, Hopper, or other metadata-only edit: saves without moving the timeline.
