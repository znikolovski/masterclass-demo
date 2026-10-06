import { readBlockConfig } from './aem.js';

let initialQuery = '';
const initialized = new WeakSet();

export function initAeroQuery(block) {
  if (initialized.has(block)) return;
  initialized.add(block);
  const params = new URLSearchParams(window.location.search);
  initialQuery = params.get('q') || params.get('llm_app_ctx') || readBlockConfig(block).query || '';
  // The SDK removes the initial input before rendering; capture its query first.
  block.addEventListener('click', (event) => {
    const chip = event.target.closest('.of1-chip');
    if (chip) initialQuery = chip.dataset.query;
    else if (event.target.closest('.of1-submit')) {
      initialQuery = block.querySelector('.of1-input')?.value.trim() || '';
    }
  }, true);
  block.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('.of1-input')) {
      initialQuery = event.target.value.trim();
    }
  }, true);
}

export function getAeroContext() {
  const main = document.querySelector('main');
  const anchor = [...main.querySelectorAll('.of1-turn-anchor')].at(-1);
  // Breadcrumb titles retain the complete follow-up query, even when its label is truncated.
  const topic = [...main.querySelectorAll('.generative-breadcrumb .breadcrumb-item')]
    .find((link) => link.hash === `#${anchor?.id}`);
  const headings = [];
  for (let section = anchor?.nextElementSibling; section; section = section.nextElementSibling) {
    if (section.classList.contains('generated-section')) {
      section.querySelectorAll('.hero-adventure h1, .cards :is(h2, h3, h4, h5, h6)').forEach((heading) => {
        headings.push(heading.textContent);
      });
    }
  }
  return { query: topic?.title || initialQuery, headings };
}
