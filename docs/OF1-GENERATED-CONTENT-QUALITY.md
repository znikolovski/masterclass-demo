# OF1 generated-content quality: engineering handoff

Tenant: `llm-traffic-tracking--masterclass-demo--znikolovski`

Worker: `https://of1-gen-web-service.franklin-prod.workers.dev`

Demo: `https://llm-traffic-tracking--masterclass-demo--znikolovski.aem.live/of1`

## Scope

Sparse responses occur beyond a single comparison. Comparisons make the problem
particularly visible because one requested option disappears or receives
invented details. Template richness and retrieval coverage are separate concerns:
adding sections cannot supply a missing source.

## Confirmed retrieval failure

Before adding a curated demo answer, `Compare Patagonia and Yosemite` selected
the **comparison** template correctly, but its four retrieved passages were:

| Source | Heading |
|---|---|
| `/of1/knowledge/patagonia-trek` | In the Field |
| `/of1/knowledge/patagonia-trek` | What We Carried |
| `/of1/knowledge/patagonia-trek` | Days 3-4: The French Valley and the Wind |
| `/of1/knowledge/patagonia-trek` | Days 1-2: Into the Park |

There was no Yosemite passage despite the Yosemite knowledge page being
published and indexed. The response dropped one card (`rowsDropped: 1`) and
described Yosemite as a five-day 80 km trek. The actual source is a beginner
granite-climbing guide, not that itinerary.

Increasing `contentIngestion.contentTopK` from 4 to 8 did **not** fix coverage:
the actual prompt still contained only FAQ and Patagonia passages. The debug
summary reports `contentRetrieved: 8`; its abbreviated content list is not
the complete prompt, so inspect `debug.prompts.system` as well.
The demo retains the bounded eight-passage budget for broader context, but
raising the budget alone is not a general retrieval repair. A separate
`Compare Ohrid and Ladakh` request did retrieve both destinations at this
budget; its output still reported `linksRejected: 1`. Coverage is
query-dependent, not a claim that every comparison fails.

The original template also offered only two short descriptions and two
location facts. This constrained useful distinctions and repeated introductory
copy even when a source was available.

## Article links: two different problems

The shared SDK's `rewriteLinks(container, domain)` builds
`https://${domain}`. For an EDS tenant identifier this omits `.aem.live`.
A relative `/blog/yosemite-rock-climbing` therefore became the invalid:

```text
https://llm-traffic-tracking--masterclass-demo--znikolovski/blog/yosemite-rock-climbing
```

The site now resolves detached OF1 result paths to the feature live origin
before the SDK rewrite. Its knowledge entity URLs and source citations also
use fully qualified live URLs. The canonical OF1 block and SDK are unchanged.
The shared SDK still needs proper tenant-ID-to-content-origin resolution.

Separately, an actual deployed Ohrid request produced Ohrid imagery but
`linksRejected: 2`, leaving Alpine cycling and Norway template destinations.
A subsequent debug request proposed fully qualified original Ohrid article
URLs and reported `linksRejected: 0`. Both original article citations were
present in the retrieved text. This establishes intermittent destination
fallback, not the exact reason each rejected proposal failed; engineering
should inspect rejected values and validation reasons.

Correcting the URL origin does not correct a link to the wrong article.

A generated deep-dive also misspelled the asset owner as `znikovovski` instead
of `znikolovski`. The accepted native Ohrid image therefore had
`naturalWidth: 0` in the browser. Site decoration now normalizes native Media
Bus URLs and their responsive sources for this repository to its configured
live origin. Other repositories and ordinary authored pages are unaffected.
The worker should validate full asset URLs against their canonical provenance,
not allow a correct image hash to mask an invalid host.

## Partial slot output can retain the wrong source

`Recommend hiking and climbing adventures` returned card titles for Patagonia
and Yosemite, but supplied only the title and description slots for those rows.
It omitted their image and link slots. The splicer retained the authored Alpine
cycling and Ohrid card destinations, with `linksRejected: 0` and `fallback: 0`.
This is a separate reproducible failure: no rejected link is needed to create
a misleading source association.

Block-level `matched` and `fallback` counts therefore do not establish that
all required card fields were filled consistently. Validate completeness and
types at the slot/row level, and bind title, image, and destination to the same
source identity instead of inheriting unrelated examples.

## Site-side mitigations

- All 17 captured pages retain their original text and now include contextual
  native images, descriptive captions, and canonical article citations.
- Image paragraphs include readable source destinations so retrieved passages
  retain their provenance even when anchor attributes are stripped.
- A dedicated sourced Patagonia/Yosemite comparison primer distinguishes
  sustained trekking from technical climbing and explicitly rejects the
  unsupported five-day 80 km itinerary. The original 17 captures are unchanged
  apart from their image/citation enrichment; this is an eighteenth document.
- All five intent templates now have substantive HTML content slots instead of
  two short blurbs. Comparison covers activity, preparation, conditions, and
  both original field notes. Recommendation and budget have three card rows;
  discovery has six. Deep-dive includes route context and preparation.
  Cards support multiple paragraphs rather than repeating the lead.

These mitigations do not establish reliable arbitrary-pair retrieval.

The exact comparison was rechecked after the primer appeared in both query
indexes and sync indexed 292 chunks. It still received only Patagonia passages
and dropped Yosemite's card (`rowsDropped: 1`). The richer response contained
274 words and three criteria per option, but that improvement is **not** proof
of balanced grounding or a complete two-card comparison.

That output also described winds as regularly reaching 80 km/h; the source
describes the author's estimate of gusts on one day. Engineering should prevent
anecdotal estimates from becoming general conditions or guarantees.

## Rendered examples after template enrichment

Real worker responses were rendered through the site's shared SDK and normal
decoration at 375, 768, and 1774 px. All five shapes remain within the viewport,
including long headings, and native images load after canonicalization.

| Intent | Example | Words | Cards |
|---|---|---:|---:|
| Comparison | Compare Patagonia and Yosemite | 274 | 1 |
| Deep-dive | Ohrid guide | 374 | 0 |
| Recommendation | Hiking and climbing recommendations | 414 | 2 |
| Discovery | Adventure catalog | 496 | 6 |
| Budget | How much does ultralight backpacking gear cost? | 254 | 1 |

Word counts indicate that the templates no longer force short blurbs, not that
the generated claims are accurate. The single comparison card and incorrect
recommendation associations remain explicit failures above. A focused cost
answer retaining one option is not equivalent to dropping an explicitly
requested comparison option.

## Reproduction

```bash
curl -sS \
  https://of1-gen-web-service.franklin-prod.workers.dev/api/generate \
  -H 'Content-Type: application/json' \
  --data '{
    "domain": "llm-traffic-tracking--masterclass-demo--znikolovski",
    "query": "Compare Patagonia and Yosemite",
    "debug": true,
    "context": {
      "browsing": [],
      "conversationHistory": ["Compare Patagonia and Yosemite"],
      "acquisition": {}
    }
  }'
```

The curated primer is published at
`/of1/knowledge/comparison-patagonia-yosemite`, but was not selected in the
recheck above. To verify a **general** repair, test other source-backed pairs
and inspect actual passages rather than assuming a curated answer proves
balanced retrieval.
Exercise discovery, recommendation, deep-dive, and budget queries too.
Record selected template, source paths in the prompt, final HTML, and
`slotResolution`, not just the model's raw slot proposals.

## Requested engineering changes and acceptance criteria

| Area | Request | Acceptance criterion |
|---|---|---|
| Comparison retrieval | Resolve each requested entity independently and balance/rerank context across their source documents | Both named options receive substantive source passages; one document cannot consume the entire context budget |
| Exploratory retrieval | Diversify relevant source documents instead of returning several adjacent passages from one article | Discovery and recommendation can offer distinct grounded options |
| Generation grounding | Handle missing evidence explicitly | No invented route, distance, duration, price, or silently omitted comparison option |
| Link validation | Normalize absolute and relative canonical article destinations consistently and preserve provenance from ingested source content | Correct same-site article links are accepted regardless of equivalent URL form |
| Link fallback | Make rejection reasons observable and avoid unrelated template destinations under newly generated titles | Rejected proposals cannot leave a misleading source link |
| Partial slot output | Validate required image and destination slots whenever card identity changes | Missing fields cannot inherit unrelated example imagery or links while reporting a fully matched block |
| Shared client origin | Separate tenant identifiers from published content origins | Localhost and both EDS tiers produce valid full article URLs with the configured content hostname |
| Asset validation | Keep full canonical asset origins when filling image slots | Correct hashes cannot be emitted under misspelled or unverified hosts; images load successfully in the browser |
| Output quality | Validate the rendered, spliced response rather than only model proposals | Both compared options, useful distinctions, source-matched images, and correct clickable destinations survive into the browser |

The sync endpoint returning HTTP 200 and indexing 40 entity vectors and
292 content chunks proves ingestion is available; it does not
prove these output-quality criteria.
