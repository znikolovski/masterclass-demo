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
