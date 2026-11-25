# WKND Adventures Shop — Analytics plan

The shop pushes commerce events to the Adobe Client Data Layer (ACDL). The martech plugin's ACDL
forwarder sends every pushed event to the Web SDK (`alloy('sendEvent')`), and
`onBeforeEventSend` (`mapShopToAnalytics` in `scripts/shop-analytics.js`) maps them to Analytics. Events use XDM commerce field groups (`commerce.*`,
`productListItems`). WKND context goes in `data.wkndShop`, plus `data.wkndJourney` when an
assisted journey is active (see [JOURNEY-TRACKING.md](JOURNEY-TRACKING.md)). Analytics is
skipped when the page has `<meta name="analytics" content="off">`. **No PII** is pushed: no
email, name or address, and search phrases are capped at 100 characters.

Implementation: `scripts/shop-analytics.js` bridges drop-in event-bus events. The cart and
checkout blocks push their own view and step events, and `blocks/search/search.js` pushes the
search-modal events.

## Commerce events (`shop*`)

| ACDL event | Trigger | `xdm.eventType` | XDM / data |
|-----------|---------|-----------------|------------|
| `shopProductView` | First `pdp/data` per SKU | `commerce.productViews` | `productListItems[0]`, `data.wkndShop.product` (sku, name, inStock) |
| `shopCartAdd` | `cart/product/added` | `commerce.productListAdds` | items added (`SKU`, qty, `priceTotal`, variant SKU) |
| `shopCartRemove` | `cart/product/removed` | `commerce.productListRemovals` | items removed |
| `shopCartUpdate` | `cart/product/updated` | `commerce.productListUpdates` | items changed |
| `shopCartView` | First non-empty `cart/data` on `/shop/cart`, or each header mini-cart open | `commerce.productListViews` | cart items, `itemCount`; `surface: 'mini-cart'` for the drawer |
| `shopCheckoutStart` | `checkout/initialized` | `commerce.checkouts` | cart items, `cartTotal` |
| `shopCheckoutStep` | First time each step completes | `commerce.checkouts` | `data.wkndShop.checkout.step` (1 email, 2 shipping address + country, 3 shipping method, 4 payment) |
| `shopPurchase` | `order/placed`, pushed on the **confirmation page** | `commerce.purchases` | `commerce.order` (`purchaseID`, `priceTotal`, AUD, payment `wknd_demo_pay`), items, `data.wkndShop.demo=true`, `guest` |
| `shopSearch` | PLP `search/result` | `siteSearch` | `data.wkndShop.search` (phrase, resultCount) |
| `shopRecsImpression` | Recommendation unit rendered | `commerce.recommendations.impressions` | unit (`unitId`, `unitName`, `typeId`), items |
| `shopRecsClick` | Recommended product clicked | `commerce.recommendations.clicks` | `unitId`, target path |
| `shopSignIn` / `shopSignOut` | Successful sign-in / sign-up popup, or Sign out (header, `/account`, checkout) | `web.webinteraction.linkClicks` | `data.wkndShop.auth` (`method`: `signin`/`signup`, `surface`: `header`/`account`/`checkout`) |

`shopPurchase` is queued in `sessionStorage` (`wknd:shop:pendingPurchase`) when the order is
placed. It is pushed once when the confirmation page loads, because checkout redirects
immediately and would otherwise drop the beacon.

## Site search modal (`siteSearch*`)

These use the site's `interaction` ACDL shape (`interaction.label|block|detail`) plus a `search`
object with `source: 'site-search-modal'`.

| ACDL event | Trigger | `search` fields |
|-----------|---------|-----------------|
| `siteSearchOpen` | Modal opened (header pill or ⌘/Ctrl+K) | `phrase` (pre-filled text) |
| `siteSearch` | Results settled for a query | `phrase`, `resultCount` (Content AI pages), `productCount` |
| `siteSearchSummary` | Grounded AI summary shown | `phrase`, `grounded` |
| `siteSearchClick` | Result, product, "See all products" or **Ask WKND Sherpa** clicked | `phrase`, `target`, `resultType` (`page`/`product`/`all-products`/`sherpa`), `position`, `sku` |

## Collection and Analytics mapping

How a shop event reaches Analytics:

1. Code pushes the ACDL event: `xdm` (eventType, `commerce.*`, `productListItems`, and a
   `web.webInteraction` link signal) plus `data.wkndShop` / `data.wkndSearch`.
2. The martech ACDL forwarder (`plugins/martech`, `analytics: true`) sends it with
   `alloy('sendEvent')`. Adobe Commerce storefront-collector events from the drop-ins
   (kebab-case: `product-page-view`, `add-to-cart`, `recs-*` …) are filtered out by
   `shouldProcessDataLayerEvent` in `scripts/martech-config.js`.
3. `onBeforeEventSend` → `mapPageToAnalytics` → `mapShopToAnalytics` sets
   `data.__adobe.analytics`: `linkType=o` and `linkName=<event>` (a link event, never an extra
   page view), plus the shop eVars and events below.
4. The datastream's Analytics service maps the XDM commerce fields to the standard commerce
   variables automatically.

**Launch: no rule is needed.** Do not add a send-event rule for `shop*` or `siteSearch*`. It
would send every hit twice. If one was created from an earlier version of this plan, disable it.

### Standard commerce metrics (automatic from XDM)

| XDM | Analytics |
|---|---|
| `commerce.productViews` | Product Views (`prodView`) |
| `commerce.productListAdds` | Cart Additions (`scAdd`) |
| `commerce.productListRemovals` | Cart Removals (`scRemove`) |
| `commerce.productListViews` | Cart Views (`scView`) |
| `commerce.checkouts` (`shopCheckoutStart`) | Checkouts (`scCheckout`) |
| `commerce.purchases` + `commerce.order.purchaseID` | Orders, with Purchase ID deduplication |
| `productListItems[].SKU` / `quantity` / `priceTotal` | Products, Units, Revenue |

All orders are WKND Demo Pay demo orders in AUD. WKND Aero demo bookings deliberately do not
send `commerce.purchases`, so Orders and Revenue in `ags050wknd` are shop orders only.

### Shop eVars and events (report suite `ags050wknd`)

These are kept clear of the journey slots (eVar30–35 / event30–41).

### Product-first OF1 attribution

The product-comparison block reuses `shopRecsImpression` and `shopRecsClick` with unit
`wknd-of1-products`. Its impression fires once on visibility per block, not on resize.
`data.wkndShop.of1` includes `experience: product`, compared SKUs and clicked paths
where applicable. Supporting adventure links emit `shopOf1AdventureClick` as a normal
link interaction through the existing forwarder. No new report-suite slots are allocated.

The cart drop-in remains the sole source of successful `shopCartAdd` events; the OF1
button does not push a second cart-add event. These events inherit the existing journey
context and analytics-off/consent handling. No full conversation history is collected.

| Slot | Name | Values | Set on | Expiration |
|---|---|---|---|---|
| eVar40 | Shop Recommendation Unit | `wknd-pdp-complete-kit`, `wknd-pdp-more-like-this`, `wknd-cart-addons`, `wknd-trending`, `wknd-of1-gear` | Recs impressions/clicks | Visit |
| eVar41 | Shop Checkout Step | `1-contact`, `2-shipping-address`, `3-delivery`, `4-payment` | Checkout steps | Hit |
| eVar42 | Search Phrase | Lower-cased phrase (≤ 100 chars), shop listing and search modal | Searches | Visit |
| eVar43 | Search Result Type | `page`, `product`, `all-products`, `sherpa` | Search-modal clicks | Hit |
| eVar44 | Shop Customer Type | `guest`, `signed-in` | Every shop hit | Visit |
| eVar45 | Account Action Surface | `header:signin`, `account:signup`, `checkout:signin`, `header:signout` … | Sign-in / sign-up / sign-out | Hit |

| Event | Name | Fires on |
|---|---|---|
| event50 | Recs Impressions | Recommendation unit rendered with products |
| event51 | Recs Clicks | Recommended product clicked |
| event52 | Searches | Shop listing search result, search-modal results |
| event53 | AI Search Summaries | Grounded AI summary shown in the search modal |
| event54 | Sherpa Hand-offs | "Ask WKND Sherpa" from the search modal |
| event55 | Checkout Steps | First completion of each checkout step |
| event56 | Sign-ins | Successful sign-in (including after sign-up) |
| event57 | Account Sign-ups | Sign-in completed from "Create account" |
| event58 | Sign-outs | Sign out chosen |

### Report suite settings

In **Analytics → Admin → Report Suites**, select `ags050wknd` and go to **Edit Settings →
Conversion**.

**Conversion Variables.** Enable eVar40–45 with the names and expirations above:
- Type: **Text String**
- Allocation: **Most Recent (Last)**
- Merchandising: **Disabled**

**Success Events.** Enable event50–58 with the names above:
- Type: **Counter**
- Unique Event Recording: **Always Record**
- Polarity: **Up is good**, except event58

**Leave as they are:**
- **Base currency:** under **General → General Account Settings**. If it isn't AUD, Analytics
  converts the AUD order values, which is expected.
- **Purchase event and Products:** nothing to configure. Purchase IDs come from
  `commerce.order.purchaseID`.

**Datastream** `56dee4fc-21a9-4e37-83ab-bdd874957aba`: keep the Adobe Analytics service routed to
`ags050wknd`. No field mapping or processing rule is needed. If **Products**, **Orders** or
**Revenue** stay empty while the eVars fill, check that the datastream's XDM schema includes
the **Commerce Details** field group (`commerce`, `productListItems`).

## Analysis Workspace: "WKND Shop" project

Build this in **Analysis Workspace** on `ags050wknd`.

### 1. Components (once)

Calculated metrics (**Components → Calculated metrics → Create**):

| Metric | Formula | Format |
|---|---|---|
| Shop Conversion Rate | Orders ÷ Visits (apply the "Shop Visits" segment in the panel) | Percent |
| Average Order Value | Revenue ÷ Orders | Currency |
| Cart-to-Order Rate | Orders ÷ Cart Additions | Percent |
| Checkout Completion | Orders ÷ Checkouts | Percent |
| Recs CTR | Recs Clicks (event51) ÷ Recs Impressions (event50) | Percent |
| Search Click-through | Instances of eVar43 ÷ Searches (event52) | Percent |

Segments (**Components → Segments → Create**):

| Segment | Container and rule |
|---|---|
| Shop Visits | Visit: Page URL contains `/shop` **or** Product Views exists **or** Cart Additions exists |
| Purchasers | Visitor: Orders exists |
| Signed-in Customers | Hit: Shop Customer Type (eVar44) equals `signed-in` |
| Cart Abandoners | Visit: Cart Additions exists **and** Orders does not exist |
| Searchers | Visit: Searches (event52) exists |

### 2. Panels

1. **Shop KPIs** (freeform panel, date range: last 30 days, segment: Shop Visits).
   - Summary Number visualisations for Revenue, Orders, Average Order Value, Shop Conversion
     Rate and Units.
   - A Line chart of Revenue and Orders by Day.
2. **Shop funnel** (Fallout visualisation), with these touchpoints:
   1. Product Views
   2. Cart Additions
   3. Cart Views
   4. Checkouts
   5. Shop Checkout Step = `2-shipping-address`
   6. Shop Checkout Step = `4-payment`
   7. Orders

   Right-click a step and choose **Trend fallthrough** to watch it over time. Break the fallout
   down by Mobile Device Type and Marketing Channel.
3. **Products** (Freeform table).
   - Dimension: Products.
   - Metrics: Product Views, Cart Additions, Cart-to-Order Rate, Orders, Units, Revenue.
   - Sort by Revenue. Add a Product Views vs Revenue scatterplot to find viewed-but-not-bought
     gear.
4. **Recommendations** (Freeform table).
   - Dimension: Shop Recommendation Unit (eVar40).
   - Metrics: Recs Impressions, Recs Clicks, Recs CTR, plus Orders and Revenue (attribution:
     Participation, or Last Touch with a visit lookback).
   - Break down by Products to see which recommended items get clicked.
5. **Search** (Freeform table).
   - Dimension: Search Phrase (eVar42).
   - Metrics: Searches, AI Search Summaries, Orders, Revenue.
   - A second table: Search Result Type (eVar43) with Instances, plus Sherpa Hand-offs (event54)
     as a Summary Number.
   - Filter phrases with high Searches and no Orders to find content gaps.
6. **Accounts and checkout** (Freeform tables).
   - Shop Customer Type (eVar44) with Visits, Orders, Revenue, Average Order Value and Shop
     Conversion Rate, comparing guest and signed-in.
   - Account Action Surface (eVar45) with Sign-ins, Account Sign-ups and Sign-outs.
   - Shop Checkout Step (eVar41) with Checkout Steps (event55).
7. **Abandonment** (segment: Cart Abandoners).
   - Products with Cart Additions.
   - Last Shop Checkout Step reached, using Shop Checkout Step with Checkout Steps (event55).

Save as **WKND Shop**, then share it (or **Curate** it) with the demo audience. The page-level
dimensions (Page, Marketing Channel, Journey ID eVar30) work alongside all of the above.

## Verification

- In the browser console:
  `adobeDataLayer.filter(e => /^(shop|siteSearch)/.test(e.event))`.
- The expected funnel for a guest order is:
  1. `shopProductView`
  2. `shopRecsImpression`
  3. `shopCartAdd`
  4. `shopCartView`
  5. `shopCheckoutStart`
  6. `shopCheckoutStep` ×4
  7. `shopPurchase` (on `/shop/order`)
