# GlobeHoppers v7.5.1 QA

## Scope

Corrective playback and interaction pass for the v7.5 release: staged outside-globe camera reacquisition, surface-vessel stability, cinematic road/marine presentation, slower active-to-passive trail conversion, exact View Globe zoom, visible month labels, single-shell destination/search cards, full-height result rails, reliable white-marker selection, stronger zoom-responsive text, wrapped-air-arc suppression, editor typography/highlighting, and stronger airplane pitch.

## Automated verification

Run from `journeylines/`:

```bash
npm run verify:v7.5.1
```

The verifier preserves all 149 Hops, 316 legs, and 316 saved route geometries; checks the staged camera-return invariant; confirms camera and surface-heading performance controls; verifies road/rail/boat presentation endpoints and route budgets; validates the result-card, timeline-month, marker-hit-target, search-color, and editor changes; and runs a clean production build.

## Required manual regression checks

1. Start playback, drag/rotate/tilt/zoom away, and release. Confirm playback remains smooth, the camera first reaches a safe outside-globe zoom, rotates to the vessel framing, and only then zooms inward. Confirm there is no travel through the globe.
2. Repeat camera reacquisition on a large monitor and during a long flight. Confirm the glide does not stutter or chase a moving target in visible steps. Start a new gesture during any stage and confirm it cancels immediately.
3. Play several car and boat Hops while the camera pans. Confirm vehicle heading follows the route tangent instead of reacting to screen movement, with no frame-to-frame spinning or flipping.
4. Review long road Hops. Confirm the route remains recognizable but arrival/departure turns are broad and gentle rather than reproducing every provider micro-turn.
5. Review coastal boat Hops. Confirm boats remain offshore on broad arcs, do not trace every inlet, and still preserve exact trip endpoints.
6. Complete a Hop with Trails enabled. Confirm the just-finished active trail changes to its passive profile over roughly 1.8 seconds rather than snapping.
7. Select View Globe from a close travel view. Confirm the transition completes at Zoom 4.20, pitch 0, bearing 0, then spin resumes.
8. Zoom the timeline in until approximately three years or less are visible. Confirm month labels appear in a dedicated row, thin appropriately at broader ranges, and show every month near one year.
9. Open a destination with many matching Hops. Confirm each result has one outer segmented pill only, one left Hopper circle, no inner pill, and the text uses the remaining width.
10. Confirm the destination list extends to the bottom of the screen and its scrolling region stops immediately above the timeline controls.
11. Click directly on the white destination circle, the city name, and surrounding placard area. Confirm all three invoke the same destination action. Verify Enter/Space works when the placard is keyboard-focused.
12. Compare city labels at global, regional, and close zoom. Confirm a clearly visible increase at close zoom without excessive size or repeated layout flicker.
13. Play Seoul/Tokyo and other International Date Line-adjacent flights. Confirm no long horizontal decorative air-arc artifact appears.
14. Open Add/Edit Hop. Confirm Additional Legs has the same framed emphasis as Route, and Route, Destination, Hoppers, Mode of Transportation, Hop Type, Additional Legs, and Notes use consistent heading typography.
15. Search for Hops. Confirm entered text and caret are white and search results use the same corrected single-shell card component.
16. Play airplane Hops. Confirm takeoff pitch-up and final-approach dive are substantially more visible while the airplane remains readable through arrival.
17. Recheck far-side culling, disconnected-trip relocation, continuous leg handoff, timeline seeking, idle mode, destination cancellation, Add/Edit saving, and repository status for regressions.

## Build result

Acceptance requires `npm run verify:v7.5.1` and `npm run build` to succeed. The existing Vite large-chunk advisory remains non-blocking.
