/* eslint-disable import/prefer-default-export, class-methods-use-this, no-await-in-loop */
/*
 * AEM Embed WebComponent (vendored from adobe/aem-embed)
 * Extended for WKND Aero blocks under blocks/aero/
 */

const AERO_BLOCKS = new Set([
  'aero-header', 'aero-footer', 'aero-hero', 'flight-search', 'adventures-bento',
  'aero-pass', 'aero-newsletter', 'destinations-grid', 'travel-inspiration', 'booking-journey', 'adventure-detail',
]);

export class AEMEmbed extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.initialized = false;
    window.hlx = window.hlx || {};
    window.hlx.suppressLoadPage = true;
    [window.hlx.codeBasePath] = new URL(import.meta.url).pathname.split('/scripts/');
  }

  /**
   * @param {HTMLBodyElement} body
   * @param {Element} block
   * @param {string} blockName
   * @param {string} origin
   */
  async loadBlock(body, block, blockName, origin) {
    const prefix = AERO_BLOCKS.has(blockName) ? 'blocks/aero' : 'blocks';
    const blockCss = `${origin}${window.hlx.codeBasePath}/${prefix}/${blockName}/${blockName}.css`;
    if (!body.querySelector(`link[href="${blockCss}"]`)) {
      const link = document.createElement('link');
      link.setAttribute('rel', 'stylesheet');
      link.setAttribute('href', blockCss);
      const cssLoaded = new Promise((resolve) => {
        link.onload = resolve;
        link.onerror = resolve;
      });
      body.appendChild(link);
      await cssLoaded;
    }

    try {
      const blockScriptUrl = `${origin}${window.hlx.codeBasePath}/${prefix}/${blockName}/${blockName}.js`;
      const decorateBlock = await import(blockScriptUrl);
      if (decorateBlock.default) await decorateBlock.default(block);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('aem-embed block load failed', blockName, e);
    }
  }

  /**
   * @param {string} htmlText
   * @param {HTMLBodyElement} body
   * @param {string} origin
   */
  async pseudoDecorateMain(htmlText, body, origin) {
    const main = document.createElement('main');
    body.append(main);
    main.innerHTML = htmlText;

    const { decorateMain } = await import(`${origin}${window.hlx.codeBasePath}/scripts/scripts.js`);
    if (decorateMain) await decorateMain(main, true);

    const blockElements = main.querySelectorAll('.block');
    if (blockElements.length > 0) {
      const blocks = Array.from(blockElements).map((b) => b.classList.item(0));
      for (let i = 0; i < blockElements.length; i += 1) {
        await this.loadBlock(body, blockElements[i], blocks[i], origin);
      }
    }

    main.querySelectorAll('.section').forEach((s) => {
      s.dataset.sectionStatus = 'loaded';
      s.style = '';
    });
  }

  async handleMain(htmlText, body, origin) {
    await this.pseudoDecorateMain(htmlText, body, origin);
    body.classList.add('appear');
  }

  async connectedCallback() {
    if (this.initialized) return;
    try {
      const urlAttribute = this.attributes.getNamedItem('url');
      if (!urlAttribute) throw new Error('aem-embed missing url attribute');

      const body = document.createElement('body');
      body.style.display = 'none';
      this.shadowRoot.append(body);

      const url = urlAttribute.value;
      const plainUrl = url.endsWith('/') ? `${url}index.plain.html` : `${url}.plain.html`;
      const { href, origin } = new URL(plainUrl);

      const resp = await fetch(href);
      if (!resp.ok) throw new Error(`Unable to fetch ${href}`);

      const styles = document.createElement('link');
      styles.rel = 'stylesheet';
      styles.href = `${origin}${window.hlx.codeBasePath}/styles/styles.css`;
      styles.onload = () => { body.style.display = ''; };
      styles.onerror = () => { body.style.display = ''; };
      this.shadowRoot.appendChild(styles);

      const brand = document.createElement('link');
      brand.rel = 'stylesheet';
      brand.href = `${origin}${window.hlx.codeBasePath}/styles/brands/wknd-aero.css`;
      this.shadowRoot.appendChild(brand);

      let htmlText = await resp.text();
      htmlText = htmlText.replace(/.\/media/g, `${origin}/media`);

      this.initialized = true;
      await this.handleMain(htmlText, body, origin);

      const fonts = document.createElement('link');
      fonts.rel = 'stylesheet';
      fonts.href = `${origin}${window.hlx.codeBasePath}/styles/fonts.css`;
      this.shadowRoot.appendChild(fonts);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('aem-embed error', err);
    }
  }
}

customElements.define('aem-embed', AEMEmbed);
