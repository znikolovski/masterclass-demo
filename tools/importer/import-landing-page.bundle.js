/* eslint-disable */
var CustomImportScript = (() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // tools/importer/import-landing-page.js
  var import_landing_page_exports = {};
  __export(import_landing_page_exports, {
    default: () => import_landing_page_default
  });

  // tools/importer/parsers/hero-adventure.js
  function parse(element, { document: document2 }) {
    const bgImage = element.querySelector('.hero-bg img, img[class*="bg"], .hero-section > img');
    const eyebrow = element.querySelector('p.tag, .tag, [class*="eyebrow"]');
    const heading = element.querySelector('h1, h2, [class*="heading"]');
    const description = element.querySelector('p.paragraph-xl, p.hero-lead, .hero-lead, p[class*="lead"], .hero-content p:not(.tag)');
    const ctaLinks = Array.from(element.querySelectorAll('.button-group a, .hero-content a.accent-button, .hero-content a.button--ghost, .hero-content a[class*="button"]'));
    const cells = [];
    if (bgImage) {
      cells.push([bgImage]);
    }
    const contentCell = [];
    if (eyebrow) contentCell.push(eyebrow);
    if (heading) contentCell.push(heading);
    if (description) contentCell.push(description);
    if (ctaLinks.length > 0) contentCell.push(...ctaLinks);
    if (contentCell.length > 0) {
      cells.push(contentCell);
    }
    const block = WebImporter.Blocks.createBlock(document2, { name: "hero-adventure", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/columns-featured.js
  function parse2(element, { document: document2 }) {
    const image = element.querySelector(".featured-article-image img, img");
    const tag = element.querySelector(".tag, p:first-child");
    const heading = element.querySelector(".h2-heading, h2, h3");
    const description = element.querySelector(".paragraph-lg, p.paragraph-lg, p:not(.tag):not(:first-child)");
    const ctaLink = element.querySelector(".featured-article-footer a, a.button, a[href]");
    const leftCell = [];
    if (image) leftCell.push(image);
    const rightCell = [];
    if (tag) rightCell.push(tag);
    if (heading) rightCell.push(heading);
    if (description) rightCell.push(description);
    if (ctaLink) rightCell.push(ctaLink);
    const cells = [
      [leftCell, rightCell]
    ];
    const block = WebImporter.Blocks.createBlock(document2, { name: "columns-featured", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/tabs-activity.js
  function parse3(element, { document: document2 }) {
    const tabButtons = Array.from(element.querySelectorAll(".tab-menu .tab-menu-link, .tab-menu button"));
    const tabPanes = Array.from(element.querySelectorAll(".tab-pane"));
    const cells = [];
    tabButtons.forEach((button, index) => {
      const label = button.textContent.trim();
      const pane = tabPanes[index];
      if (!pane) return;
      const cards = Array.from(pane.querySelectorAll('.article-card, a[class*="card"]'));
      const contentElements = [];
      cards.forEach((card) => {
        var _a;
        const img = card.querySelector(".article-card-image img, img");
        const tag = card.querySelector(".article-card-meta .tag, .tag");
        const heading = card.querySelector("h3, h2, .h6-heading");
        const description = card.querySelector("p.paragraph-sm, .article-card-body p");
        const href = card.getAttribute("href") || ((_a = card.querySelector("a")) == null ? void 0 : _a.getAttribute("href"));
        const cardContainer = document2.createElement("div");
        if (img) {
          const imgClone = img.cloneNode(true);
          cardContainer.appendChild(imgClone);
        }
        if (tag) {
          const tagEl = document2.createElement("p");
          tagEl.textContent = tag.textContent.trim();
          cardContainer.appendChild(tagEl);
        }
        if (heading) {
          const headingEl = document2.createElement("h3");
          if (href) {
            const link = document2.createElement("a");
            link.setAttribute("href", href);
            link.textContent = heading.textContent.trim();
            headingEl.appendChild(link);
          } else {
            headingEl.textContent = heading.textContent.trim();
          }
          cardContainer.appendChild(headingEl);
        }
        if (description) {
          const descEl = document2.createElement("p");
          descEl.textContent = description.textContent.trim();
          cardContainer.appendChild(descEl);
        }
        contentElements.push(cardContainer);
      });
      if (contentElements.length === 0) {
        cells.push([label, pane]);
      } else {
        const contentWrapper = document2.createElement("div");
        contentElements.forEach((el) => contentWrapper.appendChild(el));
        cells.push([label, contentWrapper]);
      }
    });
    const block = WebImporter.Blocks.createBlock(document2, { name: "tabs-activity", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/marquee-ticker.js
  function parse4(element, { document: document2 }) {
    const track = element.querySelector(".ticker-track");
    const allItems = track ? Array.from(track.querySelectorAll("span:not(.ticker-sep)")) : Array.from(element.querySelectorAll("span:not(.ticker-sep)"));
    const seen = /* @__PURE__ */ new Set();
    const uniqueItems = [];
    allItems.forEach((span) => {
      const text = span.textContent.trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        uniqueItems.push(text);
      }
    });
    const cells = uniqueItems.map((item) => [item]);
    const block = WebImporter.Blocks.createBlock(document2, { name: "marquee-ticker", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/accordion-faq.js
  function parse5(element, { document: document2 }) {
    const faqItems = element.querySelectorAll(".faq-item");
    const cells = [];
    faqItems.forEach((item) => {
      const questionButton = item.querySelector(".faq-question");
      const questionSpan = questionButton ? questionButton.querySelector("span:not(.faq-icon)") : null;
      const answerDiv = item.querySelector(".faq-answer");
      const titleCell = document2.createElement("p");
      titleCell.textContent = questionSpan ? questionSpan.textContent.trim() : "";
      const contentCell = document2.createElement("p");
      contentCell.textContent = answerDiv ? answerDiv.textContent.trim() : "";
      cells.push([titleCell, contentCell]);
    });
    const block = WebImporter.Blocks.createBlock(document2, { name: "accordion-faq", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-steps.js
  function parse6(element, { document: document2 }) {
    const items = element.querySelectorAll(".editorial-index-item");
    const cells = [];
    items.forEach((item) => {
      const numberEl = item.querySelector('.editorial-index-number, span[class*="number"]');
      const heading = item.querySelector('h3, h2, h4, [class*="heading"]');
      const description = item.querySelector('p, [class*="paragraph"]');
      const numberCell = [];
      if (numberEl) {
        const numText = document2.createElement("p");
        numText.textContent = numberEl.textContent.trim();
        numberCell.push(numText);
      }
      const contentCell = [];
      if (heading) contentCell.push(heading);
      if (description) contentCell.push(description);
      cells.push([numberCell, contentCell]);
    });
    const block = WebImporter.Blocks.createBlock(document2, { name: "cards-steps", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/columns-gallery.js
  function parse7(element, { document: document2 }) {
    const images = Array.from(element.querySelectorAll("img.gallery-img, img"));
    const row = images.map((img) => [img]);
    const cells = [row];
    const block = WebImporter.Blocks.createBlock(document2, { name: "columns-gallery", cells });
    element.replaceWith(block);
  }

  // tools/importer/transformers/wknd-adventures-cleanup.js
  var TransformHook = { beforeTransform: "beforeTransform", afterTransform: "afterTransform" };
  function transform(hookName, element, payload) {
    if (hookName === TransformHook.beforeTransform) {
      WebImporter.DOMUtils.remove(element, ["script", "style", "noscript", 'link[rel="stylesheet"]']);
      WebImporter.DOMUtils.remove(element, [".skip-link", ".navbar", "footer.footer", "footer.inverse-footer"]);
    }
  }

  // tools/importer/transformers/wknd-adventures-sections.js
  var TransformHook2 = { beforeTransform: "beforeTransform", afterTransform: "afterTransform" };
  function transform2(hookName, element, payload) {
    if (hookName !== TransformHook2.afterTransform) return;
    const doc = element.ownerDocument || document;
    const main = element.querySelector("main") || element;
    const sections = main.querySelectorAll(":scope > section");
    if (sections.length < 2) return;
    for (let i = sections.length - 1; i > 0; i--) {
      const section = sections[i];
      let style = null;
      if (section.classList.contains("inverse-section")) style = "inverse";
      else if (section.classList.contains("secondary-section")) style = "secondary";
      else if (section.classList.contains("accent-section")) style = "accent";
      if (style) {
        const metaBlock = WebImporter.Blocks.createBlock(doc, {
          name: "Section Metadata",
          cells: { style }
        });
        section.append(metaBlock);
      }
      const hr = doc.createElement("hr");
      section.before(hr);
    }
    const firstSection = sections[0];
    if (firstSection) {
      let style = null;
      if (firstSection.classList.contains("inverse-section")) style = "inverse";
      else if (firstSection.classList.contains("secondary-section")) style = "secondary";
      else if (firstSection.classList.contains("accent-section")) style = "accent";
      if (style) {
        const metaBlock = WebImporter.Blocks.createBlock(doc, {
          name: "Section Metadata",
          cells: { style }
        });
        firstSection.append(metaBlock);
      }
    }
  }

  // tools/importer/import-landing-page.js
  var parsers = {
    "hero-adventure": parse,
    "columns-featured": parse2,
    "tabs-activity": parse3,
    "marquee-ticker": parse4,
    "accordion-faq": parse5,
    "cards-steps": parse6,
    "columns-gallery": parse7
  };
  var PAGE_TEMPLATE = {
    name: "landing-page",
    description: "Informational landing page with hero, tabs, cards, and CTA sections",
    urls: [
      "https://wknd-adventures.com/about.html",
      "https://wknd-adventures.com/adventures.html",
      "https://wknd-adventures.com/basecamp.html",
      "https://wknd-adventures.com/community.html",
      "https://wknd-adventures.com/destinations.html",
      "https://wknd-adventures.com/expeditions.html",
      "https://wknd-adventures.com/faq.html",
      "https://wknd-adventures.com/field-notes.html",
      "https://wknd-adventures.com/gear.html",
      "https://wknd-adventures.com/sustainability.html"
    ],
    blocks: [
      { name: "hero-adventure", instances: ["section.hero-section"] },
      { name: "columns-featured", instances: [".featured-article"] },
      { name: "tabs-activity", instances: [".tab-container"] },
      { name: "marquee-ticker", instances: [".ticker-strip"] },
      { name: "accordion-faq", instances: [".faq-list"] },
      { name: "cards-steps", instances: [".editorial-index"] },
      { name: "columns-gallery", instances: [".grid-images"] }
    ],
    sections: [
      { id: "section-1", name: "Hero", selector: "section.hero-section", style: null, blocks: ["hero-adventure"], defaultContent: [] },
      { id: "section-2", name: "Content", selector: "main > section, main > div", style: null, blocks: [], defaultContent: [] }
    ]
  };
  var transformers = [
    transform,
    transform2
  ];
  function executeTransformers(hookName, element, payload) {
    const enhancedPayload = __spreadProps(__spreadValues({}, payload), { template: PAGE_TEMPLATE });
    transformers.forEach((transformerFn) => {
      try {
        transformerFn.call(null, hookName, element, enhancedPayload);
      } catch (e) {
        console.error(`Transformer failed at ${hookName}:`, e);
      }
    });
  }
  function findBlocksOnPage(document2, template) {
    const pageBlocks = [];
    template.blocks.forEach((blockDef) => {
      blockDef.instances.forEach((selector) => {
        const elements = document2.querySelectorAll(selector);
        elements.forEach((element) => {
          pageBlocks.push({
            name: blockDef.name,
            selector,
            element,
            section: blockDef.section || null
          });
        });
      });
    });
    console.log(`Found ${pageBlocks.length} block instances on page`);
    return pageBlocks;
  }
  var import_landing_page_default = {
    transform: (payload) => {
      const { document: document2, url, html, params } = payload;
      const main = document2.body;
      executeTransformers("beforeTransform", main, payload);
      const pageBlocks = findBlocksOnPage(document2, PAGE_TEMPLATE);
      pageBlocks.forEach((block) => {
        const parser = parsers[block.name];
        if (parser) {
          try {
            parser(block.element, { document: document2, url, params });
          } catch (e) {
            console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
          }
        }
      });
      executeTransformers("afterTransform", main, payload);
      const hr = document2.createElement("hr");
      main.appendChild(hr);
      WebImporter.rules.createMetadata(main, document2);
      WebImporter.rules.transformBackgroundImages(main, document2);
      main.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src");
        if (src && !src.startsWith("http")) {
          try {
            img.setAttribute("src", new URL(src, params.originalURL).href);
          } catch (e) {
          }
        }
      });
      const path = WebImporter.FileUtils.sanitizePath(
        new URL(params.originalURL).pathname.replace(/\/$/, "").replace(/\.html$/, "")
      );
      return [{
        element: main,
        path,
        report: {
          title: document2.title,
          template: PAGE_TEMPLATE.name,
          blocks: pageBlocks.map((b) => b.name)
        }
      }];
    }
  };
  return __toCommonJS(import_landing_page_exports);
})();
