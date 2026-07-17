# GlobeHoppers v7.5.14 Screensaver Mode

## Canonical URL

Use `?screensaver=1` on the normal GlobeHoppers URL. The current deployment is:

`https://jonathanjoelneptune.github.io/JourneyLines/?screensaver=1`

The aliases `?mode=screensaver`, `#screensaver`, and `#playmode` are also recognized.

## Cycle

1. The hero is suppressed and the timeline begins automatically at the first Hop.
2. Normal playback, relocation, routing, camera, and vessel behavior are unchanged.
3. After the final leg settles, playback enters Globe View.
4. Globe View always displays both routes and locations and resumes automatic globe spin.
5. After ten minutes, the timeline resets to the first Hop and begins again.
6. The timeline and globe phases repeat indefinitely while the screensaver URL remains loaded.

## Isolation

- The standard 30-second idle controller is disabled while Screensaver Mode is active so it cannot compete with the cycle controller.
- The cycle closes transient destination/search/editor surfaces before restarting.
- Screensaver Mode uses the existing playback and Globe View controllers rather than maintaining a second camera or animation engine.
- If a visible screensaver timeline is unexpectedly paused, it resumes automatically. Tab visibility handling remains unchanged.

## Optional QA override

`globeMinutes` can shorten the Globe View hold for testing, for example `?screensaver=1&globeMinutes=0.1`. Production behavior defaults to ten minutes.
