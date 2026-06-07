import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * @param {string} [root]
 */
export function getDaToken(root = ROOT) {
  const envToken = process.env.DA_TOKEN || process.env.IMS_TOKEN || process.env.AEM_ACCESS_TOKEN;
  if (envToken?.trim()) return envToken.replace(/^Bearer\s+/i, '').trim();

  const paths = [
    join(root, '.hlx/.da-token.json'),
    `${process.env.HOME}/.aem/da-token.json`,
  ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const token = raw.access_token || raw.imsToken;
      const expires = raw.expires_at || (raw.imsTokenExpiry && raw.imsTokenExpiry * 1000);
      if (token && (!expires || expires > Date.now() + 60_000)) return token;
    } catch {
      /* continue */
    }
  }
  return null;
}

/**
 * @param {string} path
 */
export function daPath(path) {
  const normalized = path === '/' ? 'index' : path.replace(/^\//, '');
  return `${normalized}.html`;
}

/**
 * @param {string} token
 * @param {string} org
 * @param {string} site
 * @param {string} path
 */
export async function getSource(token, org, site, path) {
  const url = `https://admin.da.live/source/${org}/${site}/${daPath(path)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

/**
 * @param {string} token
 * @param {string} org
 * @param {string} site
 * @param {string} path
 * @param {string} body
 */
export async function putSource(token, org, site, path, body) {
  const form = new FormData();
  const file = daPath(path);
  form.append('data', new Blob([body], { type: 'text/html' }), basename(file));
  const url = `https://admin.da.live/source/${org}/${site}/${file}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * @param {string} token
 * @param {string} org
 * @param {string} site
 * @param {string} branch
 * @param {string} path
 */
/**
 * Strip accidental content appended after </html>.
 * @param {string} html
 */
export function trimDaHtml(html) {
  const end = html.indexOf('</html>');
  if (end !== -1) return html.slice(0, end + '</html>'.length);
  return html.trim();
}

/**
 * Insert markup before </main>, or before </body> if no main.
 * @param {string} html
 * @param {string} section
 */
export function appendInsideMain(html, section) {
  const trimmed = trimDaHtml(html);
  const mainClose = trimmed.lastIndexOf('</main>');
  if (mainClose !== -1) {
    return `${trimmed.slice(0, mainClose)}${section}\n${trimmed.slice(mainClose)}`;
  }
  const bodyClose = trimmed.lastIndexOf('</body>');
  if (bodyClose !== -1) {
    return `${trimmed.slice(0, bodyClose)}${section}\n${trimmed.slice(bodyClose)}`;
  }
  return `${trimmed}\n${section}`;
}

/**
 * @param {string} token
 * @param {'preview'|'live'} action
 * @param {string} org
 * @param {string} site
 * @param {string} branch
 * @param {string} path
 */
export async function triggerLifecycle(token, action, org, site, branch, path) {
  const normalized = path === '/' ? '' : path;
  const url = `https://admin.hlx.page/${action}/${org}/${site}/${branch}${normalized}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn(`  ! ${action} ${path} → ${res.status}`);
  }
  return res.ok;
}

export async function triggerPreview(token, org, site, branch, path) {
  return triggerLifecycle(token, 'preview', org, site, branch, path);
}

export async function triggerPublish(token, org, site, branch, path) {
  return triggerLifecycle(token, 'live', org, site, branch, path);
}
