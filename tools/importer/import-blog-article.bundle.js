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

  // tools/importer/import-blog-article.js
  var import_blog_article_exports = {};
  __export(import_blog_article_exports, {
    default: () => import_blog_article_default
  });

  // tools/importer/parsers/hero-adventure.js
  function parse(element, { document: document2 }) {
    const bgImage = element.querySelector('.hero-bg img, img[class*="bg"], .hero-section > img');
    const eyebrow = element.querySelector('p.tag, .tag, [class*="eyebrow"]');
    const heading = element.querySelector('h1, h2, [class*="heading"]');
    const description = element.querySelector('p.paragraph-xl, p.hero-lead, .hero-lead, p[class*="lead"], .hero-content p:not(.tag)');
    const ctaLinks = Array.from(element.querySelectorAll('.button-group a, .hero-content a.accent-button, .hero-content a.button--ghost, .hero-content a[class*="button"]'));
    const byline = element.querySelector('.article-byline, .hero-byline, [class*="byline"]');
    const authorImg = byline ? byline.querySelector("img") : null;
    const authorTexts = byline ? byline.querySelectorAll("p, span:not(:has(img))") : [];
    const cells = [];
    if (bgImage) {
      cells.push([bgImage]);
    }
    const contentCell = [];
    if (eyebrow) contentCell.push(eyebrow);
    if (heading) contentCell.push(heading);
    if (description && !byline) contentCell.push(description);
    if (ctaLinks.length > 0) contentCell.push(...ctaLinks);
    if (byline) {
      if (authorImg) contentCell.push(authorImg);
      authorTexts.forEach((t) => contentCell.push(t));
    }
    if (contentCell.length > 0) {
      cells.push(contentCell);
    }
    const block = WebImporter.Blocks.createBlock(document2, { name: "hero-adventure", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/columns-gallery.js
  function parse2(element, { document: document2 }) {
    const images = Array.from(element.querySelectorAll("img.gallery-img, img"));
    const row = images.map((img) => [img]);
    const cells = [row];
    const block = WebImporter.Blocks.createBlock(document2, { name: "columns-gallery", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-article.js
  function parse3(element, { document: document2 }) {
    const cards = element.querySelectorAll('.article-card, a[class*="card"]');
    if (cards.length === 0) return;
    const cells = [];
    const tabName = "Featured";
    const panelContent = [];
    cards.forEach((card) => {
      const img = card.querySelector("img");
      const tag = card.querySelector('.tag, [class*="meta"] .tag, [class*="card-meta"] div');
      const heading = card.querySelector('h3, [class*="heading"]');
      const desc = card.querySelector('p[class*="secondary"], [class*="desc"]');
      if (img) {
        const p = document2.createElement("p");
        const pic = document2.createElement("picture");
        const newImg = document2.createElement("img");
        newImg.src = img.src;
        newImg.alt = img.alt || "";
        pic.append(newImg);
        p.append(pic);
        panelContent.push(p);
      }
      if (tag) {
        const p = document2.createElement("p");
        p.textContent = tag.textContent.trim();
        panelContent.push(p);
      }
      if (heading) {
        const h3 = document2.createElement("h3");
        const link = card.closest("a") || card.querySelector("a");
        if (link) {
          const a = document2.createElement("a");
          a.href = link.href;
          a.textContent = heading.textContent.trim();
          h3.append(a);
        } else {
          h3.textContent = heading.textContent.trim();
        }
        panelContent.push(h3);
      }
      if (desc) {
        const p = document2.createElement("p");
        p.textContent = desc.textContent.trim();
        panelContent.push(p);
      }
    });
    cells.push([tabName, panelContent]);
    const block = WebImporter.Blocks.createBlock(document2, { name: "tabs-activity", cells });
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

  // tools/importer/import-blog-article.js
  var parsers = {
    "hero-adventure": parse,
    "columns-gallery": parse2,
    "cards-article": parse3
  };
  var PAGE_TEMPLATE = {
    name: "blog-article",
    description: "Blog article page with adventure content, author info, and related posts",
    urls: [],
    blocks: [
      { name: "hero-adventure", instances: ["section.hero-section"] },
      { name: "columns-gallery", instances: [".grid-images"] },
      { name: "cards-article", instances: ["section:last-of-type .article-card-grid, section:last-of-type .grid-layout:has(.article-card)"] }
    ],
    sections: []
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
            element
          });
        });
      });
    });
    console.log(`Found ${pageBlocks.length} block instances on page`);
    return pageBlocks;
  }
  var import_blog_article_default = {
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
  return __toCommonJS(import_blog_article_exports);
})();
