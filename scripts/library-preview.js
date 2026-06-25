/**
 * Minimal EDS decoration for git-hosted library preview shells.
 * EW loads /blocks/{name}/{name}.html in an iframe; without this script only
 * library-sidekick-blocks.css fallbacks apply to raw authoring markup.
 */
import {
  decorateBlocks,
  decorateIcons,
} from './aem.js';
import { loadSiteBlock } from './aero-blocks.js';

/**
 * @param {Element} main
 */
function decorateSections(main) {
  main.querySelectorAll(':scope > div').forEach((section) => {
    const wrappers = [];
    let defaultContent = false;
    [...section.children].forEach((e) => {
      if (e.tagName === 'DIV' || !defaultContent) {
        const wrapper = document.createElement('div');
        wrappers.push(wrapper);
        defaultContent = e.tagName !== 'DIV';
        if (defaultContent) wrapper.classList.add('default-content-wrapper');
      }
      wrappers[wrappers.length - 1].append(e);
    });
    wrappers.forEach((wrapper) => section.append(wrapper));
    section.classList.add('section');
    section.dataset.sectionStatus = 'initialized';
    section.style.display = 'none';
  });
}

/**
 * @param {Element} section
 */
async function loadSection(section) {
  const status = section.dataset.sectionStatus;
  if (!status || status === 'initialized') {
    section.dataset.sectionStatus = 'loading';
    const blocks = [...section.querySelectorAll('div.block')];
    for (let i = 0; i < blocks.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await loadSiteBlock(blocks[i]);
    }
    section.dataset.sectionStatus = 'loaded';
    section.style.display = null;
  }
}

/**
 * @param {Element} element
 */
async function loadSections(element) {
  const sections = [...element.querySelectorAll('div.section')];
  for (let i = 0; i < sections.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadSection(sections[i]);
  }
}

async function initLibraryPreview() {
  if (!document.body.classList.contains('library-preview')) return;

  document.body.classList.add('appear');
  const main = document.querySelector('main');
  if (!main) return;

  decorateSections(main);
  decorateBlocks(main);
  decorateIcons(main);
  await loadSections(main);
}

initLibraryPreview();
