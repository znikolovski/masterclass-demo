# WKND Aero — Analytics plan

Cross-site attribution and booking funnel tracking for WKND Aero + Adventures embed.

## ACDL events

| Event | Trigger | Key fields |
|-------|---------|------------|
| `flightSearchStart` | flight-search submit or embed event | `attribution.destination`, `attribution.adventure`, `attribution.campaignId`, `attribution.referrer` |
| `bookingStart` | booking-journey mount | `attribution.*`, `booking.step` |
| `bookingStep` | step navigation | `booking.step`, `booking.label` |
| `bookingComplete` | payment confirm (demo) | `attribution.*` |
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

## Launch mapping (extend ANALYTICS-LAUNCH-PLAN.md)

- Map `attribution.adventure` → eVar (adventure interest)
- Map `attribution.campaignId` → campaign tracking
- Map `attribution.referrer` → cross-site referral dimension
- Booking funnel: `bookingStart` → `bookingComplete` fallout report

## Embed (Adventures)

Adventures pages with `aem-embed` listen for `wknd:flight-search-start` bubbled from Aero fragment via `scripts/aero-analytics.js`.

## Implementation files

- `scripts/aero-analytics.js` — booking + embed events
- `scripts/aero-blocks.js` — attribution persistence
- Block-level `pushInteractionEvent` calls in Aero blocks
