# WKND Aero — Target personalization plan

Target zones and activities for WKND Aero conversion optimization.

## Zones (section metadata `targetlocation`)

| Zone ID | Page | Content |
|---------|------|---------|
| `aero-hero-offer` | Homepage `/` | Hero headline / promo fare |
| `aero-pass-offer` | `/wknd-pass` | Pass benefits CTA variant |
| `flight-search-banner` | `/`, embed fragment | Promo strip above search |
| `booking-upsell` | `/book/flights` | Seat upgrade / pass upsell |

## Activities (create via Target MCP / Experience Platform)

1. **Aero hero fare promo** — A/B headline + “from $299” badge on homepage hero
2. **Adventure-attributed search** — Pre-fill destination from `adv` query param with personalized subcopy
3. **WKND Pass upsell** — Show pass CTA on booking step 3 for non-members
4. **Cross-site embed CTA** — Adventures embed: “Fly to Patagonia” variant when `adv=patagonia-peaks`

## Fragment offers

Export Target HTML offers from:

- `/fragments/flight-search` (Aero)
- `/fragments/aero-hero-promo` (optional)

Use [ew-send-to-adobe-target](.agents/skills/ew-send-to-adobe-target/SKILL.md) workflow.

## Scope

Request named scopes on Aero pages via page metadata `adobetarget: on` (same pattern as Adventures).

## Analytics linkage

Target experiences should pass `experience.id` into ACDL on apply (existing `target-analytics.js` pattern).
