# LLM App -> OF1 -> optional Sherpa -> Aero booking

The site and companion `masterclass-demo-llmapp` action implement a shared,
24-hour, session-scoped journey contract. A journey is an opaque UUID, not a
login, host session ID, or proof of an individual across devices. Sherpa is an
optional branch: direct bookings are valid conversions, not abandonment.

## Handoff

Discovery's custom Analytics wrapper emits one `llmAppResult` milestone and
returns `_meta.wkndJourney` plus, when Adobe Edge succeeds,
`_meta.wkndEdge`. These are private widget metadata, not new author fields or
model-visible output schema requirements. The widget applies Adobe's response
handles and uses the host's `bridge.openLink()` API for **Explore on WKND**.
An unavailable host API has an explicit browser-link fallback/error.

The widget reuses an already-configured Web SDK only when its org/datastream
match. Hybrid response application requires the opaque identity `state:store`
entry; applying `identity:result` alone can stall the SDK's first-request gate.
Incomplete responses instead acquire a browser identity independently and keep
the journey UUID for correlation. Browser cookies unavailable or mismatched SDK
configuration produces an explicit warning and correlation-only navigation.
Server-returned consent state is excluded: tool telemetry policy must not
overwrite the browser's saved consent. Adobe cookie values are never decoded
or constructed by production code.
An anonymous contract check against the configured Edge datastream returned
`identity:result`, `locationHint:result`, and opaque identity/cluster
`state:store` handles; no additional cookie metadata was needed on the action
request. Cookie persistence is checked by name only, not by decoding its value.

| URL parameter | Meaning |
|---|---|
| `wj` | Random v4 UUID |
| `wjt` | Creation time, milliseconds since epoch |
| `wjs` | `llm-app` or `web` |
| `wjo` | Originating tool (`discover_adventures` for the implemented LLM handoff) |
| `wja` | `1` after opening Sherpa, otherwise `0` |
| `adv` | Public adventure/catalog slug |
| `cid`, `ref`, `dest` | Existing campaign/referral/flight routing attribution |
| `fsid` | Submitted flight search UUID, preventing a second search milestone on arrival |

Only known WKND EDS hosts owned by `znikolovski` and
`wknd-adventures.run.place` receive decorated context. That custom hostname now
uses the production Launch library and the existing demo consent policy.
Unrelated custom domains do not inherit production configuration.
Expired/invalid incoming context is discarded; blocked session storage produces
a warning and memory-only attribution. Opening Sherpa persists the assisted
flag, including after reload. Adventure interest follows the selected Aero link.
Milestone deduplication uses one bounded session record (256 entries for the
current journey), not an ever-growing collection of per-event storage keys.

Ordinary navigation attempts Web SDK `appendIdentityToUrl`, bounded to 1.5
seconds so unavailable identity services cannot block navigation. Adobe returns
the URL unchanged when consent is pending or denied. Neither code nor URL
manually transmits MCP host/user IDs. Modifier/new-tab navigation retains journey
parameters but is not guaranteed to carry Adobe's ECID. No identity is fabricated
if Edge, browser storage or the host sandbox prevents identity transfer.

`llm_app_ctx` remains the intentional OF1 search handoff, with `q` taking SDK
precedence. Search/prompt parameters, Sherpa prompt hashes and `adobe_mc` are
removed from site Analytics page/link/referrer URLs. New journey events contain
only controlled stages, opaque IDs, public slugs and confirmation totals: no
search text, chat transcript, passenger details or payment data.

## Adobe Analytics contract

The user reserved **eVar30-35** and **event30-41**. All browser milestones use
ACDL event `wkndJourney`, `data.wkndJourney.stage`, and an explicit link-click XDM
signal. The existing martech ACDL forwarder sends the event, and
`mapPageToAnalytics` maps it directly to `data.__adobe.analytics`.
Milestone events are taken from the current hit's data, never ACDL's accumulated
state. Other hits receive journey dimensions without replaying milestone metrics.
No extra Launch Send Event rule is needed; adding one would duplicate hits.
Existing generic CTA rules and MCP operational events22-24 remain separate.

| Variable | Name | Expiration |
|---|---|---|
| eVar30 | WKND journey ID | Hit |
| eVar31 | WKND journey origin (`llm-app`, `web`) | Hit |
| eVar32 | WKND originating tool (`discover_adventures`, `none`) | Hit |
| eVar33 | WKND Sherpa cohort (`assisted`, `unassisted`) | Hit |
| eVar34 | WKND milestone; booking steps use `bookingStep:0` through `bookingStep:3` | Hit |
| eVar35 | WKND adventure interest (slug, `none`) | Hit |

| Event | Stage | Definition |
|---|---|---|
| event30 | `llmAppResult` | Server discovery call returns at least one adventure |
| event31 | `llmAppHandoff` | Widget requests a handoff; not proof that the host opened a tab |
| event32 | `of1Search` | SDK inserts a new generation turn anchor, not merely a button click |
| event33 | `of1Results` | That turn has generated sections and its suggestions/completion surface |
| event34 | `sherpaOpen` | Sherpa dialog opens; defines the assisted cohort |
| event35 | `sherpaMessageAttempt` | Non-empty send-button/Enter attempt, including deep-link auto-send |
| event36 | `aeroHandoff` | A known Aero link is activated from OF1/Sherpa |
| event37 | `flightSearchStart` | Submitted form, or direct booking-page flight search |
| event38 | `bookingStart` | Checkout app mounts |
| event39 | `bookingStep` | First entry into each step in this checkout |
| event40 | `bookingComplete` | Successful API response with validated confirmation and server price |
| event41 | `bookingError` | HTTP, network or malformed confirmation failure; no conversion |

Set these success events to **Counter**, not Counter (No Subrelations),
Numeric or Currency. Configure event40
to **Use Event ID** for serialization. The value is `event40:BK_<hex>`, with a
booking ID of at most 19 bytes. Browser session deduplication supplements
report-suite serialization. `of1Arrival` and `aeroArrival` are explicit link hits
with an eVar34 stage but intentionally have no additional success-event slots.

Sherpa sends are **attempts**, not server-accepted chat messages. The vendor does
not expose a verified message-acceptance callback in this integration. The
parent validates both iframe origin and exact message source before tracking.
Native vendor conversation events are not assumed to map to this report suite.

## Adobe Data Collection / Launch setup

This implementation maps journey fields in code, not through new Launch data
elements or event rules. There are three separate configuration surfaces:
**Analytics report suite** (enable the variables), **Data Collection datastream**
(route hits to the suite), and **Tags / Launch** (reuse the existing SDK without
duplicating collection). Saving a Launch library does not enable Analytics
variables, and saving report-suite settings does not deploy the site code.

### 1. Enable the Analytics variables and events

In **Adobe Analytics -> Admin -> Report Suites**, select **`ags050wknd`**.
Under **Edit Settings -> Conversion -> Conversion Variables**, enable eVar30-35
and use the names and **Hit** expiration in the contract table above.
Set their type to **Text String**, allocation to **Most Recent (Last)**, and
leave merchandising disabled. The code supplies current context on each hit;
visit-level persistence is not needed and could attribute a later journey to an
earlier value. Do not reset existing variable data as part of this setup.

Under **Edit Settings -> Conversion -> Success Events**, enable and name
event30-41 using the stage table above, then apply these settings:

| Events | Type | Unique Event Recording | Polarity |
|---|---|---|---|
| event30-39 | Counter | Always Record | Up is good |
| event40 (`bookingComplete`) | Counter | Use Event ID | Up is good |
| event41 (`bookingError`) | Counter | Always Record | Up is bad |

Use standard **Counter**, not **Counter (No Subrelations)**, for the journey
breakdowns. Do not use **Once per Visit**: repeat OF1 turns, flight searches and
booking attempts are legitimate events. Checkout step deduplication is handled
by code per checkout, rather than by a visit-wide restriction.

Adobe's serialization warning for event40 is expected: it requires the sender
to include an event ID. The new implementation already sends
`event40:BK_<hex>` in `data.__adobe.analytics.events`. Coordinate enabling
**Use Event ID** with release of that code; do not assume the old live
implementation supplies the ID. Keep all other journey events on
**Always Record**. These settings are report-suite changes, not Launch actions.

### 2. Verify the shared datastream

In **Adobe Experience Platform Data Collection -> Datastreams**, open
**`56dee4fc-21a9-4e37-83ab-bdd874957aba`** in the appropriate sandbox.
Confirm that its **Adobe Analytics** service is enabled and routes to report
suite **`ags050wknd`**. Retain the existing Target and other service settings.
Use the same datastream and IMS org
**`28260E2056581D3B7F000101@AdobeOrg`** across the discovery action/widget,
Adventures/OF1 and Aero browser code.

The Analytics service reads the documented `data.__adobe.analytics` fields
directly. No new Analytics processing rule, XDM eVar schema field or datastream
field mapping is required for these eVars/events. Routing the same context into
an AEP dataset for CJA/Data Lake analysis is a separate mapping/schema task;
Analytics routing alone does not establish that dataset.

### 3. Verify the existing Tags / Launch property

Open the property whose environment embed URLs match
[`scripts/martech-config.js`](../scripts/martech-config.js). Reuse it rather
than creating a second property or adding another embed:

| Environment | Current library filename | Site selection |
|---|---|---|
| Staging | `launch-49a2d20de828-staging.min.js` | Localhost and `.aem.page` |
| Production | `launch-43614c033f3c.min.js` | `.aem.live`, `.aem.network`, `wknd-adventures.run.place` |

In **Extensions**, verify that the Web SDK extension uses the existing
**self-hosted SDK instance `alloy`**, with the shared org/datastream above.
The site's martech plugin owns SDK loading, configuration, consent and the
`onBeforeEventSend` callback. Do not let Launch load/configure a second SDK,
replace that callback, add AppMeasurement collection, or force consent to
`in`. If using the Adobe Client Data Layer extension, use **`adobeDataLayer`**
and leave injection disabled because the site already loads it.

In **Rules**, audit broad ACDL event listeners and existing journey/booking
rules. The site's forwarder already sends `wkndJourney` payloads, including
their `xdm` and `data`; the callback then maps eVar30-35 and event30-41.
**Do not add a Web SDK Send Event action for `wkndJourney`**, nor a second
Page View action for this setup. Exclude these payloads from any existing
catch-all rule that sends another hit. Retain unrelated CTA/page rules, but
ensure they do not overwrite the reserved journey variables or replace the
current hit's `events` string.

No new Launch data elements are required. In particular, do not map milestones
from `adobeDataLayer.getState()` or a Page View/Session-stored data element:
accumulated state can replay an earlier milestone on later hits. The source is
the **current payload's** `data.wkndJourney`, not a persistent global event.
event30 comes from the server action and event31 from the widget's own SDK;
neither requires the site's Launch library to send it.

If this audit requires Tags changes, add only those changed resources to a
library, build/test in Development, then promote through Staging and Production
using the property's publishing workflow. The site currently selects the
Staging embed for preview/local hosts; use Adobe Experience Platform Debugger
to substitute a Development library when testing an unpublished Tags build.
If the existing configuration already meets these requirements, no new Launch
publication is needed for the journey mappings.

### 4. Verify collected hits before reporting

After the coordinated Worker/action/site rollout, use browser Network tools,
Adobe Experience Platform Debugger and Assurance to inspect Web SDK
`/ee/.../interact` requests and their Analytics processing. A booking completion
should include this shape (example ID only):

```json
{
  "data": {
    "__adobe": {
      "analytics": {
        "eVar30": "<journey UUID>",
        "eVar31": "llm-app",
        "eVar32": "discover_adventures",
        "eVar33": "unassisted",
        "eVar34": "bookingComplete",
        "eVar35": "lake-ohrid-escape",
        "events": "event40:BK_0123456789abcdef"
      }
    }
  }
}
```

Other existing metrics can appear in the same comma-separated `events` string.
Verify one journey milestone per triggering action, the same eVar30 through
handoffs, and `assisted` after Sherpa opens. A failed booking must send event41,
not event40; a demo confirmation must not send standard purchase/revenue.
Retrying the same confirmed booking must not add another completion.
Confirm that prompts, chat text, passenger data and `adobe_mc` do not appear in
the new journey fields or site Analytics URLs.

Finally, verify the enabled dimensions/metrics in **Analysis Workspace** on
`ags050wknd` after normal processing latency. Inspect eVar34 by event counts,
and break down by eVar30/eVar33/eVar35. An HTTP 200 from Edge proves request
acceptance, not correct report-suite routing or processed Analytics counts.
Validate both direct and Sherpa-assisted paths without making Sherpa a
mandatory funnel step.

## Booking correctness and rollout

The Worker persists server-issued fares for 30 minutes in its existing KV binding.
The frontend submits the quote ID and checkout request UUID, never a client
price or card details. Totals include the server fare, passenger count, the same
rounded 29.5% demo taxes and $15 per seat shown in the UI, in USD.
Retries of a confirmed request return its existing booking ID; changed details
with that ID return 409. Invalid/expired quotes return a real error, not a
fabricated successful reservation. KV is eventually consistent: this is a demo
implementation, not a production fare/payment or atomic inventory system.

The UI disables repeated confirmation submissions, displays booking failures,
and emits conversion only after a validated API confirmation. Its
`wknd:booking-complete` CustomEvent is also stripped of passenger PII.
Demo confirmations say no payment, flight issuance or email occurred.
Authoritative total/currency/purchase ID are present in XDM `commerce.order`.
Demo reservations do **not** emit standard `commerce.purchases`/revenue.
A real booking backend and a separate real-vs-demo reporting policy are required
before interpreting these events as airline sales.

Activation outside the working copy is separate from implementation:

1. Enable/name the reserved variables/events in report suite `ags050wknd`;
   verify the shared datastream sends to that suite and event40 serialization is on.
2. Deploy `workers/wknd-aero-api` **before** the new checkout frontend. The old
   Worker does not return quotes/totals and its responses will correctly fail
   the new confirmation validation.
3. Deploy the updated companion MCP action wrapper. Retain the existing action
   registry; this checkout has no `actions.json`, so do not build/deploy an empty
   replacement. Set `sendsEdgeEvent:false` for custom-Analytics-wrapped actions
   in the actual registry to avoid the runtime's additional automatic tool hit.
4. Release the site code used by both Adventures and the repoless Aero site.
   No new DA block fields, source content or OF1 SDK changes are required.
5. Verify the real sandbox handoff, consent and Edge responses on deployed
   hosts; inspect Debugger/Assurance and collected report-suite events.

Demo consent is deliberately retained by user approval. This is not a production
CMP implementation. SDK consent still governs browser collection and ECID
decoration. Server tool telemetry uses the companion application's existing
policy; do not assume a browser opt-out retroactively controls a server tool call.

## Funnel and cohorts

The base path is event31 -> event32 -> event33 -> event36 -> event37 ->
event38 -> booking step 1/2/3 (event39 + eVar34) -> event40.
event30 is an optional earlier discovery-result stage. event41 is a failure
metric, not a successful funnel step.

Use eVar30 as the correlation key. Where ECID transfer works, a visit/visitor
fallout can follow the browser journey normally. An eVar by itself does **not**
merge Adobe visitors: if server/widget/browser ECIDs differ, join by journey ID
in an Analytics Data Feed or connected CJA dataset rather than claiming
visitor-level fallout is complete. Keep the same report suite/datastream/org
across surfaces.

Split journeys into those that have event34 anywhere before booking and those
that do not. Do not put Sherpa open/send between mandatory fallout stages.
Because early discovery hits are initially `unassisted`, classify the entire
journey by the later Sherpa event, rather than filtering every early hit on
eVar33=`assisted`. A journey can make several OF1 turns/searches; conversion
rates should use distinct journeys, not raw event counts.

## Local validation

```sh
node tools/scripts/test-journey-context.mjs
node tools/scripts/test-journey-tracking.mjs http://localhost:3000
node tools/scripts/test-of1-planning.mjs http://localhost:3000
node tools/scripts/test-of1-aero.mjs http://localhost:3000
# In masterclass-demo-llmapp:
./node_modules/.bin/jest --runInBand --coverage=false --silent test/lib/analytics.test.js test/lib/journey.test.js test/actions/discover-adventures.test.js test/scripts/simulate-llmapp-analytics.test.js
```

The browser harness uses real site code, OF1 SDK and checkout UI with controlled
generation, Adobe responses and an in-memory instance of the actual booking
Worker. It does not prove external deployments or Analytics report collection.
Covered paths include direct, submitted flight-search and optional Sherpa handoffs, captured Edge event
mapping, HTTP/network/malformed booking failures, duplicate confirmation clicks,
assisted reload, consent opt-out, preconfigured/incomplete SDK responses, and
blocked/bounded session storage. Existing OF1 planning/Aero regression harnesses
also cover mobile, tablet and desktop layouts.
