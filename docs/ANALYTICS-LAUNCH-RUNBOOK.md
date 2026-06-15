# WKND Analytics — Launch remediation runbook

Operational guide for fixing the June 2026 tagging audit on report suite **`ags050wknd`** (login company **`adobeae7`**). Use this document in Adobe Tags / Launch; site code changes are already in the repo.

**Related docs:** [ANALYTICS-LAUNCH-PLAN.md](./ANALYTICS-LAUNCH-PLAN.md) · [QUIZ-ANALYTICS-PLAN.md](./QUIZ-ANALYTICS-PLAN.md) · [ASSET-ANALYTICS-PLAN.md](./ASSET-ANALYTICS-PLAN.md) · [FORM-ANALYTICS-PLAN.md](./FORM-ANALYTICS-PLAN.md)

| Environment | URL |
|-------------|-----|
| Preview (staging Launch) | https://main--masterclass-demo--znikolovski.aem.page |
| Live (production Launch) | https://main--masterclass-demo--znikolovski.aem.live |
| Report suite | `ags050wknd` |
| Launch embed | [`scripts/martech-config.js`](../scripts/martech-config.js) `launchUrls` |

---

## Root causes (stacked)

1. **Data element storage scope (primary)** — ACDL computed-state elements (e.g. `EDS - Interaction Detail`) set to **None** instead of **Page view**, so values are not available when the ACDL rule fires in the same turn. Symptom: empty props/eVars or, in some hits, the raw `%EDS - …%` token appearing in Analytics.
2. **Rule / event mismatch** — Interaction, quiz, asset, and form events pushed by site code require **ACDL event listeners**, not Core Click. Wrong event type = rule never fires or wrong data element context.
3. **Code / content gaps** — quiz redirect race, placeholder pages, segment bugs (code fixes shipped in repo).

Page-level variables that already work (`prop1`, `prop3`, `prop4`, `eVar3`, `eVar4`, `eVar5`) are mapped in code via [`scripts/analytics-page.js`](../scripts/analytics-page.js) → `onBeforeEventSend` in [`scripts/martech-config.js`](../scripts/martech-config.js). Supplemental Launch rules correctly use **`%EDS - …%`** in **Update variable → Provide individual attributes** — keep that pattern where it already works.

---

## Work order

1. Analytics Admin (events, eVar expiration)
2. Fix all ACDL data elements (**Page view** storage)
3. Verify interaction / quiz / asset / form rules (ACDL event type + `%EDS - …%` mappings or Custom Code)
4. Publish **Development** → QA on preview → publish **Production**
5. Content cleanup (unpublish placeholders)
6. Post-fix QA

---

## Part 0 — Analytics Admin

**Adobe Analytics → Admin → Report suites → ags050wknd → Edit settings**

| Setting | Action |
|---------|--------|
| **Success events 18–21** | Enable and label: Quiz Step Complete (18), Quiz Complete (19), Quiz Result View (20), Quiz Experience Click (21) |
| **eVar2** | Label **Quiz Result Category** · expiration **Visit** |
| **eVar8** | Label **Quiz Adventurer Type** · expiration **Visit** |
| **prop10 / prop11** | Label **Quiz Step** / **Quiz Step Index** |
| **Pages Not Found** | Note which prop/eVar is mapped (for 404 rule below) |

---

## Part 1 — Fix all data elements

**Data Collection → Tags → [EDS property] → Data Elements**

For **every** row below:

- **Extension:** Adobe Client Data Layer
- **Type:** Data Layer Computed State
- **Storage duration:** **Page view** (not **None**)

| Data element | ACDL path |
|--------------|-----------|
| `EDS - Interaction Label` | `interaction.label` |
| `EDS - Interaction Block` | `interaction.block` |
| `EDS - Interaction Detail` | `interaction.detail` |
| `EDS - Asset ID` | `asset.assetId` |
| `EDS - Asset URL` | `asset.assetUrl` |
| `EDS - Asset Source` | `asset.assetSource` |
| `EDS - Form Slug` | `form.formSlug` |
| `EDS - Form Step` | `form.step` |
| `EDS - Form Step Index` | `form.stepIndex` |
| `EDS - Form Error Field` | `form.errorField` |
| `EDS - Quiz Id` | `quiz.quizId` |
| `EDS - Quiz Step` | `quiz.step` |
| `EDS - Quiz Step Index` | `quiz.stepIndex` |
| `EDS - Quiz Result Category` | `quiz.resultCategory` |
| `EDS - Quiz Adventurer Type` | `quiz.adventurerType` |
| `EDS - Theme` | `page.theme` |

Confirm **`EDS - Analytics Variable`** exists (Web SDK → **Variable** type, storage **Page view**). See [ANALYTICS-LAUNCH-PLAN.md §4](./ANALYTICS-LAUNCH-PLAN.md).

**New data element — CID:**

| Data element | Extension | Type | Setting | Storage |
|--------------|-----------|------|---------|---------|
| `EDS - CID` | Core | Query String Parameter | Parameter name: `cid` | **Visit** |

---

## Part 2 — Rule pattern (every interaction rule)

Each rule uses **two actions in this order**:

1. **Update variable** (Web SDK) · Data element = **`EDS - Analytics Variable`**
2. **Send event** (Web SDK) · Type = **Link click** · Data object = **`EDS - Analytics Variable`**

### Mapping variables — two supported patterns

**Option A — UI field mappings (keep using this where it already works)**

In **Update variable → Provide individual attributes**, map Analytics fields to data elements with the standard Launch token syntax:

| Analytics field | Example value |
|-----------------|---------------|
| `events` | `event17` (literal) |
| `eVar6` | `%EDS - Asset ID%` |
| `prop5` | `%EDS - Interaction Detail%` |
| `prop10` | `%EDS - Quiz Step%` |

This is the same approach as page-attribute rules in [ANALYTICS-LAUNCH-PLAN.md §4b](./ANALYTICS-LAUNCH-PLAN.md) and Core Click recipes (CTA, outbound, download). **Do not rip out working `%EDS - …%` mappings** — fix **Page view** storage on the underlying data elements first.

**Option B — Custom Code**

Many rules also use `%EDS - …%` inside **Custom Code** (e.g. `s.linkName = '%EDS - Click Text (fallback)%'`). Launch substitutes these before the code runs. If the **Debugger** or Real-Time still shows the literal string `%EDS - Interaction Block%` in the outbound hit after storage is fixed, use an explicit read instead:

```js
s.prop5 = typeof _satellite !== 'undefined'
  ? (_satellite.getVar('EDS - Interaction Detail') || '')
  : '';
```

Or read ACDL state directly on code-pushed events:

```js
const interaction = window.adobeDataLayer?.getState?.('interaction') || {};
const quiz = window.adobeDataLayer?.getState?.('quiz') || {};
const asset = window.adobeDataLayer?.getState?.('asset') || {};
const form = window.adobeDataLayer?.getState?.('form') || {};
const page = window.adobeDataLayer?.getState?.('page') || {};
```

The Custom Code blocks in Parts 3–8 below are **equivalent explicit forms** for ACDL rules. Use them for new rules or when Option A still sends placeholders after storage is corrected.

**Timing:** Launch loads in the **delayed** phase (~3 s after load). Wait ≥ 5 s before testing rules in Debugger.

---

## Part 3 — Quiz rules (event17–21)

Event = **Adobe Client Data Layer → Listen to specific event → Scope All**.

**UI mapping (preferred if rules already exist):** map `events`, `eVar2`, `eVar8`, `prop10`, `prop11`, `linkName` to the quiz data elements (`%EDS - Quiz Step%`, `%EDS - Quiz Result Category%`, etc.) after Part 1 storage fix.

**Custom Code alternative** (same slots):

### `EDS - Quiz Start` → `quizStart` → event17

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const quiz = window.adobeDataLayer?.getState?.('quiz') || {};
s.events = 'event17';
s.linkName = quiz.quizId || '';
s.linkType = 'o';
```

### `EDS - Quiz Step Complete` → `quizStepComplete` → event18

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const quiz = window.adobeDataLayer?.getState?.('quiz') || {};
s.events = 'event18';
s.prop10 = quiz.step || '';
s.prop11 = quiz.stepIndex != null ? String(quiz.stepIndex) : '';
s.linkName = quiz.quizId || '';
s.linkType = 'o';
```

### `EDS - Quiz Complete` → `quizComplete` → event19

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const quiz = window.adobeDataLayer?.getState?.('quiz') || {};
s.events = 'event19';
s.eVar2 = quiz.resultCategory || '';
s.linkName = quiz.resultCategory || '';
s.linkType = 'o';
```

### `EDS - Quiz Result View` → `quizResultView` → event20

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const quiz = window.adobeDataLayer?.getState?.('quiz') || {};
s.events = 'event20';
s.eVar2 = quiz.resultCategory || '';
s.eVar8 = quiz.adventurerType || '';
s.linkName = quiz.adventurerType || '';
s.linkType = 'o';
```

### `EDS - Quiz Experience Click` → `quizExperienceClick` → event21

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const quiz = window.adobeDataLayer?.getState?.('quiz') || {};
s.events = 'event21';
s.eVar2 = quiz.resultCategory || '';
s.eVar8 = quiz.adventurerType || '';
s.linkName = quiz.adventurerType || '';
s.linkType = 'o';
```

| Rule name | ACDL event | `s.events` | UI / Custom Code extras |
|-----------|------------|------------|-------------------------|
| `EDS - Quiz Start` | `quizStart` | `event17` | `linkName` ← `%EDS - Quiz Id%` |
| `EDS - Quiz Step Complete` | `quizStepComplete` | `event18` | `prop10`, `prop11` |
| `EDS - Quiz Complete` | `quizComplete` | `event19` | `eVar2` |
| `EDS - Quiz Result View` | `quizResultView` | `event20` | `eVar2`, `eVar8` |
| `EDS - Quiz Experience Click` | `quizExperienceClick` | `event21` | `eVar2`, `eVar8` |

**Validate:** https://main--masterclass-demo--znikolovski.aem.page/find-your-adventure/results — complete quiz → Debugger shows event17 → event18 (×4) → event19 → event20.

---

## Part 4 — CTA rule (event1)

**Preferred** (after `ctaClick` code is deployed): ACDL rule **`EDS - CTA Click (ACDL)`**

Or keep **Core Click** with `%EDS - Click Text (fallback)%` in Custom Code — that pattern already works on many WKND rules.

| Event | `ctaClick` (ACDL extension) |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const interaction = window.adobeDataLayer?.getState?.('interaction') || {};
s.events = 'event1';
s.linkName = interaction.label || '';
s.linkType = 'o';
s.prop5 = interaction.label || interaction.detail || 'cta';
```

**Fallback** (Core Click) — CSS selector:

```
main a.button, main a.button-ghost, main .button-container a, main .hero-adventure a, main .quiz-results-cta a
```

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event1';
s.linkName = '%EDS - Click Text (fallback)%';
s.linkType = 'o';
s.prop5 = '%EDS - Click Text (fallback)%';
```

Disable **one** of Core Click vs ACDL when both fire to avoid double hits.

| Rule type | `prop5` source | Storage |
|-----------|----------------|---------|
| Carousel / FAQ / tabs (ACDL) | `%EDS - Interaction Detail%` or `%EDS - Interaction Block%` | Page view |
| CTA (Core Click) | `%EDS - Click Text (fallback)%` | Page view |
| CTA (ACDL `ctaClick`) | `interaction.label` | Page view |
| Quiz step | `quiz.step` | Page view |

---

## Part 5 — Interaction rules (carousel, FAQ, tabs)

Use **ACDL event listeners** (site code pushes `carouselChange`, `faqExpand`, `tabSelect`). Map in UI with `%EDS - Interaction Label%`, `%EDS - Interaction Detail%`, `%EDS - Interaction Block%` after Part 1 storage fix.

Custom Code equivalent:

| Rule | ACDL event | `s.events` |
|------|------------|------------|
| `EDS - Carousel Change` | `carouselChange` | `event2` |
| `EDS - FAQ Expand` | `faqExpand` | `event5` |
| `EDS - Tab Select` | `tabSelect` | `event6` |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const interaction = window.adobeDataLayer?.getState?.('interaction') || {};
s.events = 'event2'; // change per rule
s.linkName = interaction.label || '';
s.linkType = 'o';
s.prop5 = interaction.detail || interaction.block || '';
```

---

## Part 6 — Asset rules (event7–8)

Map in UI: `eVar6` ← `%EDS - Asset ID%`, `prop6` ← `%EDS - Asset URL%`, `prop7` ← `%EDS - Asset Source%` (after Part 1 storage fix).

Custom Code equivalent:

| Rule | ACDL event | `s.events` |
|------|------------|------------|
| `EDS - Asset Impression` | `assetImpression` | `event7` |
| `EDS - Asset Click` | `assetClick` | `event8` |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const asset = window.adobeDataLayer?.getState?.('asset') || {};
s.events = 'event7'; // event8 for click
s.eVar6 = asset.assetId || '';
s.prop6 = asset.assetUrl || '';
s.prop7 = asset.assetSource || '';
s.linkName = asset.assetId || '';
s.linkType = 'o';
```

---

## Part 7 — Form rules (event9–15)

Map in UI: `eVar7` ← `%EDS - Form Slug%`, `prop8` ← `%EDS - Form Step%` (validation errors: `%EDS - Form Error Field%`).

Custom Code equivalent:

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const form = window.adobeDataLayer?.getState?.('form') || {};
s.events = 'event11'; // event9 … event15 per rule
s.eVar7 = form.formSlug || '';
s.prop8 = form.step || form.errorField || '';
s.linkName = form.formSlug || '';
s.linkType = 'o';
```

| Rule | ACDL event | `s.events` |
|------|------------|------------|
| Form Impression | `formImpression` | `event9` |
| Form Start | `formStart` | `event10` |
| Form Step Complete | `formStepComplete` | `event11` |
| Form Submit Attempt | `formSubmitAttempt` | `event12` |
| Form Submit Success | `formSubmitSuccess` | `event13` |
| Form Validation Error | `formValidationError` | `event14` |
| Form Submit Error | `formSubmitError` | `event15` |

---

## Part 8 — 404 rule

**Event:** ACDL `pageError` (site pushes `page.pageType: 'error'` and `page.errorUrl` from [`scripts/analytics-page.js`](../scripts/analytics-page.js)).

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const page = window.adobeDataLayer?.getState?.('page') || {};
// Map to your admin-configured Pages Not Found dimension:
s.prop12 = page.errorUrl || ''; // adjust slot to match admin
s.linkName = page.errorUrl || '404';
s.linkType = 'o';
```

**Validate:** https://main--masterclass-demo--znikolovski.aem.page/this-does-not-exist

---

## Part 9 — CID (`eVar1`)

Code already maps `?cid=` on first page view via `onBeforeEventSend`. For supplemental hits after Launch loads:

- Data element **`EDS - CID`** (Core → Query String Parameter → `cid`, storage **Visit**)
- On page-view rule: `s.eVar1 = _satellite.getVar('EDS - CID') || ''`

**Validate:** `https://main--masterclass-demo--znikolovski.aem.page/?cid=test-campaign`

---

## Part 10 — Publish workflow

1. **Save** all data elements and rules.
2. **Publishing → Add library** (Development).
3. **Publish to Development** — serves `*.aem.page`.
4. Open **Experience Cloud Debugger** on preview; wait **≥ 5 s** after load.
5. Run [QA checklist](#part-12--qa-checklist).
6. **Publish to Production** — serves `*.aem.live`.
7. Re-test one interaction on live.

---

## Part 11 — Content cleanup (unpublish placeholders)

Unpublish from **live** (requires **publish** or **admin** role).

**Site editor:** https://da.live/edit#/znikolovski/masterclass-demo/

| Page | DA edit link | Live URL | Why unpublish |
|------|--------------|----------|---------------|
| Placeholder blog | [Edit](https://da.live/edit#/znikolovski/masterclass-demo/blog/food-safari-melbourne) | [Live](https://main--masterclass-demo--znikolovski.aem.live/blog/food-safari-melbourne) | "Article Title Goes Here" |
| Test blog | [Edit](https://da.live/edit#/znikolovski/masterclass-demo/blog/test) | [Live](https://main--masterclass-demo--znikolovski.aem.live/blog/test) | "Article Title — WKND Adventures" |
| Blog template preview | [Edit](https://da.live/edit#/znikolovski/masterclass-demo/templates/blog-article/blog-article) | [Live](https://main--masterclass-demo--znikolovski.aem.live/templates/blog-article/blog-article) | Library preview in production |
| Adventure interest form | [Edit](https://da.live/edit#/znikolovski/masterclass-demo/forms/wknd-adventure-interest) | [Live](https://main--masterclass-demo--znikolovski.aem.live/forms/wknd-adventure-interest) | Test form |
| Adventure interest fragment | [Edit](https://da.live/edit#/znikolovski/masterclass-demo/fragments/wknd-adventure-interest) | [Live](https://main--masterclass-demo--znikolovski.aem.live/fragments/wknd-adventure-interest) | Test fragment |

**Keep published** (real content):

- [Find Your Adventure quiz](https://da.live/edit#/znikolovski/masterclass-demo/find-your-adventure) — publish from `drafts/find-your-adventure.plain.html` if not yet in DA
- [Quiz results](https://da.live/edit#/znikolovski/masterclass-demo/find-your-adventure/results)

### Unpublish in DA

1. Open the **DA edit link**.
2. **Publish** panel → **Unpublish from Live**.
3. Confirm live URL returns 404.

### API alternative

```bash
curl -X DELETE \
  -H "Authorization: Bearer $IMS_TOKEN" \
  "https://admin.hlx.page/live/znikolovski/masterclass-demo/main/blog/test"
```

### Theme metadata

```bash
npx github:adobe-rnd/da-auth-helper token
node tools/scripts/patch-analytics-metadata.mjs --preview
```

Skips paths not in DA (e.g. `/find-your-adventure` until published).

---

## Part 12 — QA checklist

| Test | Where | Pass criteria |
|------|-------|---------------|
| Quiz funnel | `/find-your-adventure/results` | event17 → event18 (×4) → event19 → event20; eVar2 + eVar8 populated |
| CTA | Homepage hero | event1; prop5 ≠ `%EDS - …%` |
| Carousel | Homepage | event2; prop5 = `slide-N` |
| Asset | Scroll image into view | eVar6 = real path |
| Form | Adventure interest form | prop8 changes per field |
| CID | `?cid=test-campaign` | eVar1 persists visit |
| 404 | Broken URL | `page.errorUrl` in hit |
| Segments | Workspace | `WKND - Quiz Completer` > 0; `WKND - Direct Loyal Audience` > 0 for repeat visits |

**Repo smoke test:** `node tools/scripts/test-analytics-acdl.mjs`

Filter exec reports with segment **EDS - Live Traffic** (`prop1 = live`).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “No variable type data elements” on Update variable | Select **`EDS - Analytics Variable`** in the top dropdown of the action |
| Rule never fires | Wait ≥ 5 s after load; confirm library published to **Development**; check embed in `martech-config.js` |
| `%EDS - …%` appears literally in Debugger / Real-Time hits | Fix **Page view** storage on the data element first. If still broken, switch that field to `_satellite.getVar()` or `getState()` |
| ACDL data element empty when rule fires | Set **Storage duration** to **Page view** on computed-state elements |
| `prop5` shows `%EDS - Interaction Block%` | Usually **None** storage on `EDS - Interaction Detail` / `Block` / `Label` — fix storage before changing mapping approach |
| Quiz complete (event19) missing | Confirm ACDL quiz rules; site code awaits flush before redirect |
| Double hits on one click | Only one CTA rule (Core Click **or** ACDL `ctaClick`) |
| `eVar1` empty | Add `EDS - CID` data element; map on supplemental rule |

---

## Ownership

| Layer | Owner | Artifacts |
|-------|-------|-----------|
| Adobe Launch / Tags | Martech admin | Rules, data elements, library publish |
| Report suite admin | Analytics admin | Event17–21 labels, eVar expiration |
| EDS code | Dev | Quiz beacon, 404 ACDL, `ctaClick`, segment JSON |
| Content | Authors | Unpublish placeholders, `theme` metadata |

**Working foundation:** `prop1`, `prop3`, `prop4`, `eVar3`, `eVar4`, `eVar5` — filter with **EDS - Live Traffic**.
