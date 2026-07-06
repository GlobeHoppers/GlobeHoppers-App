# JourneyLines v1.3.0 — Globe Camera + Icon Polish

## Update summary
This version continues the globe-first direction and focuses on the Mult.dev-style motion feel.

## Changes
- Removes the oversized transparent glow/bubble that appeared over the globe.
- Replaces the atmosphere overlay with a subtle rim-only glow.
- Keeps the airplane icon background-free with no circular badge.
- Airplane rotates to follow the route direction.
- Car, boat, and train stay upright instead of rotating with the path.
- Adds takeoff/cruise/landing motion easing so the vehicle rolls off the origin, cruises, and eases into arrival.
- Adds more dynamic globe camera behavior in follow mode:
  - closer at departure
  - eases out during cruise
  - closer at arrival
  - uses a look-ahead focus point so the globe pans ahead of the vehicle
- Keeps the working gh-pages deployment workflow.
- Keeps package-lock.json out of the repo so GitHub Actions uses the public npm registry.

## Known limitation
This version emulates the Mult.dev camera behavior using D3 orthographic globe rendering. It does not yet use satellite/terrain map tiles, so it cannot fully match Mult.dev's textured terrain flyover look without adding a tile/imagery source or moving to a globe engine such as Cesium or MapLibre/Mapbox.
