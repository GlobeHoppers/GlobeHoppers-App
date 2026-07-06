# JourneyLines v2.24 — Globe Culling + Playback Performance

- Adds more aggressive horizon culling for labels, pins, vehicle, and active air arc.
- Keeps the custom HTML placard approach but throttles and caps label visibility at far/global zooms.
- Moves the trips drawer above all map placards and overlays.
- Prevents completed route history from being rebuilt on every animation frame.
- Updates visited pins/labels only when a new point is reached rather than every playback tick.
- Reduces completed airplane route sampling so inactive history is lighter.
- Throttles active route source updates while keeping the camera glide smooth.
- Keeps custom vessel icons and timeline/trip drawer navigation from v2.22/v2.23.
- Keeps private build-time Mapbox route cache architecture.
