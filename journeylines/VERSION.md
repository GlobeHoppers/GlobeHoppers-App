# GlobeHoppers v3.36

Hop preview and Hopper color propagation fixes:
- Hop Preview now resolves Hopper IDs to display names from live Hopper data
- Hop Preview now displays exact Hop Squad names, such as Small Council, instead of raw IDs
- Hop Preview accent color now uses the exact Hopper / Hop Squad color
- Hop Preview route rows now show the resolved Hopper / Hop Squad name
- Edit GlobeHopper Timeline rows continue to receive live Hopper data for current colors
- Culling changed from an aggressive front-face cutoff to a wider 72/88 degree buffer
- Placards in the buffer preserve their previous state instead of toggling, reducing rim flashing while keeping front-facing labels visible
- package intentionally omits src/data/trips.json, src/data/hoppers.json, and package-lock.json
