# GlobeHoppers v7.3.1 QA Record

## Release focus

This patch repairs regressions introduced around the v7.3 interaction layer while preserving the v7.1.4 playback-performance recovery.

## Corrected behavior

- Timeline pins retain dedicated vertical headroom and remain individual at the current history size.
- Paused map drag, wheel zoom, rotation, and pitch immediately take camera ownership and stop residual cinematic easing.
- The legacy MapLibre arrival-pulse layer is inert; the destination-anchored DOM ripple is the only pulse owner and is hidden outside arrival settle.
- Car, train, and boat vehicles travel on the exact same presentation route used by the active trail.
- Route stacking is calculated from the complete route before revealing an immutable prefix, preventing already-laid trail segments from moving.
- Cars use a tighter route tangent and faster heading response.
- Travel-mode placards use the camera subpoint for horizon culling and no longer override MapLibre globe occlusion opacity.
- Valhalla fetch calls preserve the browser Window/global receiver, fixing `Illegal invocation` failures.
- A non-cyan Hop never flashes the blue source vessel while its recolored PNG is being prepared.
- Destination-choice cards use the same segmented Hopper border and marker coloring as queue cards.

## Automated coverage

The v7.3.1 verifier checks:

- immutable trail-prefix geometry, including date-line interpolation;
- receiver-sensitive Valhalla fetch execution;
- timeline pin headroom and clustering threshold;
- paused camera ownership;
- pulse lifecycle ownership;
- exact surface-route/trail ownership;
- close car-heading behavior;
- camera-subpoint horizon culling;
- first-frame vessel color behavior;
- destination queue palette propagation;
- QA placement and production build output.

## Manual production smoke tests

1. Pause during a trip, then drag, rotate, and wheel-zoom the globe for at least ten seconds. The camera must not snap back until Resume is selected.
2. Run a boat and a car route with route stacking both enabled and disabled. The vehicle center must stay on its active line, and trail segments behind it must remain fixed.
3. Start a red or pink plane/car route after a cyan route. No blue vessel frame may appear.
4. View a pitched long-distance flight. Placards beyond the globe horizon must remain hidden throughout playback.
5. Run San Diego to Chicago routing. Valhalla may segment or fail over, but it must not report `Illegal invocation`.
6. Verify all timeline pins are visible at Fit, then zoom and pan the timeline.
7. Verify the cyan arrival ripple is absent during departure/cruise and appears only at the destination settle.
