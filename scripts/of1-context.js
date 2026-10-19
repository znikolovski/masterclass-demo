import { readBlockConfig } from './aem.js';
import { getJourney, pushJourneyEvent } from './journey-analytics.js';

let initialQuery = '';
const initialized = new WeakSet();

export function initOf1Query(block) {
  if (initialized.has(block)) return;
  initialized.add(block);
  const params = new URLSearchParams(window.location.search);
  initialQuery = params.get('q') || params.get('llm_app_ctx') || readBlockConfig(block).query || '';
  getJourney();
  pushJourneyEvent('of1Arrival');
  const main = block.closest('main');
  const searches = new WeakSet();
  const results = new WeakSet();
  const observeTurns = () => {
    main.querySelectorAll('.of1-turn-anchor').forEach((anchor) => {
      if (!searches.has(anchor)) {
        searches.add(anchor);
        pushJourneyEvent('of1Search');
      }
      if (results.has(anchor)) return;
      let hasResults = false;
      for (let section = anchor.nextElementSibling; section; section = section.nextElementSibling) {
        if (section.classList.contains('of1-turn-anchor')) break;
        if (section.classList.contains('generated-section')) hasResults = true;
        if (hasResults && section.classList.contains('generative-suggestions')) {
          results.add(anchor);
          pushJourneyEvent('of1Results');
          break;
        }
      }
    });
  };
  new MutationObserver(observeTurns).observe(main, { childList: true });
  observeTurns();
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

export function getOf1Context() {
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

export function getOf1ArticleUrl(href) {
  const url = new URL(href, window.location.href);
  if (['http:', 'https:'].includes(url.protocol) && url.pathname.startsWith('/blog/')
    && /--masterclass-demo--znikolovski\.aem\.(page|live)$/.test(url.hostname)) {
    return `https://wknd-adventures.run.place${url.pathname}${url.search}${url.hash}`;
  }
  return href;
}

export function normalizeOf1Text(text) {
  return ` ${text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

export function selectOf1Entries(entries, getTerms) {
  const context = getOf1Context();
  const matches = (text) => entries.filter((entry) => (
    getTerms(entry).some((term) => normalizeOf1Text(text).includes(normalizeOf1Text(term)))
  ));
  const selected = matches(context.query);
  return selected.length ? selected : matches(context.headings.join(' '));
}
