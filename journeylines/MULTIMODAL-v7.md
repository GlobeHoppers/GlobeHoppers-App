# GlobeHoppers v7 Multimodal Routing

## Purpose

GlobeHoppers treats car, train, and boat travel as first-class routing modes. Beginning with v7.1, surface routes are calculated and validated automatically. Users do not approve routes before saving; GlobeHoppers interrupts Save only when endpoints are incomplete or no safe geometry can be generated.

## Route selection hierarchy

### Car

1. Manual or already-saved detailed geometry handled by the routeDetails layer.
2. Current v7.1 memory or IndexedDB route cache.
3. Valhalla routing using OpenStreetMap road data.
4. Mapbox Directions when a public runtime token is configured.
5. Existing generated Mapbox build-cache geometry.
6. Natural Earth road graph and clearly labeled local corridor fallback.

### Train

1. Saved detailed geometry.
2. Current v7.1 route cache.
3. Natural Earth rail graph in the routing worker.
4. A clearly labeled rail-corridor fallback when the source network does not connect sufficiently near the endpoints.

Use saved station or depot locations for the best station-to-station result. This is geographic route visualization, not timetable or service-availability data.

### Boat

1. Saved detailed geometry.
2. Current v7.1 route cache.
3. Explicit known water corridors.
4. A* routing through the dense water graph.
5. Water-grid repair/fallback routing.

A boat route is rejected when it crosses mapped land or collapses to a stationary path. Only explicitly permitted canal-center edges may cross simplified Natural Earth land polygons.

## Automatic route check

The Add/Edit Hop dialog exposes a compact Automatic Route Check for surface legs. Calculation runs after input settles for ordinary Hops and during Save for large multi-leg Hops. The optional details disclosure includes:

- route source and provider
- route and direct distance
- provider duration or a mode-based estimate
- confidence
- geometry preview
- endpoint/network attachment warnings
- land/water and plausibility errors

Changing a mode, origin, destination, or intermediate stop invalidates the old route signature. GlobeHoppers recalculates automatically before Save. Warnings do not require approval and do not block Save; validation errors do.

## Persistence and recovery

Successful routes are retained in memory and IndexedDB. On repository save, current geometry and diagnostics are written into `routeDetails.json`. Cache failures are non-blocking; the current geometry remains available in memory.

The local worker has initialization/request timeouts, generation-based stale-worker protection, crash/message-error recovery, and a manual retry action. Valhalla requests have ordered endpoint failover, bounded timeouts, response and geometry validation, and a temporary circuit breaker after provider failure so large Hops continue quickly through fallback routing.

## Known data limitations

Valhalla quality depends on the OpenStreetMap data and endpoint coordinates available to the configured provider. Natural Earth provides broad geographic roads and railways rather than street-level or timetable-level detail. Lower-confidence fallbacks are labeled and produce warnings when endpoint attachment, route stretch, or land/water checks indicate approximation. Add intermediate legs or use more precise station, port, or road-access locations to shape difficult routes.
