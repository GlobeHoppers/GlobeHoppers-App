# GlobeHoppers v3.33

Add/Edit Hop recovery, active squad color, and placard culling:
- Simplified the Add/Edit Hop Hoppers selector to avoid the v3.31 black-screen regression
- Add/Edit Hop now safely falls back to Joey and Bonnie if Hopper data is missing while rendering
- In-flight active route color now uses current Hopper / Hop Squad data
- In-flight vessel icon color now uses current Hopper / Hop Squad data
- GitHub Hopper saves keep the v3.32 SHA refetch/retry behavior for back-to-back commits
- Playback placard culling now uses a stricter angular front-side gate instead of permissive rim visibility
- Rim/backside placards lock hidden longer before they are allowed to reappear
- package intentionally omits src/data/trips.json, src/data/hoppers.json, and package-lock.json
