# JourneyLines v2.33 — Home Base Black Placards + Vessel Scale + Clipping Fix

- Initial Melbourne home-base placard is seeded at timeline start and styled black.
- Established home bases stay on the map after they become inception points.
- Current/established home-base placards use black dot/border styling while visit ticks retain traveler-color history.
- Home-base returns still do not add visit ticks.
- Vessel PNG icons are about 50% larger and now have a subtle outer stroke/drop shadow for readability.
- Horizon/backside placard clipping is stricter, with a hard hidden state rather than dimming.
- Added CSS-level culling protection so MapLibre marker occlusion cannot leave dim labels visible on the back side.
