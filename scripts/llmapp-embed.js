/* eslint-disable import/prefer-default-export, class-methods-use-this */
/*
 * <aem-embed> loader for LLM app widgets (the LLM Apps EDS widget script_url). Widget pages hold
 * a single widget block, so aem.js section and block decoration is all they need. Unlike
 * scripts/aem-embed.js it never loads scripts.js: Gemini inlines the widget's module graph at
 * deploy and cannot resolve the commerce drop-ins' bare @dropins/* imports that scripts.js
 * reaches, and MCP hosts' CSP blocks the site's extra agent scripts.
 */
import { decorateBlocks, decorateSections } from './aem.js';
import { EmbedElement } from './embed-core.js';

export class LLMAppEmbed extends EmbedElement {
  async decorateContent(main) {
    decorateSections(main);
    decorateBlocks(main);
  }
}

customElements.define('aem-embed', LLMAppEmbed);
