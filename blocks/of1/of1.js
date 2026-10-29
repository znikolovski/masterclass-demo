import { decorateMain } from '../../scripts/scripts.js';
import {
  buildBlock, createOptimizedPicture, loadSections, readBlockConfig,
} from '../../scripts/aem.js';
import { selectOf1Entries } from '../../scripts/of1-context.js';

const DEFAULT_WORKER_URL = 'https://of1-gen-web-service.franklin-prod.workers.dev';
let catalog;

async function addSourceCards(main) {
  if (!main.querySelector('.adventure-facts') || main.querySelector('.cards')) return;
  const sections = [...document.querySelector('main').children];
  const turnStart = sections.findLastIndex((section) => section.classList.contains('of1-turn-anchor'));
  if (sections.slice(turnStart + 1).some((section) => section.querySelector('.cards'))) return;
  const section = document.createElement('div');
  try {
    if (!catalog) {
      catalog = fetch(new URL('../../of1/config/knowledge.json', import.meta.url))
        .then(async (response) => {
          if (!response.ok) throw new Error(`OF1 adventure catalog returned HTTP ${response.status}`);
          const entries = await response.json();
          if (!Array.isArray(entries)) throw new Error('OF1 adventure catalog is not a collection');
          return entries;
        }).catch((error) => {
          catalog = undefined;
          throw error;
        });
    }
    const entries = await catalog;
    const products = entries.filter((entry) => entry.type === 'product'
      && new URL(entry.url).pathname.startsWith('/blog/'));
    const terms = new Map(entries.filter((entry) => entry.planning)
      .map((entry) => [entry.id.replace(/^planning-/, ''), entry.planning.destinationTerms]));
    const selected = selectOf1Entries(products, (entry) => [
      entry.title, entry.id.replaceAll('-', ' '), ...(terms.get(entry.id) || []),
    ]);
    if (!selected.length) return;
    const rows = selected.map((entry) => {
      const source = new URL(entry.url);
      if (source.protocol !== 'https:' || !entry.title || typeof entry.description !== 'string') {
        throw new Error('OF1 adventure card has invalid source metadata');
      }
      const content = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = entry.title;
      const description = document.createElement('p');
      description.textContent = entry.description;
      const link = document.createElement('a');
      link.href = source.href;
      link.textContent = 'Read field notes';
      content.append(title, description, link);
      const image = entry.images?.[0]
        ? createOptimizedPicture(entry.images[0], entry.title)
        : document.createElement('div');
      return [image, content];
    });
    section.append(buildBlock('cards', rows));
  } catch (error) {
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Adventure cards are unavailable right now. Please try again later.';
    section.append(status);
    // eslint-disable-next-line no-console
    console.error('Unable to load source-backed OF1 adventure cards:', error);
  }
  main.prepend(section);
}

/**
 * Legacy EDS decoration hook — passed to the SDK for non-template-routed
 * section events that need block decoration.
 */
async function decorateAndLoad(sectionHtml) {
  const tempMain = document.createElement('main');
  tempMain.innerHTML = `<div>${sectionHtml}</div>`;
  await addSourceCards(tempMain);
  decorateMain(tempMain);
  await loadSections(tempMain);
  return Array.from(tempMain.querySelectorAll(':scope > div'));
}

export default async function decorate(block) {
  const config = readBlockConfig(block);

  if (!config['api-endpoint']) {
    config['api-endpoint'] = DEFAULT_WORKER_URL;
  }
  if (!config.domain) {
    const host = window.location.hostname;
    const metaDomain = document.querySelector('meta[name="domain"]')?.content;
    if (metaDomain && metaDomain.includes('--')) {
      config.domain = metaDomain;
    } else if (host.endsWith('.aem.page') || host.endsWith('.aem.live')) {
      config.domain = host.replace(/\.aem\.(page|live)$/, '');
    } else {
      config.domain = metaDomain || host;
    }
  }

  if (!document.querySelector('meta[name="domain"]')) {
    const meta = document.createElement('meta');
    meta.name = 'domain';
    meta.content = config.domain;
    document.head.appendChild(meta);
  }

  block.textContent = '';

  // Load the OF1 client SDK from the worker
  const sdkUrl = `${config['api-endpoint']}/sdk/of1-client.js`;
  const { init } = await import(/* webpackIgnore: true */ sdkUrl);
  await init(block, config, { decorateAndLoad });
}
