/**
 * Minimal EDS decoration for git-hosted library preview shells.
 * EW loads /blocks/{name}/{name}.html in an iframe; without this script only
 * library-sidekick-blocks.css fallbacks apply to raw authoring markup.
 */
import {
  decorateBlocks,
  decorateIcons,
  loadSections,
} from './aem.js';

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
