# GlobeHoppers v6.0 Performance Notes

## Production build comparison

| Build output | v5.2 | v6.0 |
|---|---:|---:|
| Main/app JavaScript | 4,511 kB | 289 kB |
| Main/app gzip | 1,465 kB | 98 kB |
| Initial JavaScript total, excluding lazy Studio | 4,511 kB | ~1,527 kB |
| Initial gzip total, excluding lazy Studio | 1,465 kB | ~438 kB |
| Natural Earth in main bundle | Yes | No |
| Natural Earth loading | Main thread startup | Background worker |
| Studio/AdminPanel | Main bundle | Lazy 61 kB chunk |
| Routing worker | None | ~16 kB chunk |

The total initial JavaScript reduction is approximately 66% raw and 70% gzip. The Natural Earth database remains about 3.2 MB, but it is fetched and parsed off the main thread after initial rendering.

## Runtime strategy

- One active-playback clock
- No React state update on every display frame
- Direct DOM/MapLibre updates for moving elements
- Adaptive active-trail update frequency
- Zoom-based static route LOD
- Current/next route and playback-plan prefetch
- IndexedDB route cache
- Cacheable React and MapLibre vendor chunks
- Lazy-loaded Studio
