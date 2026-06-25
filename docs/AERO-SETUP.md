# WKND Aero setup

## Site identity

| Field | Value |
|-------|--------|
| Site slug | `wknd-aero` |
| Content | `https://content.da.live/znikolovski/wknd-aero/` |
| Preview | `https://main--wknd-aero--znikolovski.aem.page/` |
| Live | `https://main--wknd-aero--znikolovski.aem.live/` |
| Code | `znikolovski/masterclass-demo` (shared repoless codebase) |

## Config Service

```bash
export HLX_AUTH_TOKEN="<x-auth-token from admin.hlx.page>"
npm run aero:migrate-config
```

## DA content

```bash
npx github:adobe-rnd/da-auth-helper token
npm run aero:seed -- --preview --publish
npm run aero:library
npm run aero:ingest-adventures
```

Open Aero content in DA:

https://da.live/edit#/znikolovski/wknd-aero/

## Aero API (Cloudflare Worker)

Product Bus catalog ETL, pipeline adapter, and demo booking API.

```bash
cd workers/wknd-aero-api
npm install
npx wrangler kv namespace create WKND_AERO_CATALOG
# Update wrangler.toml with KV namespace id
npx wrangler secret put ADMIN_SECRET   # optional — catalog sync auth
npx wrangler secret put PRODUCT_BUS_SITEKEY  # optional — api.adobecommerce.live PUT
npm run deploy
```

Set page metadata `aero-api` to your Worker URL (defaults to `https://wknd-aero-api.jaggah.workers.dev`).

## Local dev

```bash
aem up --url https://main--wknd-aero--znikolovski.aem.page
```

Test content in `drafts/wknd-aero/`:

```bash
aem up --html-folder drafts --url https://main--wknd-aero--znikolovski.aem.page
```

## Cross-site flight search embed

Aero fragment: `/fragments/flight-search` on wknd-aero.

Adventures pages use the `aem-embed` block pointing at:

```
https://main--wknd-aero--znikolovski.aem.live/fragments/flight-search?dest=PUQ&adv=patagonia-peaks&cid=adv-patagonia-peaks&ref=wknd-adventures
```

## Product Bus

Adventures query-index is ETL'd into Product Bus catalog shape via the Worker. `mixerConfig` routes `/adventures/*` to the Worker pipeline adapter.

See [AERO-BLOCK-PRDS.md](./AERO-BLOCK-PRDS.md) and [AERO-ANALYTICS-PLAN.md](./AERO-ANALYTICS-PLAN.md).
