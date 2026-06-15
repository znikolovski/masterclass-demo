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
| `quizStart` | event17 — Quiz Start | First question rendered |
| `quizStepComplete` | event18 — Quiz Step Complete | User advances after selecting an answer |
| `quizComplete` | event19 — Quiz Complete | Redirect to results |
| `quizResultView` | event20 — Quiz Result View | Results block decorated |
| `quizExperienceClick` | event21 — Quiz Experience Click | Experience card link clicked |

---

## Variables (quiz hits only)

| Slot | Name | ACDL path | Example |
|------|------|-----------|---------|
| **eVar2** | Quiz Result Category | `quiz.resultCategory` | `climbing` |
| **eVar8** | Quiz Adventurer Type | `quiz.adventurerType` | `Summit Seeker` |
| **prop10** | Quiz Step | `quiz.step` | `q2` |
| **prop11** | Quiz Step Index | `quiz.stepIndex` | `2` |

**Slot allocation:** Quiz uses dedicated slots (eVar8, prop10, prop11) separate from [ASSET-ANALYTICS-PLAN.md](./ASSET-ANALYTICS-PLAN.md) (eVar6, prop6, prop7). No cross-plan slot sharing on quiz hits.

---

## Report suite admin (`ags050wknd`)

**Admin → Report suites → Edit settings** (requires Analytics Admin — see [ANALYTICS-LAUNCH-PLAN.md §Phase 0](./ANALYTICS-LAUNCH-PLAN.md#phase-0--report-suite-admin)):

| Slot | Admin label | Notes |
|------|-------------|-------|
| **event17** | Quiz Start | First question |
| **event18** | Quiz Step Complete | Per-question advance |
| **event19** | Quiz Complete | Scored + redirect |
| **event20** | Quiz Result View | Results page |
| **event21** | Quiz Experience Click | Experience card CTA |
| **eVar2** | Quiz Result Category | Retire “Internal Search Terms” label |
| **eVar8** | Quiz Adventurer Type | Dedicated quiz slot |
| **prop10** | Quiz Step | Dedicated quiz slot |
| **prop11** | Quiz Step Index | Dedicated quiz slot |

Data collection works before labels are renamed — use `event17`–`event21` in Real-Time until Admin access is granted.

**Prerequisite for event-based segments:** On `ags050wknd`, custom events **18–21 must be enabled** in **Admin → Report suites → Edit settings → Success events** before Workspace segments that reference `event19`–`event21` can be saved. Events 1–17 are already allocated; event17 (Quiz Start) segments work today. After enabling 18–21, run `npm run analytics:segments:publish` or use Analytics MCP `upsertSegment` with the exported JSON in `tools/scripts/output/wknd-segments/`.

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

**Custom code:** Web SDK does **not** resolve `%EDS - …%` tokens in Custom Code. Read ACDL state on each rule (storage duration **Page view** on all quiz data elements):

```js
const quiz = window.adobeDataLayer?.getState?.('quiz') || {};
```

### Rule: `EDS - Quiz Start`

| Field | Value |
|-------|-------|
| ACDL event | `quizStart` |
| `s.events` | `event17` |

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const quiz = window.adobeDataLayer?.getState?.('quiz') || {};
s.events = 'event17';
s.linkName = quiz.quizId || '';
s.linkType = 'o';
```

### Rule: `EDS - Quiz Step Complete`

| Field | Value |
|-------|-------|
| ACDL event | `quizStepComplete` |
| `s.events` | `event18` |

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

### Rule: `EDS - Quiz Complete`

| Field | Value |
|-------|-------|
| ACDL event | `quizComplete` |
| `s.events` | `event19` |

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

### Rule: `EDS - Quiz Result View`

| Field | Value |
|-------|-------|
| ACDL event | `quizResultView` |
| `s.events` | `event20` |

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

### Rule: `EDS - Quiz Experience Click`

| Field | Value |
|-------|-------|
| ACDL event | `quizExperienceClick` |
| `s.events` | `event21` |

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

| Rule name | Event name | `s.events` | Custom code extras |
|-----------|------------|------------|-------------------|
| `EDS - Quiz Start` | `quizStart` | `event17` | — |
| `EDS - Quiz Step Complete` | `quizStepComplete` | `event18` | `s.prop10`, `s.prop11` |
| `EDS - Quiz Complete` | `quizComplete` | `event19` | `s.eVar2` |
| `EDS - Quiz Result View` | `quizResultView` | `event20` | `s.eVar2`, `s.eVar8` |
| `EDS - Quiz Experience Click` | `quizExperienceClick` | `event21` | `s.eVar2`, `s.eVar8` |

After creating rules, **Publish** the Launch library (Development for `*.aem.page`, Production for `*.aem.live`). Embed URLs are in [`scripts/martech-config.js`](../scripts/martech-config.js).

---

## Workspace segments

Published on `ags050wknd` via [`tools/scripts/lib/wknd-analytics-segments.mjs`](../tools/scripts/lib/wknd-analytics-segments.mjs) (`npm run analytics:segments:publish`).

**Live today (no event18–21 admin required):**

| Segment | Definition | Status |
|---------|------------|--------|
| **WKND - Quiz Starter** | event17 exists in visit | Created on `ags050wknd` |
| **WKND - Quiz Page Visitor** | Page contains `/find-your-adventure` (excludes results) | Created on `ags050wknd` |
| **WKND - Quiz Results Visitor** | Page contains `/find-your-adventure/results` | Created on `ags050wknd` |

**After Admin enables events 18–21 + Launch publish:**

| Segment | Definition |
|---------|------------|
| **WKND - Quiz Starter** | event17 exists in visit |
| **WKND - Quiz Completer** | event19 exists in visit |
| **WKND - Quiz Result: Climbing** | event19 AND eVar2 = `climbing` |
| **WKND - Quiz Result: Trekking** | event19 AND eVar2 = `trekking` |
| **WKND - Quiz Result: Water** | event19 AND eVar2 = `water` |
| **WKND - Quiz Result: Cycling** | event19 AND eVar2 = `cycling` |
| **WKND - Quiz Result: Winter & Alpine** | event19 AND eVar2 = `winter-alpine` |
| **WKND - Quiz Result: Desert** | event19 AND eVar2 = `desert` |
| **WKND - Quiz Result: Photography** | event19 AND eVar2 = `photography` |
| **WKND - Quiz Result: General Outdoor** | event19 AND eVar2 = `general-outdoor` |

### Quiz funnel fallout

**Fallout visualization** (filter with **EDS - Live Traffic**):

| Touchpoint | Definition |
|------------|------------|
| 1 | Custom event **Quiz Start** (event17) |
| 2 | Custom event **Quiz Step Complete** (event18) — any step |
| 3 | Custom event **Quiz Complete** (event19) |
| 4 | Custom event **Quiz Result View** (event20) |

**Step drop-off:** Freeform table · Rows = **Quiz Step** (`prop10`) · Metric = **Quiz Step Complete** (event18).

**Conversion rate:** `Quiz Complete` (event19) / `Quiz Start` (event17), broken down by **Quiz Result Category** (`eVar2`).

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
2. **Analytics → Real-Time** → add custom event counters for event17–event21
3. Complete the quiz → confirm event17 → event18 (per step) → event19 → event20 on results
4. Click an experience card → event21

### Checklist

- [ ] Admin: label event17–event21, eVar2, eVar8, prop10, prop11 on `ags050wknd`
- [ ] Launch: create 5 data elements + 5 rules above
- [ ] Publish Launch library (staging + production)
- [ ] Workspace segments created (script or MCP)
- [ ] QA: Real-Time custom events increment on preview
- [ ] Workspace: build Quiz Fallout panel per table above
