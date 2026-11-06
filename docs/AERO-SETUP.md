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

### Authenticated checkout and Check Booking

Browsing and flight search remain public. Confirmation requires Auth0 sign-in;
booking reads require `bookings:read` and are restricted to the verified account.
The companion `masterclass-demo-llmapp` implements the protected `check-booking`
tool. Deploy both repositories together: the new Worker intentionally rejects
anonymous booking creation and the previous unrestricted booking lookup.

1. In Auth0 create **WKND Aero Booking API**, identifier
   `https://wknd-aero-api.jaggah.workers.dev`, signing algorithm **RS256**.
   Add `bookings:create` and `bookings:read`.
2. Create **WKND Checkout**, type **Single Page Application**, for our website.
   This is separate from the Native client used by ChatGPT/Claude. Enable the
   same customer connection used for the LLM login so issuer + subject match.
   Allow user-delegated access to the two booking scopes; no client-credentials
   grant is needed.
3. For each checkout origin you use, add `{origin}/book/flights` to **Allowed
   Callback URLs** and `{origin}` to **Allowed Web Origins** and **Allowed Origins
   (CORS)**. For example:
   `https://main--wknd-aero--znikolovski.aem.live/book/flights`,
   origin `https://main--wknd-aero--znikolovski.aem.live`.
   Local browser testing uses `http://localhost:3000/book/flights` and
   `http://localhost:3000`. Do not wildcard callback URLs.
4. The public checkout SPA client ID is configured as `AUTH0_CHECKOUT_CLIENT_ID`
   under `[vars]` in `workers/wknd-aero-api/wrangler.toml`.
   The issuer, Worker audience and MCP resource are also configured there; change them together when deploying
   to another environment.
5. Generate a strong random shared secret (at least 32 bytes) locally. Store it
   with `npx wrangler secret put WKND_BOOKING_ASSERTION_SECRET` in the Worker
   directory, and as the **secret** variable `WKND_BOOKING_ASSERTION_SECRET`
   in a supported server-side secret configuration for Adobe LLM Apps.
   The current LLM Apps UI does not support secrets; do not store this key as an
   ordinary Variable. Secure runtime provisioning is required before enabling
   the lookup tool. Never commit it or put it in browser code.
6. Enable auth for **Check Booking**, scope `bookings:read`, in the LLM Apps UI.
   The MCP API identifier remains the canonical MCP resource, not the Worker
   API audience. See the companion README for the tool output/widget contract.
   Make `booking_id` optional to enable listing, and declare optional `cursor`
   for pagination; the existing required-ID schema still supports direct lookup.
7. Deploy the Worker, website code and companion app, then refresh host tools.

Check Booking is an **EDS widget**, configured with script URL
`https://main--masterclass-demo--znikolovski.aem.page/scripts/aem-embed.js`
and widget URL
`https://main--masterclass-demo--znikolovski.aem.page/eds-widgets/check-booking`.
Author the page using a `Check Booking` block with one optional H2 title cell
(default: “Your WKND bookings”); see `drafts/eds-widgets/check-booking.plain.html`.
There are no authored customer identifiers, bookings, credentials, or sample
private records. The block renders verified tool results through the shared
LLM Apps SDK and requests details/pagination via `check-booking`. Do not add
`widget.html` to the companion action directory: it overrides EDS delivery.
Standalone page previews show a host/sign-in explanation instead of private data.

The website reads public configuration from `GET /api/auth/config` and loads
Auth0's SPA SDK only when sign-in is requested. Login uses a popup and memory-only
tokens, preserving the selected quote/seats without storing tokens or payment
details. Allow popups; cancelled or expired login requires retry. Expired fare
quotes require a new flight search.

The MCP handler uses a signed, read-only assertion lasting at most 60 seconds;
it does not forward an access token minted for the MCP audience to the Worker
audience. The Worker independently validates the assertion and derives the same
account key as for website tokens. Ownership never comes from tool arguments,
email, or a browser-supplied user ID.

New records live under `customer-booking:<hashed issuer+subject>:<reference>` in
the existing KV namespace, expire after **90 days**, and snapshot server-priced
flight details independently of the 30-minute quote. Known airport time zones
use IANA identifiers; unknown time zones/instants remain unavailable. All
flights are scheduled **demo** flights, not live status or issued tickets.
Preparation snapshots reuse the existing `planning-*` entries in
`of1/config/knowledge.json`, joined by exact adventure ID (currently Patagonia,
Yosemite, Norway kayaking, Ohrid and Ladakh). Maintain their source citations and
caveats alongside the existing planning panel; Worker redeployment updates
guidance for newly created bookings. Editorial preparation guidance is not a
confirmed itinerary or issued permit.
Missing guidance is explicitly unavailable; it never becomes a mock booking.

Legacy `booking:<reference>` records are not exposed or auto-claimed. If legacy
PII must be removed, delete only reviewed legacy keys through KV administration;
do not clear the shared catalog namespace. For an account deletion request, use
the SHA-256 hex digest of `JSON.stringify([issuer, subject])` to identify its
`customer-booking:` prefix, page through KV listings and delete those keys.
KV is eventually consistent: a new booking can temporarily be absent from
listing/lookup; retry with the reference after a short delay. This demo provides
no transactional inventory or payment guarantees.

Focused regression checks:

```bash
node tools/scripts/test-booking-auth.mjs
node tools/scripts/test-journey-context.mjs
node tools/scripts/test-booking-checkout.mjs
node tools/scripts/test-check-booking-widget.mjs
```

Before enabling the live tool, create a new booking signed in as customer A,
retrieve it in the host signed in as A, then verify customer B cannot retrieve it
through either the direct API or the tool. Host login alone does not validate
the website client, delegated secret, or ownership mapping.

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
