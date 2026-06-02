# One-shot prompt: YouTube video block (WKND / masterclass-demo)

Copy everything below the line into a new agent chat.

---

## Task

Implement a new AEM Edge Delivery Services block **`youtube-video`** for the **masterclass-demo** site (WKND Adventures). The block embeds a responsive YouTube player from an authored URL, matches existing WKND styling, includes a **drafts test page**, is registered in the **DA Author library**, and has a **styled `.html` block preview** on the code bus.

Follow **content-driven-development** and **building-blocks** skills. Do **not** modify `scripts/aem.js`.

## Project context

- Repo: `znikolovski/masterclass-demo`, branch `main`
- Preview: `https://main--masterclass-demo--znikolovski.aem.page/`
- DA org/site: `znikolovski` / `masterclass-demo`
- Local dev: `npx -y @adobe/aem-cli up --no-open --forward-browser-logs --html-folder drafts`
- Design: Instrument Sans + Syncopate, accent `#e8651a`, mobile-first CSS scoped to `.youtube-video`

## Block content model (authoring contract)

Authors use a block table named **`youtube-video`**:

| Row | Col 1 | Col 2 | Notes |
|-----|--------|--------|--------|
| 1 | YouTube URL | (full URL or youtu.be link) | Required |
| 2 | Title | optional caption below player | Optional |
| 3 | (empty) | | Optional variant row: class `autoplay` in col 1 for muted autoplay |

**Variants** (CSS classes on block div): default 16:9; optional `narrow` for max-width constraint (reuse section style patterns).

**Security:** Parse URL only; build embed src only from validated 11-char video IDs. Use `https://www.youtube-nocookie.com/embed/{id}`. Never pass raw author HTML into `innerHTML` for the iframe src. Reject non-YouTube URLs gracefully (show empty state or hide iframe).

## Implementation checklist

### 1. Block code (`blocks/youtube-video/`)

- `youtube-video.js` — default export `decorate(block)`:
  - Read rows from `block.children` (match patterns in `blocks/cards/cards.js`, `blocks/teaser/teaser.js`)
  - Normalize YouTube URL → video ID
  - Build structure: wrapper, 16:9 aspect-ratio container, `iframe` with `title`, `loading="lazy"`, `allowfullscreen`, appropriate `allow` attribute
  - Optional caption element from row 2
  - `autoplay` variant: `?autoplay=1&mute=1` on embed URL only when class present
- `youtube-video.css` — scoped `.youtube-video` only; WKND typography for caption; responsive embed (padding-top aspect ratio or `aspect-ratio: 16 / 9`)
- `metadata.json` — block purpose for tooling (optional, follow `blocks/carousel-blog/metadata.json`)

### 2. Universal Editor / DA (`component-*.json` at repo root)

Add **`youtube-video`** to all three files (follow existing blocks like `teaser`, `carousel-blog`):

- `component-definition.json` — Blocks group + `plugins.da` rows/columns
- `component-models.json` — fields: URL (`aem-content` or `text`), caption (`text` or `richtext`)
- `component-filters.json` — add id to `section` filter components array

### 3. Sidekick / library snippet

- Create `tools/sidekick/blocks/youtube-video/youtube-video.plain.html` — one section, sample URL (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ` or a WKND-relevant public video), optional caption

### 4. Library index

- Add entry to `library/blocks.json` (sheet format, `name` + `path`):
  - `"name": "YouTube Video"`
  - `"path": "https://content.da.live/znikolovski/masterclass-demo/blocks/youtube-video/youtube-video.html"`

### 5. Git block preview (styled `.html` for DA)

DA preview URLs use **`.html` on the code bus** — fragments are unstyled.

- Regenerate `blocks/youtube-video/youtube-video.html` using **`wrapLibraryPreviewPage()`** from `tools/sidekick/wrap-library-preview.mjs` (full document with `/scripts/aem.js`, `/styles/styles.css`, `/styles/library-preview.css`, header/footer placeholders)
- **Do not** copy the raw fragment into git; only the wrapped preview page
- DA upload (fragment only): run `node tools/sidekick/setup-da-library.mjs` after `aem content clone --path /` (updates DA + all library git previews)

### 6. Drafts test page

- Create **`drafts/youtube-video-test.plain.html`** only (not `.html`):
  - Top-level `<div>` sections only — **no** `<body>`, `<main>`, or `<header>`
  - Section 1: default content (eyebrow, h1, intro) + optional `section-metadata` for `style`
  - Section 2: authored `youtube-video` block with sample URL + caption
  - Section 3 (optional): second variant e.g. `youtube-video narrow`
- Verify locally: `http://localhost:3000/drafts/youtube-video-test`

### 7. Quality

- `npm run lint` and fix issues
- Curl decorated page: `curl -s http://localhost:3000/drafts/youtube-video-test | grep youtube-video`
- Do not commit unless asked

## URLs to verify after deploy

| Purpose | URL |
|---------|-----|
| Draft test (local) | `http://localhost:3000/drafts/youtube-video-test` |
| Draft test (preview) | `https://main--masterclass-demo--znikolovski.aem.page/drafts/youtube-video-test` (only if draft published to DA) |
| Block library preview (DA uses `.html`) | `https://main--masterclass-demo--znikolovski.aem.page/blocks/youtube-video/youtube-video.html` |
| Block preview (no extension, DA content) | `https://main--masterclass-demo--znikolovski.aem.page/blocks/youtube-video/youtube-video` |

## Pitfalls (from prior work — avoid)

1. **Do not modify `scripts/aem.js`**
2. Draft files must be **`.plain.html`** with section `<div>` children only
3. **`.html` in preview URL** → must exist on **code bus** as a **full wrapped page**, not a fragment
4. **DA library** needs `library/blocks.json` + `.da/config` library tab (already configured); still run `setup-da-library.mjs` to sync new block to DA
5. **`section-metadata`** applies to parent section and is removed on decorate — do not put it in its own empty section
6. Empty trailing `<div></div>` sections → `decorateSections` skips empty sections (already in `scripts/scripts.js`)
7. Library insert uses **DA** path `blocks/.../....html`; git preview uses **wrapped** `blocks/.../....html`

## Deliverables

When done, report:

- Content model summary for authors
- Local and preview URLs above
- Confirmation that library preview renders styled (iframe + WKND caption)
- Any UE/DA sync steps the human must run manually (e.g. `setup-da-library.mjs`)
