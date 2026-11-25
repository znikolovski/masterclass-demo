# Your Project's Title...
Your project's description...

## OF1 historical diagnostic branch - do not merge

`test-of1-nov20` restores website code from
`ff4fb027a0deba85e34b9b8ba4713d47b2bb9838`, the November 20 release with
recorded successful adventure generation. The only differences from that tree
are this note and a hostname-scoped API-base override in `blocks/of1/of1.js`.

- Test: https://test-of1-nov20--masterclass-demo--znikolovski.aem.page/of1
- Gateway: https://28538-914blueshark.adobeioruntime.net/api/v1/web/wknd-mcp/of1-gateway-nov20
- Gateway ZIP: the exact archived original `0.0.7` artifact, SHA-256
  `92e64e9c754bb5ee457b731880934454257e06ec1272aca9a2fad0065bad9f24`.
  The separate action starts at its own version `0.0.1`; its executable bytes
  match the original `0.0.7`. Product-first remains enabled.
- Main website code, live gateway `of1-gateway`, and authored `/of1` are unchanged.

The CMS content, remote OF1 SDK/generator, tenant state, and Commerce backend
remain current. This restores website and gateway code, not the entire
historical environment. Test `?q=jacket` as the product control and the original
Ohrid question as the adventure case. Do not merge this diagnostic rollback into
main or use it for checkout, bookings, consent, or other write journeys.
Historical lint failures are intentionally not repaired in this baseline.

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
