# GlobeHoppers v7.1 Valhalla Routing

## Purpose

Valhalla with OpenStreetMap data is the primary live driving router. GlobeHoppers requests a route only while preparing or recalculating a surface leg, validates the response, and caches successful geometry for later playback.

## Configuration

The deployed defaults are in `public/runtime-config.js`. Repository defaults are mirrored in `src/data/routingSettings.json`.

```js
window.JOURNEYLINES_CONFIG.valhalla = {
  enabled: true,
  endpoints: [
    'https://valhalla1.openstreetmap.de',
    'https://valhalla.openstreetmap.de'
  ],
  timeoutMs: 18000,
  clientId: 'GlobeHoppers',
  sendClientHeader: false
};
```

A different hosted or self-hosted Valhalla server can replace the endpoint without changing route consumers or stored geometry.

## Request and validation flow

1. Normalize the endpoint and submit a Valhalla `route` request using `costing: auto`.
2. Try configured endpoints sequentially.
3. Decode the returned precision-six polyline.
4. Reject unreadable payloads, missing geometry, invalid coordinates, implausible distances, or excessive endpoint snapping.
5. Cache valid geometry using the v7.1 routing version.
6. On provider failure, temporarily pause additional Valhalla calls and proceed through fallback routing.

## User experience

No route approval is required. The modal automatically calculates up to four surface legs after input settles and calculates larger Hops during Save. Optional route details show source, distance, duration, confidence, warnings, and geometry. Warnings do not block saving unless the route fails safety validation.

## Fallback order

Valhalla/OpenStreetMap → Mapbox Directions → stored Mapbox build cache → Natural Earth local approximation.

Manual route corrections and valid saved `routeDetails` geometry are preserved by the existing route-detail precedence rules.
