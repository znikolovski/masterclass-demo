/* eslint-disable */
/* global WebImporter */

/**
 * Blog article import: split hero from body and normalize section style classes.
 * Runs in afterTransform only.
 */
const TransformHook = { afterTransform: 'afterTransform' };

const SECTION_STYLES = ['secondary', 'inverse', 'accent'];

function insertHrAfterHero(main, doc) {
  const hero = main.querySelector('.hero-adventure');
  if (!hero) return;

  const container = hero.parentElement;
  if (!container) return;

  let sibling = hero.nextElementSibling;
  while (sibling && (sibling.tagName === 'HR' || sibling.classList?.contains('section-metadata'))) {
    sibling = sibling.nextElementSibling;
  }
  if (!sibling) return;
  if (['P', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE'].includes(sibling.tagName)) {
    const hr = doc.createElement('hr');
    container.insertBefore(hr, sibling);
  }
}

function normalizeStyledSectionDivs(main, doc) {
  SECTION_STYLES.forEach((style) => {
    main.querySelectorAll(`:scope > div.${style}`).forEach((section) => {
      section.classList.remove(style);
      const metaBlock = WebImporter.Blocks.createBlock(doc, {
        name: 'Section Metadata',
        cells: { style },
      });
      section.append(metaBlock);
    });
  });
}

export default function transform(hookName, element) {
  if (hookName !== TransformHook.afterTransform) return;

  const doc = element.ownerDocument || document;
  const main = element.querySelector('main') || element;

  insertHrAfterHero(main, doc);
  normalizeStyledSectionDivs(main, doc);
}
