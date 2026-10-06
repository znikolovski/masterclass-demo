# Martech (Adobe Analytics + Target)

Runtime delivery uses the [aem-martech](https://github.com/adobe-rnd/aem-martech) plugin with phased loading for Core Web Vitals.

## Setup (one-time, Adobe consoles)

1. **AEP datastream** — Web datastream with Adobe Analytics and Adobe Target enabled. Note **datastream ID** and **org ID**.
2. **Launch** — Property with ACDL enabled; Web SDK extension instance name `alloy` (do not embed a second full SDK on the page).
3. **Config** — Edit [`scripts/martech-config.js`](../scripts/martech-config.js) with `datastreamId`, `orgId`, and Launch embed URL(s).
4. **DA Target API** (authoring only) — Sheet `adobe-target` under `/.da` (not in git). See [Send to Adobe Target](https://docs.da.live/administrators/guides/prepare-menu/send-to-adobe-target).
5. **Target activities** — Create activities in Target UI (or Claude + Target MCP) that reference HTML offers exported from Experience Workspace; QA with page metadata **target: on**. See [TARGET-PERSONALIZATION-PLAN.md](./TARGET-PERSONALIZATION-PLAN.md).

## Authoring (per page)

In page metadata (Universal Editor):

| Field | Values | Effect |
|-------|--------|--------|
| `target` | `on` / `off` | Eager Target personalization when `on` |
| `analytics` | `on` / `off` | Auto page view when `on` (default on if unset) |

Leave `target` off on most pages to protect LCP. Enable only on pages with active Target activities.

## Consent

Web SDK defaults to `pending` consent. Wire a CMP and call `updateUserConsent()` from `scripts/scripts.js` before enabling personalization on production `.aem.live` hosts.

## Demo traffic (Analytics)

Daily simulated traffic can run via GitHub Actions (`.github/workflows/daily-traffic-simulation.yaml`, 06:00 UTC) or locally:

```bash
npm run simulate:traffic:daily
```

Each run fetches `query-index.json` from production first so new pages are included, then drives ~10k page hits with clustered virtual visitors (returning ECIDs via `tools/scripts/output/visitor-pool`).

After each page load the simulator also:

- Scrolls the page to trigger **asset impressions** and clicks a sample of images (`event7` / `event8` when Launch rules exist)
- Walks **form funnels** on pages with forms (`/adventures`, fragments, etc.): impression → start → field steps → submit, validation error, or abandon (`event9`–`event15`)

**Before running:** confirm AEM Code Sync has deployed the latest `main` (form + asset analytics JS) and that Launch rules from [FORM-ANALYTICS-PLAN.md](./FORM-ANALYTICS-PLAN.md) and [ASSET-ANALYTICS-PLAN.md](./ASSET-ANALYTICS-PLAN.md) are published — otherwise hits are page views only.

Quick validation (no browser):

```bash
npm run simulate:traffic:dry -- --hits=10
```

Page-views only (skip engagement):

```bash
node tools/scripts/simulate-live-audience-traffic.mjs --skip-engagement --hits=100
```

## Validation

- `npm run lint`
- PageSpeed Insights (after code sync):
  - Baseline (no `target` metadata): `https://developers.google.com/speed/pagespeed/insights/?url=https://main--masterclass-demo--znikolovski.aem.page/`
  - Experiment page (`target: on`): test the same URL on a page where metadata enables Target

Martech does not initialize until `scripts/martech-config.js` placeholders are replaced, so baseline PSI should match pre-martech behavior.

For Launch setup, variable mapping, and corrected domain configuration, see [ANALYTICS-LAUNCH-PLAN.md](./ANALYTICS-LAUNCH-PLAN.md).

## WKND Sherpa (Brand Concierge)

Every site sharing this code gets a small **WKND Sherpa** launcher in the bottom-right
corner. It is installed in the delayed page-loading phase, alongside footer loading,
but does not depend on a footer fragment being available. Library previews and Universal
Editor hosts omit it. No new authored block or metadata is required.

Clicking the launcher opens an accessible modal panel and loads Adobe's hosted Brand
Concierge client on demand. Escape, the close button, or clicking outside the panel closes
it; reopening preserves the mounted conversation for the current page.

### Links that prefill a question

Authors can use an ordinary link or CTA with this destination:

```text
#sherpa?prompt=Help%20me%20plan%20a%20weekend%20hike
```

It opens Sherpa and fills the message input without submitting anything. The visitor
can edit the question and press Send. To open Sherpa **and send the question automatically**,
explicitly add `send=true`:

```text
#sherpa?prompt=Help%20me%20plan%20a%20weekend%20hike&send=true
```

Only the exact value `true` enables automatic sending; omitting it or using `send=false`
keeps the prefill-only behavior. Auto-send uses the client's normal Send action, preserves
the conversation, and does not send again when the launcher reopens the panel. Clicking
an auto-send question link again intentionally sends a new question. Opening or reloading
a shareable URL with `send=true` also sends its question, so label these links accordingly.
If the Send action is unavailable, an explicit message is shown and the question remains
in the input for manual sending. In authored HTML, escape the separator as `&amp;send=true`.

Use `encodeURIComponent(question)` when generating
links in code, so punctuation such as `&`, `#` and `+` remains part of the question.
A full page URL such as `/adventures#sherpa?prompt=What%20should%20I%20pack%3F`
also opens and prefills Sherpa after navigation. `#sherpa` opens without changing the draft.

Question links replace the current unsent draft, but do not reset the conversation.
Clicking the same link again still works after closing the panel. Modified clicks,
downloads and links targeting another tab retain normal browser behavior. Loading
failures retain the question for retry; an unavailable input or overlong question
displays an explicit message rather than silently losing or truncating the question.
Questions in URLs are visible in browser history and shareable links; do not put
sensitive or personal information in them.

### Implementation

- [`scripts/concierge.js`](../scripts/concierge.js) owns the launcher and modal.
- [`tools/concierge/index.html`](../tools/concierge/index.html) and
  [`scripts/concierge-frame.js`](../scripts/concierge-frame.js) host the client in a
  same-origin iframe, isolated from the parent page's SDK and Launch.
- [`scripts/concierge-config.js`](../scripts/concierge-config.js) contains the WKND UI
  export, with Sherpa naming, the approved `/privacy-and-terms` links, and compact-panel
  typography, contrast and touch-target adjustments. Controls use WKND's dark green
  (`#0f1a14`) with orange (`#e8651a`) accents rather than the export's purple. The launcher
  matches the site's pill CTA styling and offset orange shadow. Headings and button text
  use Syncopate, with Instrument Sans for conversational text; the frame loads the same
  font families as the website. Update this module when exporting
  a new configuration; do not include secrets.
- [`styles/concierge.css`](../styles/concierge.css) scopes panel and launcher styling;
  [`styles/concierge-frame.css`](../styles/concierge-frame.css) includes the supplied
  `contain`/no-repeat card-image override inside the isolated client document.

The frame uses Web SDK **2.35.0**, with IDs from `martech-config.js` and
`conversation.region: 'aus5'` for the WKND sandbox. This supported SDK configuration
routes conversations to `https://edge.adobedc.net/brand-concierge/aus5/conversations`;
upgrading the SDK alone does not select the sandbox region automatically.
Isolation is necessary: the Launch library replaces the page's `alloy` with a custom
SDK build that does not include `sendConversationEvent`. Loading another SDK or
configuring `alloy` again in the parent page would break analytics/personalization.
The frame has no site page-loading scripts, Launch embed or extra empty `sendEvent`,
so it does not generate a duplicate analytics page view.

The frame defaults to **pending** consent and shares the same-origin Adobe consent
cookie with the website; it does not grant consent or change the site's consent policy.
Production debugging is off, third-party cookies and ID migration are disabled, and
no personalization prehiding style is added. The supplied `stickySession: false` is
passed through to bootstrap, but the current client ignores it. The supported SDK
setting `conversation.stickyConversationSession: false` implements a new session on
page navigation, while close/reopen retains the current frame and conversation.

To check locally, open `/` and `/adventures`, launch Sherpa, send a question, close/reopen
the panel, and check narrow/mobile layouts. A blocked client script displays an explicit
unavailable message and a retry button; loading times out after 30 seconds. The live Adobe
datastream must have Brand Concierge enabled for conversation responses, and its allowed
web surfaces must cover each deployment host (including `/tools/concierge/index.html`);
UI bootstrap alone does not validate backend delivery.

Run deterministic browser checks with `node tools/scripts/test-concierge.mjs`. These
stub Adobe's network scripts to cover SDK isolation, responsive bounds, keyboard/focus
behavior, repeated initialization, blocked scripts, retry and timeout; they do not
claim that the Adobe backend is configured.

**Regional delivery verified October 6, 2026:** SDK 2.35.0 with `conversation.region:
'aus5'` returned HTTP 200 and a completed streamed answer to a weekend-adventure question,
including follow-up suggestions. The previous `BRANDCON-0002-400` / `Concierge not found`
error came from the unregionalized endpoint. The tested web surface was
`web://localhost:3000/tools/concierge/index.html`. One earlier question returned the
agent's temporary-unavailable message, so HTTP 200 alone is not proof of a useful answer.
The successful answer referred to the brand as "Adobe Production Demo - AGS050"; review
the Concierge's server-side brand instructions if it should consistently say WKND.
