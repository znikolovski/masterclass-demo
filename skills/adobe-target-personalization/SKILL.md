---
name: adobe-target-personalization
description: >-
  End-to-end Adobe Target personalization for AEM Edge Delivery Services using
  fragment HTML offers, martech delivery, and Target MCP. Use when creating or
  updating Target activities, audiences, experiences, QA preview links, or
  wiring EDS Target zones to exported offers. Complements ew-send-to-adobe-target
  (authoring export only).
license: Apache-2.0
metadata:
  version: "1.0.0"
  environment: cursor-claude
---

# Adobe Target personalization (Claude + Target MCP)

Orchestrate **delivery and experimentation** on WKND Adventures EDS. Authors export offers from Experience Workspace; you use **Target MCP** for activities, audiences, and QA.

## Runtime constraints

| Available | Not available |
|-----------|----------------|
| Target MCP (activities, offers, audiences) | EW Library UI (coach author separately) |
| Repo: `scripts/target-delivery.js`, martech | Pasting secrets from `/.da/adobe-target` |
| `npm run target:send` (CLI export) | Enabling `target: on` on every page |
| Git / PR for code fixes | Replacing Web SDK with at.js |

**Site:** org `znikolovski`, site `masterclass-demo`  
**Preview:** `https://main--masterclass-demo--znikolovski.aem.page`  
**Plan:** [docs/TARGET-PERSONALIZATION-PLAN.md](../../../docs/TARGET-PERSONALIZATION-PLAN.md)

## Architecture (short)

1. Fragments → **Send to Adobe Target** → immutable HTML offers
2. Page section: **Target location** metadata → `data-targetlocation` (e.g. `wknd-marquee`)
3. Page metadata: **Adobe Target = On** (opt-in, eager martech)
4. Target activity: CSS selector `[data-targetlocation="…"]`, assign offers to experiences
5. EDS re-decorates injected HTML via `target-delivery.js`

## When to use

- "Create an A/B test on the homepage hero"
- "Set up Experience Targeting for climbing visitors"
- "Which offers do we have in Target?"
- "Generate preview URL for activity X"
- "Map Analytics segment to Target audience"

## Prerequisites (verify first)

```
- [ ] Offers exported from EW (or npm run target:send) — HTML, not fragment URLs
- [ ] Page section has data-targetlocation (via section metadata targetlocation)
- [ ] Page metadata target=on for test pages only
- [ ] Datastream + Launch configured (martech-config.js)
- [ ] Target property: page-load mbox disabled if using explicit zones
```

## MCP workflow

### 1. Discover offers

Use Target MCP to list/search offers. Match names to DA exports, e.g.:

- `WKND Hero — Default`
- `WKND Hero — Climbing`
- `Columns Featured`

If offer missing → tell author to export via EW skill `ew-send-to-adobe-target` before creating activity.

### 2. Confirm delivery selector

Read page structure or ask author for **Target location** (`data-targetlocation` value).

| Section metadata | DOM |
|------------------|-----|
| targetlocation: `wknd-marquee` | `[data-targetlocation="wknd-marquee"]` or `.marquee-ticker-container[data-targetlocation="wknd-marquee"]` |

### 3. Create / update activity

Via Target MCP (names vary by MCP version):

1. **Type:** A/B Test, XT, or Recommendations (if applicable)
2. **Location:** CSS selector from step 2
3. **Default experience:** control offer (default fragment export)
4. **Variant experiences:** variant offers
5. **Audience:** Analytics-exported or Target rule (e.g. `adventureCategory=climbing` via mbox param / audience library)
6. **Traffic:** start low on preview QA, then production

Document: activity name, id, experiences, audience, selector.

### 4. QA

1. Confirm page URL has `target: on` in metadata (curl `.plain.html` or preview).
2. Provide Target preview link (`at_preview_token` / activity preview from MCP).
3. Verify in browser: zone has class `target`, correct offer HTML, blocks decorated.
4. Optional: `prop9=target-on` in Analytics for segment QA.

### 5. Performance gate

Before full traffic:

- PageSpeed Insights on experiment URL
- Compare vs same page with `target` off
- If LCP regresses: lighter offers, fewer zones, or narrower audience

### 6. Handoff

Return summary:

```markdown
## Activity: <name>
- ID: <id>
- URL: <page path>
- Selector: [data-targetlocation="<location>"]
- Offers: control + variants
- Audience: <name>
- Preview: <link>
- Author actions: Target On on page, publish content, activate in Target
```

## CLI — export offers (when author is not in EW)

```bash
npm run target:send -- --path /fragments/hero-climbing --name "WKND Hero — Climbing"
```

Requires `.hlx/.da-token.json` and `/.da/adobe-target` credentials.

## Audiences (WKND)

Prefer Analytics Tier 4 archetypes from [docs/ANALYTICS-LAUNCH-PLAN.md](../../../docs/ANALYTICS-LAUNCH-PLAN.md):

- Aspiring Climber → hero climbing variant
- Trekking planner → trekking hero / CTA
- Combine with Tier 2 adventure interest segments

## Security

- Never log or commit Target API secrets
- Offers are immutable in Target — update via DA export
- Keep `target: on` off unless an activity is live

## EW boundary

If user is in **Experience Workspace** only → use skill `ew-send-to-adobe-target`; do not call MCP. Say: "Export the fragment in Library, then switch to Claude for activity setup."

## Out of scope

- SPA view-based Target (unless user explicitly uses multi-view app)
- at.js / mbox.js migration (project uses Web SDK martech)
- Editing offer HTML inside Target UI
