# WKND Aero — Analytics plan

Cross-site attribution and booking funnel tracking for WKND Aero + Adventures embed.

The implemented end-to-end contract, reserved Analytics slots, consent scope,
serialization, demo-booking safeguards and activation sequence are documented
in [JOURNEY-TRACKING.md](JOURNEY-TRACKING.md). Browser funnel milestones now use
ACDL `wkndJourney` with `data.wkndJourney.stage` and direct Analytics mappings,
rather than depending on unmapped legacy event-name-only hits.

## ACDL events

| Event | Trigger | Key fields |
|-------|---------|------------|
| `flightSearchStart` | flight-search submit or embed event | `data.wkndJourney`, eVar30-35, event37 |
| `bookingStart` | booking-journey mount | `data.wkndJourney`, event38 |
| `bookingStep` | first entry into each checkout step | `data.wkndJourney.step`, event39 |
| `bookingComplete` | validated successful API confirmation (demo) | safe journey metadata, booking ID, authoritative total/currency |
| `adventureTileClick` | adventures-bento tile | `interaction.block`, `interaction.label` |
| `navClick` | aero-header link | `interaction.block`, `interaction.label` |
| `newsletterSubscribe` | aero-newsletter submit | `interaction.block` |

## URL attribution params

| Param | Purpose | Example |
|-------|---------|---------|
| `dest` | Destination IATA | `PUQ` |
| `adv` | Adventure slug | `patagonia-peaks` |
| `cid` | Campaign / content id | `adv-patagonia-peaks` |
| `ref` | Referring site | `wknd-adventures` |

Persisted in `sessionStorage` key `wknd:aero:attribution` via `scripts/aero-blocks.js`.

## Analytics mapping

- Journey dimensions map directly to eVar30-35; milestones map to event30-41.
- Existing `cid` campaign attribution remains eVar1.
- Enable event40 serialization using the confirmed booking ID.
- Do not add duplicate Launch Send Event rules for these funnel hits.
- Sherpa is optional, and demo reservations are not real flight sales.

## Embed (Adventures)

Adventures pages with `aem-embed` listen for `wknd:flight-search-start` bubbled from Aero fragment via `scripts/aero-analytics.js`.

## Implementation files

- `scripts/aero-analytics.js` — booking + embed events
- `scripts/aero-blocks.js` — attribution persistence
- Block-level `pushInteractionEvent` calls in Aero blocks
