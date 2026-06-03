---
name: ew-send-to-adobe-target
description: >-
  Export AEM Edge Delivery pages or /fragments documents to Adobe Target as HTML
  offers from Experience Workspace chat or via CLI. Use when the user asks to send
  to Target, export to Adobe Target, create a Target offer from a page or fragment,
  update or delete a Target offer, or use Target from Experience Workspace without
  the Prepare menu.
license: Apache-2.0
metadata:
  version: "1.0.0"
---

# Send to Adobe Target (Experience Workspace)

Export DA-authored **pages** or **fragments** to Adobe Target as immutable HTML offers. This project implements the same flow as [Send to Adobe Target](https://docs.da.live/administrators/guides/prepare-menu/send-to-adobe-target), exposed for **Experience Workspace** (no Prepare menu).

## When to use

- User wants to **export / send / push** content to **Adobe Target** from EW or chat
- User is on a **fragment** (e.g. `/fragments/columns-featured`) or **page** (`/index`)
- User asks to **create, update, or delete** a Target offer linked to DA content
- User hit **CORS / preview URL / Target API** errors in the EW extension

## Prerequisites (verify first)

| Requirement | Location |
|-------------|----------|
| Target API credentials | `/.da/adobe-target.json` in DA (`tenant`, `clientId`, `clientSecret`) — **never preview/publish** |
| DA IMS token | `.hlx/.da-token.json` or run **da-auth** skill |
| Code on `main` synced | `tools/adobe-target/` on code bus (extension + CLI) |
| Library row (EW UI) | DA config **library** tab → **Send to Adobe Target** → `…/tools/adobe-target/adobe-target.html` |
| Content previewed | Source document must be **previewed** before export |

**Site defaults (this repo):** org `znikolovski`, site `masterclass-demo`, preview `https://main--masterclass-demo--znikolovski.aem.page`

## Two ways to export

### A) Author in Experience Workspace (UI)

1. Open the **page or fragment** in [Experience Workspace](https://da.live/canvas#).
2. Open **Library** → **Send to Adobe Target** (fullsize dialog).
3. Enter offer name → **Create offer** / **Update offer**.
4. Hard-refresh if the extension was just deployed (~2–5 min code sync).

The extension previews via `admin.hlx.page`, reads `<main>` HTML from preview, calls Target API through the **DA ETC CORS proxy** (`da-etc.adobeaem.workers.dev`), and stores `adobe.target.offerId` in page metadata.

### B) Agent from chat (CLI) — preferred in Cursor

Run from repo root with a valid DA token:

```bash
# Create or update offer from a fragment
node tools/adobe-target/send-to-target.mjs \
  --path /fragments/columns-featured \
  --name "Columns Featured"

# Create or update from homepage
node tools/adobe-target/send-to-target.mjs \
  --path /index \
  --name "WKND Homepage"

# Delete offer linked in page metadata
node tools/adobe-target/send-to-target.mjs \
  --path /fragments/columns-featured \
  --delete
```

**Before running:** invoke **da-auth** if token is missing or APIs return 401.

**Output:** JSON with `offerId`, `previewUrl`, `action` (`created` | `updated`).

## Agent workflow (chat)

Copy and track:

```
- [ ] Confirm source path (/index or /fragments/…)
- [ ] Confirm offer name (or --delete)
- [ ] Ensure DA token (da-auth)
- [ ] Run send-to-target.mjs
- [ ] Report offerId + preview URL to user
```

**Decision:**

| User has path + name? | Action |
|----------------------|--------|
| Yes | Run CLI (B) |
| No, editing in EW now | Guide to Library extension (A) |
| Delete offer | CLI with `--delete` |

**Do not** call `ims-na1.adobelogin.com` or `mc.adobe.io` directly from browser context — use `tools/adobe-target/target-api.js` (ETC proxy) or the CLI script.

## What gets exported

- All HTML **inside `<main>`** on the **preview** URL (undecorated sections), per [DA Target docs](https://docs.da.live/administrators/guides/prepare-menu/send-to-adobe-target)
- Offer type: immutable **XF HTML** offer; DA remains source of truth
- Metadata written to DA source: `adobe.target.offerId` in a **metadata** block table

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Preview did not return a URL` | Use `json.preview.url` from `admin.hlx.page` POST |
| CORS on `ims-na1.adobelogin.com` | Use **da-etc** proxy in `target-api.js` |
| `Preview HTML has no main` | Preview the document; confirm `<main>` on preview URL |
| `Could not load adobe-target.json` | Add `/.da/adobe-target.json` sheet in DA |
| Extension 404 | Wait for code sync to `main` |

## Related project files

| File | Role |
|------|------|
| `tools/adobe-target/send-to-target.mjs` | CLI for agents |
| `tools/adobe-target/target-service.js` | Browser extension orchestration |
| `tools/adobe-target/target-api.js` | IMS + Target via ETC proxy |
| `tools/adobe-target/adobe-target.html` | EW library extension shell |
| `tools/sidekick/setup-da-library.mjs` | Registers library + prepare rows |

## Security

- **Never** commit or log `clientSecret`
- **Never** call IMS from browser without the ETC proxy
- Config sheet `/.da/adobe-target.json` must stay unpublished

## Cursor setup

This skill is versioned under `skills/ew-send-to-adobe-target/`. Cursor loads skills from `.agents/skills/` (gitignored). After pull, sync once:

```bash
mkdir -p .agents/skills && cp -r skills/ew-send-to-adobe-target .agents/skills/
```

Or copy to `~/.cursor/skills/ew-send-to-adobe-target/` for all projects.
