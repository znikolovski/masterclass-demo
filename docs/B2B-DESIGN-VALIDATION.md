# WKND Business — Figma design validation

**Figma file:** [WKND Business — B2B Site](https://www.figma.com/design/lFy62hLCthJSVneEsQpdWh)

## Design pages

| Page | Figma frame | Code block / page |
|------|-------------|-----------------|
| Design tokens | `01 — Design Tokens` | `styles/brand.css` |
| Homepage | `02 — Homepage` → Desktop 1440 | `/` seed + `hero-adventure`, `columns-featured`, `carousel-blog` |
| Register | `03 — Auth` → Register | `business-register` |
| Login | `03 — Auth` → Login | `business-login` |
| Dashboard | `04 — Dashboard & Forms` → Dashboard | `business-dashboard` |
| Contact | `04 — Dashboard & Forms` → Contact | `form` + `wknd-contact-b2b.json` |

## Brand alignment

| Token | Figma | Code (`brand.css`) | Status |
|-------|-------|-------------------|--------|
| Background | `#FFFFFF` | `--background-color: #fff` | Match |
| Text | `#0F1A14` | `--text-color`, `--dark-color` | Match |
| Accent | `#E8651A` | `--accent-color` | Match |
| Surface | `#F4F2EF` | `--light-color` | Match |
| Heading font | Syncopate | `--heading-font-family: Syncopate` | Match (web) |
| Body font | Instrument Sans | `--body-font-family: Instrument Sans` | Match (web) |

## Component validation

### Homepage
- Nav links: Field Notes, Request Adventure, Contact, Register, Sign In, Dashboard — matches [`seed-b2b-da.mjs`](../tools/scripts/seed-b2b-da.mjs)
- Hero eyebrow + H1 + dual CTAs — matches `hero-adventure` block contract
- Featured columns section on sand background — matches `columns-featured` on `secondary`/`sand` section
- Blog carousel with 3 cards — matches `carousel-blog` index fetch

### business-register
- Max width 720px, 2-column grid on tablet+ — matches Figma
- Fields: company, logo, contact, login credentials — matches design + plan
- Primary CTA accent button — uses global `.button`
- **Fixed:** added card padding, border, radius to match Figma white card

### business-login
- Max width 480px, email + password — matches Figma
- Sand background card — **fixed** in CSS (`--light-color`)

### business-dashboard
- Header: title + company name + actions row — matches JS structure
- Tabs: Pending / Current / Archived with counts — matches `TABS` constant
- Status badges: `#fff4e5`/`#9a6700`, `#e8f5e9`/`#1b5e20`, `#f3f3f3`/`#5c5c5c` — exact match to Figma
- 3-column card grid on desktop — matches CSS grid breakpoints

### Forms
- Contact form fields match Figma and [`form-sheet.mjs`](../tools/scripts/lib/form-sheet.mjs)
- Rendered via `form` block + `/forms/*.json`

## Gaps (acceptable for demo)

| Gap | Notes |
|-----|-------|
| Figma uses Inter; web uses Syncopate/Instrument Sans | Intentional — web fonts are correct per brand |
| Hero background image not in Figma wireframe | Uses existing `hero-adventure` with DA-authored image |
| Dashboard cards are static until API returns data | By design — dynamic via Cloudflare Worker |
| Mobile nav collapse | Inherited from global `header` block (hamburger at 900px) |

## AEM Forms API (sub-agent findings)

See [`docs/B2B-AEM-FORMS-API.md`](B2B-AEM-FORMS-API.md) for the mandatory API research. Summary:

- **No create API** via AEM MCP on program p115476
- **Runtime API** at `/adobe/forms/` (list, get, submit) — blocked from MCP allowlist
- **Recommended path:** Forms Manager UI → publish via MCP → point EDS `form` block at `guideContainer.model.json`
- **Interim:** document-based sheet JSON in `forms/` (already working)
