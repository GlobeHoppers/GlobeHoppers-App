# GlobeHoppers v7.5.15 QA Checklist

## Screensaver presentation

- [ ] Open `?screensaver=1` and verify the top navigation is absent.
- [ ] Verify Add Hop, Hoppers, GlobeHopper Timeline, Globe, Fullscreen, and Play buttons are not shown.
- [ ] Verify the GlobeHoppers brand, tagline, About text, and zoom diagnostic are not shown.
- [ ] Verify search, advanced, timeline zoom, Recenter, and Globe spin controls are not shown.
- [ ] Verify the current Hop and queued Hop cards remain visible in the upper-right corner.

## Timeline

- [ ] Verify the timeline extends from the left edge to the right edge of the viewport.
- [ ] Verify there are no side gaps, rounded outer corners, or translated low-opacity playback treatment.
- [ ] Verify timeline pins, active pin, active callout, month labels, year labels, and progress remain visible.
- [ ] Verify the full-width timeline remains correct on desktop and narrow/mobile layouts.

## Cycle regression

- [ ] Verify the timeline begins automatically.
- [ ] Verify normal route playback and queue-card updates continue.
- [ ] Verify timeline completion enters spinning Globe View for ten minutes.
- [ ] Verify Globe View still shows both routes and locations.
- [ ] Verify playback restarts at the first Hop and repeats indefinitely.
- [ ] Reload without the screensaver parameter and verify all standard controls return.
