# GlobeHoppers v7.5.3 Interaction Model

## Camera authority

During active playback, the playback frame controller is the sole camera authority. Manual gestures temporarily override writes. Reacquisition uses a staged safe zoom/orient/zoom sequence, then atomically returns authority to the current live route camera. Idle, overview, and relocation callbacks must exit without applying camera state while playback owns the camera.

## Overlay authority

Search and destination-selection results are mutually exclusive. Opening either closes the other before rendering its result surface.

## Timeline geometry

Horizontal zoom changes content width only. The rail background remains fixed-height. Pins, active pills, dates, and month labels may visually extend beyond the rail without changing layout height. Fit resets horizontal scroll and includes edge padding.
