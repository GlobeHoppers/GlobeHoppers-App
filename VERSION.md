# JourneyLines v2.21 — Vessel Icon Index Fix

This release reimplements the custom vessel icon selection logic so the new `src/Icons/...` folder is indexed correctly by Vite.

## Changes

- Fixes icon lookup mismatch from v2.20.
- Supports icon paths such as:
  - `src/Icons/Airplanes/Airplane - Cyan.png`
  - `src/Icons/Airplanes/Airplane - Orange.png`
  - `src/Icons/Airplanes/Airplane - Pink.png`
  - `src/Icons/Boats/Boat - Blue.png`
  - `src/Icons/Cars/Car - Blue.png`
  - `src/Icons/Trains/Train - Blue.png`
- Airplane icons follow route/traveler color when a matching file exists.
- Car/boat/train fall back to blue until matching colored variants are added.
- Generic `Vessel - Blue.png` fallback remains supported for future use.
- Keeps v2.19/v2.20 space, routing, and Mapbox private route-cache behavior.

## Upload note

This package does not include your large icon PNG files. Keep your existing `journeylines/src/Icons` folder in GitHub. Uploading this repo update should not delete those files unless they are manually removed.
