# GlobeHoppers v7.5.14 QA Checklist

## URL activation

- [ ] Open `?screensaver=1` and verify the hero does not remain visible.
- [ ] Verify playback launches at the first Hop without a user click.
- [ ] Verify normal URLs still open in the standard interactive state.
- [ ] Verify `?mode=screensaver` and `#screensaver` aliases activate the same mode.

## Timeline phase

- [ ] Verify every Hop and leg plays in chronological order.
- [ ] Verify disconnected-trip relocation, camera tracking, vessels, trails, and arrival settling match standard playback.
- [ ] Verify transient search, destination, and editor surfaces do not remain open across a cycle restart.
- [ ] Verify an unexpected pause while the tab is visible resumes automatically.

## Globe phase

- [ ] Verify completion of the final leg enters Globe View once.
- [ ] Verify both routes and locations are visible.
- [ ] Verify globe spin is active.
- [ ] Verify the normal 30-second idle controller does not interrupt or replace the screensaver phase.
- [ ] Use `&globeMinutes=0.1` for a six-second QA hold and verify the timeline restarts at the first Hop.

## Endless cycle

- [ ] Observe at least two full timeline-to-globe-to-timeline transitions.
- [ ] Verify timers are not duplicated and the Globe View hold is restarted only once per completed timeline.
- [ ] Reload without the screensaver parameter and verify the loop is disabled.
