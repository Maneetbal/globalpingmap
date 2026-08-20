# PingMap

Community-maintained public IP directory.

## Architecture

- `index.html`, `style.css`, `script.js` — static GitHub Pages frontend.
- `data/countries/` — geographic hierarchy and per-city IP JSON files.
- `data/index.json` — generated static search index used by the frontend.
- `scripts/build-index.mjs` — rebuilds the static search index.
- `scripts/process-submission.mjs` — validates and publishes IP submissions.
- `.github/workflows/process-submission.yml` — processes IP submission issues with GitHub Actions.
- `.github/workflows/pages.yml` — deploys the site to GitHub Pages.

There is no Cloudflare Worker and no D1 database in the PingMap architecture.

## Submission flow

1. A visitor enters a public IPv4/IPv6 address.
2. The browser gets a preview from IP2Location.io's keyless API.
3. The visitor sends the IP to GitHub as a pre-filled submission issue.
4. GitHub Actions re-validates the IP and performs a fresh IP2Location lookup.
5. GitHub Actions runs a Globalping ICMP measurement.
6. The submission is rejected unless the IP responds.
7. The enriched record is written to `data/countries/.../ips.json`.
8. The static `data/index.json` is rebuilt and GitHub Pages updates automatically.

The frontend never contains a GitHub write token. GitHub Actions uses its protected workflow token to modify repository data.

## Data sources

IP2Location.io supplies geolocation and network metadata. Globalping supplies ICMP reachability measurements. Location seed data is based on GeoNames, which provides free downloadable geographic data under CC BY 4.0.
