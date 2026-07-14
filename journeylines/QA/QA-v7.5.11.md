# GlobeHoppers v7.5.11 QA Checklist

## Automated
- Run `npm run verify:v7.5.11`.
- Run `npm run verify:v7.5.10` for timeline/camera regression coverage.
- Run `npm run build` with temporary validation `trips.json` and `hoppers.json`, then remove those files before packaging.

## Manual regression targets
- Confirm every fitted and zoomed timeline pin has a white outline.
- Confirm the active pin enlarges above the rail and its pill remains aligned.
- Confirm search and Choose-a-Hop panels animate out for selection, outside click, Escape, and competing-overlay activation.
- Confirm a long car route uses deliberate straights and gentle curves without delayed heading corrections.
- Confirm San Diego to Vancouver and its reverse remain offshore except at port/channel approaches.
- Confirm a disconnected-trip relocation completes its final zoom and playback continues without a camera cut.
- Confirm `trips.json` and `hoppers.json` are absent from release ZIPs.
