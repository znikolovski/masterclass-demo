/**
 * DA / Experience Workspace library plugin: browse /fragments and insert a Fragment block.
 * @see https://docs.da.live/developers/guides/developing-apps-and-plugins
 * @see https://www.aem.live/docs/fragments
 */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const DEFAULT_ORG = 'znikolovski';
const DEFAULT_SITE = 'masterclass-demo';
const DEFAULT_CODE_ORIGIN = `https://main--${DEFAULT_SITE}--${DEFAULT_ORG}.aem.page`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBootstrap() {
  const el = document.getElementById('fragment-picker-bootstrap');
  if (!el?.textContent?.trim()) return { codeOrigin: DEFAULT_CODE_ORIGIN };
  try {
    return { ...JSON.parse(el.textContent.trim()) };
  } catch {
    return { codeOrigin: DEFAULT_CODE_ORIGIN };
  }
}

function getCodeOrigin(context) {
  const branch = context?.ref || context?.branch || 'main';
  const org = context?.org || DEFAULT_ORG;
  const site = context?.repo || context?.site || DEFAULT_SITE;
  return `https://${branch}--${site}--${org}.aem.page`;
}

function isFragmentPath(path) {
  return typeof path === 'string'
    && path.startsWith('/fragments/')
    && path !== '/fragments'
    && !path.includes('/blocks/');
}

function slugToTitle(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildFragmentBlockHtml(fragmentPath, label) {
  const href = escapeHtml(fragmentPath);
  const text = escapeHtml(label || fragmentPath);
  return `<div class="fragment"><div><div><p><a href="${href}">${text}</a></p></div></div></div>`;
}

function setStatus(message, isError = false) {
  const el = document.getElementById('fp-status');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.classList.toggle('is-error', isError);
}

async function loadFragments(codeOrigin) {
  const url = `${codeOrigin.replace(/\/$/, '')}/query-index.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not load fragment index (${resp.status}).`);
  const json = await resp.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  const seen = new Set();
  const fragments = [];

  rows.forEach((row) => {
    const path = row?.path;
    if (!isFragmentPath(path) || seen.has(path)) return;
    seen.add(path);
    const slug = path.replace(/^\/fragments\//, '');
    fragments.push({
      path,
      title: row.title?.trim() || slugToTitle(slug),
      slug,
    });
  });

  fragments.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return fragments;
}

function renderList(fragments, actions) {
  const list = document.getElementById('fp-list');
  const search = document.getElementById('fp-search');
  if (!list) return;

  const render = (filter = '') => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? fragments.filter((f) => f.title.toLowerCase().includes(q)
        || f.path.toLowerCase().includes(q)
        || f.slug.toLowerCase().includes(q))
      : fragments;

    list.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'fp-empty';
      empty.textContent = q
        ? 'No fragments match your search.'
        : 'No fragments found under /fragments/. Create one by converting a section to a fragment, then preview it.';
      list.append(empty);
      return;
    }

    filtered.forEach((fragment) => {
      const li = document.createElement('li');
      li.className = 'fp-item';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `<span class="fp-item-title">${escapeHtml(fragment.title)}</span>`
        + `<span class="fp-item-path">${escapeHtml(fragment.path)}</span>`;
      btn.addEventListener('click', async () => {
        const html = buildFragmentBlockHtml(fragment.path, fragment.title);
        if (actions?.sendHTML) {
          await actions.sendHTML(html);
        } else if (actions?.sendText) {
          await actions.sendText(html);
        } else {
          setStatus('Editor SDK is not ready. Reload the page and try again.', true);
          return;
        }
        actions?.closeLibrary?.();
      });
      li.append(btn);
      list.append(li);
    });
  };

  render();
  search?.addEventListener('input', () => render(search.value));
}

(async function init() {
  setStatus('Loading fragments…');
  try {
    const { context, actions } = await DA_SDK;
    const bootstrap = getBootstrap();
    const codeOrigin = bootstrap.codeOrigin || getCodeOrigin(context);
    const fragments = await loadFragments(codeOrigin);
    setStatus(fragments.length
      ? `${fragments.length} fragment${fragments.length === 1 ? '' : 's'} available.`
      : '');
    renderList(fragments, actions);
  } catch (err) {
    setStatus(err.message || String(err), true);
    const list = document.getElementById('fp-list');
    if (list) list.innerHTML = '';
  }
}());
