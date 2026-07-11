Base: GlobeHoppers v5.0.2
Update: v5.0.3 boat land avoidance fix
Changes:
- Replaced coarse Natural Earth land bounding boxes with simplified Natural Earth land polygons for boat land checks.
- Boat routes now evaluate actual land polygon intersection instead of broad continent rectangles.
- Boat routes no longer use nearest-coast midpoint guidance, which could pull a route toward mainland land.
- Boat routing now prefers simple offshore curves and only bends farther when needed.
- Car/train/boat no longer reuse routeDetails/generated cached geometry unless there is a manual route override.
- This prevents bad cached vessel paths from being replayed after a routing bug is fixed.
