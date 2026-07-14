# GlobeHoppers v7.5.12 QA Checklist

## Automated
- Run `npm run verify:v7.5.12`.
- Run `npm run verify:v7.5.11` to protect the stable camera, car, boat, and timeline behavior.
- Run `npm run build`.

## Search and destination cards
- Search for a plane-only Hop and confirm a Plane badge is shown.
- Search for a mixed-mode Hop and confirm each distinct transportation mode appears in leg order.
- Confirm repeated transport modes do not create redundant badges.
- Select a destination with multiple Hops and confirm the same badges appear in Choose-a-Hop cards.
- Search for `plane`, `car`, `train`, and `boat` and confirm applicable Hops are returned.

## Active timeline pin
- Start playback and confirm the active stem is twice the inactive stem length.
- Confirm the active pin head rises above the normal pin row without moving the timeline rail.
- Confirm the active Hop pill remains attached directly above the active pin.
- Hover a non-active pin and confirm its prior hover geometry is unchanged.
- Check first and last Hops for viewport clipping.

## Globe display filters
- Open Globe View and choose Routes only; confirm location markers and names are hidden.
- Resume playback; confirm both routes and locations immediately return.
- Open Globe View and choose Locations only; confirm routes are hidden.
- Select a Timeline pin or search result to start playback; confirm both routes and locations return.
- Confirm Hero and idle views show both routes and locations.
