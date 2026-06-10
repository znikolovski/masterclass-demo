# Quiz analytics — find-your-adventure

Measurement for the WKND adventure quiz on report suite `ags050wknd`. Quiz interactions use **dedicated variables** — they do not overwrite page-level `adventureCategory` (eVar4) or `journeyStage` (prop3).

Code: [`scripts/quiz-analytics.js`](../scripts/quiz-analytics.js) · wired in [`blocks/adventure-quiz/adventure-quiz.js`](../blocks/adventure-quiz/adventure-quiz.js) and [`blocks/quiz-results/quiz-results.js`](../blocks/quiz-results/quiz-results.js).

See also [ANALYTICS-LAUNCH-PLAN.md](./ANALYTICS-LAUNCH-PLAN.md) and [FORM-ANALYTICS-PLAN.md](./FORM-ANALYTICS-PLAN.md).

---

## Page context (unchanged on quiz hits)

| Variable | Source on quiz pages | Value |
|----------|----------------------|-------|
| **eVar4** | `page.adventureCategory` (UE metadata) | `general-outdoor` |
| **prop3** | `page.journeyStage` (UE metadata) | `discovery` |

Quiz outcome category is **not** written to eVar4. Use **eVar2** on quiz interaction hits only.

---

## Events

| ACDL event | Admin event | Trigger |
|------------|-------------|---------|
| `quizStart` | event16 — Quiz Start | First question rendered |
| `quizStepComplete` | event17 — Quiz Step Complete | User advances after selecting an answer |
| `quizComplete` | event18 — Quiz Complete | Redirect to results |
| `quizResultView` | event19 — Quiz Result View | Results block decorated |
| `quizExperienceClick` | event20 — Quiz Experience Click | Experience card link clicked |

---

## Variables (quiz hits only)

| Slot | Name | ACDL path | Example |
|------|------|-----------|---------|
| **eVar2** | Quiz Result Category | `quiz.resultCategory` | `climbing` |
| **eVar6** | Quiz Adventurer Type | `quiz.adventurerType` | `Summit Seeker` |
| **prop6** | Quiz Step | `quiz.step` | `q2` |
| **prop7** | Quiz Step Index | `quiz.stepIndex` | `2` |

**Slot sharing:** eVar6, prop6, and prop7 are also used by [ASSET-ANALYTICS-PLAN.md](./ASSET-ANALYTICS-PLAN.md) on asset hits. Quiz and asset events never fire on the same hit — Launch maps each ACDL event to the correct semantics. Admin labels can read **Quiz … / Asset …** per slot.

---

## Report suite admin (`ags050wknd`)

**Admin → Report suites → Edit settings** (requires Analytics Admin — see [ANALYTICS-LAUNCH-PLAN.md §Phase 0](./ANALYTICS-LAUNCH-PLAN.md#phase-0--report-suite-admin)):

| Slot | Admin label | Notes |
|------|-------------|-------|
| **event16** | Quiz Start | First question |
| **event17** | Quiz Step Complete | Per-question advance |
| **event18** | Quiz Complete | Scored + redirect |
| **event19** | Quiz Result View | Results page |
| **event20** | Quiz Experience Click | Experience card CTA |
| **eVar2** | Quiz Result Category | Retire “Internal Search Terms” label |
| **eVar6** | Quiz Adventurer Type | Shares slot with Asset ID on asset hits |
| **prop6** | Quiz Step | Shares slot with Asset URL on asset hits |
| **prop7** | Quiz Step Index | Shares slot with Asset Source on asset hits |

Data collection works before labels are renamed — use `event16`–`event20` in Real-Time until Admin access is granted.

**Prerequisite for event-based segments:** On `ags050wknd`, custom events **17–20 must be enabled** in **Admin → Report suites → Edit settings → Success events** before Workspace segments that reference `event18`–`event20` can be saved. Events 1–16 are already allocated; event16 (Quiz Start) segments work today. After enabling 17–20, run `npm run analytics:segments:publish` or use Analytics MCP `upsertSegment` with the exported JSON in `tools/scripts/output/wknd-segments/`.

---

## Launch — ACDL data elements

Extension: **Adobe Client Data Layer** · Type: **Data Layer Computed State** · Storage: **Page view**

| Data element | ACDL path |
|--------------|-----------|
| `EDS - Quiz Id` | `quiz.quizId` |
| `EDS - Quiz Step` | `quiz.step` |
| `EDS - Quiz Step Index` | `quiz.stepIndex` |
| `EDS - Quiz Result Category` | `quiz.resultCategory` |
| `EDS - Quiz Adventurer Type` | `quiz.adventurerType` |

Verify in the browser console after starting the quiz:

```js
adobeDataLayer.getState('quiz');
```

---

## Launch rules (one per event)

Use the same pattern as [FORM-ANALYTICS-PLAN.md](./FORM-ANALYTICS-PLAN.md):

1. **Event** — ACDL extension · **Listen to specific event** · event name from table below · Scope **All**
2. **Action 1 — Update variable** (Web SDK) · Data element **`EDS - Analytics Variable`** · Custom Code (per rule)
3. **Action 2 — Send event** — Type **Link click** · Data object **`EDS - Analytics Variable`**

### Rule: `EDS - Quiz Start`

| Field | Value |
|-------|-------|
| ACDL event | `quizStart` |
| `s.events` | `event16` |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event16';
s.linkName = '%EDS - Quiz Id%';
s.linkType = 'o';
```

### Rule: `EDS - Quiz Step Complete`

| Field | Value |
|-------|-------|
| ACDL event | `quizStepComplete` |
| `s.events` | `event17` |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event17';
s.prop6 = '%EDS - Quiz Step%';
s.prop7 = '%EDS - Quiz Step Index%';
s.linkName = '%EDS - Quiz Id%';
s.linkType = 'o';
```

### Rule: `EDS - Quiz Complete`

| Field | Value |
|-------|-------|
| ACDL event | `quizComplete` |
| `s.events` | `event18` |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event18';
s.eVar2 = '%EDS - Quiz Result Category%';
s.linkName = '%EDS - Quiz Result Category%';
s.linkType = 'o';
```

### Rule: `EDS - Quiz Result View`

| Field | Value |
|-------|-------|
| ACDL event | `quizResultView` |
| `s.events` | `event19` |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event19';
s.eVar2 = '%EDS - Quiz Result Category%';
s.eVar6 = '%EDS - Quiz Adventurer Type%';
s.linkName = '%EDS - Quiz Adventurer Type%';
s.linkType = 'o';
```

### Rule: `EDS - Quiz Experience Click`

| Field | Value |
|-------|-------|
| ACDL event | `quizExperienceClick` |
| `s.events` | `event20` |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event20';
s.eVar2 = '%EDS - Quiz Result Category%';
s.eVar6 = '%EDS - Quiz Adventurer Type%';
s.linkName = '%EDS - Quiz Adventurer Type%';
s.linkType = 'o';
```

| Rule name | Event name | `s.events` | Custom code extras |
|-----------|------------|------------|-------------------|
| `EDS - Quiz Start` | `quizStart` | `event16` | — |
| `EDS - Quiz Step Complete` | `quizStepComplete` | `event17` | `s.prop6`, `s.prop7` |
| `EDS - Quiz Complete` | `quizComplete` | `event18` | `s.eVar2` |
| `EDS - Quiz Result View` | `quizResultView` | `event19` | `s.eVar2`, `s.eVar6` |
| `EDS - Quiz Experience Click` | `quizExperienceClick` | `event20` | `s.eVar2`, `s.eVar6` |

After creating rules, **Publish** the Launch library (Development for `*.aem.page`, Production for `*.aem.live`). Embed URLs are in [`scripts/martech-config.js`](../scripts/martech-config.js).

---

## Workspace segments

Published on `ags050wknd` via [`tools/scripts/lib/wknd-analytics-segments.mjs`](../tools/scripts/lib/wknd-analytics-segments.mjs) (`npm run analytics:segments:publish`).

**Live today (no event17–20 admin required):**

| Segment | Definition | Status |
|---------|------------|--------|
| **WKND - Quiz Starter** | event16 exists in visit | Created on `ags050wknd` |
| **WKND - Quiz Page Visitor** | Page contains `/find-your-adventure` (excludes results) | Created on `ags050wknd` |
| **WKND - Quiz Results Visitor** | Page contains `/find-your-adventure/results` | Created on `ags050wknd` |

**After Admin enables events 17–20 + Launch publish:**

| Segment | Definition |
|---------|------------|
| **WKND - Quiz Starter** | event16 exists in visit |
| **WKND - Quiz Completer** | event18 exists in visit |
| **WKND - Quiz Result: Climbing** | event18 AND eVar2 = `climbing` |
| **WKND - Quiz Result: Trekking** | event18 AND eVar2 = `trekking` |
| **WKND - Quiz Result: Water** | event18 AND eVar2 = `water` |
| **WKND - Quiz Result: Cycling** | event18 AND eVar2 = `cycling` |
| **WKND - Quiz Result: Winter & Alpine** | event18 AND eVar2 = `winter-alpine` |
| **WKND - Quiz Result: Desert** | event18 AND eVar2 = `desert` |
| **WKND - Quiz Result: Photography** | event18 AND eVar2 = `photography` |
| **WKND - Quiz Result: General Outdoor** | event18 AND eVar2 = `general-outdoor` |

### Quiz funnel fallout

**Fallout visualization** (filter with **EDS - Live Traffic**):

| Touchpoint | Definition |
|------------|------------|
| 1 | Custom event **Quiz Start** (event16) |
| 2 | Custom event **Quiz Step Complete** (event17) — any step |
| 3 | Custom event **Quiz Complete** (event18) |
| 4 | Custom event **Quiz Result View** (event19) |

**Step drop-off:** Freeform table · Rows = **Quiz Step** (`prop6`) · Metric = **Quiz Step Complete** (event17).

**Conversion rate:** `Quiz Complete` (event18) / `Quiz Start` (event16), broken down by **Quiz Result Category** (`eVar2`).

---

## Validation

### ACDL (local or preview)

```javascript
// After completing quiz on preview
adobeDataLayer.getState('quiz');
// Expect quiz.resultCategory on quizComplete / quizResultView events
// page.adventureCategory should remain general-outdoor on page views
```

### Real-Time (after Launch publish)

1. Open `https://main--masterclass-demo--znikolovski.aem.page/drafts/find-your-adventure` (or published `/find-your-adventure`)
2. **Analytics → Real-Time** → add custom event counters for event16–event20
3. Complete the quiz → confirm event16 → event17 (per step) → event18 → event19 on results
4. Click an experience card → event20

### Checklist

- [ ] Admin: label event16–event20, eVar2, eVar6, prop6, prop7 on `ags050wknd`
- [ ] Launch: create 5 data elements + 5 rules above
- [ ] Publish Launch library (staging + production)
- [ ] Workspace segments created (script or MCP)
- [ ] QA: Real-Time custom events increment on preview
- [ ] Workspace: build Quiz Fallout panel per table above
