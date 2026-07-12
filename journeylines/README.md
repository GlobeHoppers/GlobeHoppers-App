# GlobeHoppers

**All your hops, skips & jumps.**

GlobeHoppers is a living travel-history map that replays trips across a cinematic globe, with alternate flat projections, traveler-specific colors, custom vehicle icons, route trails, and editable trip data stored in the repository.

## v7.1: Automatic Surface Routing

Car, train, and boat Hops are now checked automatically. Users no longer need to approve a generated route before saving.

- Driving routes use Valhalla with OpenStreetMap data first.
- Mapbox Directions is a secondary fallback when a valid public token is configured.
- Stored Mapbox build geometry and the local Natural Earth road graph are later fallbacks.
- Train routes continue to use the local Natural Earth rail graph.
- Boat routes continue to use navigable-water routing with land-crossing validation.
- Route warnings and geometry remain available under an optional details disclosure.
- Saving is interrupted only when a surface route cannot be generated safely or its endpoints are incomplete.

Runtime provider settings live in `public/runtime-config.js`; the same defaults are documented in `src/data/routingSettings.json`.

## Quality assurance

Release QA records are stored under `journeylines/QA/` rather than at the repository root.
