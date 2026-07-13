# GlobeHoppers v7.3 Interaction Model

## Camera ownership

GlobeHoppers uses one active camera owner at a time:

1. Timeline playback owns the vessel-follow camera.
2. Arrival settle owns a calm destination-centered hold.
3. Disconnected-trip relocation owns a slow zoom-out, overview reposition, and zoom-in sequence.
4. Hero, View Globe, and idle mode own the slow globe rotation.
5. Direct pointer interaction immediately suspends automatic rotation.
6. Destination selection suspends both playback and automatic rotation until the user selects a Hop or cancels.

A new owner cancels stale timers and camera transitions before moving the map.

## Globe rotation and leveling

Hero mode and View Globe begin rotating immediately at the configured slow speed. Pointer-down stops rotation before MapLibre processes the drag. After the user stops interacting, GlobeHoppers waits briefly, slowly levels pitch and bearing, limits extreme polar latitude while retaining longitude, and then resumes rotation.

Playback controls provide globe zoom, spin-speed, and pause/resume-spin actions.

## Destination selection

Visible destination markers can be selected in Hero mode, View Globe, and paused playback.

- One matching Hop starts immediately.
- Multiple matching Hops open a right-side choice queue and raise/open every matching timeline pin.
- Selecting a queue card or matching pin starts that Hop.
- Escape or a click outside the queue, matching pins, or selected marker restores the previous camera, timeline, card, and playback state.
- Far-side markers are horizon-culled and cannot be selected through the globe.

## Timeline navigation

The timeline retains individual Hop pins and adds horizontal time-scale navigation:

- Fit shows the complete history.
- Zoom In and Zoom Out change horizontal date spacing without shrinking pin hit targets.
- Recenter returns to the current Hop.
- Ctrl/Command + wheel zooms.
- Wheel or drag pans when zoomed.
- Only extreme-density Fit views use year/period clusters; selecting a cluster zooms in to individual pins.

## Idle mode

When playback is not advancing and there is no active editor, relocation, or destination choice, 30 seconds of inactivity enters idle mode. GlobeHoppers saves the playback and camera state, zooms to a globe view, and rotates slowly.

- Resume returns to the exact paused trip/progress and continues.
- Play from an unstarted timeline launches the first Hop.
- Completed timelines stay complete until Restart Journey is selected.
- Any direct interaction exits or postpones idle mode.
