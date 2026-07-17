# GlobeHoppers v7.5.14 Release Notes

- Added URL-driven Screensaver Mode through `?screensaver=1`.
- Screensaver Mode automatically starts the timeline on page load.
- At timeline completion, the application enters spinning Globe View for ten minutes with both routes and locations visible.
- After the Globe View hold, the timeline restarts from the first Hop and repeats indefinitely.
- Normal idle mode is isolated from Screensaver Mode to prevent competing state and camera ownership.
- Existing v7.5.13 playback, camera, timeline, route, and result-card behavior is preserved.
