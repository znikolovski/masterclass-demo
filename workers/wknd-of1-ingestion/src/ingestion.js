import {
  articleFingerprint, boundedText, catalogueFingerprint, catalogueIds, digest,
  extractArticle, renderEntity, renderMirror, updateCatalogue,
} from './content.js';

const SOURCE_PATH = /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const CATALOGUE = '/of1/config/knowledge';
const LEASE_MS = 20 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function configuration(env) {
  for (const name of ['OWNER', 'REPO', 'REF']) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(env[name])) throw new Error(`Invalid ${name}`);
  }
  if (!['observe', 'write'].includes(env.MODE)) throw new Error('Invalid MODE');
  if (env.OF1_ORIGIN !== 'https://of1-gen-web-service.franklin-prod.workers.dev') {
    throw new Error('Unapproved OF1 origin');
  }
  const tenant = `${env.REF}--${env.REPO}--${env.OWNER}`;
  return {
    tenant,
    live: `https://${tenant}.aem.live`,
    preview: `https://${tenant}.aem.page`,
    source: `https://admin.da.live/source/${env.OWNER}/${env.REPO}`,
    admin: 'https://admin.hlx.page',
    site: `${env.OWNER}/${env.REPO}/${env.REF}`,
  };
}

function transport(fetcher) {
  let requests = 0;
  return async (url, options = {}) => {
    requests += 1;
    if (requests > 35) throw new Error('Per-run upstream request budget exhausted');
    const { timeoutMs = 15000, ...init } = options;
    const response = await fetcher(url, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    });
    return response;
  };
}

async function getText(io, url, options) {
  const response = await io(url, options);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Upstream ${new URL(url).hostname}${new URL(url).pathname}: HTTP ${response.status}`);
  }
  return boundedText(response);
}

export async function publishedIndex(io, live) {
  const rows = [];
  let total = null;
  let offset = 0;
  for (let page = 0; page < 8; page += 1) {
    const body = JSON.parse(await getText(io, `${live}/query-index.json?limit=500&offset=${offset}`));
    if (!Number.isInteger(body.total) || body.total < 0 || body.offset !== offset
      || !Array.isArray(body.data) || body.data.length > 500
      || (total !== null && body.total !== total)) {
      throw new Error('Invalid or changing published index; retrying without deleting anything');
    }
    total = body.total;
    for (const row of body.data) {
      if (!row || typeof row.path !== 'string' || !Number.isFinite(Number(row.lastModified))) {
        throw new Error('Invalid published index row');
      }
      rows.push(row);
    }
    offset += body.data.length;
    if (offset === total) {
      if (new Set(rows.map((row) => row.path)).size !== rows.length) {
        throw new Error('Duplicate published index paths');
      }
      return rows;
    }
    if (offset > total || !body.data.length) throw new Error('Incomplete published index');
  }
  throw new Error('Published index exceeds bounded pagination; increase capacity before proceeding');
}

function auth(env) {
  if (!env.DA_TOKEN) throw new Error('DA_TOKEN is missing; authoring access is not configured');
  return { Authorization: `Bearer ${env.DA_TOKEN}` };
}

async function authoringToken(io, env) {
  if (env.DA_TOKEN) return env.DA_TOKEN;
  if (!env.IMS_CLIENT_ID || !env.IMS_CLIENT_SECRET || !env.IMS_SCOPES) {
    throw new Error('DA_TOKEN or complete Adobe IMS service credentials are missing');
  }
  const body = new URLSearchParams({
    client_id: env.IMS_CLIENT_ID,
    client_secret: env.IMS_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: env.IMS_SCOPES,
  });
  const result = JSON.parse(await getText(io, 'https://ims-na1.adobelogin.com/ims/token/v3', {
    method: 'POST', body,
  }));
  if (typeof result.access_token !== 'string' || !result.access_token || !(result.expires_in > 300)) {
    throw new Error('Adobe IMS did not return a usable access token');
  }
  return result.access_token;
}

async function lifecycle(io, config, env, action, path, method = 'POST') {
  const result = await io(`${config.admin}/${action}/${config.site}${path}`, {
    method, headers: auth(env),
  });
  if (!result.ok && !(method === 'DELETE' && result.status === 404)) {
    await result.body?.cancel();
    throw new Error(`${action} ${path}: HTTP ${result.status}`);
  }
  await result.body?.cancel();
}

async function putDocument(io, config, env, path, html, conditionals = {}) {
  const data = new FormData();
  data.append('data', new Blob([html], { type: 'text/html' }), `${path.split('/').pop()}.html`);
  await getText(io, `${config.source}${path}.html`, {
    method: 'PUT', headers: { ...auth(env), ...conditionals }, body: data,
  });
  await lifecycle(io, config, env, 'preview', path);
  await lifecycle(io, config, env, 'live', path);
}

export async function runIngestion(env, fetcher = fetch) {
  const config = configuration(env);
  const db = env.STATE;
  const owner = crypto.randomUUID();
  const now = Date.now();
  const lock = await db.prepare(`UPDATE ingestion_state SET owner = ?1, lease_until = ?2,
    last_run = ?3, last_error = NULL WHERE id = 1 AND lease_until < ?3 RETURNING value`)
    .bind(owner, now + LEASE_MS, now).first();
  if (!lock) return { status: 'busy' };
  const io = transport(fetcher);
  const save = async (state) => {
    const result = await db.prepare(`UPDATE ingestion_state SET value = ?1
      WHERE id = 1 AND owner = ?2 AND lease_until > ?3`)
      .bind(JSON.stringify(state), owner, Date.now()).run();
    if (result.meta.changes !== 1) throw new Error('Ingestion lease lost');
  };
  try {
    const state = JSON.parse(lock.value);
    if (state.version !== 1 || !state.pages) throw new Error('Unsupported ingestion state version');
    const rows = await publishedIndex(io, config.live);
    const sources = rows.filter((row) => SOURCE_PATH.test(row.path));
    if (env.MODE === 'observe') {
      const ids = await catalogueIds(await getText(io, `${config.preview}${CATALOGUE}.plain.html`));
      const candidates = [];
      for (const row of sources) {
        const id = `auto-blog-${(await digest(row.path)).slice(0, 24)}`;
        if (!ids.includes(row.path.slice('/blog/'.length)) && !ids.includes(id)) {
          candidates.push(row.path);
        }
      }
      const observation = {
        status: 'observing',
        publishedAdventures: sources.length,
        candidates,
        writesEnabled: false,
      };
      if (JSON.stringify(state.observation) !== JSON.stringify(observation)) {
        state.observation = observation;
        await save(state);
      }
      return observation;
    }
    if (!env.DA_TOKEN && !(env.IMS_CLIENT_ID && env.IMS_CLIENT_SECRET && env.IMS_SCOPES)) {
      throw new Error('DA_TOKEN or complete Adobe IMS service credentials are missing');
    }
    if (env.SYNC_POLICY_VERIFIED !== 'true') {
      throw new Error('Confirm upstream sync deduplication and stale-vector pruning before enabling writes');
    }
    if (state.pending) {
      const writer = { ...env, DA_TOKEN: await authoringToken(io, env) };
      const job = state.pending;
      const present = sources.find((row) => row.path === job.path);
      if (job.operation === 'upsert' && !present) {
        const response = await io(`${config.live}${job.path}.plain.html`);
        await response.body?.cancel();
        if (![404, 410].includes(response.status)) {
          throw new Error('Pending article absent from index but not confirmed unpublished');
        }
        state.pending = { ...job, operation: 'delete', phase: 'mirror' };
        await save(state);
        return { status: 'withdrawal-pending', path: job.path };
      }
      if (job.operation === 'delete' && present) {
        state.pending = { ...job, operation: 'upsert', phase: 'mirror' };
        await save(state);
        return { status: 'republication-pending', path: job.path };
      }
      if (job.phase === 'mirror') {
        if (job.operation === 'delete') {
          await lifecycle(io, config, writer, 'live', job.mirror, 'DELETE');
          await lifecycle(io, config, writer, 'preview', job.mirror, 'DELETE');
        } else {
          const html = await getText(io, `${config.live}${job.path}.plain.html`);
          const article = await extractArticle(html, `${config.live}${job.path}`);
          job.hash = await digest(html);
          job.entity = renderEntity(article, job.id);
          job.catalogueFingerprint = await catalogueFingerprint(job.entity, job.id);
          job.modified = present.lastModified;
          const mirror = renderMirror(article);
          job.mirrorFingerprint = await articleFingerprint(await extractArticle(mirror, `${config.preview}${job.mirror}`));
          await putDocument(io, config, writer, job.mirror, mirror);
        }
        job.phase = 'catalogue';
      } else if (job.phase === 'catalogue') {
        const url = `${config.source}${CATALOGUE}.html`;
        const response = await io(url, { headers: auth(writer) });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`DA catalogue read: HTTP ${response.status}`);
        }
        let etag = response.headers.get('etag');
        const original = await boundedText(response);
        if (!etag) {
          // DA can omit its single-part S3 ETag. Verify the body-derived value
          // against the server before using it for an atomic conditional PUT.
          etag = `"${await digest(original, 'MD5')}"`;
          const current = await getText(io, url, {
            headers: { ...auth(writer), 'If-Match': etag },
          });
          if (current !== original) {
            throw new Error('DA conditional catalogue read changed; refusing to overwrite author edits');
          }
        }
        if (!etag || etag.startsWith('W/') || etag === '*') {
          throw new Error('DA catalogue has no strong ETag; refusing an unconditional shared-document write');
        }
        const updated = await updateCatalogue(original, job.id, job.operation === 'delete' ? null : job.entity);
        const hash = await digest(original);
        await db.prepare('INSERT OR IGNORE INTO catalogue_backups VALUES (?1, ?2, ?3)')
          .bind(hash, now, original).run();
        await db.prepare(`DELETE FROM catalogue_backups WHERE digest NOT IN
          (SELECT digest FROM catalogue_backups ORDER BY created_at DESC LIMIT 20)`).run();
        await putDocument(io, config, writer, CATALOGUE, updated, { 'If-Match': etag });
        job.phase = 'visibility';
      } else if (job.phase === 'visibility') {
        const indexed = rows.some((row) => row.path === job.mirror);
        if (indexed !== (job.operation !== 'delete')) {
          throw new Error('Waiting for the published mirror index to reflect the change');
        }
        const html = await getText(io, `${config.preview}${CATALOGUE}.plain.html`);
        const ids = await catalogueIds(html);
        if (ids.includes(job.id) !== (job.operation !== 'delete')) {
          throw new Error('Waiting for preview catalogue visibility');
        }
        if (job.operation !== 'delete') {
          if (await catalogueFingerprint(html, job.id) !== job.catalogueFingerprint) {
            throw new Error('Waiting for the updated catalogue contents, not merely its existing ID');
          }
          const mirror = await getText(io, `${config.preview}${job.mirror}.plain.html`);
          const article = await extractArticle(mirror, `${config.preview}${job.mirror}`);
          if (await articleFingerprint(article) !== job.mirrorFingerprint) {
            throw new Error('Waiting for the updated mirror contents, not merely HTTP 200');
          }
        }
        job.phase = 'sync';
      } else if (job.phase === 'sync') {
        const url = `${env.OF1_ORIGIN}/api/tenants/${config.tenant}/sync?stage=preview&ref=${env.REF}`;
        const result = JSON.parse(await getText(io, url, {
          method: 'POST', headers: auth(writer), timeoutMs: 120000,
        }));
        if (result.ok !== true || !Array.isArray(result.errors) || result.errors.length
          || !Array.isArray(result.synced)
          || !result.synced.some((name) => ['knowledge', 'content'].includes(name))
          || !Number.isInteger(result.content?.indexed) || result.content.indexed < 0) {
          throw new Error('OF1 sync did not confirm successful content indexing');
        }
        state.pages[job.path] = {
          id: job.id,
          mirror: job.mirror,
          hash: job.hash,
          modified: job.modified,
          checked: now,
          deleted: job.operation === 'delete',
        };
        state.pending = null;
        await db.prepare(`DELETE FROM catalogue_backups WHERE digest NOT IN
          (SELECT digest FROM catalogue_backups ORDER BY created_at DESC LIMIT 20)`).run();
      } else {
        throw new Error('Unknown ingestion job phase');
      }
      await save(state);
      return { status: 'progress', path: job.path, phase: state.pending?.phase || 'complete' };
    }
    const catalogue = await catalogueIds(await getText(io, `${config.preview}${CATALOGUE}.plain.html`));
    const missing = Object.entries(state.pages).find(([path, entry]) => (
      !entry.deleted && !sources.some((source) => source.path === path)
    ));
    if (missing) {
      const [path, entry] = missing;
      const response = await io(`${config.live}${path}.plain.html`);
      await response.body?.cancel();
      if (![404, 410].includes(response.status)) {
        throw new Error('Missing index entry is not a confirmed unpublish; refusing deletion');
      }
      state.pending = {
        ...entry, path, operation: 'delete', phase: 'mirror',
      };
      await save(state);
      return { status: 'queued-deletion', path };
    }
    const due = sources.filter((row) => {
      const known = state.pages[row.path];
      const curated = !known && catalogue.includes(row.path.slice('/blog/'.length));
      const current = known && !known.deleted && known.modified === row.lastModified
        && now - known.checked < DAY_MS;
      return !curated && !current;
    });
    const [row] = due;
    if (row) {
      const known = state.pages[row.path];
      const html = await getText(io, `${config.live}${row.path}.plain.html`);
      const hash = await digest(html);
      if (known && !known.deleted && known.hash === hash) {
        known.modified = row.lastModified;
        known.checked = now;
        await save(state);
        return { status: 'unchanged', path: row.path };
      }
      const id = known?.id || `auto-blog-${(await digest(row.path)).slice(0, 24)}`;
      state.pending = {
        path: row.path,
        id,
        mirror: `/of1/knowledge/${id}`,
        hash,
        modified: row.lastModified,
        operation: 'upsert',
        phase: 'mirror',
      };
      await save(state);
      return { status: 'queued', path: row.path };
    }
    return { status: 'idle', publishedAdventures: sources.length };
  } catch (error) {
    await db.prepare('UPDATE ingestion_state SET last_error = ?1 WHERE id = 1 AND owner = ?2')
      .bind(error.message, owner).run();
    throw error;
  } finally {
    await db.prepare(`UPDATE ingestion_state SET owner = NULL, lease_until = 0,
      last_success = CASE WHEN last_error IS NULL THEN ?1 ELSE last_success END
      WHERE id = 1 AND owner = ?2`).bind(Date.now(), owner).run();
  }
}
