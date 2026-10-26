---
name: adobe-deck
description: >
  Apply Adobe corporate presentation brand guidelines when building or editing PowerPoint decks. Use
  this skill whenever the user asks to create, build, design, or update a presentation that follows
  Adobe brand standards, Adobe corporate style, Adobe template guidelines, or Adobe deck standards.
  Also triggers when the user asks to make a deck "look like Adobe", "match Adobe brand", or
  references the Adobe Corporate Presentation Template. Covers slide structure, typography, colour
  palette, red thread, layout selection, grid alignment, section dividers, title slides, closer
  slides, imagery, icons, animation, and chart/diagram styling. Triggers on: "Adobe deck", "Adobe
  presentation", "Adobe brand deck", "Adobe corporate template", "Adobe slide guidelines", "make it
  Adobe brand", "follow Adobe template", "Adobe-branded slides", "Adobe style guide", "build a deck
  for Adobe", "Adobe clean font", "red thread". Do NOT trigger for: generic non-Adobe presentations,
  Keynote files, Google Slides, or PDF documents.
---

# Adobe Corporate Deck Skill

Apply Adobe brand guidelines end-to-end when building or editing a PowerPoint deck.

## Load Order

Read references in this order before writing a single slide:

1. `references/brand-foundations.md` — colour, typography, voice, spacing rules (always load)
2. `references/slide-anatomy.md` — title slides, dividers, content layouts, closer (always load)
3. `references/layout-library.md` — specific layout patterns by content type (load when slide types are known)
4. `references/charts-and-diagrams.md` — data visualisation and design elements (load when charts, diagrams, stats, tables, or org charts are needed)
5. `references/imagery-and-assets.md` — imagery, icons, screenshots, logos, animation (load when imagery or media is involved)

---

## Workflow

### 1. Clarify scope (if not already clear)

Before building, confirm:
- Slide count and purpose (executive briefing, internal update, customer-facing pitch)
- Content provided vs. content Claude must draft
- Speaker name and title for the title slide
- Whether this is a presented version, handout version, or both

If the user has supplied a corporate template file, use the editing workflow (unpack → edit → repack).
If no template file is supplied, build from scratch using pptxgenjs following the brand rules in references.

### 2. Load references per load order above

### 3. Plan the deck structure

Every Adobe deck follows this shell:

| Position | Slide type | Notes |
|----------|-----------|-------|
| First | Title slide | Red (preferred) or 50/50 image layout; speaker name + title |
| After title (optional) | Agenda | Table format; presentable version for live use |
| Content sections | Section divider → content slides | One divider per major section |
| Last | Closer slide | Red Adobe wordmark closer; never end on a content slide |

Multiple speakers: use one title slide per speaker. Only one closer slide at the very end.

### 4. Build slides following brand rules

Non-negotiables at a glance:

- **Font:** Adobe Clean Display Black for headlines; Adobe Clean Regular for body; Adobe Clean Bold for emphasis. Fallback: Arial Black / Arial.
- **Backgrounds:** white or black only for content slides. No coloured backgrounds, no gradients with content on top.
- **Text colour:** black on white, white on black. Never coloured text for body copy.
- **Red (`#EB1000`):** sparingly on content slides. Used on title slides, closer, and as the red thread only.
- **Red thread:** present on every content slide; never break it with text or images; never recolour it.
- **Sentence case** on all slide titles.
- **Pipe separator** `|` for title sub-concepts: `Core concept  |  Sub concept` (2 spaces each side).
- **Left-justify** all body text. Centre only for single-line image/chart titles. Never full-justify.
- **Content area:** keep all content between the guides. Do not break the content area except on designed full-bleed or half-bleed layouts.
- Every slide must be readable in under 10 seconds (presented version).
- Max 5 bullets × 6–7 words for presented version.
- **Every slide needs a visual element** — no text-only content slides.

### 5. QA

Run standard pptx QA (content check + visual check via thumbnail/image conversion).
Additionally check Adobe-specific items:
- No leftover placeholder text (grep check)
- Red thread present and unbroken on all content slides
- Title slide is red or 50/50 image layout
- Closer slide is the final slide and is the red Adobe wordmark version
- No red in financial charts
- Corporate red is `#EB1000` only — no substitutes or tints
- All content within the content area guides
- Icons are black on white or white on black — not recoloured
- No coloured section backgrounds or colour-blocked design elements

---

## Persona Notes

Rebecca's personal preference: all slide backgrounds must be white or light throughout. Where the Adobe template offers a dark variant, default to the light or white variant. Dark/charcoal full-slide backgrounds must not be used.
