# GlobeHoppers v7.5.5 QA

## Automated/build verification
- Production Vite build completed successfully.
- Confirmed package version is 7.5.5.
- Confirmed mutable `trips.json` and `hoppers.json` are excluded from release packages.

## Targeted regression checks
- Follow camera no longer blends from endpoint-close zoom back to a lower cruise zoom.
- Manual reacquisition continues to rotate before final zoom.
- Timeline years are horizontal, visible, and unmasked.
- Month labels are emitted only for months containing a Hop and align to the associated pin.
- Timeline rail remains fixed height with no visible scrollbar.
- Search and destination cards use the shared 75/25 layout.
- Hopper names use Hopper colors.
- Globe menu order is Globe View, Routes only, Locations only.
- Empty month selection contributes an empty string to automatic titles; `Choose month` is never part of a generated title.
