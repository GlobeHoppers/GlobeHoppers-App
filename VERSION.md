# JourneyLines v2.35 — Home Base Layering + Distance Culling

- Home-base return arrivals no longer re-trigger the pin drop animation.
- Home-base placards now layer above nearby regular destination placards.
- Home-base placards use a black fill with a gray border/tail treatment.
- Added a hard distance-based placard culling guard in addition to horizon culling.
- This should prevent Alaska, Seoul, Tokyo, and other far-side placards from showing while focused on Europe or another distant local region.
