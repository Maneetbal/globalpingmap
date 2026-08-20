# PingMap

Community-maintained public IP directory.

## Architecture

- `index.html`, `style.css`, `script.js` — static frontend assets.
- `src/index.js` — Cloudflare Worker API.
- `migrations/0001_init.sql` — Cloudflare D1 schema.
- `data/locations/` — location indexes and seed city metadata.
- `data/countries/` — geographic hierarchy used for exports/imports.

## Automatic submission flow

1. Validate that the submitted address is a public IPv4/IPv6 address.
2. Look up country, region, city, coordinates, ASN and network data with IP2Location.io's keyless API.
3. Run a Globalping ICMP ping measurement.
4. Reject the submission unless at least one ping response is received.
5. Save the enriched record to D1.

IP2Location.io currently documents a keyless limit of 1,000 geolocation queries/day, and its free API exposes country, region, city, latitude/longitude, ZIP, timezone, ASN and AS name. Globalping documents an unauthenticated API for ping measurements with a free allowance; the allowance is consumed per test rather than per HTTP request.

## D1 setup

Create a Cloudflare D1 database named `globalpingmap`, apply `migrations/0001_init.sql`, then add the D1 binding as `DB` in the Worker/`wrangler.jsonc`. Cloudflare's current D1 binding requires both the database name and database ID.

## Location data

The location seed data is based on GeoNames, which provides free downloadable geographic data under CC BY 4.0. The live geolocation for submitted IPs is performed by IP2Location.io, so the city master catalog is an auxiliary browsing/index dataset rather than the source of truth for IP locations.
