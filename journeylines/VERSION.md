# GlobeHoppers v3.29

Placard culling correction:
- Playback culling now focuses strictly on globe rim/backside transition, not local camera focus
- Local/front-facing placards remain visible even when not near the current camera center
- Playback front-face threshold tightened to avoid dim ghost placards on the rim
- Marker opacity is forced binary so placards are fully visible or fully hidden
- Covered/occluded marker opacity is forced to zero where supported by MapLibre
- package intentionally omits src/data/trips.json and package-lock.json
