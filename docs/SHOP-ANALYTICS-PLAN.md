# WKND Adventures Shop — Analytics plan

The shop pushes commerce events to the Adobe Client Data Layer (ACDL). Launch maps them to
Web SDK `sendEvent` calls. Events use XDM commerce field groups (`commerce.*`,
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
| `shopSignIn` / `shopSignOut` | Auth state change (`authenticated`) | `web.webinteraction.linkClicks` | — |

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

## Launch / Analytics mapping (to configure)

- **Send-event rule.** Add one Launch rule on ACDL events matching `^shop` and `^siteSearch`.
  It sends XDM from the event (`xdm`) merged with `data`.
- **Standard metrics.** The Web SDK commerce field groups map automatically to Analytics `prodView`,
  `scAdd`, `scRemove`, `scView`, `scCheckout` and `purchase`, with `purchaseID` serialisation.
- **Suggested eVars and events** (keep these clear of the journey slots eVar30–35 / event30–41):
  - eVar40: recommendation `unitId`
  - eVar41: checkout step
  - eVar42: site-search phrase
  - eVar43: search `resultType`
  - event50: recs impressions
  - event51: recs clicks
  - event52: site searches
  - event53: AI summary shown
  - event54: Sherpa hand-off
- **Demo orders.** Segment them out with `data.wkndShop.demo = true`. All orders are WKND Demo Pay,
  and no revenue is real.

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
