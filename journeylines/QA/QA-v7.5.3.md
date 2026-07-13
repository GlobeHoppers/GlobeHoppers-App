# GlobeHoppers v7.5.3 QA

Released: July 13, 2026

## Principal engineering stabilization scope

- Consolidated active-playback camera ownership so disconnected-leg relocation, idle state, globe overview, and manual camera reacquisition cannot seed a stale continent-level zoom after playback resumes.
- Manual camera reacquisition preserves the safe outside-globe sequence and finishes on the continuously updated live playback target.
- Increased route-follow zoom floors and retained vessel-centered camera constraints.
- Restored timeline fit behavior, fixed-height presentation, visible date/month rails, and overflow for active pins and tooltip pills.
- Added Spacebar Play/Pause behavior outside editable controls.
- Made destination selection and timeline search mutually exclusive overlays.
- Refined the shared Choose-a-Hop/search card grid and removed clipping from dynamically scaled location labels.
- Broadened open-water boat presentation geometry while retaining provider endpoints and constrained-route safeguards.
- Suppressed wrapped decorative aircraft arcs using raw antimeridian crossing detection and made far-side culling more conservative.
- Promoted Additional Legs to a primary section heading and moved Add Leg into the section action row.

## Verification

- `npm run verify:v7.5.3`
- `npm run build`
- ZIP integrity checks for complete and updated-files packages
- Mutable travel-data files excluded from release packages
