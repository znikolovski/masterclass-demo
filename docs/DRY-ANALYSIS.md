# DRY Analysis

This project uses a lightweight **Don't Repeat Yourself (DRY)** review for JavaScript changes. The goal is not zero duplication everywhere — EDS blocks stay self-contained — but to **avoid re-copying shared utilities** that already exist under `scripts/`.

## When to run

| Context | Command |
|---------|---------|
| Local (compare to `main`) | `npm run dry:analysis` |
| Local (custom base branch) | `npm run dry:analysis -- --base=main` |
| Save report for a PR | `npm run dry:analysis -- --output=docs/DRY-REPORT.example.md` |
| CI | Runs automatically on pull requests (`.github/workflows/pr-dry-analysis.yaml`) |

## Pull request workflow

1. Implement your change (blocks, scripts, tools).
2. Run `npm run dry:analysis` locally and fix any **error** findings.
3. Open a PR — CI posts the DRY report to the GitHub Actions job summary.
4. Copy the report (or a short summary) into the PR under **DRY analysis** (see `.github/pull_request_template.md`).
5. If you intentionally keep duplication (block-specific markup, one-off logic), note **why** in the PR.

### What belongs in the PR

```markdown
## DRY analysis

**Status:** PASS | WARN | FAIL

- Reused `scripts/paths.js` for path validation
- Reused `scripts/carousel.js` for nearby carousel
- Intentional duplication: map pin SVG stays in adventure-map (no second consumer yet)

<details>
<summary>Full report</summary>

(paste npm run dry:analysis output)

</details>
```

## Shared modules catalog

| Module | Use for |
|--------|---------|
| `scripts/paths.js` | `isSafePath`, `stripWkndTitleSuffix`, `buildPathWithQueryParam` |
| `scripts/index.js` | `fetchHelixIndex`, `helixIndexPath` |
| `scripts/carousel.js` | Slide index, a11y, prev/next, scroll sync |
| `scripts/adventure-links.js` | Adventure CTAs with `?cid=` + ACDL |
| `scripts/analytics-acdl.js` | `pushInteractionEvent`, `pushCarouselChange` |
| `scripts/media.js` | Responsive pictures |

## Anti-patterns the checker flags

| ID | Severity | Description |
|----|----------|-------------|
| `local-isSafePath` | error | Block-local `function isSafePath` |
| `inline-wknd-title-strip` | warn | Inline `— WKND Adventures` regex |
| `local-carousel-slide-wrap` | warn | Manual slide index wrap logic |
| `duplicate-index-fetch` | warn | Inline fetch + `json.data` parsing |

**Errors fail CI.** Warnings are advisory — document them in the PR if you keep them.

## Data-layer DRY (content model)

These are architectural checks the script does **not** automate; include them in your PR review:

- **Geo coordinates** live in page metadata → `helix-query.yaml` index → blocks read the index (never duplicate pins in block content).
- **Analytics cid** appended via shared URL helpers, mapped to eVar1 by existing page analytics.
- **Seed scripts** (`tools/scripts/lib/adventure-page-metadata.mjs`) may duplicate metadata until authors own production content — call that out in rollout notes.

## Adding new shared utilities

When the same logic appears in **two or more** blocks or scripts:

1. Extract to `scripts/<name>.js` with a single responsibility.
2. Add exports to the catalog in `tools/scripts/dry-analysis.mjs`.
3. Add an anti-pattern rule if the old inline form is easy to detect.
4. Update this doc.

## Example: adventure-map refactor

Before refactor, `adventure-map` and `carousel-blog` each defined:

- `isSafePath`
- carousel slide a11y + scroll sync
- WKND title suffix stripping
- Helix index fetch boilerplate

After refactor:

- `scripts/paths.js`, `scripts/index.js`, `scripts/carousel.js`, `scripts/adventure-links.js`
- Blocks import shared helpers; block-specific map styling and Google Maps API loading remain in `adventure-map`.

## Related

- [AGENTS.md](../AGENTS.md) — EDS block conventions
- [code-review skill](.agents/skills/code-review/SKILL.md) — self-review before PR
- [ADVENTURE-MAP-PRD.md](ADVENTURE-MAP-PRD.md) — data-model DRY requirements for the map block
