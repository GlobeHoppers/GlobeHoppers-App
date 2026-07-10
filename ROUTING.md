Base: GlobeHoppers v4.30
Update: v4.31.2 safe city suggestions
Changes:
- Rebuilt from v4.30 to avoid carrying the broken v4.31/v4.31.1 runtime path.
- City database lives in public/data/cities15000.json and is lazy-fetched after AdminPanel mounts.
- Add/Edit Hop opens even if city database fetch fails or has not loaded yet.
- Saved locations remain available immediately.
- Destination, override start location, and additional leg destination use saved + city suggestions.
- City suggestions become real locations only when a hop is saved.
