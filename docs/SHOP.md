# WKND Adventures Shop — architecture and runbook

A demo shopping experience for apparel and travel accessories on
[wknd-adventures.run.place](https://wknd-adventures.run.place/shop/). The storefront uses the
Adobe Commerce **drop-ins**. A **mock Adobe Commerce backend** built on App Builder and
**API Mesh** sits behind them. Payment is mocked with **WKND Demo Pay**, so nothing is charged or
shipped.

| Piece | Where |
|-------|-------|
| Storefront (EDS + drop-ins) | this repo, under `/shop` |
| Mock Commerce backend, API Mesh, admin UI, AEM image linking | sibling App Builder repo `../wknd-commerce` (Console project `wkndcommerce`) |
| Product images | AEM Assets `/content/dam/wknd-adventures/products/**`, delivered **only** via Dynamic Media OpenAPI |
| Site search | AEM Content AI (`wknd-adventures` content source) via the `content-ai` proxy action |
| Sign-in | WKND Aero Auth0 tenant (shared with `/book/flights`) |

```
Browser (EDS /shop, header search, OF1)
  ├─ drop-ins ──GraphQL──► API Mesh ──► commerce/storefront-graphql (Core + Catalog Service schema)
  │                                        └─ aio-lib-db: products, prices, inventory, carts, orders, asset_links
  ├─ search modal ───────► commerce/content-ai ──► AEM Content AI /adobe/contentAI (search, gensearch)
  └─ Auth0 SPA (wknd-auth.js) ─ access token ─► auth drop-in cookie ─► Mesh (JWT verified via JWKS)
AEM Assets ── I/O Events ──► commerce/asset-events (custom asset matcher) ──► asset_links
EDS preview of /shop/products/* ── content overlay ──► commerce/pdp-markup (BYOM PDP HTML)
Admin (ExC Shell SPA) ──IMS──► commerce-admin/admin (products, inventory, pricing, orders, images)
```

## Storefront

| Path | Block(s) | Notes |
|------|----------|-------|
| `/shop/` | `shop-hero`, `product-recommendations`, `product-list-page` | Shop home, trending, all gear (DA `shop/index`) |
| `/shop/<category>` | `product-list-page` (`category` key) | Facets: category, price, activity, adventure, colour, size, gender, brand |
| `/shop/search?q=` | `product-list-page` (search) | Also the "See all products" target of the search modal |
| `/shop/products/<url-key>` | `product-details`, `product-recommendations` | Implicit: never authored. `pdp-markup` (BYOM overlay) renders each product, and `prerender` previews/publishes it automatically on catalog, price, stock and image changes |
| `/shop/cart`, `/shop/checkout`, `/shop/order` | `commerce-cart`, `commerce-checkout`, `commerce-order` | Guest or signed-in checkout, WKND Demo Pay |
| `/account` | `commerce-account` | WKND account: sign in / create account; overview, orders, saved addresses (`/shop/account` redirects here via the DA `redirects` sheet) |

- **Runtime wiring.** `scripts/commerce.js` and `scripts/initializers/*` set up the drop-ins. `scripts/commerce-config.js` holds the Mesh endpoint, store headers and shop paths. `scripts/scripts.js` starts commerce early on `/shop/**`. Other blocks (OF1 gear, search) load it lazily.
- **Drop-ins.** They are pinned in `package.json` and vendored to `scripts/__dropins__` by `npm run install:dropins`. An import map in `head.html` exposes them.
- **Cart quote batching.** On the cart page, the public SDK transport subclass in `scripts/commerce-fetch-graphql.js` keeps the original ordinary add/update mutation and appends fresh shipping and estimated totals in one ordered request. `scripts/cart-quote-batch.js` serves those results once to the SDK's automatic post-update estimate cycle, not to later user actions. New input, cart edits, changed endpoint/auth/store headers, or expiry invalidate the continuation. Only destination and shipping-method identity persist between actions; a changed first available method requires normal fresh estimates. Partial mutation errors remain visible, and failed estimates show an alert while preserving committed cart updates. Removing the last item uses the native path. Vendor code is unchanged; bundle completion uses the dedicated atomic operation below.
- **Labels.** Labels default to AU wording (GST, postcode) in `scripts/commerce-utils.js`. Authors can override any drop-in string in the multi-sheet `/shop/placeholders` spreadsheet, using one sheet per drop-in (`pdp`, `cart`, `checkout`, …) with `Key` dot paths such as `Cart.Cart.heading`.
- **Images.** Product images come from DM OpenAPI renditions (`{asset}/as/{alias}.webp?width=…`). The `pdp-markup` HTML links to images rather than embedding them, so EDS never copies them to the media bus.
- **Design.** Shop UI reuses the site design system rather than a separate theme: drop-in buttons follow `a.button` (Syncopate pill, 2px border, offset orange shadow; `.shop-accent` = orange conversion CTA), pill tags/chips, 10px rounded cards and `--light-color` panels (`styles/commerce.css`). Product imagery is 4:5 (1600×2000); PDP gallery and cards use 4:5 frames. `shop-hero` is a dark banner block for category/landing pages (tag paragraph, heading, intro, bullet list → highlight pills).
- **WKND account.** One sign-in for WKND Adventures and WKND Aero (Auth0 popup; `scripts/wknd-auth.js`). WKND Adventures configures a persistent session (`configureAuth`: rotating refresh tokens cached in `localStorage`) and the `/account` callback. `scripts/shop-auth.js` hands the access token to the drop-ins and caches the first name and initials in `scripts/account-state.js`, so the header shows the signed-in state on every page without loading Auth0. The header account menu (`blocks/header/account-menu.js`) offers Sign in / Create account (`screen_hint=signup`) or account links and Sign out. Checkout offers sign-in up front (guests can continue). The order drop-in treats order refs longer than 20 characters as guest tokens, so the backend lets a signed-in customer open their own order by number through `guestOrderByToken`.
- **Applied discounts.** The cart order summary groups automatic promotions and applied coupon savings in a visible **Discounts** section, separate from tax details and the discount-code entry form. It reuses the drop-in's authoritative discount rows through `OrderSummary.updateLineItems`; no pricing calculations change. The section disappears when no discounts apply.
- **Welcome-back recovery offer.** On `/shop/cart`, after authentication the initializer starts `wkndCustomerRecoveryOffer` independently of cart loading. The backend selects the existing owned active cart without creating or changing one. The UI consumes that initial response once, only after its cart ID, item UIDs/quantities and coupon codes match the confirmed cart; changed snapshots use a fresh cart-specific check. Sign-out or newer cart events prevent stale results from appearing. Failures retain the visible retry action. This read does not claim or apply an offer, reset inactivity or delay cart rendering. Deploy the additive Commerce/Mesh query before the frontend.
- **Checkout address headings.** `commerce-checkout.css` styles both the guest `AddressForm` title and the signed-in `Addresses` header title for shipping and billing. The latter uses `.account-addresses-header-title .dropin-header-container__title`, not `.account-address-form-wrapper__title`.
- **Header.** The header shows a cart badge and the account menu. The cart icon opens a mini-cart drawer (`blocks/header/mini-cart.js`, drop-in `MiniCart`). Modifier-clicks and the cart/checkout pages keep the plain link. The **Ask WKND** pill opens the search modal (also on ⌘/Ctrl+K).

### Complete a bundle from the cart

On `/shop/cart`, an enabled automatic bundle can appear under **Complete your bundle**
when at least one exact required variant is already in the cart. Commerce supplies the
offer through `wkndBundleOffers`; disabled, expired, unavailable and ineligible offers
are not shopper recommendations. No additional block authoring is needed.

**Add remaining products** calls `completeWkndBundle` with the offer's `cart_version`,
promotion and bundle IDs. Commerce validates the current cart, offer, prices and stock,
derives missing quantities itself, and commits all additions with one version-checked write.
Stale or unavailable offers fail without a partial add; the cart refreshes for review.
It never replaces a variant or adds a second complete kit. The server promotion engine
selects the best eligible discount; showing a recommendation does not grant one.
Shipping and unrelated products remain outside the kit.

The public SDK's per-item `customFields` carries an explicit `wknd_bundle_completion`
intent to the project transport adapter. It replaces that marked add with the dedicated
mutation, preserving SDK normalization, cart events and the ordered shipping/totals quote.
No client quantities are sent to the atomic operation. Without the adapter the unknown
input field fails GraphQL validation, rather than silently performing a standard add.

Publish the Commerce GraphQL extension and updated Mesh schema before publishing this
storefront change. If the offer service is unavailable, the cart reports that explicitly
and keeps ordinary cart editing and checkout available.

## Search modal (`blocks/search`)

- **Opening it.** Focusing the header "Ask WKND" pill opens the modal. Pages can also author a `search` block, which renders a trigger button.
- **What it shows:**
  - Content AI page results, deduped per page; OF1 knowledge and infrastructure pages are excluded.
  - A **grounded** AI summary from `gensearch`, hidden when Content AI has no grounded answer.
  - Up to 4 products from Mesh `productSearch`.
  - Trending gear from the `wknd-trending` unit, plus recent searches (stored locally only).
- **Hand-off.** Enter, or **Ask WKND Sherpa**, goes to `/of1?q=…` as the header form did before.
- **Indexing.** Content AI crawls the live sitemap daily at 05:00 UTC. Shop pages are indexed once they are published.

## OF1 gear recommendations

`scripts/scripts.js` autoblocks one `product-recommendations` panel (unit `wknd-of1-gear`,
"Gear up for this adventure") into each generated OF1 response that has adventure cards or facts.
The panel's anchor product is chosen in three steps:
1. Products tagged with the response's adventure slugs (`/blog/<slug>`, `/adventures/<slug>` links),
   combined with the turn's query.
2. Those adventure tags alone.
3. The query alone.

Templates and the model contract are unchanged. Test with
`node tools/scripts/test-of1-gear.mjs http://localhost:3000`.

The authored `/of1` block routes product APIs through the `wknd-mcp/of1-gateway`
App Builder action in `../wknd-automation`; `api-endpoint` still serves the OF1
SDK. The gateway allows the canonical domain, `http://localhost:3000`, and HTTPS
`<branch>--masterclass-demo--znikolovski.aem.page` / `.aem.live` origins.
It keeps the upstream tenant fixed to `main--masterclass-demo--znikolovski`.
An `API error: 403` with response `Origin is not allowed` comes from this
gateway's origin policy, not the page's content or Commerce configuration.
Gateway tests and targeted deployment instructions are in
`../wknd-automation/actions/of1-gateway/README.md`.

### Product-first OF1

The gateway can also route shopping questions into catalog-grounded product results.
`OF1_PRODUCT_FIRST_ENABLED` is **off by default** in its deployment manifest. When enabled:

- The read-only Commerce `of1Discovery(query, history)` query distinguishes shopping,
  adventure planning and requests needing clarification. The existing generator still
  handles adventure turns. No remote SDK fork or new model provider is involved.
- Product results lead with up to three products, factual specification comparisons,
  live AUD prices, inline variant selection and direct add-to-cart. One matching
  product renders without an artificial comparison. Hard budgets also apply to the
  selected variant; missing specifications are never inferred.
- Up to three related adventures follow, resolved from product adventure slugs against
  the published `/blog-index.json`. Generic activity tags do not become invented URLs.
  Adventure enrichment failure is visible without removing usable product results.
- Product-first turns do not trigger the adventure-first gear, flight or Sherpa panels.
  Subsequent trip-planning searches still use those existing integrations.
- Follow-ups use the SDK's recent query history. Unresolvable references such as “the
  second one” prompt clarification rather than guessing previous result identities.
- Catalog failures and no matches are distinct. Cart actions require an explicit click,
  use the existing guest/signed-in cart, and never retry uncertain writes automatically.

The reusable [product-comparison block](../blocks/product-comparison/README.md) takes
SKU identities and optional criteria, not generated price/spec text. Product explanations
are deterministic compositions of catalog facts, not free-form generated endorsements.

Validate without touching live carts:

```sh
node tools/scripts/test-of1-products.mjs http://localhost:3001
```

Use an AEM server with `--html-folder drafts` (and the canonical site as `--url` if
preview content is unavailable). The test requires the sibling backend/gateway workspaces
and replays real SDK, gateway and Commerce operations against an in-memory catalog/cart.

Deploy the Commerce storefront schema/action and Mesh, then the new website block/code,
before enabling the gateway flag. Publish/sync the updated landing suggestions only
after activation. Disabling the flag restores the previous gateway forwarding behavior.
See the gateway README for the rollout checks; no adventure DA template migration is needed.

## Shop in ChatGPT (WKND LLM app)

Shoppers can browse gear, manage their cart and check out with WKND Demo Pay inside ChatGPT through
the WKND LLM app (`../masterclass-demo-llmapp`, tools `search-shop-products`, `get-shop-product`,
`get-shop-cart`, `add-shop-cart-items`, `update-shop-cart-items`, `prepare-shop-checkout`,
`place-shop-demo-order`). Its README has the tool contract and LLM Apps UI settings.

- **One dedicated widget per tool with a UI**, each an EDS block named after its tool and rendered
  by `aem-embed`:

  | Block / widget page | Shows |
  |---|---|
  | `search-shop-products` | Results grid with option pickers and Add to cart |
  | `get-shop-product` | One product in detail; options the shopper named are preselected |
  | `get-shop-cart` | The cart with quantity controls and the welcome-back offer card; "Check out" hands off to checkout |
  | `prepare-shop-checkout` | Delivery details, delivery method, coupon or welcome-back offer, Demo Pay review, receipt |

  `add-shop-cart-items`, `update-shop-cart-items` and `place-shop-demo-order` are tool-only (the
  widgets call them). Shared rendering is in `scripts/llmapp-shop.js` and `styles/llmapp-shop.css`;
  preview data is in `scripts/llmapp-shop-samples.js`, loaded only for previews. Like the other tool
  widgets, each widget page is `/eds-widgets/<tool>-demo`: the block with a `placeholder` cell (local
  copies in `content/<tool>-demo.plain.html`). Preview with `/tools/widget-preview.html?block=<tool>`.
  Previews use sample data and never call tools. Add `&scenario=planner-offer` (or
  `planner-offer-unavailable`) to the cart or checkout widget for a **simulated** general climbing
  planner offer (10% off selected climbing gear, capped at $25, applied automatically). The harness
  labels it as fixture data: the shop does not send this offer yet. The renderer words each offer by
  its `kind` and shows no offer whose kind it does not know.
- **Gear checklist.** The `build-gear-checklist` widget shows the matching WKND product under each
  checklist item it sells. Simple products get Add to cart; products with options get Choose options
  (opens `get-shop-product`); there is also a View My Cart action.
- **One cart.** Signed-in shoppers have the same customer and active cart in ChatGPT and on the site:
  the LLM app sends `storefront-graphql` a delegated assertion for the shopper's Auth0 `sub` (see
  the backend README). `scripts/initializers/cart.js` refreshes a signed-in cart when the tab regains
  focus, so edits or an order made in ChatGPT appear without a reload.
- **Safe checkout.** Orders need the reviewed cart version and total plus an explicit button press in
  the widget; a cart changed elsewhere is re-shown, never silently ordered. The backend claims a cart
  atomically, so one cart produces at most one order.
- **Demo only.** Production ChatGPT checkout is gated by OpenAI (external checkout; native checkout
  for approved partners only) and is not part of this demo.

## Backend (`../wknd-commerce`)

| Action | Purpose |
|--------|---------|
| `commerce/storefront-graphql` | Mesh source: carts, checkout, orders, customer, Catalog Service, recommendations |
| `commerce/auth-config` | Public Auth0 SPA settings for the storefront |
| `commerce/pdp-markup` | BYOM overlay HTML for `/shop/products/*`: everything a shopper sees (price/GST/shipping note, SKU and stock, gallery, options, details, specs, made-for, promises, and both recommendation units as product links) plus JSON-LD and DM og:image, so agents that don't run JavaScript see the full page (82–100% of `<main>` text) |
| `commerce/prerender` | Previews (and, with `PDP_PUBLISH=true`, publishes) changed PDPs via the EDS Admin API: warms the overlay, waits for the bulk job, retries failures once. `aio rt action invoke commerce/prerender -p all true` re-renders every enabled product. Needs `HLX_ADMIN_API_KEY` (publish role) |
| `commerce/pdp-scheduler` | Alarm every 15 min: re-renders PDPs whose special price starts/ends, refreshes every PDP daily and whenever `PDP_PUBLISH` changes. With admin/stock/price/image writes, orders that sell out and deletes/imports (all trigger `prerender` directly), no manual prerender runs are needed |
| `commerce/content-ai` | CORS proxy to AEM Content AI (stable API), with compact hits and a `grounded` flag |
| `commerce/asset-events`, `asset-to-product`, `product-to-asset`, `reconcile` | AEM image linking using the Adobe Commerce custom-matcher contract and a nightly reconcile |
| `commerce-admin/admin` | IMS-protected admin RPC used by the ExC Shell UI |

- **Admin UI.** It runs in the Experience Cloud shell. Production (submitted for approval, then listed
  under Custom Apps):
  `https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=https://28538-wkndcommerce.adobeio-static.net/index.html`.
  Stage: the same URL with `28538-wkndcommerce-stage`.
  It has Dashboard, Products (editor with variants, price and stock, and images), Inventory, Pricing
  (bulk sales) and Orders.
- **Image linking.**
  1. Upload images to `/content/dam/wknd-adventures/products/<category>/<SKU>/…` with
     `commerce:isCommerce`, `commerce:skus`, `commerce:roles` and `commerce:positions`. Use
     `npm run shop:upload-images` from this repo, and see `tools/aem-assets/product-images/README.md`.
  2. The I/O Events registration *WKND AEM Assets product image linking*
     (`events/aem-assets-registration.json`) triggers `asset-events`.
  3. In the admin UI, use **Re-match from AEM** to relink a product on demand.

## Commerce Catalog in Experience Workspace

Authors search the catalog and insert products from the **Commerce Catalog** library plugin.

- **Plugin.** `tools/commerce-catalog/` is vendored from
  [markszulc/ew-ext-commerce](https://github.com/markszulc/ew-ext-commerce) and lint-ignored.
  There is one WKND patch (marked in the file): the category picker also accepts the
  `categoryPath` facet that this backend returns. Keep the rest in sync with upstream.
- **Library rows.** These are in the DA site config Library tab and are managed by
  `tools/sidekick/setup-da-library.mjs`:
  - `Commerce Catalog` points at `main`.
  - A temporary `Commerce Catalog (shop-storefront)` row with `ref = shop-storefront` points at
    the branch preview. Use it with `da.live/edit?ref=shop-storefront#/…`, and remove it after
    the merge.
- **Catalog connection.** The plugin reads `public.default.commerce-endpoint` and
  `headers.all` / `headers.cs` from the site's `/config.json`. That is the Config Service
  `public.json` `default` entry, which mirrors the default export of `scripts/commerce-config.js`.
  If the mesh endpoint or headers change, update both.
- **Insert formats.** These come from the `commerce-templates` sheet in the DA site config. It is
  seeded once, and authors can edit it:

  | Format | Inserts |
  |---|---|
  | Product cards | A `cards-commerce` block with one row per selected product |
  | Product link | `/shop/products/{{urlKey}}` |
  | SKU | The SKU as plain text |
  | Similar gear | `product-recommendations` with `wknd-pdp-more-like-this` and `sku` |
  | Complete the kit | `product-recommendations` with `wknd-pdp-complete-kit` and `sku` |

  The recommendation formats use one anchor product. If several products are selected, the last
  one wins.
  Any commerce block can be inserted into the content cell of a `tabs-activity` row, including
  **Product cards**, **Similar gear**, **Complete the kit**, and custom insert formats. The tabs
  block converts nested tables whose first row is a single cell containing the canonical
  hyphenated block name (for example, `cards-commerce` or `product-recommendations`) into
  blocks and loads them in the panel. Optional variants use `block-name (variant, variant)`.
  Ordinary data tables remain tables. SKU and Product link insert formats remain plain content.
  Validate nested inserts and responsive panels with
  `node tools/scripts/test-tabs-commerce.mjs http://localhost:3000` against previewed `/gear`
  content.
- **`cards-commerce` block.** Use it on any page. It has one row per product with these cells:
  1. SKU
  2. Eyebrow (optional)
  3. Description (optional)
  4. CTA text (optional)
  5. CTA link (optional)

  It sends one `products(skus)` request to the mesh, uses Dynamic Media renditions, and drops
  unknown SKUs. Each card shows the same details as the shop search grid
  (`scripts/product-card.js`): a sale badge with the percentage off, a sold-out badge, the main
  material, a spec bar, the activity eyebrow, and the sale price with the regular price struck
  through and the saving. Cards keep their own colours inside `accent`, `inverse` and `dark`
  sections, and rows are centred. It is registered as **Commerce Cards** in the block library.
  The test page is `drafts/cards-commerce.plain.html`.

## Environments

The live site runs on the App Builder **Production** workspace. Stage is for development and has its
own database, mesh and event registration.

| | Production (live site) | Stage |
|-|------------------------|-------|
| Runtime namespace | `28538-wkndcommerce` | `28538-wkndcommerce-stage` |
| API Mesh | `https://edge-graph.adobe.io/api/46e0d9f5-4d7a-463d-bebb-678c9106d482/graphql` | `https://edge-sandbox-graph.adobe.io/api/fd2c6dc7-f3ce-426a-83bd-63227acbcdb4/graphql` |
| AEM Assets event registration | `af306307-5bb3-4863-ae4a-9a5ba8ec9e71` | `93b74c5e-7d9b-4ac8-96b1-afba56a394f6` |
| `WKND_PDP_PUBLISH` | `true` | `false` |

The storefront points at Production in `scripts/commerce-config.js` (`RUNTIME`, `MESH_ENDPOINT`), in
the Config Service `public.json` `default` commerce config, and in the site `content.overlay`
(`config/repoless.site.json`). Change all three together.

- **Switch workspace.** `aio app use -w Production --no-input` (or `-w Stage`) in `../wknd-commerce`.
  It rewrites the `AIO_*` values in `.env`; the `WKND_*` values stay, so also set
  `WKND_PDP_MARKUP_URL` (the namespace's `pdp-markup`) and `WKND_PDP_PUBLISH` for that workspace.
- **Database.** aio-lib-db is scoped per namespace. Production was seeded by copying Stage at
  go-live (all collections except `events` and `carts`, and the Stage `pdp_scheduler` state).

## Environment and setup checklist

| Step | Status / how |
|------|--------------|
| App Builder deploy | `aio app deploy` in `../wknd-commerce` (in the workspace selected above) |
| API Mesh | `npm run mesh:build && aio api-mesh update mesh.json` (mesh.json is generated for the selected namespace) |
| Seed catalog | `npm run catalog:seed` (99 products / 584 sellable SKUs) |
| AEM author API allowlist for the S2S client | Deploy `../wknd-commerce/aem-config/config/api.yaml` via the Cloud Manager config pipeline |
| Product images | Generate with `tools/aem-assets/product-images/image-prompts.csv`, then `npm run shop:upload-images` |
| PDP overlay | Done: `content.overlay` (from `config/repoless.site.json`) is set on the live site config. Update only the `content` sub-config (`POST /config/znikolovski/sites/masterclass-demo/content.json`); the full `migrate:repoless --apply` would overwrite the live `public.json` (production mixer config) and `headers.json` with the stale repo copies |
| PDP preview/publish automation | Done: publish-role key in `../wknd-commerce/.env`; PDPs re-render automatically (see `prerender` / `pdp-scheduler`). Production publishes (`WKND_PDP_PUBLISH=true`); Stage previews only. Changing the flag and running `aio app deploy` makes the next scheduler tick re-render every PDP |
| Auth0 | On the Aero SPA client (`ULTyS938dUNMhSXTjvLXr3b8ZrGOGhyM`), add each storefront origin explicitly (Auth0 can't wildcard `*--…aem.page`): Allowed Callback URLs and Allowed Logout URLs `<origin>/account`, Allowed Web Origins and Allowed Origins (CORS) `<origin>`; **Allow Refresh Token Rotation** on the application and **Allow Offline Access** on the `wknd-aero-api` API (persistent sessions). Sign-in is popup-only (`web_message`), so the callback URL is validated but never loaded; Aero keeps its own `/book/flights` callback |
| Shop content | Done (previewed): DA `shop/index` (served at `/shop/`), `apparel`, `accessories`, `search`, `cart`, `checkout`, `order` and the `placeholders` sheet, plus `/account` and the root `redirects` sheet (`/shop/account` → `/account`). No product pages are authored. Published at go-live |

## Testing

| Command | Covers |
|---------|--------|
| `npm run lint` | ESLint + Stylelint (drop-ins are ignored) |
| `node tools/scripts/test-booking-checkout.mjs` | WKND Aero sign-in regression (shared Auth0 module) |
| `node tools/scripts/test-of1-actions.mjs <base>` / `test-of1-gear.mjs <base>` | OF1 decoration and gear panel |
| `npm test` in `../wknd-commerce` | Drop-in GraphQL contract, linking, PDP, admin, Content AI shaping |

Local shop drafts: run `aem up --html-folder drafts`, then open `/drafts/shop/…`. `SHOP_ROOT` switches to
`/drafts/shop` automatically. There are no draft PDPs: test product pages at `/shop/products/<url-key>`
(the local server proxies the prerendered BYOM preview).
