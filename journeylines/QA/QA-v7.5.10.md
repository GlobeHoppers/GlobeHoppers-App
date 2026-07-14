# GlobeHoppers v7.5.10 QA Checklist

## Camera regression checks

- [ ] Start playback and confirm the initial camera zoom does not trigger reacquisition or repeated acceleration/deceleration.
- [ ] During the first leg, drag the globe away, release it, and confirm one continuous return to the moving vessel.
- [ ] Confirm follow remains smooth for the remainder of that same leg.
- [ ] Repeat with wheel zoom, rotation, and pitch gestures.
- [ ] Confirm the vessel remains visible and continues moving during manual camera interaction and reacquisition.
- [ ] Jump to another timeline pin and confirm the camera transitions once without a start/stop cycle.

## Timeline regression checks

- [ ] At Fit, confirm the first and last pins are fully visible.
- [ ] Confirm the active pin is shown once and its pill is directly above the corresponding pin.
- [ ] Hover a pin near either edge and confirm its pill remains visible on screen.
- [ ] Zoom the timeline repeatedly and confirm pin sizes and all vertical positions remain unchanged.
- [ ] Confirm years stay in the same row and are not clipped at any timeline zoom.
- [ ] Confirm month labels appear only for months containing Hops and remain below their pins.
- [ ] Confirm timeline height does not increase while zooming.

## Build checks

- [ ] `npm ci --ignore-scripts --no-audit --no-fund`
- [ ] `npm run verify:v7.5.10`
- [ ] `npm run build`
- [ ] Confirm `trips.json` and `hoppers.json` are absent from release ZIPs.
