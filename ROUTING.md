Base: GlobeHoppers v5.0.1
Update: v5.0.2 vessel route shaping refinement
Changes:
- Car routes now add a subtle road-like squiggle after Natural Earth road guidance so they feel more like roads and less like smooth arcs.
- Car/train Natural Earth routing now rejects excessive detours and falls back to shorter vessel-specific generated routes when the network guidance wanders too far.
- Train routes now prioritize shorter rail-like routes, avoiding large inland detours when a simpler route is more believable.
- Boat routes now evaluate more route candidates, apply stronger land-intersection penalties, and try farther offshore bends when needed.
- Boat curves now use smoother Catmull-Rom sampling instead of angular line segments.
- General surface/boat fallback curves are smoother and more flow-like.
