/* eslint-disable */
/* global WebImporter */

import heroAdventureParser from './parsers/hero-adventure.js';
import columnsGalleryParser from './parsers/columns-gallery.js';
import cardsArticleParser from './parsers/cards-article.js';

import cleanupTransformer from './transformers/wknd-adventures-cleanup.js';
import sectionsTransformer from './transformers/wknd-adventures-sections.js';
import blogArticleSectionsTransformer from './transformers/blog-article-sections.js';

const parsers = {
  'hero-adventure': heroAdventureParser,
  'columns-gallery': columnsGalleryParser,
  'cards-article': cardsArticleParser,
};

const PAGE_TEMPLATE = {
  name: 'blog-article',
  description: 'Blog article page with adventure content, author info, and related posts',
  urls: [],
  blocks: [
    { name: 'hero-adventure', instances: ['section.hero-section'] },
    { name: 'columns-gallery', instances: ['.grid-images'] },
    { name: 'cards-article', instances: ['section:last-of-type .article-card-grid, section:last-of-type .grid-layout:has(.article-card)'] },
  ],
  sections: [],
};

const transformers = [
  cleanupTransformer,
  sectionsTransformer,
  blogArticleSectionsTransformer,
];

function executeTransformers(hookName, element, payload) {
  const enhancedPayload = { ...payload, template: PAGE_TEMPLATE };
  transformers.forEach((transformerFn) => {
    try {
      transformerFn.call(null, hookName, element, enhancedPayload);
    } catch (e) {
      console.error(`Transformer failed at ${hookName}:`, e);
    }
  });
}

function findBlocksOnPage(document, template) {
  const pageBlocks = [];
  template.blocks.forEach((blockDef) => {
    blockDef.instances.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        pageBlocks.push({
          name: blockDef.name,
          selector,
          element,
        });
      });
    });
  });
  console.log(`Found ${pageBlocks.length} block instances on page`);
  return pageBlocks;
}

export default {
  transform: (payload) => {
    const { document, url, html, params } = payload;
    const main = document.body;

    executeTransformers('beforeTransform', main, payload);

    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    pageBlocks.forEach((block) => {
      const parser = parsers[block.name];
      if (parser) {
        try {
          parser(block.element, { document, url, params });
        } catch (e) {
          console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
        }
      }
    });

    executeTransformers('afterTransform', main, payload);

    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);

    // Keep images as absolute URLs instead of removing unresolvable ones
    main.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http')) {
        try {
          img.setAttribute('src', new URL(src, params.originalURL).href);
        } catch (e) { /* ignore */ }
      }
    });

    const path = WebImporter.FileUtils.sanitizePath(
      new URL(params.originalURL).pathname.replace(/\/$/, '').replace(/\.html$/, '')
    );

    return [{
      element: main,
      path,
      report: {
        title: document.title,
        template: PAGE_TEMPLATE.name,
        blocks: pageBlocks.map((b) => b.name),
      },
    }];
  },
};
