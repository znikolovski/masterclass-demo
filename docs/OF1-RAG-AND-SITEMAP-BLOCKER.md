# OF1 Retrieval and Sitemap Blocker

**Status:** Retrieval blocker resolved; feature-branch validation continues.
**Branch:** `llm-traffic-tracking`
**Date checked:** 2026-10-05

**Rechecked:** 2026-10-06. After the OF1 maintainer's repair, the feature
tenant sync returns HTTP 200 with `ok: true`, no errors,
`vectors.indexed: 40`, and `content.indexed: 283`. A fresh question about the
Alpine cycling guide reports `rag-vectorize` with `matched: 6` and
`content: 4`. An immediate post-sync comparison initially still reported
zero matches, so allow indexing to become searchable and verify retrieval
separately from sync success. The worker-side root cause and repair were not
available in this repository.

The diagnostics below preserve the historical 2026-10-05 failure evidence.

**Sitemap/robots resolution:** The missing sitemap origin was corrected in
Configuration Service, robots now advertises the custom-domain sitemap, and
the production host was registered as Adobe Managed CDN for cache
invalidation. Local configuration mirrors are `config/sitemap.yaml`,
`config/robots.txt`, and `config/cdn.json`. The historical findings below
describe the state before this fix; the OF1 retrieval blocker remains open.
Sitemap membership and the shared query index were not changed.

## Executive summary

The OF1 page and header search are available on the feature branch, and the
worker reports the feature tenant as ready. That readiness flag only confirms
that required configuration is present. It does not confirm that any content
was vectorized or can be retrieved.

On 2026-10-05, the sync endpoint returned HTTP 500 with Cloudflare error 1101. Generation
requests nevertheless return HTTP 200, but their debug payload reports zero
RAG matches, including for an exact-title question about the indexed Sonoran
source. One response supplied unsupported details; a later response repeated
the source's 4 L figure but still showed zero retrieval. Until the worker's
sync/indexing path is fixed and retrieval is observable, its factual answers
must not be represented as grounded in WKND content.

Separately, the public sitemap has 99 `loc` entries and every one uses the
invalid host `https://undefined`. The custom-domain `robots.txt` references
only Adobe-owned sitemap URLs, while the Adobe-host robots files disallow all
crawling. These sitemap/robots findings are in the EDS site/CDN configuration
layer. There is no evidence that they directly cause OF1's zero RAG matches,
although both issues warrant a review of branch/site configuration.

## OF1 evidence and reproduction

The feature tenant is
`llm-traffic-tracking--masterclass-demo--znikolovski`.

### Configuration and source availability

- `GET /api/tenants/{tenant}/status` returns HTTP 200 and `ready: true`, with
  `hasKnowledge`, `hasSuggestions`, `hasOf1Endpoint`, `hasCtaTemplate`, and
  `hasTemplates` set to `true`.
- The feature `.aem.live` query index contains `/of1`, 17 knowledge pages, and
  five `/templates/of1/` response templates.
- The feature `.aem.live` URLs for `of1/config/knowledge.json` and
  `/of1/knowledge/desert-survival-guide.plain.html` return HTTP 200.
- The `desert-survival-guide` knowledge entity contains the explicit
  source-backed statement: "The number is 4 litres per person per day in
  summer heat." The matching knowledge-page content also contains a 4 L
  minimum.

### Sync failure

The documented no-body request form has been tried:

```sh
curl -i -X POST \
  'https://of1-gen-web-service.franklin-prod.workers.dev/api/tenants/llm-traffic-tracking--masterclass-demo--znikolovski/sync'
```

It returns HTTP 500 and `error code: 1101`. Adding a JSON content-type header
without a request body did not change the failure. The status endpoint still
reports `ready: true`, so readiness is not evidence that sync/vectorization
succeeded.

### Generation has no retrieval matches

The worker's `/api/generate` endpoint returns HTTP 200 and
`application/x-ndjson`. Two queries were checked:

1. "How much water should I carry per day on the Sonoran Desert adventure?"
2. "According to '48 Hours in the Sonoran: A Field Guide to Desert Survival',
   what is the minimum water per person per day in summer heat?"

For both, the debug step reported:

```json
{
  "step": "rag-vectorize",
  "meta": {
    "matched": 0,
    "products": 0,
    "content": 0
  }
}
```

The first generated response did not state the source's 4 L minimum and added
unsupported guidance. The exact-title response did say 4 L, but it also added
details not established by the retrieved source; the debug payload still
reported zero matches. Thus a correct-looking number is not proof of
retrieval or attribution.

### Team diagnostics requested

Please inspect the worker-side logs and sync implementation for this tenant,
then verify the following before calling the search grounded:

1. The exception behind the sync 1101 and whether it occurs while fetching the
   EDS query index, parsing the knowledge pages, embedding chunks, or writing
   vectors.
2. The exact host/tier used for fetching the feature branch's
   `/query-index.json` and each `.plain.html` document. The published feature
   query index and source pages are reachable from the browser.
3. Sync's `content.indexed` and `vectors.indexed` counts, plus the namespace
   and tenant key used for those writes.
4. A repeat of the exact-title generation query with a debug payload showing
   at least one relevant retrieval match and the source entity/page used.
5. An empty-retrieval behavior that declines to invent safety-relevant
   specifics when no content matches.

The gen-web worker source was not present in this repository, and a public
repository for it was not discoverable under the OF1 organization. The
remaining sync/vector investigation therefore needs worker access or its
maintainer's logs.

## Sitemap and robots findings

On 2026-10-05, the public endpoints returned:

- `https://wknd-adventures.run.place/sitemap.xml`: HTTP 200, 99 `loc` values,
  all `https://undefined/...`.
- `https://main--masterclass-demo--znikolovski.aem.live/sitemap.xml` and the
  corresponding `.aem.network` URL: the same malformed host in sitemap
  locations.
- The custom-domain `robots.txt` matches `config/robots.txt` and lists only:
  `https://main--masterclass-demo--znikolovski.aem.network/sitemap.xml` and
  `https://main--masterclass-demo--znikolovski.aem.live/sitemap.xml`.
- Both Adobe-owned robots endpoints return the standard `User-agent: *` /
  `Disallow: /` rules. AEM intentionally keeps `.aem.page` and `.aem.live`
  hidden from crawlers to prevent duplicate-content indexing.

The sitemap also includes `/nav`, `/footer`, `/fragments/**`,
`/find-your-adventure/results`, `/blocks/**`, `/templates/**`,
`/eds-widgets/**`, and OF1 content/configuration paths. This is consistent
with the broad default index in `helix-query.yaml`, which includes `/**` and
excludes only `/drafts/**`. Do not narrow that shared index without accounting
for OF1: the worker uses the feature query index to find OF1 knowledge pages
and response templates.

### Likely sitemap remediation

The official [AEM sitemap documentation](https://www.aem.live/developer/sitemap)
says the domain used for external sitemap URLs is controlled by the
`cdn.prod.host` project configuration. The repository has no `cdn.prod.host`
setting; its `conf/cdn.yaml` is CDN routing for other work and is not that
property. The sitemap output is strong evidence that the sitemap generator is
not receiving a valid production host, but the site-level Configuration
Service/CDN settings were not inspected. The team should verify the
production-host setting is `wknd-adventures.run.place`, confirm the custom CDN
forwards the expected host information, and regenerate the sitemap. The
[BYO CDN guide](https://www.aem.live/docs/byo-cdn-setup) documents the
production origin and required request-header handling.

The public custom-domain `robots.txt` should advertise the canonical custom
domain sitemap, for example:

```text
Sitemap: https://wknd-adventures.run.place/sitemap.xml
```

The source of truth must be confirmed before editing: the project currently
has `config/robots.txt`, but an enabled Configuration Service can override
repository configuration. The [Configuration Service guide](https://www.aem.live/docs/config-service-setup#update-robotstxt)
shows the site-level robots update path. After correcting the sitemap host,
the team should also decide which paths belong in the sitemap. Use a
sitemap-specific index/configuration or suitable `robots: noindex` metadata;
preserve the broader index if OF1 still needs those documents.

## Is the sitemap issue related to OF1?

No direct causal link is evident. The malformed sitemap is produced by AEM's
sitemap/CDN host configuration, while the OF1 failure is visible inside the
worker's sync and `rag-vectorize` steps. The worker receives an explicit
feature-tenant ID, and its generation endpoint can render templates even
though retrieval is empty. The sitemap's `undefined` host does not explain the
worker's zero match counts or its 1101 exception.

Both findings involve configuration across site/branch tiers, so a team review
of the production and feature environment mappings is reasonable. That is a
shared area to inspect, not proof of a shared root cause.

## Rollout boundary

The OF1 page, knowledge documents, and templates were published only to the
`llm-traffic-tracking` feature tier after authorization. No `main` content was
published and no PR was opened. Retrieval was verified on 2026-10-06 as recorded above. Promotion to `main`
remains a separate approval; this work stays on the feature branch.
