# GlobeHoppers v7.5.10 Interaction Architecture

## Playback camera ownership

Active playback remains the only camera writer after a Hop begins. A real pointer, touch, or wheel gesture temporarily releases camera follow. Programmatic MapLibre move, zoom, rotate, and pitch events are never treated as manual gestures.

Each manual interaction receives one gesture sequence. Only the matching completed sequence can start camera reacquisition. The return controller uses frame-rate-independent exponential damping, follows the current live vessel target, preserves a safe outside-globe zoom until orientation is nearly restored, and hands control back without starting another animation.

## Timeline layout

The bottom timeline uses the isolated `gh-timeline-v7510` component namespace. Timeline zoom changes only the horizontal content width. Pin dimensions, rail height, month position, and year position are fixed.

The scroll viewport owns only the base rail. The active or hovered pin and its location pill are rendered in a non-clipping overlay and anchored to the actual on-screen bounding rectangle of the corresponding base pin. This avoids conversion between data, scroll-content, and page coordinate systems.
