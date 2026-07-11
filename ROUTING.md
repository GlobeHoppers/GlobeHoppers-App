Base: GlobeHoppers v5.1.4
Update: v5.1.5 water-only boat trail enforcement
Changes:
- Boat visible route geometry now docks at water-side approach points when a city pin is on land.
- City points are still used for trip labels/cards, but the rendered boat trail no longer draws an inland connector through land.
- Added global water-only enforcement pass across boat route segments.
- If a boat segment crosses land/island/canal no-cross geometry, the route tries a local water dogleg repair.
- Known canal crossings remain allowed only through deliberate approach/departure nodes.
