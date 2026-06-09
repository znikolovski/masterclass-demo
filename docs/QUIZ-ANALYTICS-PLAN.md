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

---

## Launch rules (add after Phase 0 gate)

Create ACDL event rules mirroring form funnel ([FORM-ANALYTICS-PLAN.md](./FORM-ANALYTICS-PLAN.md)):

| Rule | ACDL event | `s.events` | Custom code extras |
|------|------------|------------|-------------------|
| Quiz Start | `quizStart` | `event16` | — |
| Quiz Step | `quizStepComplete` | `event17` | `s.prop6`, `s.prop7` from quiz step |
| Quiz Complete | `quizComplete` | `event18` | `s.eVar2` = result category |
| Quiz Result View | `quizResultView` | `event19` | `s.eVar2`, `s.eVar6` |
| Quiz Experience Click | `quizExperienceClick` | `event20` | `s.eVar2`, `s.eVar6` |

Data elements: `EDS - Quiz Id`, `EDS - Quiz Step`, `EDS - Quiz Step Index`, `EDS - Quiz Result Category`, `EDS - Quiz Adventurer Type`.

---

## Workspace segments

| Segment | Definition |
|---------|------------|
| **WKND - Quiz Completer** | event18 exists in visit |
| **WKND - Quiz Result: Climbing** | event18 AND eVar2 = `climbing` |
| **WKND - Quiz Result: Trekking** | event18 AND eVar2 = `trekking` |

*(Repeat per category in ALLOWED_CATEGORIES.)*

---

## Validation

```javascript
// After completing quiz locally
adobeDataLayer.getState('quiz');
// Expect quiz.resultCategory on quizComplete / quizResultView events
// page.adventureCategory should remain general-outdoor on page views
```
