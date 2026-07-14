# GlobeHoppers v7.5.11 Interaction Notes

## Timeline pins
- Every timeline pin has a high-contrast white outline.
- The active pin is rendered in the timeline overlay, enlarged, and animated upward without changing rail geometry.

## Result panels
- Timeline search and destination result panels remain mounted for their closing animation before state is cleared.
- Selecting a result, clicking outside, pressing Escape, or opening the competing results surface uses the same exit path.

## Surface travel
- Car icons follow the precomputed presentation-route tangent directly. Route geometry, rather than delayed heading filters, removes small road-provider deflections.
- Boat routes use the Natural Earth water network when only endpoint fallback geometry exists, preserve water-safe anchors, and maintain a 15-mile open-water clearance where practical. Port and channel approaches are allowed to tighten.

## Relocation camera
- A disconnected-leg relocation hands the live rendered camera to playback. The first route frame eases from that camera instead of replacing it with a newly calculated starting camera.
