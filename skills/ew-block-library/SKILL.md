---
name: ew-block-library
description: >-
  Register new or updated AEM EDS blocks in the Experience Workspace block library
  with fully styled previews. Covers Sidekick library.json, library/blocks.json,
  preview shells, library-preview.js decoration, and static CSS fallbacks. Use when
  creating a new block, adding a block to the EW library, fixing unstyled library
  previews, or running library:setup / library:regen-shells.
license: Apache-2.0
metadata:
  version: "1.0.0"
---

# Experience Workspace block library

Ensure every new block renders **fully styled** in EW block picker and Sidekick library previews — not raw authoring markup.

**Invoke after** [building-blocks](.agents/skills/building-blocks/SKILL.md) implementation (Step 5 or as a library-only follow-up).

## Three surfaces (do not conflate)

| Surface | Index / config | Bus | Consumer |
|---------|----------------|-----|----------|
| **Experience Workspace** Library → Blocks | `library/blocks.json` | Content (`content.da.live`) | EW block picker with previews (`fetchLibraryConfig` → `getBlockVariants`) |
| **Sidekick Library** plugin | `tools/sidekick/library.json` | Code (`.aem.page`) | Sidekick extension (`config/sidekick.json`) — not EW |
| **Universal Editor** Add component | `component-definition.json` | Code | UE component rail (no library previews) |

EW and classic DA **share** the content-bus `library/blocks.json` registered in DA site config (`setup-da-library.mjs` → Library tab → Blocks). Sidekick uses a **separate** code-bus index.

Fixing `tools/sidekick/library.json` **does not** fix EW. Run `npm run library:setup` to publish `library/blocks-adventures.json` → content bus.

## Why previews break (learned patterns)

1. **Block CSS targets decorated DOM** (`ul`/`li`, BEM classes) but library shells initially showed **raw** table/div authoring markup → partial or no styling.
2. **`styles/styles.css` hides `body` until `.appear`** — srcdoc/iframes without JS stayed blank until `library-preview.css` forced `display: block`.
3. **EW iframes often snapshot before `loadLazy()`** — global button/typography from `lazy-styles.css` must load in the **eager** library bootstrap (`bootstrapLibraryBlockDocument` in `scripts/scripts.js`).
4. **Sidekick `PreviewBlock` event typo** — upstream expects `event.details.path`; shim in `tools/sidekick/library-patch.js` (load before upstream `index.js` in `library.html`).
5. **Code-bus shells are separate from live pages** — they need their own stylesheet stack and optional decoration script.

## Preview architecture (current)

```
Author snippet          tools/sidekick/blocks/{name}/{name}.plain.html
        ↓ npm run library:regen-shells
Code-bus shell          blocks/{name}/{name}.html
  <head> brand.css, styles.css, lazy-styles.css, library-preview.css,
         library-sidekick-blocks.css, blocks/{name}/{name}.css
  <body class="library-preview sidekick-library">
  <script type="module" src="/scripts/library-preview.js">  ← runs decorate + loadSections
        ↓
EW iframe loads         https://main--{site}--{org}.aem.page/blocks/{name}/{name}.html
```

**No-JS fallback** (Sidekick srcdoc): `styles/library-sidekick-blocks.css` — static rules on raw markup. Add rules here when a block must look acceptable without JS.

## New block checklist

Copy and track:

```
Library registration:
- [ ] Block implemented: blocks/{name}/{name}.js + .css (+ UE JSON if applicable)
- [ ] Authoring snippet: tools/sidekick/blocks/{name}/{name}.plain.html
- [ ] Regenerate shells: npm run library:regen-shells
- [ ] Sidekick index: tools/sidekick/library.json (multi-sheet `data` row)
- [ ] EW index: library/blocks.json (via setup or manual row)
- [ ] Repo-only block? Add to REPO_BLOCK_PREVIEWS in regenerate-library-shells.mjs
- [ ] Static fallback CSS in library-sidekick-blocks.css (if block looks wrong with JS blocked)
- [ ] Optional dual selectors in block CSS: body.library-preview / body.sidekick-library
- [ ] Commit + push (Code Sync deploys shells and scripts)
- [ ] Publish content bus: npm run library:setup (needs DA token)
- [ ] Verify preview URL returns 200 and shows decoration
```

### 1. Authoring snippet

Create `tools/sidekick/blocks/{block-name}/{block-name}.plain.html`:

- Wrap in section div: `<div><div class="{block-name}">…rows…</div></div>`
- Use realistic sample content (images, headings, multiple rows)
- Match the block's **authoring contract** from content modeling

### 2. Regenerate preview shells

```bash
npm run library:regen-shells
```

Writes:

- `blocks/{name}/{name}.html` — full document via `wrap-library-preview.mjs`
- `blocks/{name}/{name}.html.plain.html` — fragment copy

Shell head **must** include (handled by `wrapLibraryPreviewPage` — do not omit when editing):

- `/styles/brand.css`, `/styles/styles.css`, `/styles/lazy-styles.css`
- `/styles/library-preview.css`, `/styles/library-sidekick-blocks.css`
- `/blocks/{name}/{name}.css`
- `<script type="module" src="/scripts/library-preview.js"></script>`

### 3. Register in Sidekick library

Add row to `tools/sidekick/library.json` (`:type: multi-sheet`, top-level `data` array):

```json
{
  "name": "Human Name",
  "type": "block",
  "path": "/blocks/{name}/{name}.html",
  "preview": "/blocks/{name}/{name}.html.plain.html"
}
```

`config/sidekick.json` library plugin URL must include `?base=/tools/sidekick/library.json`.

### 4. Register in EW block picker

`library/blocks.json` rows use **code-bus `.html` URLs** for `path` and content-bus URLs for `value`:

```json
{
  "name": "Human Name",
  "path": "https://main--masterclass-demo--znikolovski.aem.page/blocks/{name}/{name}.html",
  "value": "https://content.da.live/znikolovski/masterclass-demo/blocks/{name}/{name}.html"
}
```

Sync to DA and preview-publish:

```bash
npm run library:setup
```

Requires DA token (`.hlx/.da-token.json` or `da-auth` skill). Setup also preview-publishes `library/blocks.json`.

### 5. CSS strategy for library previews

**Preferred:** Rely on `library-preview.js` — block `{name}.css` applies after JS decoration (same as live pages).

**Also add static fallbacks** when:

- Block must look acceptable in Sidekick srcdoc (JS blocked)
- Decoration depends on page context the shell lacks (document in PR)

Add to `styles/library-sidekick-blocks.css`:

```css
body.library-preview .{block-name} > div,
body.sidekick-library .{block-name}.sidekick-library > div {
  /* layout on raw authoring rows */
}
```

**Optional** dual selectors in `blocks/{name}/{name}.css` (see `adventure-facts.css`, `adventure-quiz.css`).

### 6. Blocks with extra stylesheets

Pass extra CSS in `regenerate-library-shells.mjs` when regenerating templates, or extend `wrapLibraryPreviewPage` `options.stylesheets` — e.g. blog templates need `/styles/blog.css`.

### 7. Verify before PR

```bash
# Shell exists and includes decoration script
curl -s "https://main--masterclass-demo--znikolovski.aem.page/blocks/{name}/{name}.html" | tail -3

# library-preview.js deployed
curl -sI "https://main--masterclass-demo--znikolovski.aem.page/scripts/library-preview.js" | head -1

# Local (dev server running)
curl -s "http://localhost:3000/blocks/{name}/{name}.html" | grep library-preview.js
```

Open EW block picker → hard refresh → preview should match live page styling (layout/colors; interactivity may differ).

## Key files (do not break)

| File | Role |
|------|------|
| `scripts/library-preview.js` | Minimal decorate + loadSections for shells |
| `scripts/scripts.js` | `bootstrapLibraryBlockDocument`, `isLibraryPreview*` guards |
| `tools/sidekick/wrap-library-preview.mjs` | Shell HTML generator |
| `tools/sidekick/regenerate-library-shells.mjs` | Batch regen from `.plain.html` |
| `tools/sidekick/setup-da-library.mjs` | DA upload + `library/blocks.json` publish |
| `styles/library-preview.css` | Body visibility, main padding, hide chrome |
| `styles/library-sidekick-blocks.css` | No-JS fallback layouts |
| `tools/sidekick/library-patch.js` | PreviewBlock `details` shim |
| `tools/sidekick/library.html` | Sidekick plugin entry (patch → upstream → init) |
| `config/headers.json` | CORS for `/blocks/**/*.html` |

## Commands

| Command | When |
|---------|------|
| `npm run library:regen-shells` | After snippet or wrap-library-preview changes (no DA auth) |
| `npm run library:setup` | After blocks.json / DA content changes (needs token) |
| `npm run migrate:repoless -- --apply` | Sidekick config to Config Service |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Blank iframe | `body { display: none }` without `.appear` | `library-preview.css` + `library-preview.js` |
| Grid/cards unstyled | No decoration in shell | Ensure `library-preview.js` in shell; regen shells |
| Buttons/typography missing | `lazy-styles.css` not loaded early | In shell `<head>` + `bootstrapLibraryBlockDocument` |
| `PreviewBlock` TypeError | Upstream `event.details` typo | `library-patch.js` before upstream in `library.html` |
| EW picker stale | Content bus not preview-published | `npm run library:setup` |
| Sidekick works, EW doesn't | Only updated `tools/sidekick/library.json` | `npm run library:setup` (content-bus `library/blocks.json`) |
| EW shows templates, not blocks | Index fetch fails or rows missing `name`/`path` | DA config index → code-bus `library/blocks.json`; row `path` → content-bus block doc |
| Console `parseDom` / `window.view.state` | Classic `da-library` eagerly parses all block variants (e.g. image focal point) before the editor view is ready, or bad block HTML | Usually non-fatal for EW Blocks panel; hard-refresh; remove 404 rows; fix content-bus block docs via `library:setup` |
| B2B block missing brand.css | Skipped regen (full doc existed) | Add to `REPO_BLOCK_PREVIEWS`, regen |

## Related skills

- [building-blocks](.agents/skills/building-blocks/SKILL.md) — block JS/CSS implementation
- [content-modeling](.agents/skills/content-modeling/SKILL.md) — authoring contract
- [ue-component-model](.agents/skills/ue-component-model/SKILL.md) — Universal Editor fields
- [da-auth](.agents/skills/da-auth/SKILL.md) — token for `library:setup`
- [testing-blocks](.agents/skills/testing-blocks/SKILL.md) — lint and browser validation

For extended architecture notes, see [reference.md](reference.md).
