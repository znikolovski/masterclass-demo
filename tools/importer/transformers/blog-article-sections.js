/* eslint-disable */
/* global WebImporter */

/**
 * Blog article import: split hero from body and normalize section style classes.
 * Runs in afterTransform only.
 */
const TransformHook = { afterTransform: 'afterTransform' };

const SECTION_STYLES = ['secondary', 'inverse', 'accent'];

function wrapBodyAfterHero(main, doc) {
  const hero = main.querySelector('.hero-adventure');
  if (!hero) return;

  const heroContainer = hero.parentElement;
  let sibling = heroContainer?.nextElementSibling;
  while (sibling && (sibling.tagName === 'HR' || sibling.classList?.contains('section-metadata'))) {
    sibling = sibling.nextElementSibling;
  }
  if (!sibling || !['P', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE'].includes(sibling.tagName)) {
    return;
  }

  const section = doc.createElement('div');
  const metaBlock = WebImporter.Blocks.createBlock(doc, {
    name: 'Section Metadata',
    cells: { style: 'narrow' },
  });

  while (sibling) {
    const tag = sibling.tagName;
    const isStyled = sibling.classList
      && SECTION_STYLES.some((s) => sibling.classList.contains(s));
    if (isStyled || sibling.classList?.contains('columns-gallery')
      || sibling.classList?.contains('tabs-activity')
      || sibling.classList?.contains('metadata')) {
      break;
    }
    if (!['P', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE', 'PICTURE'].includes(tag)) break;
    const next = sibling.nextElementSibling;
    section.append(sibling);
    sibling = next;
  }

  if (section.children.length > 0) {
    section.append(metaBlock);
    heroContainer.after(section);
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

  wrapBodyAfterHero(main, doc);
  normalizeStyledSectionDivs(main, doc);
}
