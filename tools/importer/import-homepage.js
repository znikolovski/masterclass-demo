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
  name: 'homepage',
  description: 'Main landing page with hero, tabs, accordion, steps, gallery, and CTA sections',
  urls: ['https://wknd-adventures.com/'],
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
    { id: 'section-2', name: 'Featured Story', selector: 'section.secondary-section:first-of-type', style: 'secondary', blocks: ['columns-featured'], defaultContent: [] },
    { id: 'section-3', name: 'Browse by Activity', selector: 'main > section:nth-of-type(3)', style: null, blocks: ['tabs-activity'], defaultContent: ['.section-heading h2'] },
    { id: 'section-4', name: 'Marquee Ticker', selector: '.ticker-strip', style: null, blocks: ['marquee-ticker'], defaultContent: [] },
    { id: 'section-5', name: 'Not Sure Where to Start', selector: 'section.inverse-section:first-of-type', style: 'inverse', blocks: [], defaultContent: ['section.inverse-section .tag', 'section.inverse-section h2', 'section.inverse-section .paragraph-lg', 'section.inverse-section .button-group'] },
    { id: 'section-6', name: 'Quick Answers FAQ', selector: 'main > section:nth-of-type(5)', style: null, blocks: ['accordion-faq'], defaultContent: ['.section-heading h2'] },
    { id: 'section-7', name: 'How We Work', selector: 'section.secondary-section:nth-of-type(2)', style: 'secondary', blocks: ['cards-steps'], defaultContent: ['.section-heading h2'] },
    { id: 'section-8', name: 'In the Field Gallery', selector: 'section.inverse-section:nth-of-type(2)', style: 'inverse', blocks: ['columns-gallery'], defaultContent: ['.section-heading h2', '.section-heading .text-button'] },
    { id: 'section-9', name: 'Final CTA', selector: 'section.accent-section', style: 'accent', blocks: [], defaultContent: ['section.accent-section h2', 'section.accent-section .paragraph-lg', 'section.accent-section .button-group'] },
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
      if (elements.length === 0) {
        console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
      }
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
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    const path = WebImporter.FileUtils.sanitizePath(
      new URL(params.originalURL).pathname.replace(/\/$/, '').replace(/\.html$/, '')
    );

    return [{
      element: main,
      path: path || '/index',
      report: {
        title: document.title,
        template: PAGE_TEMPLATE.name,
        blocks: pageBlocks.map((b) => b.name),
      },
    }];
  },
};
