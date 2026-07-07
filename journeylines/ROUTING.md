# JourneyLines Routing Notes

Driving routes are generated privately during GitHub Actions from the `VITE_MAPBOX_TOKEN` repository secret and saved as route geometry. The token is not published to GitHub Pages.

Boat/train routes still use manual route overrides for now.

v2.33 focuses on home-base placard behavior, vessel icon scale/readability, and stricter globe-side placard culling.


## v2.34 notes

This version does not change route generation. It updates vessel icon styling and relaxes front-facing placard culling while preserving hard backside globe clipping.


## v2.35 notes
- Home-base placards are layered above nearby destination placards and use gray borders.
- Placard culling now combines horizon visibility with a distance-from-focus guard to hide far-side labels that remain projectable on the globe.
