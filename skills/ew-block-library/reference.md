# EW block library — reference

## Content bus vs code bus

| URL pattern | Bus | JS runs? | Typical consumer |
|-------------|-----|----------|------------------|
| `/blocks/{name}/{name}.html` | Code | Yes (`library-preview.js`) | EW `path` in blocks.json |
| `/blocks/{name}/{name}` (no extension) | Content | Yes (`scripts.js` loadPage) | Legacy; bootstrap path still supported |
| Sidekick srcdoc from `.plain.html` | Inline | Often no | Sidekick panel markup source |

## wrapLibraryPreviewPage contract

`tools/sidekick/wrap-library-preview.mjs` generates shells with:

- Body classes: `library-preview sidekick-library`
- Block root class: `{blockName} sidekick-library`
- Empty `<header>` / `<footer>` (hidden by CSS)
- Google Fonts link (Instrument Sans + Syncopate)
- Module script: `/scripts/library-preview.js`

## library.json format (Sidekick)

Loader expects top-level `data` array or `:type: multi-sheet` — **not** `{ blocks: { data } }` alone (crashes `.map()`).

## bootstrapLibraryBlockDocument (content bus)

When pathname matches `/blocks/{name}/{name}` (no `.html`), `scripts/scripts.js` eagerly loads:

- `library-preview.css`
- `library-sidekick-blocks.css`
- `lazy-styles.css`
- `blocks/{name}/{name}.css`

Skips martech, header/footer, analytics for library previews via `isLibraryPreview()`.

## REPO_BLOCK_PREVIEWS

Blocks authored directly under `blocks/` (not `tools/sidekick/blocks/`) listed in `regenerate-library-shells.mjs`:

- form, adventure-quiz, quiz-results, embed-adaptive-form
- business-register, business-login, business-dashboard

Always regenerated from `{name}.html.plain.html` so shells pick up wrap-library-preview changes.

## Site URLs (this repo)

- Preview: `https://main--masterclass-demo--znikolovski.aem.page`
- Content: `https://content.da.live/znikolovski/masterclass-demo`
- Sidekick library test: `/tools/sidekick/library.html?base=/tools/sidekick/library.json`
