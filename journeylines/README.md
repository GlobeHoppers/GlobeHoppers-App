# JourneyLines

JourneyLines is a public-facing GitHub Pages travel-history playback app. It opens on a completed route web, then plays the travel history from the beginning with animated routes, city reveals, traveler colors, projection toggles, camera modes, and a hidden admin editor.

## Current v1 features

- React + Vite static site
- Fullscreen travel-history playback
- Completed route web opening state
- Equal Earth and Gall-Peters projections
- Global, Route, Follow, and Continent camera modes
- Traveler filters: All, Joey only, Bonnie only, Trips together only
- Traveler route colors: Joey orange, Bonnie pink, together cyan
- Plane, car, boat, and train route modes
- Persistent trails with route styling by mode
- City dots reveal as trips occur
- Home bases with active date ranges
- Move/home-base events are represented in `homeBases.json` and can be elevated later into custom timeline cards
- Hidden admin mode: click the JourneyLines title 5 times
- Admin can add, edit, delete trips
- Download updated `trips.json`
- Optional GitHub fine-grained token commit flow for `src/data/trips.json`

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Create a new GitHub repo.
2. Upload/push this project.
3. In `vite.config.js`, set `base` if using a project page. Example: `base: '/journeylines/'`.
4. Run:

```bash
npm install
npm run build
npm run deploy
```

Or configure GitHub Actions to build and publish `dist`.

## Data files

- `src/data/trips.json`: trip archive
- `src/data/locations.json`: city/location coordinates
- `src/data/homeBases.json`: home-base date ranges
- `src/data/travelers.json`: traveler colors
- `src/data/settings.json`: default app settings

## Admin mode

Click the `JourneyLines` title 5 times to open Admin Mode.

### Option A: download JSON

Use the admin panel to add/edit/delete trips, then click **Download trips.json**. Replace `src/data/trips.json` in the repo and commit.

### Option B: GitHub token commit

Use a fine-grained GitHub token scoped only to this repo with Contents read/write access. Enter it in Admin Mode along with `owner/repo`. The token is stored only in this browser's local storage and can be cleared from the admin panel.

## Notes

The initial location coordinates are practical starter values for animation and can be refined. Broad places such as Bahamas, Alaska, Scotland, Swiss Alps, and Dominican Republic are mapped to representative travel points while preserving the public display name.
