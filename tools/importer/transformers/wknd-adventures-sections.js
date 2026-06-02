/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: wknd-adventures sections.
 * Splits content into EDS sections by inserting <hr> at source <section> boundaries.
 * Also adds Section Metadata blocks for styled sections (inverse, secondary, accent).
 * Runs in afterTransform only.
 */
const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

export default function transform(hookName, element, payload) {
  if (hookName !== TransformHook.afterTransform) return;

  const doc = element.ownerDocument || document;
  const main = element.querySelector('main') || element;

  // Find all top-level <section> elements in the source content
  const sections = main.querySelectorAll(':scope > section');
  if (sections.length < 2) return;

  // Process in reverse to avoid DOM position shifts
  for (let i = sections.length - 1; i > 0; i--) {
    const section = sections[i];

    // Detect section style from class names
    let style = null;
    if (section.classList.contains('inverse-section')) style = 'inverse';
    else if (section.classList.contains('secondary-section')) style = 'secondary';
    else if (section.classList.contains('accent-section')) style = 'accent';

    // Add Section Metadata block if section has a style
    if (style) {
      const metaBlock = WebImporter.Blocks.createBlock(doc, {
        name: 'Section Metadata',
        cells: { style: style },
      });
      section.append(metaBlock);
    }

    // Insert <hr> before each section (except the first)
    const hr = doc.createElement('hr');
    section.before(hr);
  }

  // Handle first section style too
  const firstSection = sections[0];
  if (firstSection) {
    let style = null;
    if (firstSection.classList.contains('inverse-section')) style = 'inverse';
    else if (firstSection.classList.contains('secondary-section')) style = 'secondary';
    else if (firstSection.classList.contains('accent-section')) style = 'accent';
    if (style) {
      const metaBlock = WebImporter.Blocks.createBlock(doc, {
        name: 'Section Metadata',
        cells: { style: style },
      });
      firstSection.append(metaBlock);
    }
  }
}
