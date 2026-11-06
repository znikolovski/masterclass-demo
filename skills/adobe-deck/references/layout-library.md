# Adobe Deck — Layout Library

Specific layout patterns by slide content type. Always apply alongside brand-foundations.md and slide-anatomy.md.

---

## Bullet / Text Slides

**Presented version:**
- Max 5 bullets, 6–7 words each
- Adobe Clean Regular 22/20/18pt hierarchy (levels 1/2/3)
- Avoid 3rd-level bullets
- Leave generous white space — do not fill the slide
- Add a visual element (image, icon, chart) alongside text; text-only slides are not acceptable
- Use builds or highlight/dim animations to focus attention one bullet at a time in live presentations

**Handout version:**
- More detail acceptable; use pipe in title: `Slide Title  |  Detailed Version`
- Avoid 3rd-level bullets

---

## Full-Bleed Image Slides

- Image fills the entire slide
- Maximum 3–4 words of text overlaid (short, punchy phrase)
- Image must have a large dead-space area where text sits, with strong contrast against the type
- If more than a few words are needed, use a 50/50 layout instead
- Red thread sits over the top of the image using the designated layout; do not reposition it
- Used in live presentations to give context and provide a visual backdrop while the speaker elaborates

---

## 50/50 Image + Text Layouts

- Image on one half, text on the other (typically image right, text left)
- Good for: product features, practical information, longer quotes, speaker title slides
- Text area follows standard content area rules
- Image should be bold, bright, and colourful (see imagery-and-assets.md)

---

## Bucket Slides (multiple concepts on one slide)

- Strictly limit content per bucket — it accumulates quickly
- 3–4 buckets maximum; split into multiple slides if more are needed
- Presented: minimal text per bucket
- Handout: pipe in title for extended version

**3 images with titles:** Three equal columns, image + short title. Column headers left-aligned to the padding guide (not the raw image edge).
**3 images with descriptors:** As above plus a short descriptor line per column.
**3×2 image grid:** Six images in a 3-column × 2-row grid.

---

## Quote Slides

- Quote text: Adobe Clean Regular, larger than the author attribution
- Author attribution: Adobe Clean Bold, smaller than the quote
- Format: `"Quote text"` / `–Author, Publication`
- Keep quotes as short as possible for live presentation impact
- Company logos can replace author attribution when appropriate
- Scatter pattern: 3–6 quotes distributed across the slide
- Single large quote: fills most of the slide for maximum impact
- Speech bubble pointed triangle must face inward toward the centre of the page

---

## Stats / Data Callout Slides

- Stat number: Adobe Clean Display Black, 60–72pt
- Stat descriptor: Adobe Clean Regular, ~1/3 the point size of the stat number
- Units (M, B, %): ~80% of the stat number's point size, not subscript
- Currency symbols: same size as descriptor text, superscript
- Tilde (~) where used: same size as descriptor text, superscript
- Superscript/sizing rules apply to standalone stats only — not inline body copy
- Round numbers as much as possible
- Multiple stats: equal-weight grid layout
- All stats: black numbers and black text on white background

---

## Dashboard Slides

- At-a-glance readout of multiple metrics
- Every block must communicate good/bad and magnitude immediately on sight
- Presented: strip explanatory text; let numbers speak
- Handout: full explanatory text per block
- Use accessible gray fills + extended palette accents for positive/negative indicators

---

## Diagram Layouts

### Flowchart / Linear workflow
- Keep to 6–7 steps maximum for presented slides
- Break complex systems across multiple slides
- Style A (preferred): high-contrast gray fills, one extended palette accent colour for a key step
- Style B: contrasting stroke on lower-contrast fill
- White and black background variants available

### Stack / Marketecture diagram
- Visualises hierarchy and relationships (e.g. marchitecture)
- Text in boxes can be centred or left-justified as needed
- Rows use different accessible gray shades with a contrasting stroke between them
- Snap boxes together using smart guides; use stroke to create consistent padding
- Style A (preferred) vs Style B: same gray/stroke logic as flowcharts

### Cycle diagram (Flywheel)
- Use only when the concept makes a complete loop; if not, use a flowchart instead
- Grays for most components; extended palette to highlight one key step if needed
- Variants: 2–8 steps
- Style A (preferred) vs Style B available; white and black backgrounds

### Timeline
- Single chevron-edged bar for the timeline itself; fill must contrast with text on top
- Data points: vertical lines with "flag" labels (text aligned to the top of the vertical line)
- Flags can be staggered if many data points, or aligned horizontally if layout allows
- Limit to the relevant slice of time; highlight the most important moments
- Direct labels for presented version; keys/legends acceptable for handout version
- Gather all data before starting layout so nothing has to be squeezed in afterwards

### Pyramid diagram
- Use PowerPoint SmartArt pyramid; tiers are resizable
- Follows same style rules as other diagrams

---

## Table Slides

- Headers: Adobe Clean Display Black or Bold; left-aligned
- Cell text: left-aligned horizontally, vertically centred (single words may be centred)
- Rows and columns: evenly distributed (Table Layout > Distribute tools)
- Borders: inside horizontal only, 0.5pt dark gray pen. No outer borders, no vertical borders.
- Shade rows sparingly — only the most important for emphasis (total row, header row)
- If everything is emphasised, nothing is
- Status symbols: use ASCII (● ◑ ◕ ◔ ○) and emoji — do not try to align graphics for status data
- Simplify heavily for presented versions; tables take time to parse visually

---

## Org Chart Slides

- Keep names and titles to one line each
- Break large reporting structures across multiple slides
- Include titles only if necessary; abbreviate as much as possible
- Avatars: trim to perfect squares
- Connectors: from avatar to avatar, not to text boxes
- Lay all boxes out first, then draw and snap connectors

---

## Collage / Logo Grid Slides

- **Company logo grid:** Drag logo into placeholder, use crop-to-fit, scale down. Consistent size and visual weight. Alphabetise or order by importance. Use Align and Distribute tools. Put logos on a white field.
- **Full content area collage:** 2×3, 2×4, or 3×4 image grids
- **3-column collage:** Three larger images in equal columns

---

## Device Mockup Slides

- Use only official Adobe device shells (light gray on white, dark gray on black, white for special cases only)
- Never recolour the shells
- Match shell type to screenshot type (smartphone shell for smartphone screenshot)
- Format and crop the screenshot to fit the shell — do not distort the shell
- Resize shells by holding Shift and dragging from a corner

---

## Shock and Awe Slides

- One of these goes a long way — use very sparingly
- Intentionally messy: still include a focal point amid the chaos
- Neatly organised with a lot of items: use a grid to guide the eye
- Decide the message before laying out: "we're overwhelmed" vs "we handle a lot"

---

## Awards Slides

- Organisational awards: category tiles with blurb, or winner spotlight with project title, key points, and names
- People awards (light/dark): headshot grid with name and title per person
- Workplace awards: dedicated layouts for internal recognition

---

## Layout Anti-Patterns (never do)

- Do not repeat the same layout on consecutive slides — vary structure
- Do not centre multi-line body text
- Do not use accent/decorative lines under titles
- Do not add full-width coloured bars, header ribbons, or footer stripes
- Do not use coloured or gradient backgrounds on content slides
- Do not colour-code sections with background fills
- Do not default to cream/beige — use `#FFFFFF` (white) or `#000000` (black)
- Do not ship text that overflows its shape — resize or split
- Do not use low-contrast text or icons against backgrounds
- Do not create text-only slides — every slide needs a visual element
- Do not break the content area on standard content slides
- Do not put the closer slide after individual speaker sections — one at the very end only
