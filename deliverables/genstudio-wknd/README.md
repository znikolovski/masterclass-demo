# WKND Adventures: GenStudio Meta and Instagram templates

Six standalone HTML templates for Adobe GenStudio for Performance Marketing:
light and dark variations of three formats.
TikTok is intentionally excluded from this package. These are static image ads,
not video templates, EDS blocks, or Adobe Express documents.

## Files and sizing

| Upload file | Placement | HTML canvas | Target exported artwork |
| --- | --- | --- | --- |
| `meta-feed-square.html` (dark) | Facebook / Instagram Feed | 1080 x 1080 | 1080 x 1080 (1:1) |
| `meta-feed-square-light.html` | Facebook / Instagram Feed | 1080 x 1080 | 1080 x 1080 (1:1) |
| `instagram-feed-portrait.html` (light) | Instagram / Facebook Feed | 1080 x 1350 | 1080 x 1350 (4:5) |
| `instagram-feed-portrait-dark.html` | Instagram / Facebook Feed | 1080 x 1350 | 1080 x 1350 (4:5) |
| `instagram-stories-vertical.html` (dark) | Instagram / Facebook Stories | 1080 x 1920 | 1080 x 1920 (9:16) |
| `instagram-stories-vertical-light.html` | Instagram / Facebook Stories | 1080 x 1920 | 1080 x 1920 (9:16) |

The HTML body and artwork use native output dimensions. The earlier 360px
artboards occupied only one-third of the 1080px-wide GenStudio media area;
a high-DPI browser screenshot masked that mismatch. All layout coordinates and
font sizes now use output pixels, with no reliance on browser device scale,
CSS transforms, or GenStudio automatically enlarging the HTML.

This deliberately differs from Adobe's 360px column-layout recommendation to
address the observed media-area rendering. Match **Ad width (px)** and
**Ad height (px)** to the overall artwork dimensions above, not to the image
window. Confirm the actual exported dimensions before launch.

For an already uploaded template, replace the HTML using the template code
editor or upload it as a new template, correct its size metadata, and refresh
the preview. Existing generated experiences may need to be recreated from the
updated template. The square artwork should fill the media area; the native
brand header, primary text, and CTA remain outside the artwork.

The Stories design keeps essential content inside a conservative working area:
72px left, 192px right, 270px top, and 390px bottom at canvas size. This is a design
allowance, not a universal platform guarantee. Check the final placement preview
for UI collisions. The Stories template is not a validated Reels creative.

## Upload and generate

1. In GenStudio, configure the **WKND Adventures** Brand. Use the site's
   Syncopate Bold headings, Instrument Sans body text, forest `#0f1a14`,
   orange `#e8651a`, warm white `#f4f2ef`, and white `#ffffff`.
2. Add approved photographs to **Content**. Use JPEG or PNG assets at least
   1080 x 1080; for portrait and Stories use 1080 x 1350 and 1080 x 1920 or
   larger respectively. Art-direct each crop before generation. The public-site
   image URLs in `sample-content.json` are demonstration references, not proof
   of campaign usage rights or upload-ready crops.
3. In **Content > Templates**, add each HTML file as a **Meta ad** template.
   Instagram uses the Meta workflow, not a separate HTML template channel.
   Review detected fields before saving. Set the appropriate aspect ratio and
   image cropping details. The square image window is 1080 x 576, the portrait
   window is 1080 x 840, and the Stories window is 1080 x 1920; do not mistake the
   smaller feed image window for the overall artwork size.
4. Confirm these fields:

   | Placeholder | Role | Population |
   | --- | --- | --- |
   | `{{image}}` | Exactly one primary image | Select an approved Content asset |
   | `{{on_image_text}}` | Generated text within artwork | 3–6 words; maximum 40 characters including spaces |
   | `{{imageDescription}}` | Image alternative text | User-defined manual field; describe the selected crop |
   | `{{brand_logo}}` | Brand logo image | Select the matching PNG from the WKND Brand using Logo Swap |
   | `{{defaultLogo}}` | Empty-logo placeholder styling | System-populated by GenStudio; not generated copy or a manual field |

5. Set the on-image text length in the Brand's channel guidelines. Use the
   relevant prompt in `sample-content.json`, select Brand, audience/persona,
   product/context as applicable, and generate. Sample native headline, primary
   text, CTA, and destination are supplied separately in that file. Complete
   the logo setup below and select the logo for every variant before approval.
6. Review every variant for text fit, image cropping, font loading, brand checks,
   and placement safety. Shorten copy that does not fit; do not clip text or
   shrink it until unreadable. Review alt text after every image swap.
7. Set the native **Learn More** CTA and destination in GenStudio/activation.
   Request approval, publish to Content, then configure the selected placements
   through your connected Meta account.

Native headline, primary text/body, and CTA are intentionally not embedded in the
artwork: GenStudio generates those Meta fields separately. Instagram does not
display the generated native headline. There is no fake in-image button or
nonfunctional link.

## Brand and creative guidance

### Required logo setup

The uploaded GenStudio preview retained the text wordmark but omitted the inline
SVG compass. All six templates now use Adobe's documented Logo Swap contract:
`<img src="{{brand_logo}}" style="{{defaultLogo}}">`. Logo sizing is in the
`.wknd-ad .wknd-logo` CSS rule, not the system-managed inline style. This keeps
the logo at 96 x 96 output pixels with `object-fit: contain` after a swap.

Two transparent 540 x 540 PNGs are supplied, rasterized directly from
`icons/wknd-adventures-logo.svg` without changing its geometry:

| Template theme | Upload this logo to the WKND Brand | Colour |
| --- | --- | --- |
| Dark | `assets/wknd-compass-on-dark.png` | White |
| Light | `assets/wknd-compass-on-light.png` | Forest |

Add both PNGs to the **WKND Adventures Brand's logos** in GenStudio. Upload or
replace each template with the updated HTML. In Create, use **Logo Swap** to
select the matching logo for each variant. If the control is missing, confirm
the updated template contains `brand_logo` and `defaultLogo` and that the Brand
has logos available. The Brand's logo asset supplies the image URL: the local
`assets/` paths are upload files, not URLs that GenStudio can fetch.

**The logo is no longer baked into the HTML.** Until a logo is selected,
GenStudio supplies a transparent 1 x 1 placeholder and `defaultLogo` adds an
outline. This is expected, not proof that the selected PNG failed. Do not launch
with the placeholder, an omitted logo, or a white logo on a light background.
The logo is selected artwork, never AI-generated. Primary creative selection
still uses the separate `image` field; do not map the logo to that field.

Regenerate the PNGs after an icon update with
`node tools/scripts/export-genstudio-logos.mjs`.

Get brand-owner approval before production use. Google Fonts are loaded
over HTTPS; approve access to `fonts.googleapis.com` and `fonts.gstatic.com` in
your environment and confirm the fonts in GenStudio previews and exports.
Arial is the explicit fallback. The templates do not depend on this site's CSS
or JavaScript, and contain no JavaScript, viewport metadata, relative font
sizes, background images, or multiple content groups.

The concept is **Wild places. Real weekends.** Use an honest, grounded editorial
voice: real routes, useful field notes, and curiosity about the outdoors.
Avoid invented bookings, discounts, prices, availability, difficulty ratings,
safety guarantees, environmental claims, or testimonials. The three examples
cover discovery, trail research, and Lofoten editorial exploration.

`sample-content.json` is a local reference fixture, not a GenStudio import
manifest. Each format includes an `alternate` file/theme using the same content.
Upload the six HTML source files individually. The `previews/` PNGs show
example populated artwork; they are not editable templates and are not approved
campaign assets.

## Compatibility and remaining approval

Run `node tools/scripts/test-genstudio-templates.mjs` from the repository root
to check the native artboard sizes, field contract, text fit, and Stories safe
area in Chromium. Pass an output directory as the first argument to capture
populated PNGs at device scale 1 (for example,
`node tools/scripts/test-genstudio-templates.mjs deliverables/genstudio-wknd/previews`).

The sources follow Adobe's documented Meta HTML field and layout requirements.
Local browser rendering does not prove successful ingestion, field detection,
font availability, or export scaling in a particular GenStudio tenant. Those
steps require the in-app upload and approval workflow above; no templates have
been uploaded or activated by creating these files.

References:

- [Meta ad template guidelines](https://experienceleague.adobe.com/en/docs/genstudio-for-performance-marketing/user-guide/templates/channel-best-practice/meta-template)
- [Customize a template and recognized fields](https://experienceleague.adobe.com/en/docs/genstudio-for-performance-marketing/user-guide/templates/customize-template)
- [Template and image-cropping best practices](https://experienceleague.adobe.com/en/docs/genstudio-for-performance-marketing/user-guide/templates/best-practices-for-templates)
- [Set up Logo Swap in templates](https://experienceleague.adobe.com/en/docs/genstudio-for-performance-marketing/user-guide/create/logo-swap-setup)
