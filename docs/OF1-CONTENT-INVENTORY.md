# OF1 Search Content Inventory

**Source:** public EDS `query-index.json` and rendered `.plain.html` pages for
`main--masterclass-demo--znikolovski` on 2026-10-05. This is a published-content
inventory, not a complete DA source-tree listing; unpublished DA documents and
assets are not represented.

The site query index contains 76 entries. The following 25 content pages were
loaded successfully and their headings, paragraphs, lists, and same-site images
were inspected for the initial OF1 search scope:

| Area | Pages |
|---|---|
| Entry / discovery | `/adventures`, `/destinations`, `/basecamp`, `/expeditions` |
| Practical information | `/faq`, `/gear`, `/field-notes`, `/sustainability` |
| Brand context | `/about`, `/community` |
| Adventure guides | `/blog/alpine-cycling`, `/blog/kayaking-norway`, `/blog/desert-survival-guide`, `/blog/mountain-photography`, `/blog/patagonia-trek`, `/blog/surfing-costa-rica`, `/blog/ultralight-backpacking`, `/blog/wild-swimming-guide`, `/blog/winter-mountaineering`, `/blog/yosemite-rock-climbing` |
| Additional destination guides | `/blog/ohrid-city-of-thousand-churches`, `/blog/ohrid-north-macedonia`, `/blog/ohrid-macedonia`, `/blog/mekong-delta-vietnam`, `/blog/ladakh-india` |

These pages provide a grounded first release for adventure discovery,
recommendation, comparison, and factual follow-up questions. The FAQ and gear
pages add practical answers; destination and guide pages supply trip context.
Only content explicitly present in these pages should be treated as factual.

The index also contains navigation and footer documents, block examples,
templates, fragments, forms, and demo widgets. These are not automatically
knowledge sources; they require a separate relevance review before ingestion.

## DA source inventory

The DA Admin API source listing was inspected read-only on 2026-10-05. The
complete 160-path snapshot (106 HTML files, 50 directories, 3 JSON files, and 1
Markdown file) is recorded in
[`OF1-DA-SOURCE-INVENTORY.json`](OF1-DA-SOURCE-INVENTORY.json). It covers the
whole `znikolovski/masterclass-demo` DA repository, not just the OF1 search
scope.

The source tree contains 11 root-level content pages, 16 blog documents,
shared block examples under `blocks/`, six EDS widget demos, two forms,
27 fragment documents, the `find-your-adventure/results.html` page, three
existing EDS templates (blog article, field notes, landing page), and a report.
The root `nav.html` and `footer.html`, `drafts/`, `library/`, block examples,
forms, fragments, and widget demos are not automatically treated as general
search knowledge. The three existing `/templates` documents are page-authoring
templates, not OF1 response templates. No `/of1` or `/of1/knowledge` content
was present in the DA source tree.

There are two source mismatches to resolve before final ingestion:

- `blog/food-safari-melbourne.html` and `blog/test.html` are in DA but were not
  among the published search pages inspected for this first release.
- `/blog/ohrid-city-of-thousand-churches` appears in the published content
  inventory and generated knowledge, but no matching `blog/` document appears
  in the DA source listing. Its live content exists, but its source ownership
  needs confirmation.

The current config draft contains 15 adventure entities, 25 FAQs, four
personas, and ten suggestions. `knowledge-pages.json` captures 17 published
pages: those 15 adventure pages plus `/faq` and `/gear`. It is generated from
published `.plain.html` pages; it is not a DA-source export. Search should
remain grounded in these captured pages, and the two DA-only blog entries
should stay excluded unless their published status and intended use are
confirmed.

## Feature-branch rollout status

After explicit feature-branch-only authorization, `/of1`, 17 knowledge
documents, and five response templates were previewed and published to the
`llm-traffic-tracking` feature tier. They were not published to `main`; no PR
was opened. The feature `/of1` page and its header search were checked at 375,
768, 900, and 1280 px on both `.aem.page` and `.aem.live`: all returned HTTP
200, with no horizontal overflow or browser-console errors.

The feature worker reports `ready: true`, with knowledge, suggestions, the
endpoint, CTA template, and templates available. However, this does **not**
yet establish reliable content grounding:

- `POST /api/tenants/llm-traffic-tracking--masterclass-demo--znikolovski/sync`
  returns Cloudflare error 1101 / HTTP 500, including with the documented
  no-body request.
- Generation returns HTTP 200, but debug data for both a general Sonoran water
  question and an exact-title source question reports `rag-vectorize` with
  `matched: 0`, `products: 0`, and `content: 0`.
- One response produced unsupported details and did not preserve the source's
  explicit 4 L minimum; an exact-title query later repeated 4 L but still had
  zero RAG matches. Treat these as model output, not verified retrieval.

The retrieval blocker was rechecked on 2026-10-06 after the maintainer's
repair: sync returned HTTP 200 with 40 entity vectors and 283 content chunks
indexed, and an Alpine cycling question returned six retrieval matches,
including four content matches. These counts establish that ingestion and
retrieval now work, not that every generated claim has been fact-checked.
The failure evidence above is historical. The main tenant and main `/of1`
route remain unchanged. See
[`OF1-RAG-AND-SITEMAP-BLOCKER.md`](OF1-RAG-AND-SITEMAP-BLOCKER.md) for detailed
reproduction evidence and the separate sitemap/robots investigation.

## Integration completion follow-up (2026-10-06)

The config-review page and demo hub are generated under `deliverables/`.
The review page reads the current `knowledge.json` model (15 adventures and
25 FAQs), along with brand voice, personas, suggestions, CTA, template
routing, and the OF1 endpoint. The hub links the published content and five
response templates under `/templates/of1/`; nested paths are preserved.

The generated-result sizing fixes keep padded containers and follow-up
inputs within the viewport. Streamed hero headings are visible, responsive,
and no longer reserve the initial page's heading-height placeholder.
Generated responses and both deliverables were checked at 375, 768, and
1280 px with no horizontal overflow. The canonical `blocks/of1/of1.js` is
unchanged.

One worker-side UI issue remains: `/api/suggest` returns only suggestions,
not the title, subtitle, or placeholder from `suggestions.json`. The client
therefore shows generic search copy despite the served WKND configuration.
This requires a shared worker/API fix rather than patching the canonical
client block.

## Wide-desktop layout and image quality follow-up

Streamed sections are decorated in a detached `main`, one section at a
time. Only an attached page's first section should receive the first-section
LCP treatment; otherwise every streamed section inherits full-bleed hero
styling. Non-hero results now retain the normal centered, padded section
layout. Generated card grids collapse unused tracks and center a single
card at a maximum width of 480 px; ordinary authored card grids are unchanged.

The primary OF1 adventure images were 750 px delivery renditions copied as
new assets. The knowledge configuration now references the original article
Media Bus assets without resize parameters, and all five DA templates were
updated and previewed/published on `llm-traffic-tracking` only. Their hero
originals are now 1379-1600 px wide instead of 750 px. Preserve original
image URLs when regenerating configuration or templates: requesting a larger
delivery width cannot recover detail from a previously resized source.
Cross-origin EDS Media Bus images also retain responsive optimization on
localhost rather than becoming single fallback images.

After tenant sync, real `ohrid` generation returned the new image hashes.
At that point image relevance was unresolved: this response still
retained template images and links despite replacing their accompanying
text with Ohrid copy. Higher-resolution sources do not repair that mismatch.

## Knowledge imagery and article destinations

The 17 captured knowledge pages were initially text-only. The extraction skill
already required capturing images and publishing them inline; the capture
omitted those steps. The original pages now include 95 image placements using
91 native article assets and links to all 17 original sources, preserving the existing
headings, paragraphs, and lists. Author portraits, unrelated recommendation
images, duplicate assets, and a broken `about:error` image were excluded.
Existing same-tenant Media Bus originals were reused rather than downloaded at
a smaller delivery size and uploaded again.

Image-only paragraphs were discarded by retrieval chunking. The publisher now
keeps each image with its descriptive caption and preceding article citation
in a text-bearing paragraph. Citation destinations also appear as readable
URLs because anchor attributes do not survive text extraction. This associates
each retrieved photograph with its actual source article, even when the
article's opening passage is not retrieved. Real Ohrid generation used Ohrid
photography after captioned sources were published.

Knowledge entity URLs and source citations now use the fully qualified feature
`.aem.live` origin. The shared SDK also rewrites relative links using the tenant
identifier as a hostname, dropping the required `.aem.live` suffix. The site's
normal decoration hook resolves relative and bare-tenant links to the feature
live origin before that rewrite. This applies only to detached OF1 results;
ordinary authored-page links, fragment anchors, and external destinations are
unchanged. The canonical OF1 block and shared SDK were not forked.

The header search submit button has an inset from the pill border. The
follow-up submit arrow inherits a white foreground normally and a dark
foreground on orange hover, fixing the previous black-on-black appearance.

## Comparison retrieval follow-up

An exact `Compare Patagonia and Yosemite` request selected the comparison
template correctly, but all four retrieved passages came from Patagonia.
Yosemite was omitted from the cards or replaced with an unsupported five-day
80 km trek. This is a grounding problem, not just sparse styling. The content
retrieval budget was increased to eight passages, but still supplied no Yosemite
source for that query. A separate Ohrid/Ladakh comparison did retrieve both
destinations at this budget: coverage is query-dependent, not universally broken.
A dedicated sourced comparison primer adds both activities, two image placements,
and original article citations together for the demo. This brought the corpus to
18 knowledge documents with 97 image placements. The public FAQ and its knowledge
capture remain unchanged. Even after the primer appeared in the query index and sync
indexed 292 chunks, the exact comparison query still retrieved only Patagonia:
the source exists, but the worker does not reliably select it.

All five response templates were enriched and feature-published. Comparison
uses two substantive HTML columns covering activity, preparation, and conditions,
plus both original field notes. The other intents also use richer route and
preparation columns rather than two short blurbs; recommendation and budget
have three available card rows, and discovery has six. Multi-paragraph card
content supports source-specific detail instead of repeating the same intro.
Existing block decorators and styles are reused, and unknown prices or
itinerary details must not be invented.
Generated wrappers allow long words in the richer headings to wrap rather than
overflow on narrow screens; ordinary authored headings are unaffected.

These are demo/content mitigations, not a general worker retrieval repair.
The richer comparison produced substantive activity/preparation/conditions
columns, but still dropped Yosemite's source card when its evidence was absent.
See [`OF1-GENERATED-CONTENT-QUALITY.md`](OF1-GENERATED-CONTENT-QUALITY.md)
for engineering reproduction evidence and acceptance criteria.

### Adventure-card handoff to WKND Sherpa

Generated adventure cards with a heading and an original `/blog/` article link
offer two actions: the existing field-notes link as a secondary button, and
**Chat with WKND Sherpa** as a primary button. Labels wrap on narrow cards.
Cards pointing to the same owner's WKND Aero site instead use
**View WKND Aero experience** or **Find flights with WKND Aero**, preserving the
full external URL and airport/adventure query parameters.
Generated grids show one column below 600 px and at most two columns above it;
additional cards wrap into new rows, and a single card stays centered.
The chat action uses the existing same-page `#sherpa?prompt=...&send=true`
deep link to automatically send
`Help me plan this adventure: {card title}. What should I prepare?`.
The prompt uses the visible title, not a potentially mismatched fallback article
destination.

Site decoration adds these actions consistently without a new model-generated
slot or changes to the authored template contract, canonical OF1 client, or
concierge implementation. Ordinary authored cards remain unchanged.
Run `node tools/scripts/test-of1-actions.mjs` against the local server to check
the handoff, prompt encoding, responsive actions, and authored-card isolation.

### Recovery of corrupted native image IDs

The worker can also alter characters inside an immutable Media Bus asset ID.
Failed native images in generated sections are recovered only when their
caption matches exactly one asset in the published knowledge capture.
Recovery preserves responsive sizes and formats and does not substitute
images based on a guessed topic or similar hash. Captures are fetched only
after an image fails and shared across recovery attempts. Each image gets one
attempt; missing or ambiguous captions and failed canonical assets surface
explicit errors. Ordinary authored images are unaffected.

### Curated WKND Aero flight-linked experiences

Five rendered Aero experience pages were captured from the source site. Their source
HTML contains only an `adventure-detail` identifier, so ingestion uses their
rendered destination-airport, starting-fare, and flight-finder information.
These are flight-linked adventures, not evidence of an all-inclusive package.

| Experience | Destination airport | Published starting flight fare | Aero source |
|---|---|---|---|
| Ohrid lakeside adventure | OHD | from $449 | [Ohrid](https://main--wknd-aero--znikolovski.aem.live/adventures/ohrid-macedonia) |
| Yosemite granite climbing | FAT | from $349 | [Yosemite](https://main--wknd-aero--znikolovski.aem.live/adventures/yosemite-rock-climbing) |
| Lofoten Arctic surfing | EVE | from $749 | [Lofoten](https://main--wknd-aero--znikolovski.aem.live/adventures/kayaking-norway) |
| Patagonia W Circuit trekking | PUQ | from $899 | [Patagonia](https://main--wknd-aero--znikolovski.aem.live/adventures/patagonia-trek) |
| Ladakh Himalayan trekking | IXL | from $899 | [Ladakh](https://main--wknd-aero--znikolovski.aem.live/adventures/ladakh-india) |

Fares retain the site's displayed currency symbol and are captured demo
from-fare labels, not origin/date-specific quotes or total adventure costs.
The pages do not establish that hotels, guides, transfers, or activities are
included. The linked Aero flight finder is the destination for current options
and final pricing.

Each addition has four verified, already-ingested photographs from its linked
original WKND field notes. The original 18 captures, existing entities, and
persona recommendations are unchanged. Five `aero-*` slugs prevent collisions
with the original destination guides. The corpus now contains 23 documents
with 117 image placements using the same 91 verified native image URLs
(86 distinct asset filenames; some original URLs are path aliases).
Only the five new knowledge documents were previewed and published, on the
`llm-traffic-tracking` tier; Aero's own content and `main` were not modified.

**Worker ingestion is currently blocked.** Both EDS tiers serve all 45
knowledge entities and 23 captures, and the preview query index lists all five
Aero documents. Two sync attempts nevertheless returned a content-phase
subrequest-limit error, 40 indexed entity vectors, and `content: null`.
Actual worker responses for Ohrid, Yosemite, and Lofoten flight queries retrieved
only older knowledge and emitted no Aero source or booking links. Do not treat
model-generated Aero claims as verified until the shared worker completes
ingestion; see [`OF1-GENERATED-CONTENT-QUALITY.md`](OF1-GENERATED-CONTENT-QUALITY.md)
for the exact failure and
unsupported flight claims.

### Dedicated source-backed Aero section

OF1 results now include a separate **WKND Aero flight options** panel immediately
after Planning notes and before Keep exploring. This panel is decorated by the
site, not generated by the model, so it works independently of worker ingestion.
Searching `ohrid` is sufficient; the visitor does not have to mention Aero.
Comparisons can show multiple matching flight-linked experiences.

The five Aero entities in `of1/config/knowledge.json` carry structured
`flightOptions`: `destinationTerms`, `airport`, `startingFare` (the displayed
currency symbol and amount), and `bookingUrl`. Maintain these alongside the
source facts and canonical experience `url`; the renderer rejects inconsistent
airports/adventure IDs or invalid destinations instead of inventing substitutes.

Explicit destination names in the current query take priority. Without those,
the panel matches destination names in the current turn's visible hero/card
headings, not old turns, body prose, or inherited source-link fallbacks. Normal
search, follow-up queries, and suggestion chips are supported. Unmatched results
show no Aero panel; unavailable source data shows an explicit error.

The panel shows the sourced airport, published starting flight fare, Aero
experience link, and flight-finder link. It does not add schedules, departure
cities, seat availability or package inclusions. Its price caveat is always
visible. Results stack on mobile and use at most two columns from 600 px.
Ordinary authored cards and the canonical OF1 block/SDK are unchanged.

Run `node tools/scripts/test-of1-aero.mjs http://localhost:3000` for source,
placement, matching, follow-up/restart, responsive and error-state coverage.
