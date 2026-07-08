# GlobeHoppers v3.37

Hopper polish, validation popup, mixed colors, and culling strategy update:
- No-hopper Hop Preview uses an unfilled neutral icon instead of cyan
- Restored compact Edit Hoppers layout with one-line Hopper/Squad rows, color-circle pickers, and Delete buttons
- Hop Squad unselected members are gray, unfilled, and diagonally striped
- Add/Edit Hop required-field errors now use a themed GlobeHoppers popup instead of browser alerts
- Guest Hopper add interface uses a popup with Name, color-circle picker, Delete/Cancel, and OK
- Mixed no-squad groups use the first selected Hopper as the primary route/vessel color while rows/previews can show gradients/accent colors
- Long dates wrap inside timeline/editor date cells
- Playback placard culling now uses a geographic far-side gate based on angular distance plus lon/lat delta to avoid hiding nearby front-facing labels while hard-hiding far-side labels
- package intentionally omits src/data/trips.json, src/data/hoppers.json, and package-lock.json
