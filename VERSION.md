# JourneyLines v2.27 — Stable Placards + Slower Cinematic Zoom

- Uses MapLibre markers for persistent placards to eliminate projection wobble.
- Keeps historical placards visible when genuinely on the visible globe face; removes focus-distance fading/capping.
- Applies stricter horizon clipping for placards hidden by the globe.
- Zooms all travel modes roughly 60% closer, with drive routes more localized.
- Slows all leg travel by 25% for wall-display/screensaver playback.
- Increases camera lead and smoothing so the camera glides ahead of the vessel rather than catching up.
