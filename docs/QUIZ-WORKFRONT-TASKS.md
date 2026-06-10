# WKND Quiz — Workfront tasks for content team

Copy each task below into Workfront for the content team to execute in Experience Workspace. **Dev prerequisite:** Phase 0 code merged to `main` (Code Sync preview available).

**Figma:** [WKND Adventures — EDS Design System](https://www.figma.com/design/6cx6VFkggGJqijhoROnYDE/WKND-Adventures---EDS-Design-System)

| Frame | Node |
|-------|------|
| `block / adventure-quiz` | [96:2](https://www.figma.com/design/6cx6VFkggGJqijhoROnYDE?node-id=96-2) |
| `template / find-your-adventure` | [97:295](https://www.figma.com/design/6cx6VFkggGJqijhoROnYDE?node-id=97-295) |
| `template / find-your-adventure-results` | [97:297](https://www.figma.com/design/6cx6VFkggGJqijhoROnYDE?node-id=97-297) |

**Draft structure reference (repo):**

- [`drafts/find-your-adventure.plain.html`](../drafts/find-your-adventure.plain.html)
- [`drafts/find-your-adventure/results.plain.html`](../drafts/find-your-adventure/results.plain.html)

**Local dev test** (`npx -y @adobe/aem-cli up --html-folder drafts`):

- Quiz: `http://localhost:3000/drafts/find-your-adventure`
- Results: `http://localhost:3000/drafts/find-your-adventure/results?type=climbing`

---

## Task 1 — Author quiz and results pages

**Title:** WKND Quiz — Create `/find-your-adventure` pages in EW  
**Priority:** High · **Depends on:** Dev Phase 0 on `main`

See plan section "Workfront Task 1" for full description. Key URLs after publish:

- Quiz: `https://main--masterclass-demo--znikolovski.aem.page/find-your-adventure`
- Results: `https://main--masterclass-demo--znikolovski.aem.page/find-your-adventure/results`

---

## Task 2 — Create 8 result fragments

**Title:** WKND Quiz — Author result fragments (8 adventurer types)  
**Priority:** High

Fragment paths under `/fragments/quiz-result-{category}` for climbing, trekking, water, cycling, winter-alpine, desert, photography, general-outdoor. Each: `hero-adventure` + `cards` (1–3 experiences).

---

## Task 3 — Export Target HTML offers

**Title:** WKND Quiz — Export result fragments as Target HTML offers  
**Priority:** High · **Depends on:** Task 2

Use Library → Send to Adobe Target. Offer names: `WKND Quiz Result — {Category}`. See [`skills/ew-send-to-adobe-target/SKILL.md`](../skills/ew-send-to-adobe-target/SKILL.md).

---

## Task 4 — Target XT activity

**Title:** WKND Quiz — Target XT activity for quiz-result zone  
**Priority:** High · **Depends on:** Tasks 1 + 3

Activity on `[data-targetlocation="quiz-result"]` with URL param `type=` audiences. See [`docs/TARGET-PERSONALIZATION-PLAN.md`](./TARGET-PERSONALIZATION-PLAN.md).

---

## Task 5 — Entry CTAs

**Title:** WKND Quiz — Add entry CTAs and results conversion section  
**Priority:** Medium

Homepage + `/adventures` promo to quiz (author in Experience Workspace — not injected by code). Optional results `columns-featured` CTA.
