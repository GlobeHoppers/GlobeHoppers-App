Base: GlobeHoppers v5.1.4
Update: v5.1.6 stable water-side boat routing rollback
Changes:
- Rolled back the v5.1.5 post-route dogleg repair behavior that caused scribble/starburst boat routes.
- Kept water-side destination/dock logic.
- Boat trails now stop at water-side approach/dock points when the city pin is on land, instead of drawing inland connectors.
- Kept Caribbean island no-cross boxes and the Panama/Gibraltar/Suez corridor concepts.
- Water graph edges are rejected before routing when they cross land, island no-cross boxes, or bad canal crossing angles.
- After a valid water route is chosen, only light simplification is applied.
- Added minimum segment length and maximum backtracking/turn cleanup to prevent sharp scribbles without inventing new doglegs.
