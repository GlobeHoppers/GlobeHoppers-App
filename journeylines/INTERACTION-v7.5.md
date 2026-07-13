# GlobeHoppers v7.5 Interaction Model

## Playback camera ownership

Playback and direct manipulation are concurrent. The playback clock and vessel continue advancing while pointer, touch, wheel, keyboard, or double-click input temporarily owns the camera. Gesture start cancels any pending camera return. After the final input event, GlobeHoppers waits 500 milliseconds and then blends from the user’s current camera to the continuously updated cinematic vessel camera over 1.25 seconds. A new gesture cancels that blend immediately.

## Globe spin and auto-level

Hero, View Globe, and idle globe modes spin only when no user gesture, destination selection, relocation, intro transition, or explicit Pause Spin state owns the camera. Programmatic `easeTo` and `jumpTo` events do not masquerade as manual input. User rotation or pitch pauses spin, preserves the actual zoom, and later eases pitch and bearing back to upright while retaining longitude. User wheel zoom is retained. Auto-level does not normalize the camera to a hard-coded scale.

## Timeline scale and search

Timeline dates remain pin-derived. At an effective visible range of two years or less, month ticks are interpolated between dated Hop pins. Near two years the scale shows alternate months; at approximately one year or less it shows every month. Search begins after two normalized characters with a 120-millisecond debounce and matches title, origin/destination route, Hopper names, dates, mode, notes, and occasion. Destination queues and search use one shared result-card component.

## Location interaction and readability

The location placard is one interactive target: its white circle, city name, and enlarged transparent hit area all dispatch the same destination action. Label scale is calculated from both viewport dimensions and map zoom, with minimum and maximum clamps. Placement remains collision-aware and uses tighter marker-to-text offsets. Placards are faded and culled before the geometric horizon to avoid far-side bleed-through.

## Mode presentation

Distance and mode jointly determine cinematic duration. Air remains brisk; long car, train, and boat legs receive substantially more time. Marine presentation retains provider/source points but uses a lower point budget, wider safe chords, and fewer shoreline micro-turns. Aircraft keep readable scale through touchdown and use explicit takeoff and landing pitch windows.

## Add/Edit Hop structure

The primary editor sequence is Route, Hoppers, Mode of Transportation and Hop type, Additional legs, then Notes. Automatic titles use `New Trip <current year>` until a destination exists. With a destination and no selected month, the title is `Destination <year>`; selecting a month adds it to the generated title. Custom-title ownership remains unchanged until Use Automatic Title is selected.
