GlobeHoppers v6.0 — Worker-First Routing and Smooth Playback

Base: GlobeHoppers v5.2

Major changes:
- Natural Earth routing data is no longer statically imported into the main JavaScript bundle.
- Detailed routing data is fetched and parsed in a Web Worker during browser idle time or when Add/Edit Hop opens.
- Saved routeDetails geometry is used before any route is recalculated.
- New and changed car/train/boat routes are calculated in the background and stored in a routing-version-aware IndexedDB cache.
- Repository saves wait in the existing background queue for new/changed vessel route geometry, while the Add/Edit Hop window still closes immediately.
- The active playback clock now uses one singleton requestAnimationFrame engine based on performance.now().
- Vessel, camera, and active trail rendering are driven imperatively from that playback clock.
- React timeline/progress state is throttled and is no longer updated every animation frame.
- Worker-generated playback plans include equal-distance positions, headings, camera points, cumulative distance, and route LOD geometry.
- Camera movement uses custom smoothing and a safe-screen constraint to keep the vessel visible.
- Active trail reveal is adaptively throttled based on measured frame time.
- Completed route geometry uses overview, regional, and detail levels based on map zoom.
- Current and upcoming trips are routed and prepared ahead of playback.
- AdminPanel is lazy-loaded.
- React and MapLibre are split into cacheable vendor chunks.
- Routing readiness, queue, active job, completed jobs, routing version, and data version appear in the ... menu.

Build status:
- npm run build: PASS
- Main app chunk: approximately 289 kB raw / 98 kB gzip
- Initial JavaScript total excluding lazy AdminPanel: approximately 1.53 MB raw / 438 kB gzip
- v5.2 main bundle comparison: approximately 4.51 MB raw / 1.47 MB gzip
- Approximate reduction versus v5.2: 66% raw / 70% gzip
