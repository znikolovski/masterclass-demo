# Automatic OF1 adventure ingestion

The isolated [`wknd-of1-ingestion` Worker](../workers/wknd-of1-ingestion/)
maintains knowledge for **newly published `/blog/**` adventure articles**.
It does not modify the site runtime, templates, Sherpa, Aero, or the current
ingestion allowlist.

**Production write mode is active.** Adobe service credentials are verified
against DA and the site's AEM Admin API, installed as Cloudflare secrets,
and the upstream sync-policy gate is enabled. A temporary published article
completed real ingestion and source-specific OF1 retrieval, followed by
withdrawal and a successful negative retrieval check. Health alone is not
proof of successful knowledge ingestion.

The production deployment is
[`wknd-of1-ingestion.jaggah.workers.dev`](https://wknd-of1-ingestion.jaggah.workers.dev/health),
with the `*/5 * * * *` schedule and persistent D1 state. This deployment is
separate from AEM Code Sync; no unrelated local site changes were released.
The activated Worker version is `3ec36863-e044-4ef8-9202-a18ba176a4be`.
Its actual `*/5 * * * *` invocation at 2026-10-15 23:15 UTC completed
successfully, idle on the original 15 articles, using 192 ms CPU.

## Detection and ownership

One five-minute cron reads the **published** root query index, including all
pages of the response. Public-index polling avoids a separate audit-log
credential. It does not ingest preview-only documents or use the deprecated
GitHub publication-event integration.

Only lowercase, extensionless `/blog/` paths are eligible. Drafts, generated
knowledge pages, configuration, and other sites cannot trigger ingestion.
The existing broad root index is unchanged. Fetch or pagination failures
abort processing rather than treating missing rows as deletions.

Existing curated entries whose `id` matches the article path after `/blog/`
are left alone. This matches the current 15 article records. Their planning,
Aero and FAQ companions, manually maintained mirrors and custom fields remain
unchanged. Existing curated articles are **not adopted** for automatic updates
or unpublishes. A custom ID convention for future manually curated articles
requires an explicit source-identity mapping before enabling automation.

For a new article, a SHA-256 hash of its canonical path produces a stable
`auto-blog-<24 hex characters>` ID. The automation owns:

* `/of1/knowledge/<id>`: a DA mirror for content RAG;
* the corresponding `of1-config` block inside the DA
  `/of1/config/knowledge` document: structured entity knowledge.

These are separate from the committed `knowledge.json` fallback and
`knowledge-pages.json` capture manifest. The latter remains the curated image
recovery catalogue; automatic entries are not added to it.

Actual live `.plain.html` is the source, not the index's concatenated `image`
field. Extraction preserves headings, article paragraphs, lists, quotes,
original image URLs/alt text and links. Related-card, form, navigation and
metadata blocks are excluded. Text is decoded and escaped before authoring;
source HTML/scripts are not copied into the generated document. The article
URL appears in both the mirror's citations and entity facts. No location,
fare, difficulty or safety facts are invented.

## Incremental lifecycle

A D1 singleton stores progress and uses an atomic SQL lease to serialize
invocations. KV's eventually consistent reads are not used as a lock.
The twenty-minute lease exceeds the scheduled invocation's fifteen-minute
wall-time limit. Each run performs at most one phase, with 35 outbound fetches,
eight index pages/4,000 rows, 15-second ordinary fetch timeouts and 1 MiB
document limits. Whole-tenant OF1 sync has a separate two-minute timeout:
real ingestion can outlast the ordinary source-fetch deadline.

1. Discover one new or changed article and checkpoint its stable identity.
2. Read its published source, create/update the mirror, preview and publish.
3. Read the current DA catalogue, back it up, replace only the managed record,
   and preview/publish. A **specific `If-Match` ETag** prevents concurrent
   author edits being overwritten. When DA omits the response ETag, derive
   its single-part S3 content MD5 and verify it with a conditional source GET
   before using it for the PUT. A failed verification, weak ETag or HTTP 412
   stops the phase; there is no unconditional-write fallback. This contract
   was exercised against an isolated real DA document: stale writes returned
   412 and preserved the intervening author's content.
4. Wait until the published query index reflects the mirror and the preview
   tier serves the matching entity and mirror. Compare semantic fingerprints
   of their actual contents: an existing ID or HTTP 200 alone is insufficient
   when the delivery cache still contains an earlier version.
5. Request OF1 preview sync, require explicit knowledge/content success and no
   reported errors, then advance the committed article hash.

With an empty queue and normal index visibility, this takes approximately
20-25 minutes from publication. Bursts are processed serially and take longer.
Failures retain the phase and retry on the next cron; they do not mark a page
ingested. Every failed invocation emits a structured error and stores
`last_error`. HTTP 401/403 requires credential/permission repair rather than
silent anonymous fallback.

Managed articles are checked using publication modification metadata.
Round-robin, due-after-24-hours hashes also detect changes with unchanged
metadata, one article per available invocation. Unchanged hashes do not
publish or sync. This is suitable for the small current corpus, not a
high-volume crawler.

A missing managed article must also return live HTTP 404/410 before a removal
is queued. The Worker unpublishes its owned mirror from live and preview,
removes its owned entity, waits for visibility and syncs. It does not delete
the original author article or the DA mirror source, allowing recovery.
Republishing during a pending removal restarts an upsert. Withdrawals have
priority over new jobs when no other job is already in progress.

### Upstream activation gate

The deployed DA sync app establishes the request shape:

```text
POST /api/tenants/main--masterclass-demo--znikolovski/sync?stage=preview&ref=main
```

The Worker targets the same tenant ID used by the site's generation requests.
The current DA app also supports an `org/repo` route; the legacy-shaped tenant
route above was verified with the deployed service.

This implementation requests one whole-tenant sync **per changed article**,
not per idle poll. It does not assume an undocumented per-article sync API.
Scoped configuration-file sync exists, but is not evidence of incremental
content-RAG synchronization.

Before setting `SYNC_POLICY_VERIFIED=true`, obtain maintainer confirmation or
an isolated-tenant demonstration that:

* unchanged documents are not needlessly re-embedded, or the cost of the
  whole-tenant rebuild has been explicitly accepted;
* removed mirror chunks and entity vectors are actually pruned, including
  preview-unpublished documents;
* the success response has `ok: true`, `errors: []`, `synced` containing
  `content` (current OF1) or `knowledge` (legacy OF1), and a nonnegative integer
  `content.indexed`.

The Worker conservatively rejects a response that does not establish these
success fields. An indexed chunk count alone does not prove source-specific
retrieval or stale-vector removal. Write activation must include an actual
new-article query and an unpublish/retrieval check. The current upstream
source has not been independently reviewed. The site owner confirmed the
maintainer's sync-policy assurance on 2026-10-16. A supervised service-account
sync returned `ok: true`, `synced` containing `content`, no errors and 331
indexed chunks before the acceptance fixture was published.

## Authentication and setup

From the repository root:

```sh
cd workers/wknd-of1-ingestion
npm ci
npm test
npm run test:live
npm run check
npm run types
```

`test:live` only downloads public content; it cannot write to any service.
Tests use native workerd HTMLRewriter and SQLite/D1, not DOM/lock stubs.
No AEM browser runtime has changed, so this Worker does not need a site
preview branch or frontend build.

For a new Cloudflare account, create the database and retain the resulting
`database_id` in `wrangler.jsonc`, then apply its migration:

```sh
npx wrangler d1 create wknd-of1-ingestion --binding STATE --update-config
npx wrangler d1 migrations apply wknd-of1-ingestion --remote
npm run deploy
```

The checked-in config describes the activated production deployment. For a
new account/site, first set `MODE=observe` and `SYNC_POLICY_VERIFIED=false`,
and replace its site/database bindings. Do not enable `write` until both
authentication and the upstream gate are satisfied.

For unattended operation, the Worker implements Adobe's documented OAuth
Server-to-Server `client_credentials` exchange. Provision secrets interactively:

```sh
npx wrangler secret put IMS_CLIENT_ID
npx wrangler secret put IMS_CLIENT_SECRET
npx wrangler secret put IMS_SCOPES
```

Use the credential's actual Developer Console scopes, not guessed scopes.
**An arbitrary Adobe API credential is not necessarily accepted by DA or
AEM Admin.** Have the DA/site administrators grant the service identity the
minimum necessary read/write rights on `/of1/config/knowledge` and
`/of1/knowledge/**`, plus preview/publish/unpublish rights on those paths.
Verify the identity against both services before activating writes. DA
service-identity provisioning remains an operational prerequisite, not
something this repository can grant itself. The production service identity
has now been verified: IMS token/profile and DA source/list reads succeed,
DA advertises read/write access, and EDS reports preview/live write/delete
permissions. Its three IMS values are installed as Cloudflare secrets;
the local `credentials.json` is gitignored and owner-readable/writable only.

Lifecycle operations use `https://admin.hlx.page/{action}/{owner}/{repo}/{ref}{path}`.
Those existing path shapes do not work on `api.aem.live`: that hostname
returned 404 during live verification. Never substitute hosts without
checking their distinct API contracts.

Tokens are minted only during active job phases, not idle/observation runs.
No token is persisted in D1 or logged. This low-volume implementation obtains
one token per active phase; it is not suitable for high-frequency token
generation. If volume grows, add a properly secured token cache.

For a **supervised test only**, `wrangler secret put DA_TOKEN` can supply an
interactive IMS bearer. It takes precedence over service credentials and
will expire; it is not an unattended solution. Remove it using
`wrangler secret delete DA_TOKEN` before switching to service authentication.
Never paste credentials into git, docs, deployment arguments or logs.

After satisfying the gate, edit the non-secret configuration:

```json
{
  "MODE": "write",
  "SYNC_POLICY_VERIFIED": "true"
}
```

Then deploy, watch an actual test article go through every phase, query OF1 for
a unique source-backed fact, unpublish it, and verify withdrawal from retrieval.
Do not use an existing curated article for this acceptance check.

### Verified production acceptance

A clearly labelled, non-bookable temporary article at
`/blog/of1-ingestion-validation-20261016` exercised the real services:

* Production cron discovered the article and published its owned mirror.
  A private Wrangler remote scheduled-test session accelerated subsequent
  phases using the production D1 lease/checkpoints; no public mutation
  endpoint was added.
* Catalogue publication preserved all **50 original curated record hashes**.
  The OF1 corpus increased from **331 to 334 chunks**. A real generation
  response's RAG diagnostics identified the owned mirror, and its unique
  packing phrase appeared in the supplied model context without being
  included in the question. The generated visible sections did not repeat
  that phrase; this establishes retrieval, not guaranteed wording.
* Source withdrawal removed the owned mirror from preview/live and removed
  only its catalogue entry. D1 committed `deleted=true`, with no pending job
  or error, and sync returned the corpus to **331 chunks**.
* Retrieval initially still reported stale source metadata despite the lower
  chunk count. After allowing propagation and a supervised repeat sync, a
  fresh generation returned neither the owned source nor its unique fact.
  Do not equate a successful sync/count change with immediate retrieval
  freshness.
* The temporary DA article and mirror were deleted after public withdrawal.
  All 50 original catalogue records remained unchanged.

Native workerd/D1 coverage passes **24 regression tests**, including updates,
withdrawal, conditional-write races, strict sync responses and sync deadlines.
The opt-in public test also passes for all **15 original published articles**.
Changed Worker files pass ESLint and the Wrangler dry bundle. Repository-wide
JavaScript/CSS lint remains blocked by unrelated pre-existing errors; DRY
analysis passes, but its tracked-diff scope excludes the new untracked Worker.

## Operations and recovery

`GET /health` is public process liveness and configuration information only.
It is not an ingestion-success or credential-validity check. No public
HTTP endpoint can trigger writes.

```sh
npx wrangler tail --format json
npx wrangler d1 execute wknd-of1-ingestion --remote \
  --command 'SELECT last_run,last_success,last_error,value FROM ingestion_state'
```

`value.observation` records the last changed observation: candidate paths and
published adventure count. `value.pending` identifies the resumable phase.
Do not clear it merely to silence an error. After repairing a transient
failure or credentials, the next cron resumes it.

To stop all authoring and sync writes, redeploy with `MODE=observe`.
Observation does not discard pending work. To stop even observation, remove
the cron from the configuration and redeploy.

D1 retains the 20 most recent distinct pre-write catalogue snapshots in
`catalogue_backups`. Export the database before any manual repair:

```sh
npx wrangler d1 export wknd-of1-ingestion --remote --output ./ingestion-backup.sql
```

Keep that export outside git. Coordinate recovery with an author: blindly
restoring an old whole-catalogue snapshot could discard later editorial
changes. Correct just the affected record, preview/publish, and verify OF1
again. D1 state loss must be investigated before write mode is restored.

Cloudflare logs must be monitored for failed invocations and CPU-limit
termination; an alert destination has not been provisioned by this code.

## Runtime limits and cost policy

Five-minute cron means 288 runs/day, well below 100,000 Workers requests/day
on its own. D1 replaces KV for correct serialization: ordinary idle runs
write two singleton rows, approximately 576 writes/day, versus D1 Free's
100,000 written and 5 million read rows/day. The current state and bounded
catalogue backups fit comfortably within its storage allocation.

**This implementation is not verified compatible with Workers Free's
10 ms CPU limit.** Actual successful production observation invocations used
203-404 ms CPU, not merely wall time. Request/storage counts within Free
quotas do not establish Free-plan CPU compatibility. A strict Free deployment
would need a different processing design; exceeding Free CPU limits can
terminate invocations rather than automatically buying an overage.

After reviewing the account dashboard and reporting no billable usage, the
site owner approved proceeding on the existing account limits on 2026-10-16.
No plan upgrade or billing configuration change was made. Successful runs
are not a guarantee of zero future charges: monitor actual usage, limits and
catalogue growth. OF1's embedding, model, R2 and vector costs remain separate.

References:

* [AEM publication integrations](https://www.aem.live/developer/integrations)
* [Adobe service credential exchange](https://developer.adobe.com/developer-console/docs/guides/authentication/ServerToServerAuthentication/implementation)
* [DA conditional source writes](https://github.com/adobe/da-admin/blob/main/src/storage/version/put.js)
* [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
* [D1 pricing and Free quotas](https://developers.cloudflare.com/d1/platform/pricing/)
