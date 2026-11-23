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

### Automatic booking confirmation email

New confirmed bookings automatically send a transactional email through the existing
Brevo account, from the verified `hello@wknd-adventures.run.place` sender. The message
uses the persisted booking's flight, seats, passenger count, adventure and total;
it explicitly identifies the booking as a **demo**, not a real airline ticket or
payment. It does not subscribe the passenger to marketing.

Provision `WKND_BREVO_API_KEY` as a Cloudflare Worker secret, never as a public
variable or browser credential. `WKND_EMAIL_FROM` is the public verified sender
configuration. Booking authentication and the existing delegation secret are unchanged.

The pending receipt index is written before the confirmed booking snapshot.
Sending starts only after that snapshot is persisted. The Worker attempts delivery
immediately using `waitUntil`; the additional `*/5 * * * *` cron retries pending
receipts automatically. The existing six-hour catalog sync remains separate.
Retries reuse a deterministic booking/account-scoped Brevo UUID, so concurrent
booking requests and retrying the same booking do not create different send keys.
Only newly created bookings enter this outbox; historical bookings are not emailed.
Receipt metadata and its index expire with the booking's original 90-day retention,
including when delivery is retried.

The write-once KV `booking-receipt-status:<provider-uuid>` record has
`status = accepted` when Brevo accepted the request (or
recognized the same idempotency key), not proof of inbox delivery. An uncertain
network/provider outcome is retried only within a conservative 15-minute window,
inside Brevo's documented [30-minute deduplication TTL](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).
After that it becomes `unknown` and logs a reconciliation error rather than risking
a duplicate. Investigate the provider log before any manual resend. Missing
configuration retains scheduled retries without attempting a send. Provider failures
are retried at most once per five-minute window, then require reconciliation if no
definite acceptance is obtained within the safe window. Separate write-once attempt,
start and acceptance records avoid KV's per-key write-rate limit without rewriting
the immutable booking or exposing delivery metadata in its public response.
Provider bodies, email addresses and credentials are never logged.

Validation without real sends:

```bash
node --test tools/tests/aero-booking-receipt.test.mjs
node tools/scripts/test-booking-auth.mjs
node tools/scripts/test-booking-checkout.mjs /absolute/path/to/screenshots
```

The first two mock Brevo and assert durable booking-before-send, retry, duplicate
suppression, invalid recipients and unknown-outcome handling. The browser check
uses the authenticated demo checkout harness and makes no live booking or email.
For rollback, revert the receipt integration and additional cron together; do not
revoke the unrelated booking-delegation secret or resend old pending receipts.

### Authenticated checkout and Check Booking

Browsing and flight search remain public. Confirmation requires Auth0 sign-in;
booking reads require `bookings:read` and are restricted to the verified account.
The companion `masterclass-demo-llmapp` implements the protected `check-booking`
tool. Deploy both repositories together: the new Worker intentionally rejects
anonymous booking creation and the previous unrestricted booking lookup.

1. In Auth0 create **WKND Aero Booking API**, identifier
   `https://wknd-aero-api.jaggah.workers.dev`, signing algorithm **RS256**.
   Add `bookings:create` and `bookings:read`.
2. Use the dedicated Aero application with client ID
   `PrVnVZDYQKOtjcEUHGpVj8nJ1ywobf8k` in tenant
   `dev-g4kzp3zwgwzs8oha.us.auth0.com`. Set **Application Type** to
   **Single Page Application** and **Token Endpoint Authentication Method** to
   **None**. This is separate from the shop's existing SPA and the Native client
   used by ChatGPT/Claude. Enable exactly the same connection(s) on the Aero
   client as on the shop client, and keep the LLM login connection aligned.
   A shared tenant alone does not guarantee a shared identity across connections:
   the same shopper signing in through a different connection can receive a
   different `sub`. Cart ownership and recovery eligibility use issuer + subject;
   a second identity has separate cart history and recovery-redemption history.
   Allow user-delegated access to the two booking scopes; no client-credentials
   grant is needed. Under **Applications > APIs > WKND Aero Booking API >
   Application Access**, add an explicit **user-access** grant for the Aero
   SPA with only `bookings:create` and `bookings:read`. If the API requires
   explicit grants, URL allowlists alone are insufficient. Do not broaden its
   policy to allow all applications or grant the Aero client Commerce API access.
3. For each checkout origin you use, add `{origin}/book/flights` to **Allowed
   Callback URLs** and `{origin}` to **Allowed Web Origins** and **Allowed Origins
   (CORS)**. For example:
   `https://main--wknd-aero--znikolovski.aem.live/book/flights`,
   origin `https://main--wknd-aero--znikolovski.aem.live`.
   Local browser testing uses `http://localhost:3000/book/flights` and
   `http://localhost:3000`. Do not wildcard callback URLs.
   Configure these entries on the dedicated Aero application, not the shop's
   application. Keep the shop's client configuration, existing `/account`
   callbacks and origins unchanged. A `Callback URL mismatch`
   screen is an Auth0 application allowlist error, not a password or Worker error.
   Both Aero preview and live origins must be configured separately:

   | Setting | Aero entries to add (preserve existing entries) |
   |---------|------------------------------------------------|
   | Allowed Callback URLs | `https://main--wknd-aero--znikolovski.aem.page/book/flights`, `https://main--wknd-aero--znikolovski.aem.live/book/flights`, `http://localhost:3000/book/flights` |
   | Allowed Web Origins / Allowed Origins (CORS) / Allowed Logout URLs | `https://main--wknd-aero--znikolovski.aem.page`, `https://main--wknd-aero--znikolovski.aem.live`, `http://localhost:3000` |
4. The public checkout SPA client ID is configured as `AUTH0_CHECKOUT_CLIENT_ID`
   under `[vars]` in `workers/wknd-aero-api/wrangler.toml`.
   The issuer remains `https://dev-g4kzp3zwgwzs8oha.us.auth0.com/` and the API
   audience remains `https://wknd-aero-api.jaggah.workers.dev`. A new SPA client
   does not require changing either value or the MCP resource. Do not change
   the shop's separate `auth-config` action or put a client secret in the website.
   If Aero later calls protected Commerce APIs, request the same API audience
   used by the shop. Commerce validates issuer + audience without binding tokens
   to an `azp`/client ID, so a dedicated SPA client is compatible; it does not
   make a token for a different audience valid. Any future Commerce API grant
   requires separate coordination. The current read-only Aero product suggestions
   use public catalog requests and transfer no shopper token.
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

#### SDK installation and verification

The website already loads the official **Auth0 SPA SDK** from Auth0's CDN in
`scripts/wknd-auth.js`; `scripts/aero-auth.js` connects the Aero header and booking
journey to it. This vanilla JavaScript EDS site has no Vite build or npm SDK
bundling step. Do not add a second SDK instance or paste the standalone
quickstart HTML into the booking page.

The existing integration uses `Auth0Client`, `loginWithPopup`, `checkSession`,
`isAuthenticated`, `getTokenSilently`, `getUser`, and `logout`. Popup login is
intentional: the SDK handles authorization code/PKCE and the callback without
navigating away from an in-progress booking. Do not add a separate manual
redirect/callback flow. Tokens remain in memory; no SDK storage or shared shop
authentication changes are needed for this client configuration.

For a new environment, complete and save the application settings above in the
Auth0 dashboard before switching clients. Changing the client ID alone cannot
make login work. After deployment is approved, deploy the Worker configuration
and check the configuration consumed by the browser:

```bash
curl -fsS https://wknd-aero-api.jaggah.workers.dev/api/auth/config
```

Expected public response:

```json
{
  "issuer": "https://dev-g4kzp3zwgwzs8oha.us.auth0.com/",
  "clientId": "PrVnVZDYQKOtjcEUHGpVj8nJ1ywobf8k",
  "audience": "https://wknd-aero-api.jaggah.workers.dev"
}
```

Website code deployment alone does not update this Worker setting.
For local booking-page testing, run the EDS dev server on port 3000 using the
repository setup command; ensure it serves Aero content rather than another
site. A local page that still uses the hosted Worker also uses its deployed
Auth0 configuration.

On both preview and live `/book/flights`, select a flight, sign in from the
header or checkout, and verify both surfaces update without losing the selection.
Reload to check Auth0 session restoration, then sign out and verify the site
origin is accepted as the logout return URL. Repeat on localhost if used.
The automated checks below mock the SDK and validate application behavior;
they do not prove that the tenant allowlists or a real user login are configured.
If authentication succeeds but booking access fails, verify the client can
request the Booking API audience and both booking scopes, rather than removing
the Worker's authentication checks.

Check Booking is an **EDS widget**, configured with script URL
`https://main--masterclass-demo--znikolovski.aem.live/scripts/llmapp-embed.js`
and widget URL
`https://main--masterclass-demo--znikolovski.aem.live/eds-widgets/check-booking`.
Author the page using a `Check Booking` block with one optional H2 title cell
(default: “Your WKND bookings”); see `drafts/eds-widgets/check-booking.plain.html`.
There are no authored customer identifiers, bookings, credentials, or sample
private records. The block renders verified tool results through the shared
LLM Apps SDK and requests details/pagination via `check-booking`. Do not add
`widget.html` to the companion action directory: it overrides EDS delivery.
Standalone page previews show a host/sign-in explanation instead of private data.

The header and booking checkout share the same Auth0 client and in-memory
sign-in state, using public configuration from `GET /api/auth/config`. The header's
authored **SIGN IN** / **SIGN IN / JOIN** action opens the same login popup as the
checkout, rather than navigating to `/sign-in`. Signing in from either surface
updates both; **SIGN OUT** clears the SDK session and uses Auth0 logout with the
site origin as its return URL. Keep that origin in Auth0's Allowed Logout URLs.
On a new page, the SDK checks for an existing Auth0 session without persisting
tokens in browser storage. Credentials remain memory-only. Allow popups;
cancelled or expired login requires retry without discarding the selected
quote/seats. Expired fare quotes require a new flight search.

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
node tools/scripts/test-aero-shop.mjs
node tools/scripts/test-check-booking-widget.mjs
```

Before enabling the live tool, create a new booking signed in as customer A,
retrieve it in the host signed in as A, then verify customer B cannot retrieve it
through either the direct API or the tool. Host login alone does not validate
the website client, delegated secret, or ownership mapping.

### Booking-aware shopping

The existing `Booking Journey` block needs no new author fields. After a flight
is selected, it shows up to four in-stock products tagged with the booking's
adventure. Confirmation uses the confirmed booking's adventure first. Direct
flight searches without an adventure use matching destination entries from the
public Aero adventure catalog. No matching adventure/products produces an
explicit empty state, not unrelated trending recommendations.

Products and prices come from the existing Commerce Mesh `productSearch` API.
Only public adventure slugs are sent to Commerce: no booking reference, access
token, passenger details, or payment information. This read-only integration
does not change promotions or the shared customer identity implementation.
Product links open the canonical WKND Adventures shop in a new tab to preserve
in-progress checkout; shoppers choose sizes/options and purchase there. Gear
is optional and separate from the flight. No cross-domain cart or sign-in
transfer is implied. Catalog failures show a retry action and never block booking.

The shared [page head](../head.html) supplies both Commerce and Preact import-map
entries. Keep both: the booking block's standalone import-map fallback cannot
replace a head map that already exists.

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
