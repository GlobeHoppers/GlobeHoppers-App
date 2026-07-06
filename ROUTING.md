# JourneyLines Routing Notes v2.14

Mapbox driving routes require a public Mapbox token named `VITE_MAPBOX_TOKEN` in GitHub.

Preferred setup:
1. Repository → Settings → Secrets and variables → Actions.
2. Add a repository secret named `VITE_MAPBOX_TOKEN` with your `pk.` Mapbox token.
3. As an optional fallback, add the same value as a repository variable named `VITE_MAPBOX_TOKEN`.
4. Upload the root `.github/workflows/deploy.yml` from this repo update. Uploading only the `journeylines/` folder will not fix token injection.

After deploy, open:

`https://jonathanjoelneptune.github.io/JourneyLines/runtime-config.js`

It should contain a `pk.` token and a `tokenSource` field. If it shows an empty token, the updated workflow was not used or the GitHub secret/variable is not available to Actions.
