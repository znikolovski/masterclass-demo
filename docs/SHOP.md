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
| `/shop/account` | `commerce-account` | Auth0 sign-in, orders, addresses |

- **Runtime wiring.** `scripts/commerce.js` and `scripts/initializers/*` set up the drop-ins. `scripts/commerce-config.js` holds the Mesh endpoint, store headers and shop paths. `scripts/scripts.js` starts commerce early on `/shop/**`. Other blocks (OF1 gear, search) load it lazily.
- **Drop-ins.** They are pinned in `package.json` and vendored to `scripts/__dropins__` by `npm run install:dropins`. An import map in `head.html` exposes them.
- **Labels.** Labels default to AU wording (GST, postcode) in `scripts/commerce-utils.js`. Authors can override any drop-in string in the multi-sheet `/shop/placeholders` spreadsheet, using one sheet per drop-in (`pdp`, `cart`, `checkout`, …) with `Key` dot paths such as `Cart.Cart.heading`.
- **Images.** Product images come from DM OpenAPI renditions (`{asset}/as/{alias}.webp?width=…`). The `pdp-markup` HTML links to images rather than embedding them, so EDS never copies them to the media bus.
- **Design.** Shop UI reuses the site design system rather than a separate theme: drop-in buttons follow `a.button` (Syncopate pill, 2px border, offset orange shadow; `.shop-accent` = orange conversion CTA), pill tags/chips, 10px rounded cards and `--light-color` panels (`styles/commerce.css`). Product imagery is 4:5 (1600×2000); PDP gallery and cards use 4:5 frames. `shop-hero` is a dark banner block for category/landing pages (tag paragraph, heading, intro, bullet list → highlight pills).
- **Header.** The header shows a cart badge and an account link. The cart icon opens a mini-cart drawer (`blocks/header/mini-cart.js`, drop-in `MiniCart`). Modifier-clicks and the cart/checkout pages keep the plain link. The **Ask WKND** pill opens the search modal (also on ⌘/Ctrl+K).

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

- **Admin UI.** It runs in the Experience Cloud shell (Stage):
  `https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=https://28538-wkndcommerce-stage.adobeio-static.net/index.html`.
  It has Dashboard, Products (editor with variants, price and stock, and images), Inventory, Pricing
  (bulk sales) and Orders.
- **Image linking.**
  1. Upload images to `/content/dam/wknd-adventures/products/<category>/<SKU>/…` with
     `commerce:isCommerce`, `commerce:skus`, `commerce:roles` and `commerce:positions`. Use
     `npm run shop:upload-images` from this repo, and see `tools/aem-assets/product-images/README.md`.
  2. The I/O Events registration *WKND AEM Assets product image linking*
     (`events/aem-assets-registration.json`) triggers `asset-events`.
  3. In the admin UI, use **Re-match from AEM** to relink a product on demand.

## Environment and setup checklist

| Step | Status / how |
|------|--------------|
| App Builder Stage deploy | `aio app deploy` in `../wknd-commerce` |
| API Mesh | `npm run mesh:build && aio api-mesh update mesh.json` |
| Seed catalog | `npm run catalog:seed` (99 products / 584 sellable SKUs) |
| AEM author API allowlist for the S2S client | Deploy `../wknd-commerce/aem-config/config/api.yaml` via the Cloud Manager config pipeline |
| Product images | Generate with `tools/aem-assets/product-images/image-prompts.csv`, then `npm run shop:upload-images` |
| PDP overlay | Done: `content.overlay` (from `config/repoless.site.json`) is set on the live site config. Update only the `content` sub-config (`POST /config/znikolovski/sites/masterclass-demo/content.json`); the full `migrate:repoless --apply` would overwrite the live `public.json` (production mixer config) and `headers.json` with the stale repo copies |
| PDP preview/publish automation | Done: publish-role key in `../wknd-commerce/.env`; PDPs re-render automatically (see `prerender` / `pdp-scheduler`). Preview-only (`WKND_PDP_PUBLISH=false`) until the shop code is on `main`; go-live = set it to `true` and `aio app deploy` — the next scheduler tick publishes every PDP |
| Auth0 | On the Aero SPA client (`ULTyS938dUNMhSXTjvLXr3b8ZrGOGhyM`), add each storefront origin explicitly (Auth0 can't wildcard `*--…aem.page`): Callback `<origin>/book/flights` (the shared popup `redirect_uri`), Logout `<origin>/shop/` and `<origin>`, Web Origins and Allowed Origins (CORS) `<origin>` |
| Shop content | Done (previewed): DA `shop/index` (served at `/shop/`), `apparel`, `accessories`, `search`, `cart`, `checkout`, `order`, `account` and the `placeholders` sheet. No product pages are authored. Publish once the shop code is on `main` |

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
