# Cart recovery offers (storefront)

Signed-in shoppers whose cart has been inactive for 24 hours to 7 days (and who have not
purchased since) can recover it with a one-time offer: **10% off gear, up to AUD 25**. The
Commerce backend decides everything; the storefront only displays and applies what the backend
returns.

## How it works

1. `blocks/commerce-cart/recovery-offer.js` runs on `/shop/cart` after the cart drop-in loads.
   For signed-in shoppers with items it queries `wkndRecoveryOffer(cart_id)`.
2. When the status is `ELIGIBLE` or `CLAIMED` **and** the offer saves more than the promotion
   already on the cart, a dark "Welcome back" card appears above the order summary
   ("Save $X on this cart"). Both figures (`saving`, `current_saving`) come from the Commerce
   promotion engine, so the shopper is always steered to the highest discount available. Nothing
   renders for guests, empty carts, `INELIGIBLE`/`REDEEMED`/`UNAVAILABLE`, when the current
   promotion saves as much or more, or if the backend does not support the query yet.
3. **Apply this offer** calls `claimWkndRecoveryOffer(cart_id)` (issues the server entitlement),
   then applies the returned code with the cart drop-in's `applyCouponsToCart(..., REPLACE)`, so the
   drop-in refreshes totals. If a (smaller) code is already applied the card says
   "Replaces code X." — codes are never replaced silently.
4. Totals, eligibility and the single redemption per account are enforced by Commerce
   (`wknd.promotions/v1`, see `../wknd-commerce/docs/PROMOTIONS.md`) at both order paths.

No authoring is required; the offer copy is fixed and matches the backend policy.

## Audience Manager and Target

- AAM segments (e.g. **Cart Abandoners**, `27504716`) choose *content* only — for example a
  Target experience on shop pages. They never authorise a discount: a browser segment, cookie or
  Target offer cannot grant the recovery coupon.
- Target content may promote coming back to the cart, but must not promise a discount amount;
  the cart card only appears when Commerce confirms eligibility.

## Analytics

Events go through the existing ACDL → Web SDK path (`pushShopEvent`), with `data.wkndShop.offerStatus`:

| Event | When |
| --- | --- |
| `shopRecoveryOfferView` | Offer card shown (once per cart/code/line state) |
| `shopRecoveryOfferApply` | Offer claimed and applied |
| `shopRecoveryOfferError` | Claim or apply failed (card stays with the reason) |

They are not yet mapped to Analytics eVars/events (`mapShopToAnalytics`); allocate report-suite
slots after checking existing usage (docs/SHOP-ANALYTICS-PLAN.md). No customer identifiers,
entitlements or codes are sent.

## Testing

The backend fields must be deployed (Commerce storefront action + API Mesh). Until then the card
stays hidden. Component behaviour (eligible, claim failure, ineligible, backend error) was
verified headlessly with the GraphQL client and cart API stubbed at the module boundary.

## Email preferences (express consent)

The account page (`blocks/commerce-account/email-preferences.js`) has an **Email preferences**
section with two independent, unticked opt-ins that each save on their own:

| Option | Backend field / mutation | Wording version |
| --- | --- | --- |
| Cart reminders | `wknd_recovery_email_opt_in` / `setWkndRecoveryEmailOptIn` | `recovery-2026-11` |
| WKND news & offers | `wknd_marketing_email_opt_in` / `setWkndMarketingEmailOptIn` | `news-offers-2026-11` |

This follows Australian Spam Act 2003 express-consent practice and APP 5/7: no pre-ticked boxes,
no bundling with sign-in, checkout or T&Cs, the sender and content are named, tailoring to site/app
activity is disclosed, withdrawal is as easy as opting in, and the Privacy Policy is linked.
The backend records every change (wording version, source `WEB`/`IOS`, time) as consent evidence.
**Bump the wording version in `email-preferences.js` whenever the text in `commerce-account.js`
changes.** Options the backend does not support stay hidden. A Brevo unsubscribe withdraws both.

Before production marketing sends: author the `/privacy` page (currently missing) and have the
wording legally reviewed. Sending is described in `../wknd-commerce/docs/PROMOTIONS.md`.
