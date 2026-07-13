# GlobeHoppers v7.5.1 Interaction and Playback Corrections

## Staged playback-camera reacquisition

Manual interaction continues to override only the camera while the playback clock and vehicle advance. After the input idle delay, the return is divided into explicit stages. A close manual view first zooms outward in place to a safe globe distance. The camera then changes center, bearing, and pitch while zoom is locked. Only after orientation is complete does it zoom inward. The desired cinematic camera is tracked independently from the rendered return camera, and screen-space vessel constraints are suspended during the staged return so the target cannot jitter.

## Stable surface-vessel motion

Cars, trains, and boats derive sprite heading exclusively from the projected route tangent. Camera movement is never interpreted as vehicle movement. Surface presentation geometry is prepared and cached once at leg start: provider geometry is reduced to bounded anchors and receives a gentle corner-softening pass. Cars broadly follow the road journey; boats use fewer anchors, broader safe chords, and stronger corner softening to avoid shoreline tracing.

## Trail conversion

When a trip completes, its just-finished active profile is first represented in the completed-route source. Eight low-frequency cached profile steps then convert it to the passive profile over approximately 1.8 seconds. This avoids both a one-frame snap and expensive per-frame full-history reconstruction.

## Globe, timeline, and result rails

View Globe owns the camera for the full transition and locks the final camera to Zoom 4.20 before spin resumes. Timeline zoom now extends deeply enough to expose month-level detail; a reserved month row prevents labels from being clipped by the horizontal scrollport. Destination and search results use one outer segmented card with no nested timeline pill, and destination results occupy the vertical space down to the timeline.

## Location interaction and typography

The white location circle, city text, and transparent placard hit area share pointer and keyboard behavior. Zoom-responsive map type is inherited from a root scale variable and updated only when the scale materially changes, reducing style churn. Search entry is explicitly white. Additional Legs receives the same framed section treatment as the route-entry area, and the major Add/Edit Hop labels share one typography system.
