# LLM App Integration Plan — Mock Data → Real Integrations

**Status:** Proposed · **Date:** 2026-09-24
**Scope:** Convert the six WKND adventure actions in `masterclass-demo-llmapp` from
hand-authored `MOCK_DATA` to real integrations sourced from the `masterclass-demo`
codebase (EDS content + the Aero/B2B Cloudflare workers).

---

## Discovery browsing behavior

The companion LLM app's `discover_adventures` handler supports full-catalog
browsing (`{}`), category-only (`{"category":"trekking"}`), region-only
(`{"region":"Europe"}`), level-only (`{"experience_level":"beginner"}`), and
combined filters. Unspecified preferences are not required. Experience level
filters suitability; pace, priority, and landscape rank matching results.
Discovery reads published page metadata when the live index omits those fields.
Missing levels are excluded from level-filtered results rather than presented as
beginner-safe. Successfully loaded catalogs contain only upstream records.

The `discover-adventures` widget renders every returned adventure, lazily loads
non-leading images, and suppresses "Top match" for unranked catalog listings.
Legacy results without `structuredContent.ranked` retain the existing ribbon.

**Deployment dependency:** update the discovery input schema and description in
the Adobe LLM Apps UI: all filters must be optional, and `category` must be
declared. Permit `category`/`editorial_url` on output items and `ranked` on the
structured result. Handler changes cannot override a required-input schema or
teach a host about undeclared filters. Download the updated `actions.json`,
deploy both repositories, and refresh the LLM host's cached tool definitions.
The companion README documents the complete UI configuration.

Local widget regression command:
`node tools/scripts/test-discover-adventures.mjs http://localhost:3000`
(optional second argument: screenshot output directory). Companion discovery
and shared-loader tests run with `npm test -- --runInBand --coverage=false
test/actions/discover-adventures.test.js test/actions/discover-adventures-matching.test.js
test/lib/wknd.test.js`.

---

## 1. Background

`masterclass-demo-llmapp` is an [Adobe LLM Apps](https://www.npmjs.com/package/@adobe/llm-apps-runtime)
(MCP) server. Handlers live in `actions/<name>/index.js`; each receives `(args, extra)`
and returns `{ content, structuredContent? }`. Config is read from `extra.variables.X`
(declared in the LLM Apps UI, mirrored locally via a downloaded `actions.json`) —
**not** `process.env`, despite what the current TODO comments say.

Six actions are backed by `MOCK_DATA`, each carrying a `// TODO: Replace MOCK_DATA
with a real API call` block:

| Action | Returns | TODO's suggested endpoint |
|---|---|---|
| `discover-adventures` | filtered adventure list | `GET /adventures?activity=…` |
| `build-route-briefing` | per-route stages / conditions | `GET /reports/{adventure_id}` |
| `build-gear-checklist` | gear list by activity | `GET /gear/checklist?adventure_id=…` |
| `plan-permits-and-access` | permits + travel logistics | `GET /destinations/{id}/logistics` |
| `audit-pack-weight` | pack-weight audit | `GET /adventures/{id}` + local compute |
| `prepare-field-submission` | submission scaffold + write | `GET /adventures?destination=…` (+ POST) |

All six share one record shape keyed by `adventure_id` (`patagonia-trek`,
`yosemite-rock-climbing`, …), which matches EDS page slugs and the Aero enrichment keys 1:1.

---

## 2. Real integrations already available (verified live)

### 2.1 EDS content — `https://main--masterclass-demo--znikolovski.aem.live`
- `/query-index.json` — 76 pages: `path, lastModified, title, description, image`.
- `/adventures-map-index.json` — adds `adventureCategory, latitude, longitude, placeName`.
- Per-page `.plain.html` / `.md` — rich narrative (route stages, conditions, gear mentions).
- Page **Metadata blocks** already carry `journeyStage, adventureInterest,
  adventureCategory, adobeTarget, theme, template, placeName, lat/long`.
- Index shapes are configured in [`helix-query.yaml`](../helix-query.yaml).

### 2.2 Aero catalog API — `https://wknd-aero-api.jaggah.workers.dev`
- `GET /catalog/adventures/index.json` — Product-Bus catalog, **15 live adventures**.
- `GET /catalog/adventures/{sku}.json` — single entity.
- `GET /api/flights/search?from=&to=` — flight search (uses IATA codes).
- `POST /api/bookings`, `GET /api/bookings/{id}`.
- Entity fields: `sku, name, description, images[], price, destinationIata,
  adventureCategory, editorialUrl`.
- Synced every 6h from `/query-index.json`; machine enrichment (IATA/category/price)
  in [`workers/wknd-aero-api/src/adventure-catalog-enrichment.json`](../workers/wknd-aero-api/src/adventure-catalog-enrichment.json).
  Mapping happens in [`product-bus-schema.js`](../workers/wknd-aero-api/src/product-bus-schema.js).

### 2.3 B2B API — `https://wknd-b2b-api.jaggah.workers.dev`
- `POST /api/forms/{slug}` — validated form intake (`wknd-adventure-interest`,
  `wknd-adventure-interest-b2b`, `wknd-contact-b2b`).
- `POST /api/b2b/adventures` (auth) — partner adventure submissions; `register`/`login`.

---

## 3. Core finding: the data-richness gap

The `sku`/`adventure_id` join is clean, but **the catalog entity is thinner than the
mock record**. These fields the actions filter and render on exist today only in the
mock (or as unstructured page prose):

> `experience_level, pace, priority, landscape, region, country, trip_length_days,
> duration, verified_status, match_reason` — plus route stages, gear items, permit
> rules, and pack-weight thresholds.

So "mock → real" is two jobs:
1. **Wire handlers to the live APIs** for the fields that already exist.
2. **Decide where the missing structured fields come from.**

---

## 4. Decision: EDS is the source of truth (Option B first)

EDS is our authoritative knowledge source, and the pipeline already flows
**EDS → query-index → Aero catalog**. Therefore the *default* home for the missing
editorial attributes is EDS, not the worker. Rationale:

- **The pattern already exists.** `helix-query.yaml` already lifts custom `<head>`
  meta (`adventureCategory`, lat/long, `placeName`) into the index. New attributes are
  a one-for-one extension.
- **Single source of truth.** Putting editorial attributes in the worker's enrichment
  JSON creates a *second* source that can drift from the pages the team maintains.
  EDS-first means the catalog inherits the data for free (near-zero worker change).
- **Authors already own attributes** in Metadata blocks — `experienceLevel`/`pace`/
  `priority` are the same kind of data, sitting next to `journeyStage`.

### Where each source is correct

| Source | Owns | Why |
|---|---|---|
| **B — EDS** (page Metadata + helix-query, and/or an EDS attributes **spreadsheet**) | Editorial adventure attributes: `experienceLevel, pace, priority, landscape, region, country, duration, tripLengthDays, verifiedStatus`; tabular/list data (gear, permits) via a spreadsheet | Authoritative, author-owned, already the sync source |
| **A — Aero enrichment JSON** | *Only* non-editorial machine values already there: `destinationIata`, `demoPrice`, catalog `adventureCategory` | Commerce/booking-layer data, not editorial content |
| **C — Derived endpoints / handler compute** | Computed or query-relative outputs: `match_reason`, pack-weight audit, flight logistics, route-briefing assembly | Not anyone's authored content |

**Why not put everything in EDS page meta?** Flat key/value metadata can't model
nested/list data (a gear checklist of items × category × weight, a multi-stage
briefing, a permit table) without awkward `gear1`, `gear2`… keys or authoring it as
block content and parsing it back. The fix is the **spreadsheet variant of B** — an
EDS-published sheet is still EDS, still author-owned, still one source of truth, and
models tabular/list data cleanly.

---

## 5. Concrete data-model changes (Option B)

### 5.1 Scalars → page Metadata + `helix-query.yaml`

Author these in each adventure page's Metadata block:

```
| Metadata        |            |
| experienceLevel | Advanced   |
| pace            | Endurance  |
| priority        | Physical challenge |
| landscape       | Mountains  |
| region          | Americas   |
| country         | Chile      |
| duration        | 9 days · 115 km |
| tripLengthDays  | 9          |
| verifiedStatus  | Verified · February 2026 |
```

Then extend the `default` (and `adventures-map`) index in `helix-query.yaml`:

```yaml
      experienceLevel:
        select: head > meta[name="experiencelevel"]
        value: attribute(el, "content")
      pace:
        select: head > meta[name="pace"]
        value: attribute(el, "content")
      priority:
        select: head > meta[name="priority"]
        value: attribute(el, "content")
      landscape:
        select: head > meta[name="landscape"]
        value: attribute(el, "content")
      region:
        select: head > meta[name="region"]
        value: attribute(el, "content")
      country:
        select: head > meta[name="country"]
        value: attribute(el, "content")
      duration:
        select: head > meta[name="duration"]
        value: attribute(el, "content")
      tripLengthDays:
        select: head > meta[name="triplengthdays"]
        value: attribute(el, "content")
      verifiedStatus:
        select: head > meta[name="verifiedstatus"]
        value: attribute(el, "content")
```

(EDS lowercases meta names; author `experienceLevel` in the block, select
`experiencelevel`.)

### 5.2 Tabular/list data → EDS attributes spreadsheet

Author a workbook (e.g. `/data/adventure-attributes`) published to
`/data/adventure-attributes.json`, one row per `adventure_id`:

| Column | Example | Feeds |
|---|---|---|
| `adventureId` | `patagonia-trek` | join key |
| `gear` | `Trekking poles;Down jacket;35L pack;…` | `build-gear-checklist` |
| `gearByCategory` | `shelter:Tent,Footprint;sleep:Bag,Pad` | `build-gear-checklist` |
| `permits` | `CONAF park entry;Refugio reservation` | `plan-permits-and-access` |
| `accessNotes` | `Fly PUQ → bus to Laguna Amarga` | `plan-permits-and-access` |
| `packReferenceKg` | `12.5` | `audit-pack-weight` |
| `physicalDemand` / `technicalSkill` / `remoteness` | `4` / `2` / `5` | `discover-adventures` |

Semicolon/comma-delimited cells keep lists authorable in a flat sheet.

### 5.3 Catalog pass-through (minimal worker change)

Once the scalars are in the index, extend `toProductBusEntity` in
`product-bus-schema.js` to copy them onto `entity.extensions` (and/or top level) so
the catalog carries them. Enrichment JSON keeps *only* `destinationIata`/`demoPrice`.
Optionally the worker reads the attributes sheet and merges gear/permits into the
entity, so handlers have a single fetch.

---

## 6. Per-action integration

| Action | Read | Write | Extra source needed |
|---|---|---|---|
| `discover-adventures` | catalog `index.json` (+ §5.1 scalars) | — | B scalars for full filters |
| `build-route-briefing` | `{sku}.json` + page `.plain.html` (stages) | — | C: assemble/parse; optional derived endpoint |
| `build-gear-checklist` | `{sku}.json` + attributes sheet (`gearByCategory`) | — | B sheet |
| `plan-permits-and-access` | attributes sheet (`permits`,`accessNotes`) + `/api/flights/search` (via `destinationIata`) | — | B sheet + C (flights) |
| `audit-pack-weight` | `{sku}.json` + `packReferenceKg` | — | C: real compute from user `items` (drop `MOCK_AUDIT`) |
| `prepare-field-submission` | catalog `index.json` (match) | `POST /api/forms/{slug}` or `/api/b2b/adventures` | real write |

---

## 7. Phased delivery

**Phase 0 — Plumbing (llmapp, once)**
- Add `actions/lib/wknd.js`: base URLs from `extra.variables`
  (`WKND_CATALOG_BASE`, `WKND_B2B_BASE`, `WKND_EDS_BASE`), timeout, error
  normalization, small TTL cache.
- Declare those variables in the LLM Apps UI; download `actions.json` for `dev:local`.
- Keep `MOCK_DATA` as a **fallback** on fetch failure (guard behind `USE_MOCK`), so the
  demo never hard-breaks.

**Phase 1 — Wins on existing APIs (no backend change)**
- `prepare-field-submission` → match on catalog index, real `POST` to B2B. *(Highest
  demo value — a real write.)*
- `discover-adventures` → read catalog `index.json`; rich-attribute filters degrade
  gracefully until Phase 2.
- `audit-pack-weight` → fetch entity for reference kit; real audit math, drop `MOCK_AUDIT`.

**Phase 2 — EDS attributes (Option B)**
- Add §5.1 Metadata + helix-query properties across the 15 adventure pages.
- Add §5.2 attributes spreadsheet.
- Extend `toProductBusEntity` pass-through (§5.3); re-sync catalog.
- `discover-adventures` filters become fully real.

**Phase 3 — Rich actions (Option C, reads Phase 2 data)**
- `build-gear-checklist` ← attributes sheet + category/climate from entity.
- `plan-permits-and-access` ← attributes sheet permits + real flights logistics.
- `build-route-briefing` ← entity + page content (interim: parse `.plain.html`;
  later: `GET /catalog/adventures/{sku}/briefing.json` derived endpoint).

**Phase 4 — Hardening**
- Jest per handler (live API mocked); update each TODO block to document the now-real
  contract; README note on the declared variables; remove or flag mocks.

**Recommended order:** Phase 0 → `prepare-field-submission` + `discover-adventures`
→ Phase 2 → Phase 3.

---

## 8. Decisions (locked 2026-09-24)

1. **Content changes are made via the DA - Prod MCP** (org `znikolovski`, repo
   `masterclass-demo`). Metadata rows (§5.1) are injected into each adventure page's
   `<div class="metadata">` block, then previewed and published. Authoritative values
   are sourced from the team's own hand-authored `MOCK_DATA` in the llmapp actions
   (10 adventures have full values; see §5.4).
2. **A new EDS attributes sheet is created** (§5.2) for the tabular/list data (gear,
   permits, pack reference).
3. **Server-side merge — the more efficient path.** The Aero worker reads the
   attributes sheet and merges gear/permits/pack data into the catalog entity, so each
   handler makes a single cached fetch (accept the ≤6h sync latency).
4. **`match_reason` stays a computed rationale (C)** — never authored; it is
   query-relative.

### 5.4 Authoritative attribute values (from llmapp `MOCK_DATA`)

| adventure_id | experienceLevel | pace | priority | landscape | region | country | duration | tripLengthDays | verifiedStatus |
|---|---|---|---|---|---|---|---|---|---|
| patagonia-trek | Advanced | Endurance | Physical challenge | Mountains | Americas | Chile | 9 days · 115 km | 9 | Verified · February 2026 |
| yosemite-rock-climbing | Beginner | Immersive | Skill-building | Mountains | Americas | United States | Flexible | 3 | — |
| alpine-cycling | Advanced | Endurance | Physical challenge | Mountains | Europe | France | 6 days | 6 | — |
| kayaking-norway | Advanced | Adrenaline | Solitude | Coast | Europe | Norway | 7 days | 7 | Verified · November 2025 |
| surfing-costa-rica | Intermediate | Immersive | Culture | Tropics | Americas | Costa Rica | Flexible | 5 | — |
| winter-mountaineering | Advanced | Endurance | Technical challenge | Mountains | Alpine | — | 1–3 days | 2 | — |
| desert-survival-guide | Intermediate | Endurance | Solitude | Desert | Americas | United States | 48 hours | 2 | — |
| mountain-photography | Intermediate | Slow & immersive | Photography | Mountains | Alpine | — | Flexible | 3 | — |
| ultralight-backpacking | Intermediate | Endurance | Comfort / weight | Mixed | General | — | Multi-day | 4 | — |
| wild-swimming-guide | Beginner | Slow & immersive | Solitude | Waterways | Mountains | — | Day trip | 1 | — |

Blog pages without authored mock values (`food-safari-melbourne`, `ladakh-india`,
`mekong-delta-vietnam`, `ohrid-*`, `test`) are out of scope for this pass.

---

## 9. Implementation status (2026-09-24)

### Content (via DA - Prod MCP)
Scalar attributes added to the page Metadata block, verified as `<head>` metas + body
intact, and **published**:
- ✅ patagonia-trek
- ✅ yosemite-rock-climbing (also repaired: recovered `template`, restored truncated
  description, removed post-`</body>` garbage)
- ✅ alpine-cycling
- ✅ kayaking-norway — root cause found and fixed: the "In the Field" section was
  missing its closing `</div>` after the `columns-gallery` block, which nested the
  following "inverse" section *and* the page `metadata` block one level too deep
  (`body>main>div>div>div` instead of `body>main>div>div`), so the metadata block was
  never being consumed into `<head>`. Added the single missing `</div>`, verified all
  metas land in `<head>` and the body ends with the expected empty section `<div>`
  (matching the `patagonia-trek` pattern), previewed, and published.
- ✅ surfing-costa-rica — found and fixed real corruption: the `template` field was
  missing from the metadata block and had been mangled into a garbage
  `section-metadata` block dumped *after* `</body>` (invalid, dead markup). Removed the
  post-body junk, restored `template: blog-article` in the metadata block, added the
  new attribute fields, verified head metas + clean body end, and published.
- ⏳ winter-mountaineering, desert-survival-guide, mountain-photography,
  ultralight-backpacking, wild-swimming-guide — delegated to two background agents
  (running), following the verified kayaking-norway/surfing-costa-rica procedure:
  diagnose structural corruption via a nesting-depth parser check, repair, add fields,
  preview, verify head metas + clean body end via curl, then publish.

> These imported pages carry pre-existing corruption (post-`</body>` junk, orphaned
> prose, mis-nested `section-metadata`). Repair pattern: wrap orphaned prose in a
> section `<div>`; keep `section-metadata` a direct child of its section; recover
> `template`; strip post-body junk. Verify each with a head-meta + body-word-count
> check before publishing.

### Code (done — no DA dependency)
- ✅ `helix-query.yaml` — default index now extracts `adventureCategory`,
  `experienceLevel`, `pace`, `priority`, `landscape`, `region`, `country`, `duration`,
  `tripLengthDays`, `verifiedStatus`, `placeName`. **Requires commit + code-sync** for
  the query-index to carry them.
- ✅ `actions/lib/wknd.js` (llmapp) — shared data access: `loadAdventures` (merges EDS
  query-index scalars over the Aero catalog's commerce fields over MOCK_DATA fallback),
  `loadAttributes` (EDS attributes sheet), `searchFlights` (Aero flights), `submitForm`
  (B2B). 5-min TTL cache, 6s timeouts, graceful mock fallback.
- ✅ All six handlers rewired to `loadAdventures(extra, MOCK_DATA)`; MOCK_DATA retained
  only as fallback. `plan-permits-and-access` additionally populates real transport legs
  from the flights API (verified: `Fly JFK → PUQ`) and permits from the attributes
  sheet. TODO blocks updated to document the real contract.
- Smoke-tested end-to-end against the **live** APIs: discover (cycling→alpine-cycling,
  hiking→patagonia + ohrid + ladakh from the real catalogue), briefing, permits, gear.

### Architecture note — revisiting decision #3
Implemented as **handlers read query-index + catalog (+ sheet) directly**, not via a
worker-side merge. Rationale (the "more efficient" judgment delegated in decision #3):
handlers already make one cached multi-fetch, this needs **no worker redeploy and no
6-hour sync latency**, is fresher, and works today. The Aero worker
`product-bus-schema.js` pass-through (§5.3) is therefore **optional** — only needed if
another consumer wants the scalars on the catalog entity itself.

### Remaining
1. Finish kayaking-norway + the 6 pages (needs DA session re-auth — a **Claude Code
   session restart**, not just a connector reconnect).
2. Create the EDS attributes sheet `/data/adventure-attributes` (gear, permits,
   `packReferenceKg`) — unblocks the gear/permits/pack detail. Needs DA.
3. Commit + code-sync `helix-query.yaml`; re-index so scalars land in the query-index.
4. (Optional) real item-level `audit-pack-weight` computation; worker pass-through.
5. Declare `WKND_EDS_BASE` / `WKND_CATALOG_BASE` / `WKND_B2B_BASE` in the LLM Apps UI
   (defaults are baked in, so this is only needed to point at non-prod).
