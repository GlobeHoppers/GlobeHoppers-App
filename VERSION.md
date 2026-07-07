# JourneyLines v2.34 — Black Vessel Stroke + Relaxed Visible Placards

- Changed imported vessel icon outline/drop treatment from white to black.
- Relaxed placard culling for front-facing locations so nearby regional placards remain visible.
- Removed the local focus cutoff from persistent placard visibility; placards now hide only when offscreen or behind the globe horizon.
- Kept MapLibre `occludedOpacity: 0` and hard hidden state for true backside globe culling.
