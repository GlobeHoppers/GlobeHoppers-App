Base: GlobeHoppers v4.30
Update: v4.31 city suggestions database
Changes:
- Added src/data/cities15000.json generated from uploaded GeoNames cities15000.txt.
- Add/Edit Hop location fields now search saved locations first, then the city database.
- Destination, override start location, and additional leg destination all support city suggestions.
- City suggestions are converted into locations.json entries only when the hop is saved.
- Manual/custom typed location behavior remains available.
