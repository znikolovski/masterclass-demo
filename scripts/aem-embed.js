/* eslint-disable import/prefer-default-export, class-methods-use-this */
/*
 * AEM Embed WebComponent (vendored from adobe/aem-embed) for content embeds: decorates the
 * embedded page with the full site decoration from scripts.js. LLM app widgets should load
 * scripts/llmapp-embed.js instead, which keeps scripts.js out of the widget.
 */
import { EmbedElement } from './embed-core.js';

export class AEMEmbed extends EmbedElement {
  async decorateContent(main, origin) {
    const { decorateMain } = await import(`${origin}${window.hlx.codeBasePath}/scripts/scripts.js`);
    if (decorateMain) await decorateMain(main, true);
  }
}

customElements.define('aem-embed', AEMEmbed);
