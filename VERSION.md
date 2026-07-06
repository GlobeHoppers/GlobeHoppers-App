# JourneyLines v1.2 — Dynamic Globe Polish

## Summary

This update builds on v1.1 and focuses on making the globe mode feel smoother, less glitchy, and more cinematic.

## Included updates

- Keeps the working `gh-pages` branch deployment workflow.
- Keeps the nested repo structure currently used in GitHub:
  - `.github/workflows/deploy.yml`
  - `journeylines/`
- Keeps `package-lock.json` out of the repo so installs use the public npm registry.
- Smooths globe camera motion so leg-to-leg transitions no longer snap hard between globe states.
- Adds dynamic globe zooming during playback:
  - zooms closer near departure and arrival
  - eases outward during cruise portions of longer legs
  - keeps route/follow mode feeling more like a guided travel animation
- Replaces emoji vehicle icons with clean inline SVG vehicle icons.
- Removes the dark circular icon background.
- Removes the visible circle around the aircraft/vehicle icon.
- Keeps plane, car, boat, and train modes with distinct icon shapes.
- Keeps globe as the default projection and Follow as the default camera mode.

## Upload instructions

Upload the contents of this folder to the root of the existing `JourneyLines` GitHub repo.

The repo root should look like this after upload:

```text
.github/workflows/deploy.yml
.gitignore
VERSION.md
journeylines/index.html
journeylines/package.json
journeylines/vite.config.js
journeylines/src/...
```

Do not upload a `package-lock.json` file for this version.
