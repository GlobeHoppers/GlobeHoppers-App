# JourneyLines v2.4 — Glide Playback + Arrival Polish

## Changes
- Visited city dots now persist instead of disappearing after each leg.
- Fixed flashing visited-point behavior by centralizing visited point updates.
- Slowed camera smoothing so playback glides instead of snapping.
- Added a 2.2 second settle period after each arrival before departure.
- Vehicle icons grow from size zero on departure and shrink to size zero on arrival.
- Added landing ripple/puddle pulse at the destination.
- Added red home-base move legs from old home to new home.
- Added first-pass waypoint paths for drive/boat/train segments so they follow more realistic road/water corridors where known.
- Kept north-up cinematic glide.
- Kept gh-pages deployment workflow and no package-lock.json.

## Note
Actual turn-by-turn roadway/boat routing will require a routing provider or adding more manual route waypoint data. v2.4 includes an initial offline/manual waypoint approach for known routes.
