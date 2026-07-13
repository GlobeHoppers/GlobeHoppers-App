# GlobeHoppers v7.3.0 QA Record

## Scope

Camera, vessel, routing, timeline-density, Globe mode, destination-selection, idle-mode, and Batch Add polish on top of v7.2.0.

## Required behavior

- Plane, car, train, and boat sprites align with the actual rendered playback-plan tangent.
- Display routes retain exact origin and destination coordinates after simplification.
- Arrival pulses remain fixed at destination coordinates and never follow the vessel.
- Vessels remain readable until the final few percent of travel.
- Far-side city placards are hidden using the visible globe hemisphere, including pitched views.
- Long Valhalla drives recover from error 154 by routing bounded sections and stitching the returned geometry.
- Arrival settle rapidly centers on the destination, then holds with only negligible drift.
- Disconnected trips use slow zoom-out, overview reposition, and zoom-in stages.
- Long-flight framing changes release gradually rather than abruptly.
- GlobeHopper Timeline and Add Hop use distinct lazy-load request IDs.
- Top navigation order is Add Hop, Hoppers, GlobeHopper Timeline.
- Batch actions are grouped as Update Current Hop/Done with Hop, Add Another Hop, and Save Hop Batch.
- Timeline Fit/Zoom/Recenter and drag/wheel navigation preserve individual pin hit targets.
- Destination selection supports one-trip direct launch, multi-trip queue/pin choice, and exact cancel restoration.
- Hero/View Globe spin is slower, immediately yields to drag, auto-levels after interaction, and resumes later.
- Thirty seconds of paused/not-started inactivity enters idle globe mode without changing timeline progress.

## Automated gates

Run:

```bash
npm run verify:v7.3
```

The verifier checks utility behavior, static ownership rules, long-route segmentation, endpoint anchoring, vessel offsets, destination-choice state, idle state, timeline controls, Batch Add actions, QA placement, and a production Vite build.

## Manual production smoke tests

1. Fly diagonal routes in both directions and verify all four vessel sprites point along the visible trail.
2. Complete car, train, and boat legs and verify the line reaches the destination circle.
3. Focus Tokyo and verify North American placards do not appear through the rear hemisphere.
4. Stage a long San Diego-to-Chicago drive and verify segmented Valhalla routing is attempted before approximate fallback.
5. Pause for 30 seconds, then Resume and verify exact trip progress returns.
6. In View Globe, drag toward Antarctica, release, and verify slow upright leveling and spin resumption.
7. Select a destination with multiple Hops, cancel outside the queue, and verify exact prior state restoration.
8. Open GlobeHopper Timeline on the first click after reload and verify no Add Hop modal appears.
9. Exercise Fit, zoom, drag, wheel-pan, Recenter, and a dense cluster drill-down on the bottom timeline.
10. Verify Batch Add action order and Update Current Hop wording.
