import { normalizeOf1Text, selectOf1Entries } from '../../scripts/of1-context.js';

let catalog;

function validList(value) {
  return Array.isArray(value) && value.length > 0
    && value.every((text) => typeof text === 'string' && text.trim());
}

function validSource(source) {
  const url = new URL(source.url);
  return typeof source.label === 'string' && source.label.trim()
    && url.protocol === 'https:' && !url.username && !url.password;
}

async function getCatalog() {
  if (!catalog) {
    catalog = fetch(new URL('../../of1/config/knowledge.json', import.meta.url))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Planning catalog returned HTTP ${response.status}`);
        const entities = await response.json();
        if (!Array.isArray(entities)) throw new Error('Planning catalog is not an entity collection');
        const entries = entities.filter((entry) => entry.id?.startsWith('planning-'));
        if (!entries.length) throw new Error('Planning catalog has no curated adventures');
        const ids = new Set();
        entries.forEach((entry) => {
          const { planning } = entry;
          if (ids.has(entry.id) || typeof entry.title !== 'string' || !entry.title.trim()
            || !validList(planning?.destinationTerms)
            || !planning.destinationTerms.every((term) => normalizeOf1Text(term).trim())
            || !['gear', 'route', 'access'].every((key) => validList(planning[key]))
            || typeof planning.caveat !== 'string' || !planning.caveat.trim()
            || !Array.isArray(planning.sources) || !planning.sources.length
            || !planning.sources.every(validSource)
            || !planning.sources.some((source) => source.url === entry.url)) {
            throw new Error(`Invalid source-backed planning information for ${entry.id}`);
          }
          ids.add(entry.id);
        });
        return entries;
      }).catch((error) => {
        catalog = undefined;
        throw error;
      });
  }
  return catalog;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export default async function decorate(block) {
  let entries;
  try {
    entries = await getCatalog();
  } catch (error) {
    const message = element('p', 'Adventure planning information is unavailable right now. Please try again later.');
    message.setAttribute('role', 'status');
    block.replaceChildren(element('h2', 'Plan your adventure'), message);
    // eslint-disable-next-line no-console -- display and report source-data failures
    console.error('Unable to load source-backed adventure planning:', error);
    return;
  }
  const selected = selectOf1Entries(entries, (entry) => entry.planning.destinationTerms);
  if (!selected.length) {
    block.closest('.section').hidden = true;
    return;
  }
  const panel = element('div', '', 'adventure-planning-panel');
  panel.append(element('h2', 'Plan your adventure'));
  panel.append(element('p', 'Gear, route briefings, and permits & access from published sources. Expand a topic to explore it.', 'adventure-planning-lead'));
  const list = element('ul', '', 'adventure-planning-list');
  selected.forEach((entry) => {
    const { planning } = entry;
    const item = element('li');
    item.append(element('h3', entry.title.replace('Trip planning: ', '')));
    [
      ['route', 'Route briefing'],
      ['gear', 'Gear checklist'],
      ['access', 'Permits & access'],
    ].forEach(([key, label]) => {
      const details = element('details');
      details.open = key === 'route';
      details.append(element('summary', label));
      const points = element('ul');
      planning[key].forEach((text) => points.append(element('li', text)));
      details.append(points);
      item.append(details);
    });
    item.append(element('p', planning.caveat, 'adventure-planning-caveat'));
    const sources = element('ul', '', 'adventure-planning-sources');
    planning.sources.forEach((source) => {
      const sourceItem = element('li');
      const link = element('a', source.label);
      link.href = source.url;
      sourceItem.append(link);
      sources.append(sourceItem);
    });
    item.append(sources);
    list.append(item);
  });
  panel.append(list);
  panel.append(element('p', 'Editorial starting points, not a complete safety checklist or a live permit service. Confirm current rules, closures, conditions and suitable equipment with local authorities and qualified providers before travelling.', 'adventure-planning-note'));
  block.replaceChildren(panel);
}
