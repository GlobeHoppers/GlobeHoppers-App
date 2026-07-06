# JourneyLines v2.2.0 — MapLibre Cinematic Recovery + Terrain Texture

This version recovers the intended cinematic MapLibre playback behavior and adds a terrain/satellite-textured globe style.

## Key updates

- Uses Esri World Imagery as the textured terrain/satellite globe surface.
- Keeps CARTO label/reference tiles as a subtle overlay.
- Fixes the overly white/washed-out globe from v2.1.
- Moves vehicle icons and active city labels to a dedicated HTML overlay above MapLibre so they remain visible.
- Restores active origin and destination labels during playback.
- Restores cinematic camera control during playback with smoother `jumpTo` camera updates.
- Keeps mouse interaction disabled while playing so the playback camera owns the map.
- Adds stronger takeoff, cruise, and arrival camera choreography.
- Airplane rotates relative to the screen direction of flight.
- Car, boat, and train remain upright.
- Keeps `gh-pages` deployment workflow.
- Keeps `package-lock.json` out of the repo.

## Notes

This is still MapLibre raster terrain/satellite texture, not full 3D elevation terrain. True 3D terrain would be a later step using a terrain source/provider.
