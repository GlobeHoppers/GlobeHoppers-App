# GlobeHoppers v7.5.0 QA

## Scope

Playback camera freedom, View Globe spin recovery, zoom-preserving auto-level, close-range timeline months, Hop search, compact destination results, clickable location placards, dynamic map readability, mode-specific travel pacing, broader boat presentation routes, Add/Edit Hop ordering and titles, aircraft arrival/departure presentation, and stricter horizon culling.

## Automated verification

Run from `journeylines/`:

```bash
npm install
npm run verify:v7.5
```

The v7.5 verifier checks release metadata, managed data integrity, all 149 Hops and 316 legs, camera-return ownership, zoom-preserving auto-level, spin-state recovery, timeline search and months, shared result cards, editor order and titles, map-label scaling, vehicle timing, marine presentation geometry, production parsing, and a complete Vite build.

## Required manual regression checks

1. Start a Hop, drag/rotate/tilt/zoom the map during playback, and confirm the vessel continues moving. Release input and verify a short pause followed by a smooth glide to the vessel’s current position rather than its old position.
2. Interact again during the return glide and confirm the new gesture immediately cancels camera reacquisition.
3. Open View Globe and confirm the globe begins spinning. Tilt or rotate it, stop interacting, and verify it slowly returns upright without changing the selected longitude or current zoom.
4. Set the globe zoom near 4.20, tilt it, and confirm auto-level remains near 4.20 rather than dropping to approximately 0.65.
5. Use Timeline Zoom In until one to two years are visible. Confirm abbreviated month labels appear at plausible pin-derived positions, thin to every other month near two years, and disappear when zoomed back out.
6. Select a destination with multiple Hops. Confirm each card has one left Hopper circle, compact padding, full-width text, readable route wrapping, and no upper-right circle.
7. Click both the white location circle and its city text. Confirm either target opens the same destination queue, or directly starts the only matching Hop.
8. Verify city names sit closer to their markers and collision handling can still place a label above, below, left, or right.
9. Compare labels and playback controls at global, continental, regional, and close zoom. Confirm they grow gradually on large/close views without becoming oversized.
10. Compare long plane, car, train, and boat Hops. A cross-country plane should remain brisk, a car should be near 50 seconds at 1×, and train/boat playback should be progressively slower.
11. Review long boat routes near detailed coastlines. Confirm the vessel follows broad offshore arcs without tracing every cove, while endpoints and land avoidance remain intact.
12. Open Add Hop and Edit Hop. Confirm Additional legs appears below Hoppers, Mode of Transportation, and Hop type, and immediately above Notes.
13. Open a blank Add Hop in 2026 and confirm the title starts as `New Trip 2026`. Select a destination while Month remains `Choose month` and confirm `Destination 2026`; then select a month and confirm the month appears.
14. Play several airplane Hops. Confirm visible takeoff and landing pitch and that the airplane remains readable through final approach instead of shrinking away early.
15. Rotate and pitch the globe near the horizon. Confirm far-side locations fade and disappear earlier without flashing during auto-level.
16. Confirm the word `Timeline` is absent from the lower control bar. Select the magnifying glass immediately left of More, enter two characters, and verify responsive shared-card results. Test clear, outside click, Escape, and selecting a result.
17. Recheck connected and disconnected Hop transitions, timeline seeking, destination cancellation, idle mode, Add/Edit save, route playback, and repository-save status for regressions.

## Build result

The release is accepted only when `npm run verify:v7.5` and `npm run build` both complete successfully. The known Vite large-chunk advisory is non-blocking and does not represent a build failure.
