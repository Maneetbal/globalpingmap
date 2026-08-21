# PingMap

Community-maintained public IP directory.

## Architecture

- `index.html`, `style.css`, `script.js` — GitHub Pages frontend.
- `data/countries/` — geographic hierarchy and per-city IP JSON files.
- `data/index.json` — generated static search index used by the frontend.
- `worker/index.js` — secure submission gateway used by the public frontend.
- `worker/wrangler.toml` — Cloudflare Worker configuration.
- `scripts/process-submission.mjs` — server-side validation, Globalping verification, and publishing.
- `scripts/build-index.mjs` — rebuilds the static search index.
- `.github/workflows/process-submission.yml` — processes submission jobs with GitHub Actions.
- `.github/workflows/deploy-worker.yml` — deploys the submission gateway.
- `.github/workflows/pages.yml` — deploys the site to GitHub Pages.

The frontend never contains a GitHub write token. The Worker holds the GitHub token as a Cloudflare secret and only creates the internal submission job; GitHub Actions performs the actual repository write using its protected workflow token.

## Submission flow

1. A visitor enters a public IPv4/IPv6 address.
2. The browser geolocates it for a preview.
3. The visitor clicks **Verify & Add IP**.
4. The submission gateway creates an internal `IP submission:` GitHub issue; the visitor does not need to interact with GitHub.
5. GitHub Actions re-geolocates the IP and runs a Globalping ICMP measurement. Globalping's HTTP API creates a measurement with `POST /v1/measurements` and exposes the completed result at `GET /v1/measurements/{id}`. citeturn370530search0
6. The submission is rejected unless the IP is public and responds to the Globalping check.
7. The enriched record is written to `data/countries/.../ips.json`.
8. `scripts/build-index.mjs` rebuilds `data/index.json`.
9. The GitHub Pages workflow deploys the updated directory.
10. The frontend polls the gateway and reports **verified / added** or the rejection reason.

## Deployment secrets

The Worker deployment workflow expects these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `PINGMAP_GITHUB_TOKEN`

`PINGMAP_GITHUB_TOKEN` should be a least-privilege GitHub token capable of creating issues in `Maneetbal/globalpingmap`. Do not put it in `script.js`, `index.html`, or any public file.

## Data sources

IP2Location.io supplies geolocation and network metadata. Globalping supplies ICMP reachability measurements. Location seed data is based on GeoNames, which provides free downloadable geographic data under CC BY 4.0.
