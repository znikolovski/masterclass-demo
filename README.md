# Your Project's Title...
Your project's description...

## Environments
- Preview: https://main--{repo}--{owner}.aem.page/
- Live: https://main--{repo}--{owner}.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## LLM app widget branding

The action widgets (`discover-adventures`, `build-route-briefing`,
`build-gear-checklist`, `plan-permits-and-access`, `audit-pack-weight`,
`prepare-field-submission`, `check-booking`, and the shop widgets `search-shop-products`,
`get-shop-product`, `get-shop-cart` and `prepare-shop-checkout`) import
`styles/llmapp-widgets.css` through their block
stylesheets. It shares the site's font and colour tokens with standalone fallbacks:
Syncopate headings and action buttons, Instrument Sans body text, forest pill
buttons with orange offset shadows, and white/cream surfaces. Fonts retain the
existing Google Fonts source; the embed host must permit that source in its CSP.
`aem-embed` loads `styles/llmapp-fonts.css` into the host document for these widgets,
since font faces declared only inside a shadow root are not registered by the browser.
It waits for the fonts before decorating the block and reporting its dimensions.

Configure every widget in the LLM Apps UI with script URL
`https://main--masterclass-demo--znikolovski.aem.live/scripts/llmapp-embed.js` and widget URL
`https://main--masterclass-demo--znikolovski.aem.live/eds-widgets/{block-name}-demo`
(Check Booking: `/eds-widgets/check-booking`).
`scripts/llmapp-embed.js` registers the same `<aem-embed>` element as `scripts/aem-embed.js`
(shared code in `scripts/embed-core.js`) but decorates with `aem.js` only, without `scripts.js`.
Gemini inlines each widget's JavaScript at deploy and fails on the commerce drop-ins' bare
`@dropins/*` imports that `scripts.js` reaches; MCP host CSPs also block the site-only agent scripts
it loads. `scripts/aem-embed.js` remains for content embeds that need full site decoration.

Widget-specific layouts and safety/status treatments remain in each block.
Light, system-dark, and `body.dark` host themes are supported. Shared layout resets
only affect sections containing these widgets, not the rest of the website.
Preview each widget at `/eds-widgets/{block-name}-demo`; use the LLM app host to
check real tool results and follow-up actions.

Discovery shows one card in narrow embeds and two cards when its content area is
at least 600px wide. Additional results remain accessible through the carousel.
Its centered action buttons are capped at 280px with 44px minimum touch targets.

## Local development

1. Create a new repository based on the `aem-boilerplate` template
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)

### Hero layout regression check

With the AEM dev server running, use
`PAGE_LAYOUT_BASE_URL=http://localhost:3000 node --test tools/tests/page-layout.test.mjs`.
It checks the published Yosemite climbing article and Gear page at mobile/desktop
widths: the hero must be decorated before first paint, CLS must stay at or below
0.1, and a failed font service must not hide the page. Without the environment
variable the browser test is skipped, not passed.

The hero image is still preloaded from the head, but the page is revealed only
after eager decoration, stylesheet readiness, and a bounded wait for its fonts.
The provider's Latin and Latin-extended font faces are registered directly in the
critical `head.html` styles, without a redundant Google Fonts CSS request.
Only common Latin binaries are preloaded; eager readiness checks the actual hero
and first-section text so extended characters also use their final font at reveal.
Keep these pinned faces and the font preloads in sync when updating fonts.
Empty footers stay out of the layout while deferred sections load. Above-fold
section variant padding belongs in `styles/styles.css`, not lazy styles. Recheck both
pages with mobile and desktop Lighthouse after changes; local results do not
replace the branch preview's PSI check.
For production-like local measurements, start AEM with `--no-livereload` to
exclude its development-only reload script, not application resources.

EDS media-hash preloads use the current page origin, matching the rendered hero,
rather than downloading a second copy from the live URL in preview or local tests.
External DAM image URLs retain their original origin.
