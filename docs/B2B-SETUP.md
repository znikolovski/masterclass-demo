# WKND Business (B2B) setup

## Site identity

| Field | Value |
|-------|--------|
| Site slug | `wknd-business` |
| Content | `https://content.da.live/znikolovski/wknd-business/` |
| Preview | `https://main--wknd-business--znikolovski.aem.page/` |
| Code | `znikolovski/masterclass-demo` (shared with B2C) |

## Config Service

`@adobe/aem-cli` v16+ has no `aem login`. Use one of:

```bash
# Option A — DA OAuth token (may work if your account has config_admin)
npx github:adobe-rnd/da-auth-helper token
npm run b2b:migrate-config

# Option B — admin.hlx.page session JWT (most reliable for Config Service)
# DevTools → Network → any admin.hlx.page request → copy x-auth-token header
export HLX_AUTH_TOKEN="<x-auth-token>"
npm run b2b:migrate-config
```

## DA content

```bash
# DA auth (@adobe/aem-cli v16+ has no `aem login`)
npx github:adobe-rnd/da-auth-helper token

npm run b2b:seed -- --preview --publish
npm run b2b:library          # Author sidebar: blocks + Adaptive Form
npm run b2b:sync-blog
npm run b2b:seed-b2c-form -- --preview --publish
```

Open B2B content in DA (not listed as a GitHub project — repoless bucket):

https://da.live/edit#/znikolovski/wknd-business/

## B2B API (Cloudflare Worker)

```bash
cd workers/wknd-b2b-api
npm install
npx wrangler kv namespace create WKND_B2B_DATA
# Update wrangler.toml with the KV namespace id
npx wrangler secret put JWT_SECRET
npm run deploy
```

Set page metadata `b2b-api` to your Worker URL (seed script defaults to `https://wknd-b2b-api.jaggah.workers.dev`).

## Forms (EDS adaptive form block)

Document-based form JSON is generated in `forms/` and rendered by the `form` block. Submissions POST to the same Cloudflare Worker (`POST /api/forms/{slug}`) — not Adobe Forms.

```bash
npm run b2b:forms
# or Git-only: node tools/scripts/create-wknd-forms.mjs
```

| Form | Slug | Site |
|------|------|------|
| Contact B2B | `wknd-contact-b2b` | wknd-business |
| Adventure interest B2B | `wknd-adventure-interest-b2b` | wknd-business |
| Adventure interest B2C | `wknd-adventure-interest` | masterclass-demo |

Set page metadata `forms-api` to your Worker URL (defaults to the same host as `b2b-api`). Each sheet JSON includes `formSlug` so the `form` block routes submits to `/api/forms/{slug}`.

Optional: migrate to AEM author adaptive forms later and swap form block URLs in DA.

## Local dev

```bash
# B2B site against preview content
aem up --url https://main--wknd-business--znikolovski.aem.page

# B2B blocks with local drafts + worker
cd workers/wknd-b2b-api && npm run dev
aem up --html-folder drafts
```

Test pages: `/drafts/b2b/register`, `/drafts/b2b/dashboard`
