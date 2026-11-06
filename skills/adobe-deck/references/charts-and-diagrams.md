# Adobe Deck — Charts and Diagrams

Load this reference when the deck includes charts, graphs, data visualisations, tables, stats, or design elements.

---

## Core Principles

- Design elements must be simple, quickly readable, impactful, and clean
- Strip to the bare minimum of text and descriptors — let data speak
- Active elements (bars, buckets, any element that conveys data) must meet accessibility contrast: 3:1 minimum; 4.5:1 preferred
- Never use tints of any colour
- Grays form the base; extended palette colours are highlights only

---

## Style A vs Style B

| | Style A (preferred) | Style B |
|---|---------|---------|
| Base fills | High-contrast grays | Lower-contrast fills |
| Accessibility | Contrast via fill darkness | Contrast via stroke |
| Stroke | Optional | Required — contrasting stroke for accessibility |
| Accent | 1–2 extended palette colours | 1–2 extended palette colours |
| Best for | Bar charts, category comparisons, flowchart buckets | Stacked data, trend lines, overlapping elements |
| Lightest fill (white bg) | `#949494` | Lower contrast fill + `#949494`+ stroke |
| Darkest fill (black bg) | `#616161` | Lower contrast fill + `#616161` stroke |

Both white and black background versions are available for all diagram types.

---

## Colour Rules for Charts

**Do:**
- Grays as primary fills for most data series
- 1–2 extended palette colours (`#FFA311`, `#FF66CC`, `#3A63F9`, `#0AA35B`, `#F3C600`) to call out key data points
- Blue and green to signal positive outcomes
- Yellow/orange to signal caution or negative trends

**Do not:**
- Use red (`#EB1000`) in financial charts — ever
- Use red to signal negative financial performance
- Use tints of any colour
- Give all data series equal colour weight

---

## Accessible Gray Ramps

For charts requiring multiple gray levels (stacked bars, sequential categories):

| Steps | Backgrounds safe for black text | Backgrounds safe for white text |
|-------|--------------------------------|--------------------------------|
| 2-colour | `#FFFFFF` → `#BFBFBF` | `#080808` → `#757575` |
| Up to 10-colour | Equal perceptual steps between the above | Equal perceptual steps between the above |

Never lighter than `#BFBFBF` for black-text elements. Never darker than `#757575` for white-text elements.

---

## Bar / Column Charts

- Use direct labels on bars OR a Y-axis — not both
- Direct labels: better when the value itself is meaningful and has few significant digits (20, 41.2)
- Y-axis: better when comparison matters more than the exact number, or many significant digits (28,381.39)
- Remove chart title if it is the only chart on the slide and information is available elsewhere on the slide
- Remove legends and keys that are redundant

---

## Flowcharts

- Keep to 6–7 buckets maximum for presented versions
- Break complex processes across multiple slides
- Use Style A (preferred) unless stacking/layering requires Style B
- White and black background variants; use white per Rebecca's preference

---

## Stack / Marketecture Diagrams

- Visualise hierarchy (marchitecture, product architecture, reporting structure)
- Text in boxes: centred or left-justified as needed
- Different gray shades for rows must have a contrasting stroke for accessibility
- Snap boxes together using smart guides; use stroke to create consistent padding between them

---

## Cycle Diagrams

- Only use when the concept forms a complete loop; use a flowchart if it does not
- Grays for most steps; extended palette to highlight one key step
- 2–8 step variants available
- Style A preferred

---

## Timelines

- Timeline bar: single block with a chevron edge at the right; fill must contrast with the overlaid text
- Data point flags: vertical line + text aligned to the top of the line
- Flags can be staggered (many data points) or horizontally aligned (fewer)
- Highlight the most important dates/events; visually push back supporting detail
- Use direct labels for presented version; legends acceptable for handout version
- Gather all data before starting layout

---

## Large Stats

- Stat number: Adobe Clean Display Black, 60–72pt
- Descriptor: Adobe Clean Regular, ~1/3 the point size of the number
- Units (M, B, %): ~80% of the stat number's point size, not subscript
- Currency symbols: same size as descriptor, superscript
- Tilde (~): same size as descriptor, superscript
- Round numbers as much as possible (use full number only when scale is the point)
- Left-justify all stat text
- All stats use black on white background

---

## Tables

- Headers: Adobe Clean Display Black or Bold, left-aligned
- Cell text: left-aligned, vertically centred (single words may be centred)
- Evenly distributed rows and columns (Table Layout > Distribute tools)
- Borders: inside horizontal only, 0.5pt dark gray. No outer or vertical borders.
- Shade sparingly — total rows or critical rows only
- Use ASCII symbols for status (● ◑ ◕ ◔ ○) — not graphics
- Simplify significantly for presented slides

---

## Org Charts

- Names and titles to one line each
- Break large structures across slides
- Titles only if necessary; abbreviate
- Avatar photos trimmed to perfect squares
- Connectors from avatar to avatar, not to text boxes
- Lay boxes out first, then draw connectors

---

## Design Element Accessibility

- All active elements must contrast at 3:1 or better against background and adjacent elements
- `#949494` is the lightest gray usable on white; `#616161` is the darkest usable on black
- Icons and text both need strong contrast against their actual background
- Test every element against its real background colour, not just the slide default
