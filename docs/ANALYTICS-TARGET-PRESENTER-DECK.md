---
marp: true
theme: default
paginate: true
header: ''
footer: ''
style: |
  /* Adobe corporate deck — see skills/adobe-deck/ */
  :root {
    --adobe-red: #EB1000;
    --adobe-black: #000000;
    --adobe-white: #FFFFFF;
    --adobe-gray-mid: #949494;
    --adobe-gray-dark: #616161;
    --adobe-blue: #3A63F9;
    --adobe-green: #0AA35B;
    --content-left: 72px;
  }

  section {
    font-family: 'Adobe Clean', Arial, Helvetica, sans-serif;
    font-size: 22px;
    font-weight: 400;
    color: var(--adobe-black);
    background: var(--adobe-white);
    padding: 56px 64px 48px var(--content-left);
    line-height: 1.45;
    text-align: left;
  }

  h1, h2, h3, strong.title-emphasis {
    font-family: 'Adobe Clean Display', 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    color: var(--adobe-black);
    letter-spacing: -0.02em;
  }

  h1 { font-size: 1.55em; margin-bottom: 0.35em; line-height: 1.15; }
  h2 { font-size: 1.2em; margin-bottom: 0.4em; }
  h3 { font-size: 1em; margin-bottom: 0.3em; }

  p, li { font-size: 0.95em; max-width: 92%; }
  ul { margin-top: 0.4em; }
  li { margin-bottom: 0.35em; }
  li::marker { color: var(--adobe-gray-mid); }

  code {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.72em;
    background: #f5f5f5;
    padding: 0.08em 0.35em;
    border-radius: 2px;
    color: var(--adobe-black);
  }

  pre {
    font-size: 0.62em;
    background: #f5f5f5;
    border-left: 3px solid var(--adobe-gray-mid);
    padding: 0.6em 0.8em;
    margin: 0.5em 0;
  }

  blockquote {
    font-size: 0.88em;
    border-left: 3px solid var(--adobe-gray-mid);
    margin: 0.6em 0;
    padding: 0.2em 0 0.2em 0.8em;
    color: var(--adobe-gray-dark);
  }

  table {
    font-size: 0.72em;
    border-collapse: collapse;
    width: 100%;
    margin-top: 0.4em;
  }

  th {
    font-family: 'Adobe Clean Display', 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    text-align: left;
    border-bottom: 1.5pt solid var(--adobe-gray-mid);
    padding: 0.45em 0.6em 0.45em 0;
  }

  td {
    text-align: left;
    vertical-align: top;
    border-bottom: 0.5pt solid var(--adobe-gray-mid);
    padding: 0.4em 0.6em 0.4em 0;
  }

  tr:last-child td { border-bottom: none; }

  section::after {
    content: 'Adobe';
    position: absolute;
    right: 48px;
    bottom: 28px;
    font-family: 'Adobe Clean Display', 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    font-size: 14px;
    letter-spacing: 0.04em;
    color: var(--adobe-red);
  }

  section.title::after,
  section.closer::after {
    color: var(--adobe-white);
  }

  section.title,
  section.closer {
    background: var(--adobe-red);
    color: var(--adobe-white);
    padding: 64px 64px 56px 64px;
  }

  section.title h1,
  section.title h2,
  section.title p,
  section.closer h1,
  section.closer p {
    color: var(--adobe-white);
  }

  section.title h1 { font-size: 2em; max-width: 85%; }
  section.title .speaker { font-size: 0.72em; margin-top: 2.2em; opacity: 0.95; }
  section.title .meta { font-size: 0.62em; margin-top: 0.8em; opacity: 0.88; }

  section.divider {
    padding-left: 64px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  section.divider h1 {
    font-size: 1.85em;
    max-width: 80%;
  }

  section.divider .timing {
    font-size: 0.65em;
    color: var(--adobe-gray-dark);
    margin-top: 0.6em;
  }

  section.content::before {
    content: '';
    position: absolute;
    left: 40px;
    top: 88px;
    bottom: 52px;
    width: 4px;
    background: var(--adobe-red);
  }

  section.content h1 { font-size: 1.15em; }

  section.small { font-size: 19px; }
  section.small table { font-size: 0.82em; }

  section.closer {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
  }

  section.closer h1 { font-size: 2.4em; margin-bottom: 0.2em; }
  section.closer .sub { font-size: 0.65em; opacity: 0.9; max-width: 70%; }

  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; align-items: start; }
  .columns-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.9rem; }
  .visual-box {
    background: #f5f5f5;
    border: 1pt solid var(--adobe-gray-mid);
    border-radius: 4px;
    padding: 0.7em 0.8em;
    font-size: 0.78em;
    min-height: 4.5em;
  }
  .visual-box strong {
    display: block;
    font-family: 'Adobe Clean Display', 'Arial Black', Arial, sans-serif;
    margin-bottom: 0.25em;
  }
  .flow-step {
    background: #f5f5f5;
    border-left: 4px solid var(--adobe-gray-dark);
    padding: 0.35em 0.6em;
    margin: 0.25em 0;
    font-size: 0.78em;
  }
  .flow-step.accent { border-left-color: var(--adobe-blue); }
  .stat {
    font-family: 'Adobe Clean Display', 'Arial Black', Arial, sans-serif;
    font-size: 2.4em;
    font-weight: 900;
    line-height: 1;
    margin: 0.1em 0;
  }
  .stat-label { font-size: 0.55em; color: var(--adobe-gray-dark); }

  section.title,
  section.divider,
  section.closer { --marpit-root-font-size: 40px; }
---

<!-- _class: title _paginate: false -->

# Analytics and Target on WKND Adventures

<p class="speaker">Presenter name  |  Role / team</p>
<p class="meta">30-minute walkthrough · AEM Edge Delivery Services · Web SDK · Launch · Analytics · Target</p>

<!--
OPENING (30 sec)
Welcome. Adobe corporate deck styling applied per skills/adobe-deck/.
Demo site: main--masterclass-demo--znikolovski.aem.page
Report suite: ags050wknd (login company adobeae7)
Replace speaker line before presenting.
-->

---

<!-- _class: content _paginate: false -->

# Agenda

| Section | Time |
|---------|------|
| Part 1 · The big picture | 0:00 – 5:00 |
| Part 2 · Site wiring and page load | 5:00 – 10:00 |
| Part 3 · Analytics in the codebase | 10:00 – 17:00 |
| Part 4 · Launch configuration | 17:00 – 22:00 |
| Part 5 · Analytics admin and audiences | 22:00 – 25:00 |
| Part 6 · Adobe Target end-to-end | 25:00 – 30:00 |

<div class="columns" style="margin-top: 1em;">

<div class="visual-box"><strong>Preview site</strong>main--masterclass-demo--znikolovski.aem.page</div>
<div class="visual-box"><strong>Have ready</strong>One page with Target = On and a targetlocation section</div>

</div>

<!--
Before presenting: open Debugger, Launch, Analytics, Target, and martech-config.js in tabs.
-->

---

<!-- _class: divider _paginate: false -->

# Part 1  |  The big picture

<p class="timing">0:00 – 5:00</p>

---

<!-- _class: content -->

# One Web SDK  |  Three Adobe products

<div class="columns">

<div>

| Layer | Role |
|-------|------|
| Datastream | Routes hits to Analytics + Target |
| Martech + code | Load alloy, consent, phased load |
| Launch | ACDL rules → Analytics variables |
| Blocks | Push interaction events |
| Target offers | HTML from authoring export |
| Segments | Audience archetypes for Target |

</div>

<div class="visual-box">

**Key rule**

One Web SDK instance: **alloy**

Code sends the **first page view**

Launch loads **~3 seconds later**

Target is **opt-in per page**

</div>

</div>

<!--
SAY: Never embed a second Web SDK from Launch. See docs/ANALYTICS-LAUNCH-PLAN.md.
-->

---

<!-- _class: content -->

# Architecture  |  End-to-end flow

<div class="flow-step accent">Authoring → Send to Adobe Target → HTML offers</div>
<div class="flow-step">Target activity → selector + audience → Web SDK decisions</div>
<div class="flow-step accent">Martech eager → [data-targetlocation] zones → target-delivery.js</div>
<div class="flow-step">Page load → ACDL page → onBeforeEventSend → first page view</div>
<div class="flow-step accent">~3s later → Launch → interaction rules → link clicks</div>

<p style="font-size:0.75em;color:#616161;margin-top:0.8em;">Deep dive: docs/TARGET-PERSONALIZATION-PLAN.md · docs/ANALYTICS-LAUNCH-PLAN.md</p>

---

<!-- _class: content small -->

# What lives where  |  Responsibility split

| Code | Launch | Analytics admin | Target |
|------|--------|-----------------|--------|
| Datastream IDs | Interaction mapping | Variable labels | Activities |
| First page view | Data elements | Segments Tier 2–4 | HTML offers |
| ACDL + block events | Rule libraries | Workspace | Audiences |
| Target zone decoration | Supplemental pageView | Event enablement | Traffic allocation |
| launchUrls embed | | | |

---

<!-- _class: divider _paginate: false -->

# Part 2  |  Site wiring and page load

<p class="timing">5:00 – 10:00</p>

---

<!-- _class: content -->

# Configuration  |  martech-config.js

<div class="columns">

<div>

| Setting | Value |
|---------|-------|
| Datastream | `56dee4fc-…` |
| Org ID | `28260E2056581D3B7F000101@AdobeOrg` |
| Staging Launch | `.aem.page` + localhost |
| Production Launch | `.aem.live` |
| First-hit mapping | `onBeforeEventSend` |

</div>

<div>

```js
onBeforeEventSend: (content) =>
  mapPageToAnalytics(content),
```

<p style="font-size:0.8em;">Preview → staging embed<br/>Live → production embed</p>

</div>

</div>

<!--
SHOW martech-config.js in IDE. First page view vars mapped before Launch exists.
-->

---

<!-- _class: content -->

# Author metadata  |  Universal Editor

<div class="columns">

<div>

**Page fields** · `component-models.json`

| Field | Maps to |
|-------|---------|
| analytics | Auto page view |
| target | Eager personalization |
| adventureCategory | eVar4 |
| journeyStage | prop3 |

</div>

<div>

**Section field**

| Field | Effect |
|-------|--------|
| targetlocation | data-targetlocation zone |

<div class="visual-box" style="margin-top:0.6em;"><strong>Docs</strong>docs/MARTECH.md</div>

</div>

</div>

---

<!-- _class: content -->

# Page load  |  Three phases

<div class="columns-3">

<div class="visual-box"><strong>Eager</strong>LCP path<br/>Target if target: on<br/>scheduleEagerTargetDelivery()</div>
<div class="visual-box"><strong>Lazy</strong>loadMartech()<br/>ACDL page push<br/>martechLazy() = page view</div>
<div class="visual-box"><strong>Delayed</strong>~3 seconds<br/>martechDelayed() = Launch<br/>initAssetAnalytics()</div>

</div>

<p style="font-size:0.78em;margin-top:0.7em;"><strong>Critical:</strong> Launch rules do not run on the first page view. Interaction rules need ≥5 seconds after load.</p>

---

<!-- _class: content -->

# Demo  |  Browser console

<div class="columns">

<div>

After preview load (wait ~5s):

```js
adobeDataLayer.getState('page')
typeof _satellite !== 'undefined'
```

</div>

<div class="visual-box">

**Performance**

head.html preconnects to edge.adobedc.net

Target zones hidden until target-ready class applied in target-delivery.js

</div>

</div>

---

<!-- _class: divider _paginate: false -->

# Part 3  |  Analytics in the codebase

<p class="timing">10:00 – 17:00</p>

---

<!-- _class: content -->

# Page context  |  analytics-page.js

<div class="columns">

<div>

Pushed **before** `martechLazy()` via `pushAnalyticsPageContext()`.

```js
adobeDataLayer.push({ page: {
  pageName, template, theme,
  contentType, environment,
  siteSection, adventureCategory,
  journeyStage, targetEnabled,
}});
```

404: `pushErrorPageContext()` → pageError

</div>

<div class="visual-box">

**Environment**

preview · live · local

via prop1 on every hit

</div>

</div>

---

<!-- _class: content small -->

# Variable map  |  Report suite ags050wknd

| Slot | Source | Example |
|------|--------|---------|
| eVar5 | page.template | blog-article |
| eVar3 | page.contentType | homepage |
| eVar4 | page.adventureCategory | climbing |
| eVar1 | ?cid= | Campaign ID |
| prop1 | page.environment | preview |
| prop3 | page.journeyStage | inspiration |
| prop4 | page.siteSection | blog |
| prop5 | interaction hits | Block detail |
| prop9 | targetEnabled | target-on |

Mapping: `mapPageToAnalytics()` ← `onBeforeEventSend`

---

<!-- _class: content -->

# Interactions  |  ACDL pattern

<div class="columns">

<div>

**File:** `scripts/analytics-acdl.js`

```js
adobeDataLayer.push({
  event: 'ctaClick',
  interaction: { label, block, detail },
});
```

Launch: event → Update variable → Send event

Global CTAs: `bindCtaAnalytics()` in scripts.js

</div>

<div class="flow-step accent">Block fires ACDL event</div>
<div class="flow-step">Launch rule listens (~3s+)</div>
<div class="flow-step accent">EDS - Analytics Variable</div>
<div class="flow-step">Real-Time event counter</div>

</div>

---

<!-- _class: content small -->

# Blocks  |  Events and Launch rules

| Block | ACDL event | Analytics |
|-------|------------|-----------|
| CTA | ctaClick | event1 |
| Carousel | carouselChange | event2 |
| FAQ | faqExpand | event5 |
| Tabs / map | tabSelect / mapPinClick | event6 |
| YouTube | videoStart / complete | event3 / event4 |
| Quiz | quizStart … complete | event17–21 |
| Forms | formImpression … | event9–15 |
| Images | assetImpression / click | event7 / event8 |

---

<!-- _class: content -->

# Demo  |  FAQ expand

<div class="columns">

<div>

1. Open page with accordion-faq
2. Expand one item
3. Console: `getState('interaction')`
4. Debugger → **EDS - FAQ Expand**

```js
pushInteractionEvent('faqExpand', {
  block: 'accordion-faq', label,
});
```

</div>

<div class="visual-box">

**Validate**

Rule fires after Launch loads

prop5 = accordion-faq

event5 in Real-Time

</div>

</div>

---

<!-- _class: content -->

# Specialized funnels  |  Plan docs

| Feature | Code | Events |
|---------|------|--------|
| Quiz | quiz-analytics.js | event17–21, eVar2, eVar8 |
| Forms | form-analytics.js | event9–15, eVar7 |
| Assets | asset-analytics.js | event7–8, eVar6 |

> Quiz result category → **eVar2 on quiz hits only** — not page eVar4.

---

<!-- _class: divider _paginate: false -->

# Part 4  |  Launch configuration

<p class="timing">17:00 – 22:00</p>

---

<!-- _class: content -->

# Launch property  |  Tags setup

<div class="columns">

<div>

| Setting | Value |
|---------|-------|
| Property | masterclass-demo-eds |
| Domains | aem.page, aem.live |
| Embed | martech-config.js |

**ACDL extension**

Name adobeDataLayer · do not inject

**Web SDK extension**

Self-hosted alloy · Migrate Target off

</div>

<div class="visual-box">

**Console path**

Experience Platform → Data Collection → Tags

</div>

</div>

---

<!-- _class: content -->

# Data elements  |  Two-layer model

<div class="columns">

<div>

**Layer 1 — ACDL sources**

Storage duration: **Page view**

| Element | Path |
|---------|------|
| EDS - Page Template | page.template |
| EDS - Adventure Category | page.adventureCategory |
| EDS - Interaction Label | interaction.label |

⚠️ Storage None = top audit failure

</div>

<div>

**Layer 2 — Variable container**

**EDS - Analytics Variable**

Web SDK → Variable → Data + Analytics

Used by every Update variable → Send event rule

</div>

</div>

---

<!-- _class: content -->

# Interaction rules  |  Skeleton

<div class="columns-3">

<div class="visual-box"><strong>1 · Event</strong>Core Click or ACDL listen<br/>ctaClick, faqExpand, …</div>
<div class="visual-box"><strong>2 · Update variable</strong>Select EDS - Analytics Variable<br/>Set events, linkName, prop5</div>
<div class="visual-box"><strong>3 · Send event</strong>Link click<br/>Data = Analytics Variable</div>

</div>

<p style="font-size:0.78em;margin-top:0.7em;">Skip page view on DOM Ready — martech already sends it. Recipes: ANALYTICS-LAUNCH-PLAN.md §4d</p>

---

<!-- _class: content -->

# Live example  |  EDS - FAQ Expand

| Step | Value |
|------|-------|
| Event | ACDL listen · faqExpand |
| Update variable | events = event5 · prop5 = accordion-faq |
| Send event | Link click · Analytics Variable |
| Publish | Development → preview QA → Production |

**Runbook:** docs/ANALYTICS-LAUNCH-RUNBOOK.md

---

<!-- _class: content -->

# Validate Launch  |  QA checklist

<div class="columns">

<div>

1. Preview — wait ≥ 5 seconds
2. Debugger → staging launch script
3. Trigger interaction once
4. Rules tab — correct order
5. Real-Time — event increments

</div>

<div class="visual-box">

**Common fixes**

Literal %EDS - …% → use getVar or getState

Rule never fires → wait 5s, check embed

Empty props → Page view storage

</div>

</div>

---

<!-- _class: divider _paginate: false -->

# Part 5  |  Analytics admin and audiences

<p class="timing">22:00 – 25:00</p>

---

<!-- _class: content -->

# Report suite  |  ags050wknd labels

| Slot | Admin label |
|------|-------------|
| eVar4 | Adventure category |
| prop3 | Journey stage |
| event1 | CTA Click |
| event2 | Carousel Interaction |
| event17–21 | Quiz funnel |
| eVar2 | Quiz Result Category |
| eVar8 | Quiz Adventurer Type |

Full inventory: ANALYTICS-LAUNCH-PLAN.md Phase 3

---

<!-- _class: content -->

# Segments  |  Built for personalization

<div class="columns-3">

<div class="visual-box"><strong>Tier 1</strong>Data hygiene<br/>EDS - Live Traffic</div>
<div class="visual-box"><strong>Tier 2</strong>Adventure interest<br/>WKND - Climbing Seekers</div>
<div class="visual-box"><strong>Tier 3</strong>Journey stage<br/>WKND - Planners and Prep</div>

</div>

<p style="font-size:0.82em;margin-top:0.7em;"><strong>Tier 4 archetypes → Target:</strong> WKND - Aspiring Climber = Climbing Seekers AND (Inspiration OR Discovery)</p>

<p style="font-size:0.75em;color:#616161;">Workspace: WKND — Adventure Audiences</p>

---

<!-- _class: content -->

# Demo  |  Analysis Workspace

<div class="columns">

<div>

1. Workspace on **ags050wknd**
2. Panel filter **EDS - Live Traffic**
3. Tier 2 segments as columns
4. Rows: Visits
5. Optional: eVar4 × prop3 table

</div>

<div class="visual-box">

**Bridge to Target**

Export Tier 4 segments as Target audiences for hero tests

</div>

</div>

---

<!-- _class: divider _paginate: false -->

# Part 6  |  Adobe Target end-to-end

<p class="timing">25:00 – 30:00</p>

---

<!-- _class: content -->

# Offers  |  Authoring to Target

<div class="flow-step accent">Fragment variants in Experience Workspace</div>
<div class="flow-step">Library → Send to Adobe Target</div>
<div class="flow-step accent">Immutable HTML offer in Target</div>
<div class="flow-step">Referenced by activity experience</div>

<p style="font-size:0.78em;margin-top:0.6em;">CLI: <code>npm run target:send -- --path /fragments/hero-climbing</code></p>

> Offers are undecorated HTML — site re-decorates after injection.

---

<!-- _class: content -->

# Target zones  |  Page setup

<div class="columns">

<div>

1. Section as direct child of main
2. Section metadata → targetlocation
3. Page metadata → Target On

**Code:** applySectionMetadata() → data-targetlocation + class target

</div>

<div>

```bash
curl -s '…aem.page/…' \
  | grep targetlocation
```

<div class="visual-box" style="margin-top:0.5em;"><strong>Turn off</strong>Target metadata when activity ends</div>

</div>

</div>

---

<!-- _class: content -->

# Target activity  |  Console setup

| Setting | Value |
|---------|-------|
| Type | A/B Test or Experience Targeting |
| Location | [data-targetlocation="wknd-marquee"] |
| Experiences | Control + variant HTML offers |
| Audience | e.g. WKND - Aspiring Climber |
| QA | ?at_preview_token=… |

**Admin:** Disable auto global mbox · Datastream includes Target

---

<!-- _class: content -->

# Runtime  |  target-delivery.js

<div class="columns">

<div>

| Function | Role |
|----------|------|
| buildTargetApplyMetadata | Mbox → CSS selector |
| decorateTargetInjections | decorateBlock + loadBlock |
| initTargetDelivery | MutationObserver |
| refreshTargetZones | Re-decorate after lazy load |

Eager: scheduleEagerTargetDelivery()

</div>

<div class="visual-box">

**Analytics QA**

prop9 = target-on

ACDL targetZoneReady

scripts/target-analytics.js

</div>

</div>

---

<!-- _class: content -->

# Target QA  |  Before go-live

- Section has data-targetlocation and class target
- Page metadata Target = On
- Injected blocks styled and interactive
- Target reporting shows impressions
- PageSpeed ≥ 90 on experiment URL
- Turn Target Off when activity ends

**Agent workflow:** skills/adobe-target-personalization/SKILL.md

---

<!-- _class: content small -->

# Summary  |  Who owns what

| Code | Launch | Analytics | Target |
|------|--------|-----------|--------|
| Datastream + first page view | Interaction mapping | Labels + segments | Activities + offers |
| ACDL + block events | Data elements + rules | Workspace | Audiences + traffic |
| Target zones + decoration | Libraries | Tier 4 archetypes | HTML from EW |

**Docs:** MARTECH.md · ANALYTICS-LAUNCH-PLAN.md · ANALYTICS-LAUNCH-RUNBOOK.md · TARGET-PERSONALIZATION-PLAN.md

---

<!-- _class: closer _paginate: false -->

# Thank you

<p class="sub">Preview: main--masterclass-demo--znikolovski.aem.page<br/>Optional: node tools/scripts/test-analytics-acdl.mjs</p>

<!--
CLOSING — skill requires red Adobe wordmark closer as final slide.
Questions? Take them now.

PowerPoint (Adobe-branded): npm run deck:analytics-target
→ docs/ANALYTICS-TARGET-PRESENTER-DECK.pptx

Marp PDF: npx @marp-team/marp-cli docs/ANALYTICS-TARGET-PRESENTER-DECK.md --pdf
-->
