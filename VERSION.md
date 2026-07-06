# JourneyLines v2.23 — Playback Performance + Route Direction Fix

- Removed colored glow from vessel icons and location placards.
- Timeline scrubbing and trip drawer jumps now autoplay immediately.
- Playback state updates are capped around 30fps to reduce MapLibre/React churn on wall displays.
- Active route geometry sampling is lighter to reduce per-frame `setData` work.
- Plane routes now unwrap across the antimeridian so California-to-Tokyo goes west across the Pacific instead of east around the globe.
- Distance calculations now normalize longitude delta to the shortest path.
