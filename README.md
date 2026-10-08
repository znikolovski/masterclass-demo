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

The six action widgets (`discover-adventures`, `build-route-briefing`,
`build-gear-checklist`, `plan-permits-and-access`, `audit-pack-weight`, and
`prepare-field-submission`) import `styles/llmapp-widgets.css` through their block
stylesheets. It shares the site's font and colour tokens with standalone fallbacks:
Syncopate headings and action buttons, Instrument Sans body text, forest pill
buttons with orange offset shadows, and white/cream surfaces. Fonts retain the
existing Google Fonts source; the embed host must permit that source in its CSP.
`aem-embed` loads `styles/llmapp-fonts.css` into the host document for these widgets,
since font faces declared only inside a shadow root are not registered by the browser.
It waits for the fonts before decorating the block and reporting its dimensions.

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
