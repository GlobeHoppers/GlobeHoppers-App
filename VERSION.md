# JourneyLines v2.28 — Local Destination Zoom + Caribbean Boat Routing

- Adds a more aggressive destination push-in during arrival/settle so the camera frames a more local county/region area.
- Keeps the stable MapLibre marker-based placards and strict horizon clipping from v2.27.
- Updates Carnival-style Caribbean manual boat route overrides so Bahamas, Jamaica, and Cayman routes stay offshore and avoid cutting through Florida or Cuba.
- Adds a direct Port Canaveral/Melbourne-area to Grand Cayman override.
- Updates legacy fallback boat waypoints to the same offshore routing corridors.
- Keeps the private build-time Mapbox route cache architecture and no published token.
