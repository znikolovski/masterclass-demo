# Form analytics plan

End-to-end measurement for adaptive / sheet forms on **masterclass-demo** (`ags050wknd`), including **submission success** and **funnel drop-off** via ACDL + Launch.

Code: [`scripts/form-analytics.js`](../scripts/form-analytics.js) · wired in [`blocks/form/form.js`](../blocks/form/form.js) and [`blocks/form/submit.js`](../blocks/form/submit.js).

## Funnel events (ACDL)

| Event | When | Drop-off signal |
|-------|------|-----------------|
| `formImpression` | Form ≥50% in viewport (once) | Saw form, never started |
| `formStart` | First focus in any field (once) | Started, never completed a step |
| `formStepComplete` | Field blur with valid non-empty value (once per field) | Stopped after step N |
| `formSubmitAttempt` | Submit click | Tried to finish, validation/server failed |
| `formValidationError` | Submit blocked by HTML5 validation | Missing/invalid required field |
| `formSubmitSuccess` | POST succeeded | Conversion |
| `formSubmitError` | POST failed / network error | Server-side drop-off |

**Privacy:** events include `formSlug`, field **names**, and step index only — never email, phone, or message content.

### ACDL payload shape

```js
adobeDataLayer.push({
  event: 'formStepComplete',
  form: {
    formId: '…',
    formSlug: 'wknd-adventure-interest',
    step: 'email',
    stepIndex: 2,
    totalSteps: 6,
  },
  interaction: {
    label: 'wknd-adventure-interest',
    block: 'form',
    detail: 'email',
  },
});
```

Verify in the browser console after interacting with a form:

```js
adobeDataLayer.getState('form.formSlug')
```

## Report suite mapping (`ags050wknd`)

Do not reuse event1–event8 (CTA, carousel, video, FAQ, tabs, asset). Allocate:

| Slot | Admin label | ACDL event |
|------|-------------|------------|
| **event9** | Form Impression | `formImpression` |
| **event10** | Form Start | `formStart` |
| **event11** | Form Step Complete | `formStepComplete` |
| **event12** | Form Submit Attempt | `formSubmitAttempt` |
| **event13** | Form Submit Success | `formSubmitSuccess` |
| **event14** | Form Validation Error | `formValidationError` |
| **event15** | Form Submit Error | `formSubmitError` |
| **eVar7** | Form ID | `form.formSlug` |
| **prop8** | Form step | `form.step` (field name or `submit` / `success`) |

Page context (`eVar4` adventure category, `prop3` journey stage) still comes from [`scripts/analytics-page.js`](../scripts/analytics-page.js) on every hit.

## Launch — ACDL data elements

Extension: **Adobe Client Data Layer** · Type: **Data Layer Computed State** · Storage: **Page view**

| Data element | ACDL path |
|--------------|-----------|
| `EDS - Form Slug` | `form.formSlug` |
| `EDS - Form Step` | `form.step` |
| `EDS - Form Step Index` | `form.stepIndex` |
| `EDS - Form Error Field` | `form.errorField` |

## Launch rules (one per event)

Use the same pattern as [ASSET-ANALYTICS-PLAN.md](./ASSET-ANALYTICS-PLAN.md):

1. **Event** — ACDL extension · **Listen to specific event** · event name from table above · Scope **All**
2. **Action 1 — Update variable** (Web SDK) · Data element **`EDS - Analytics Variable`** · Custom Code:

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
const form = window.adobeDataLayer?.getState?.('form') || {};
s.events = 'event11'; // change per rule: event9 … event15
s.eVar7 = form.formSlug || '';
s.prop8 = form.step || '';
s.linkName = form.formSlug || '';
s.linkType = 'o';
```

3. **Action 2 — Send event** — Type **Link click** · Data object **`EDS - Analytics Variable`**

| Rule name | Event name | `s.events` |
|-----------|------------|------------|
| `EDS - Form Impression` | `formImpression` | `event9` |
| `EDS - Form Start` | `formStart` | `event10` |
| `EDS - Form Step Complete` | `formStepComplete` | `event11` |
| `EDS - Form Submit Attempt` | `formSubmitAttempt` | `event12` |
| `EDS - Form Submit Success` | `formSubmitSuccess` | `event13` |
| `EDS - Form Validation Error` | `formValidationError` | `event14` |
| `EDS - Form Submit Error` | `formSubmitError` | `event15` |

For validation errors, also set `s.prop8 = form.errorField || '';` in the Custom Code block (read `form` from `adobeDataLayer.getState('form')` as above).

## Workspace — form fallout

**Fallout visualization** (filter panel with **EDS - Live Traffic**):

| Touchpoint | Definition |
|------------|------------|
| 1 | Custom event **Form Impression** (event9) exists |
| 2 | Custom event **Form Start** (event10) exists |
| 3 | Custom event **Form Submit Attempt** (event12) exists |
| 4 | Custom event **Form Submit Success** (event13) exists |

Break down fallout by **Form ID** (`eVar7`) to compare `wknd-adventure-interest`, `wknd-contact-b2b`, etc.

**Step-level drop-off:** Freeform table · Rows = **Form step** (`prop8`) · Metric = **Form Step Complete** (event11) · Filter **Form ID** = `wknd-adventure-interest`.

**Conversion rate:**  
`Form Submit Success` / `Form Start` by **Form ID** and **Adventure category** (`eVar4`).

## Forms covered

| Form slug | Site | Notes |
|-----------|------|-------|
| `wknd-adventure-interest` | masterclass-demo | B2C interest, fragment + `/adventures` |
| `wknd-adventure-interest-b2b` | wknd-business | B2B team request |
| `wknd-contact-b2b` | wknd-business | Contact |

Slug is taken from embedded sheet `formSlug`, link href, or `/api/forms/{slug}` action URL.

## Demo traffic

The live audience simulator (`tools/scripts/simulate-live-audience-traffic.mjs`) walks form funnels on pages that include a form block (notably `/adventures` and blog pages with the adventure-interest fragment). Outcomes are mixed for realistic fallout:

| Simulated outcome | Share (approx.) | ACDL events |
|-------------------|-----------------|-------------|
| Impression only | 32% | `formImpression` |
| Abandon after 1 field | 26% | `formImpression`, `formStart`, `formStepComplete` |
| Validation error | 14% | through `formValidationError` |
| Submit success | 28% | through `formSubmitSuccess` |

Run after code sync + Launch publish:

```bash
npm run simulate:traffic:daily
```

## Checklist

- [ ] Admin: label event9–event15, eVar7, prop8 on `ags050wknd`
- [ ] Launch: create data elements + 7 rules above
- [ ] Publish Launch library to Development / Production
- [ ] QA: interact with form on preview, confirm Real-Time custom events increment
- [ ] Workspace: build Form Fallout panel per table above
