/* eslint-disable */
/* global WebImporter */

import heroAdventureParser from './parsers/hero-adventure.js';
import columnsFeaturedParser from './parsers/columns-featured.js';
import tabsActivityParser from './parsers/tabs-activity.js';
import marqueeTickerParser from './parsers/marquee-ticker.js';
import accordionFaqParser from './parsers/accordion-faq.js';
import cardsStepsParser from './parsers/cards-steps.js';
import columnsGalleryParser from './parsers/columns-gallery.js';

import cleanupTransformer from './transformers/wknd-adventures-cleanup.js';
import sectionsTransformer from './transformers/wknd-adventures-sections.js';

const parsers = {
  'hero-adventure': heroAdventureParser,
  'columns-featured': columnsFeaturedParser,
  'tabs-activity': tabsActivityParser,
  'marquee-ticker': marqueeTickerParser,
  'accordion-faq': accordionFaqParser,
  'cards-steps': cardsStepsParser,
  'columns-gallery': columnsGalleryParser,
};

const PAGE_TEMPLATE = {
  name: 'landing-page',
  description: 'Informational landing page with hero, tabs, cards, and CTA sections',
  urls: [
    'https://wknd-adventures.com/about.html',
    'https://wknd-adventures.com/adventures.html',
    'https://wknd-adventures.com/basecamp.html',
    'https://wknd-adventures.com/community.html',
    'https://wknd-adventures.com/destinations.html',
    'https://wknd-adventures.com/expeditions.html',
    'https://wknd-adventures.com/faq.html',
    'https://wknd-adventures.com/field-notes.html',
    'https://wknd-adventures.com/gear.html',
    'https://wknd-adventures.com/sustainability.html',
  ],
  blocks: [
    { name: 'hero-adventure', instances: ['section.hero-section'] },
    { name: 'columns-featured', instances: ['.featured-article'] },
    { name: 'tabs-activity', instances: ['.tab-container'] },
    { name: 'marquee-ticker', instances: ['.ticker-strip'] },
    { name: 'accordion-faq', instances: ['.faq-list'] },
    { name: 'cards-steps', instances: ['.editorial-index'] },
    { name: 'columns-gallery', instances: ['.grid-images'] },
  ],
  sections: [
    { id: 'section-1', name: 'Hero', selector: 'section.hero-section', style: null, blocks: ['hero-adventure'], defaultContent: [] },
    { id: 'section-2', name: 'Content', selector: 'main > section, main > div', style: null, blocks: [], defaultContent: [] },
  ],
};

const transformers = [
  cleanupTransformer,
  sectionsTransformer,
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
          section: blockDef.section || null,
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
