# GlobeHoppers v7.4 Interaction Model

## Camera ownership

Direct pointer, touch, wheel, keyboard, and double-click input immediately claims the paused camera. Cinematic motion is stopped once at gesture start; MapLibre drag/zoom lifecycle events only latch ownership and never stop the gesture. Auto-spin and auto-level may resume only after interaction completion and the configured idle delay.

## Surface playback

The vessel position is always the exact point on the presentation route. Heading follows actual projected screen movement with the route tangent as fallback. Smoothing applies to heading only. A lightweight connector bridges the intentionally throttled GeoJSON trail frontier to the display-rate vessel center.

## Add Hop title ownership

New Hops begin in automatic-title mode. Destination and additional-leg changes update `Destination + Destination Month Year`. Selecting Edit Title switches to custom mode; Use Automatic Title restores generated-title ownership.
