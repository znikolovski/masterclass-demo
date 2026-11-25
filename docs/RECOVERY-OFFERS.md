# Cart recovery offers (storefront)

Signed-in shoppers whose cart has been inactive for the configured recovery window (and who have not
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
   promotion saves as much or more, or when its code is already applied.
   A failed offer check is reported separately with **Retry offer check**; it is not treated as
   ineligibility and does not prevent the standard cart from working. Retrying only reads the
   backend offer; it does not claim an entitlement or apply a coupon.
3. **Apply this offer** calls `claimWkndRecoveryOffer(cart_id)` (issues the server entitlement),
   then applies the returned code with the cart drop-in's `applyCouponsToCart(..., REPLACE)`, so the
   drop-in refreshes totals. If a (smaller) code is already applied the card says
   "Replaces code X." — codes are never replaced silently.
4. Totals, eligibility and the single redemption per account are enforced by Commerce
   (`wknd.promotions/v1`, see `../wknd-commerce/docs/PROMOTIONS.md`) at both order paths.

No authoring is required; the offer copy is fixed and matches the backend policy.

### Reproducing the offer in the LLM app

The current demo recovery window starts after **55 minutes** without cart activity and ends
after seven days. Adding a product, changing quantities or changing coupons starts a new
inactivity period; an entitlement from an earlier period cannot authorize the new period.
Reading the cart does not restart this clock.

Sign in as the same shopper, leave a nonempty cart unchanged for at least 55 minutes, then ask
the app to show the cart (`get_shop_cart`). Adding a product first makes the cart active again,
so no recovery offer is expected. The app still hides offers that are already redeemed, already
applied or no better than the current promotion. No timestamps need to be changed for a demo.

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
| `shopRecoveryOfferError` | Offer check, claim or apply failed (card stays with a retry or reason) |

They are not yet mapped to Analytics eVars/events (`mapShopToAnalytics`); allocate report-suite
slots after checking existing usage (docs/SHOP-ANALYTICS-PLAN.md). No customer identifiers,
entitlements or codes are sent.

## Testing

The backend fields must be deployed (Commerce storefront action + API Mesh).
Run `node --test tools/tests/cart-recovery-offer.test.mjs` for browser regressions covering a
failed check followed by a same-cart retry, stale replies after an empty cart or sign-out, and
ineligible or inferior offers. The GraphQL client and authentication predicate are stubbed at
the module boundary; these tests do not sign in a customer, issue entitlements or call Commerce.
Eligible offers remain backend-decided. An email link does not bypass sign-in, inactivity,
purchase, redemption or best-discount checks.

## Email preferences (express consent)

The account page (`blocks/commerce-account/email-preferences.js`) has an **Email preferences**
section with two independent, unticked opt-ins that each save on their own:

| Option | Backend field / mutation | Wording version |
| --- | --- | --- |
| Cart reminders | `wknd_recovery_email_opt_in` / `setWkndRecoveryEmailOptIn` | `recovery-2026-11-23` |
| WKND news & offers | `wknd_marketing_email_opt_in` / `setWkndMarketingEmailOptIn` | `news-offers-2026-11` |

This follows Australian Spam Act 2003 express-consent practice and APP 5/7: no pre-ticked boxes,
no bundling with sign-in, checkout or T&Cs, the sender and content are named, tailoring to site/app
activity is disclosed, withdrawal is as easy as opting in, and the Privacy Policy is linked.
The backend records every change (wording version, source `WEB`/`IOS`, time) as consent evidence.
**Bump the wording version in `email-preferences.js` whenever the text in `commerce-account.js`
changes.** Options the backend does not support stay hidden. A Brevo unsubscribe withdraws both.

Reminder frequency is at most one per configured period of inactivity, not one per
cart for its lifetime. Further activity on the same cart starts a new period. The offer remains
a separate one-time redemption per account/campaign; another reminder does not grant another use.

The published `/privacy` redirects to `/privacy-and-terms`, which describes the separate email
preferences, unsubscribe-all behavior, sender and providers, and demonstration store.
Sending is described in `../wknd-commerce/docs/PROMOTIONS.md`.
