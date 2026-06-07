import {
  clearSessionToken,
  fetchAdventures,
  getApiBase,
  getSessionToken,
} from '../../scripts/b2b-api.js';

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'current', label: 'Current' },
  { id: 'archived', label: 'Archived' },
];

/**
 * @param {Element} block
 */
function parseConfig(block) {
  const rows = [...block.children];
  return {
    title: rows[0]?.children?.[1]?.textContent?.trim() || rows[0]?.textContent?.trim() || 'Adventure Dashboard',
    apiBase: rows[1]?.children?.[1]?.textContent?.trim() || '',
    requestUrl: rows[2]?.children?.[1]?.textContent?.trim() || '/request-adventure',
  };
}

/**
 * @param {object} adventure
 */
function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

/**
 * @param {object} adventure
 */
function renderCard(adventure) {
  const card = document.createElement('article');
  card.className = 'business-dashboard-card';
  card.innerHTML = `
    <div class="business-dashboard-card-head">
      <h3>${adventure.adventureName}</h3>
      <span class="business-dashboard-badge business-dashboard-badge-${adventure.status}">${adventure.status}</span>
    </div>
    <dl class="business-dashboard-meta">
      <div><dt>Type</dt><dd>${adventure.adventureType || 'general'}</dd></div>
      <div><dt>Team size</dt><dd>${adventure.teamSize || '—'}</dd></div>
      <div><dt>Preferred dates</dt><dd>${adventure.preferredDates || '—'}</dd></div>
      <div><dt>Updated</dt><dd>${formatDate(adventure.updatedAt)}</dd></div>
    </dl>
    ${adventure.notes ? `<p class="business-dashboard-notes">${adventure.notes}</p>` : ''}
  `;
  return card;
}

/**
 * @param {Element} panel
 * @param {object[]} items
 * @param {string} emptyLabel
 */
function renderPanel(panel, items, emptyLabel) {
  panel.textContent = '';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'business-dashboard-empty';
    empty.textContent = emptyLabel;
    panel.append(empty);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'business-dashboard-grid';
  items.forEach((item) => grid.append(renderCard(item)));
  panel.append(grid);
}

/**
 * @param {Element} block
 * @param {object} data
 * @param {ReturnType<typeof parseConfig>} config
 */
function renderDashboard(block, data, config) {
  block.textContent = '';
  block.classList.add('business-dashboard-loaded');

  const header = document.createElement('div');
  header.className = 'business-dashboard-header';
  const company = data.business?.companyName || 'Your business';
  header.innerHTML = `
    <div>
      <h2>${config.title}</h2>
      <p class="business-dashboard-company">${company}</p>
    </div>
    <div class="business-dashboard-actions">
      <a class="button" href="${config.requestUrl}">Request new adventure</a>
      <button type="button" class="button quiet business-dashboard-signout">Sign out</button>
    </div>
  `;
  block.append(header);

  const tablist = document.createElement('div');
  tablist.className = 'business-dashboard-tabs';
  tablist.setAttribute('role', 'tablist');

  const panels = document.createElement('div');
  panels.className = 'business-dashboard-panels';

  const adventures = data.adventures || [];
  const byStatus = Object.fromEntries(
    TABS.map((t) => [t.id, adventures.filter((a) => a.status === t.id)]),
  );

  TABS.forEach((tab, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'business-dashboard-tab';
    btn.textContent = `${tab.label} (${byStatus[tab.id].length})`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    btn.setAttribute('aria-controls', `business-dashboard-panel-${tab.id}`);
    btn.id = `business-dashboard-tab-${tab.id}`;

    const panel = document.createElement('div');
    panel.className = 'business-dashboard-panel';
    panel.id = `business-dashboard-panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', btn.id);
    panel.hidden = index !== 0;
    renderPanel(panel, byStatus[tab.id], `No ${tab.label.toLowerCase()} adventures yet.`);

    btn.addEventListener('click', () => {
      tablist.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', 'false'));
      panels.querySelectorAll('.business-dashboard-panel').forEach((p) => { p.hidden = true; });
      btn.setAttribute('aria-selected', 'true');
      panel.hidden = false;
    });

    tablist.append(btn);
    panels.append(panel);
  });

  block.append(tablist, panels);

  header.querySelector('.business-dashboard-signout')?.addEventListener('click', () => {
    clearSessionToken();
    window.location.href = '/login';
  });
}

/**
 * @param {Element} block
 */
function renderSignedOut(block) {
  block.textContent = '';
  block.innerHTML = `
    <div class="business-dashboard-signed-out">
      <h2>Adventure Dashboard</h2>
      <p>Sign in to view your team's adventure requests.</p>
      <a class="button" href="/login">Sign in</a>
    </div>
  `;
}

/**
 * @param {Element} block
 * @param {string} message
 */
function renderError(block, message) {
  block.textContent = '';
  block.innerHTML = `
    <div class="business-dashboard-error" role="alert">
      <p>${message}</p>
      <button type="button" class="button quiet business-dashboard-retry">Try again</button>
    </div>
  `;
  block.querySelector('.business-dashboard-retry')?.addEventListener('click', () => {
    // eslint-disable-next-line no-param-reassign
    block.dataset.blockStatus = '';
    window.location.reload();
  });
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const config = parseConfig(block);

  if (!getSessionToken()) {
    renderSignedOut(block);
    return;
  }

  try {
    const apiBase = getApiBase(config.apiBase);
    const data = await fetchAdventures(apiBase);
    renderDashboard(block, data, config);
  } catch (err) {
    if (err.status === 401) {
      clearSessionToken();
      renderSignedOut(block);
      return;
    }
    renderError(block, 'Could not load adventures. Please try again.');
  }
}
