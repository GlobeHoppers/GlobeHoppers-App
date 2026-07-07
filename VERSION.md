# JourneyLines v2.32 — Black Home Moves + Hard Horizon Clipping

- Home-base move routes now render black instead of red.
- Persistent placards now use a stricter single culling path and MapLibre marker `occludedOpacity: 0` to prevent dim-then-bright flicker at the globe horizon.
- Placards are now either fully visible or fully hidden, with no edge dimming transition.
- Keeps v2.31 home-return visit logic, longer lingering, slower pacing, segmented visits, and Mapbox build-time route cache.
