# GlobeHoppers v7.4.0 QA

## Scope

Direct map interaction, timeline scale animation, destination-choice presentation, surface-vessel route fidelity, live trail attachment, disconnected-trip relocation, playback horizon culling, and Add Hop workflow restructuring.

## Required regression checks

1. A single pointer hold can continuously drag/rotate the globe in Hero, View Globe, and paused playback.
2. Wheel and trackpad zoom use normal interactive-map sensitivity and do not snap back.
3. Hero and View Globe begin slow spin immediately; direct input suspends spin and later auto-levels/resumes.
4. Timeline Zoom In, Zoom Out, Fit, and Recenter animate around the current focus.
5. Destination-choice cards use Timeline-row styling; no matching timeline pills open.
6. Surface vessels remain centered on route geometry and turn in the direction of actual screen movement.
7. The active trail terminates visually at the vessel center while completed trail vertices remain immutable.
8. Disconnected trips zoom out, glide at overview altitude, then zoom in without a center cut.
9. Far-side labels fade and cull before the visible horizon during playback.
10. Add Hop shows Month before Year, optional Exact Hop Dates, editable Start Location without an override switch, route fields before Hopper/mode fields, and destination-derived automatic titles.
11. Manual titles remain unchanged until Use Automatic Title is selected.
12. Production build succeeds and managed data files are excluded from release ZIPs.
