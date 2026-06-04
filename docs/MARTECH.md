# Martech (Adobe Analytics + Target)

Runtime delivery uses the [aem-martech](https://github.com/adobe-rnd/aem-martech) plugin with phased loading for Core Web Vitals.

## Setup (one-time, Adobe consoles)

1. **AEP datastream** — Web datastream with Adobe Analytics and Adobe Target enabled. Note **datastream ID** and **org ID**.
2. **Launch** — Property with ACDL enabled; Web SDK extension instance name `alloy` (do not embed a second full SDK on the page).
3. **Config** — Edit [`scripts/martech-config.js`](../scripts/martech-config.js) with `datastreamId`, `orgId`, and Launch embed URL(s).
4. **DA Target API** (authoring only) — Sheet `adobe-target` under `/.da` (not in git). See [Send to Adobe Target](https://docs.da.live/administrators/guides/prepare-menu/send-to-adobe-target).
5. **Target activities** — Create activities in Target UI that reference HTML offers exported from Experience Workspace; QA with page metadata **target: on**.

## Authoring (per page)

In page metadata (Universal Editor):

| Field | Values | Effect |
|-------|--------|--------|
| `target` | `on` / `off` | Eager Target personalization when `on` |
| `analytics` | `on` / `off` | Auto page view when `on` (default on if unset) |

Leave `target` off on most pages to protect LCP. Enable only on pages with active Target activities.

## Consent

Web SDK defaults to `pending` consent. Wire a CMP and call `updateUserConsent()` from `scripts/scripts.js` before enabling personalization on production `.aem.live` hosts.

## Validation

- `npm run lint`
- PageSpeed Insights (after code sync):
  - Baseline (no `target` metadata): `https://developers.google.com/speed/pagespeed/insights/?url=https://main--masterclass-demo--znikolovski.aem.page/`
  - Experiment page (`target: on`): test the same URL on a page where metadata enables Target

Martech does not initialize until `scripts/martech-config.js` placeholders are replaced, so baseline PSI should match pre-martech behavior.

For Launch setup, variable mapping, and corrected domain configuration, see [ANALYTICS-LAUNCH-PLAN.md](./ANALYTICS-LAUNCH-PLAN.md).
