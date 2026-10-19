import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const root = new URL('../', import.meta.url);
const bundle = await build({
  stdin: {
    contents: `
      import { runIngestion, publishedIndex } from './src/ingestion.js';
      import { extractArticle, renderMirror, updateCatalogue, catalogueIds } from './src/content.js';
      export default {
        async fetch(request, env) {
          try {
            const input = await request.json();
            const vars = {
              OWNER: 'znikolovski', REPO: 'masterclass-demo', REF: 'main',
              OF1_ORIGIN: 'https://of1-gen-web-service.franklin-prod.workers.dev',
              MODE: 'write', SYNC_POLICY_VERIFIED: 'true', DA_TOKEN: 'fixture-only',
              STATE: env.STATE, ...input.vars
            };
            const io = env.UPSTREAM.fetch.bind(env.UPSTREAM);
            let result;
            if (input.action === 'extract') {
              result = await extractArticle(input.html, input.url);
              result.mirror = renderMirror(result);
            } else if (input.action === 'catalogue') {
              result = await updateCatalogue(input.html, input.id, input.entity);
            } else if (input.action === 'ids') {
              result = await catalogueIds(input.html);
            } else if (input.action === 'index') {
              result = await publishedIndex(io, 'https://example.com');
            } else {
              result = await runIngestion(vars, io);
            }
            return Response.json({ok: true, result});
          } catch (error) {
            return Response.json({ok: false, error: error.message}, {status: 500});
          }
        }
      };`,
    resolveDir: root.pathname,
    sourcefile: 'test-entry.js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
});
const schema = await fs.readFile(new URL('migrations/0001_state.sql', root), 'utf8');
const original = '<body><header></header><main><div><h2>Keep editorial context</h2>'
  + '<div class="of1-config"><div><div>id</div><div>alpine-cycling</div></div>'
  + '<div><div>custom</div><div><strong>Curated &amp; unchanged</strong></div></div></div>'
  + '</div></main><footer>Preserve me</footer></body>';
const article = '<div><h1>New &amp; Wild</h1><p>A source-backed adventure.</p>'
  + '<h2>Route</h2><p>Take the <a href="/map">marked route</a>.</p>'
  + '<p><picture><img src="./media_photo.jpg?width=750&amp;format=jpg" alt="River &amp; rocks"></picture></p>'
  + '<ul><li>Bring water.</li></ul><div class="metadata"><p>Not article facts</p></div></div>';

async function setup(t) {
  const state = {
    rows: [
      { path: '/blog/alpine-cycling', lastModified: 1 },
      { path: '/blog/new-adventure', lastModified: 2 },
    ],
    articles: { '/blog/new-adventure': article },
    documents: { '/of1/config/knowledge': original },
    delivery: {},
    calls: [],
    syncs: 0,
    syncDelay: 0,
    syncResult: {
      ok: true, errors: [], synced: ['knowledge'], content: { indexed: 5 },
    },
    failure: null,
    blockIndex: null,
    onIndex: null,
    changingCatalogue: false,
    catalogueReads: 0,
    catalogueVersion: 0,
    omitEtag: false,
    rejectComputedEtag: false,
  };
  const mf = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-30',
    d1Databases: { STATE: 'state' },
    serviceBindings: {
      UPSTREAM: async (request) => {
        const url = new URL(request.url);
        const key = `${request.method} ${url.pathname}`;
        state.calls.push(key);
        if (state.failure?.key === key) return new Response('', { status: state.failure.status });
        if (url.hostname === 'ims-na1.adobelogin.com') {
          const data = await request.formData();
          assert.equal(data.get('grant_type'), 'client_credentials');
          assert.equal(data.get('scope'), 'fixture-scope');
          return Response.json({ access_token: 'fixture-only', expires_in: 86400 });
        }
        if (url.pathname === '/query-index.json') {
          state.onIndex?.();
          if (state.blockIndex) await state.blockIndex;
          const offset = Number(url.searchParams.get('offset'));
          const rows = state.indexRows || state.rows;
          return Response.json({
            total: rows.length, offset, data: rows.slice(offset, offset + 500),
          });
        }
        if (url.hostname === 'admin.da.live') {
          const path = url.pathname.replace('/source/znikolovski/masterclass-demo', '').replace(/\.html$/, '');
          if (request.method === 'PUT') {
            if (path === '/of1/config/knowledge') {
              if (state.changingCatalogue) {
                state.catalogueVersion += 1;
                state.documents[path] += '<!-- author edited -->';
              }
              const etag = `"${createHash('md5').update(state.documents[path]).digest('hex')}"`;
              if (request.headers.get('if-match') !== etag) {
                return new Response('', { status: 412 });
              }
              state.catalogueVersion += 1;
            }
            const form = await request.formData();
            assert(form.get('data'), 'DA uses the required data form field');
            state.documents[path] = await form.get('data').text();
            return Response.json({ source: {} });
          }
          state.catalogueReads += 1;
          const etag = `"${createHash('md5').update(state.documents[path] || '').digest('hex')}"`;
          if (request.headers.has('if-match')
            && (state.rejectComputedEtag || request.headers.get('if-match') !== etag)) {
            return new Response('', { status: 412 });
          }
          return new Response(state.documents[path] || '', {
            status: state.documents[path] ? 200 : 404,
            headers: state.omitEtag ? {} : { etag },
          });
        }
        if (url.hostname === 'api.aem.live') {
          assert.fail('Legacy-shaped lifecycle URLs are not supported by api.aem.live');
        }
        if (url.hostname === 'admin.hlx.page') {
          assert.equal(request.headers.get('authorization'), 'Bearer fixture-only');
          const path = url.pathname.replace(/^\/(preview|live)\/znikolovski\/masterclass-demo\/main/, '');
          if (url.pathname.startsWith('/live/')) {
            if (request.method === 'DELETE') {
              state.rows = state.rows.filter((row) => row.path !== path);
            } else if (!state.rows.some((row) => row.path === path)) {
              state.rows.push({ path, lastModified: 3 });
            }
          }
          return Response.json({});
        }
        if (url.pathname.includes('/sync')) {
          state.syncs += 1;
          assert.equal(url.pathname, '/api/tenants/main--masterclass-demo--znikolovski/sync');
          assert.equal(url.search, '?stage=preview&ref=main');
          if (state.syncDelay) {
            await new Promise((resolve) => { setTimeout(resolve, state.syncDelay); });
          }
          return Response.json(state.syncResult);
        }
        const path = url.pathname.replace(/\.plain\.html$/, '');
        const html = state.delivery[path] || state.documents[path] || state.articles[path];
        return new Response(html || '', { status: html ? 200 : 404 });
      },
    },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('STATE');
  for (const statement of schema.split(';').map((sql) => sql.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
  const call = async (input = {}) => {
    const response = await mf.dispatchFetch('http://test', { method: 'POST', body: JSON.stringify(input) });
    return response.json();
  };
  const run = async (vars) => {
    const response = await call({ vars });
    assert.equal(response.ok, true, response.error);
    return response.result;
  };
  const stored = async () => JSON.parse((await db.prepare('SELECT value FROM ingestion_state').first()).value);
  return {
    state, db, call, run, stored,
  };
}

test('native extraction retains source text, citations and original image URLs without metadata', async (t) => {
  const { call } = await setup(t);
  const { ok, result } = await call({ action: 'extract', html: article, url: 'https://example.com/blog/new' });
  assert.equal(ok, true);
  assert.equal(result.title, 'New & Wild');
  assert.equal(result.images[0].src, 'https://example.com/blog/media_photo.jpg?width=750&format=jpg');
  assert.equal(result.images[0].alt, 'River & rocks');
  assert.deepEqual(result.links, ['https://example.com/map']);
  assert(result.mirror.includes('New &amp; Wild'));
  assert(result.mirror.includes('https://example.com/blog/new'));
  assert(!result.mirror.includes('Not article facts'));
});

test('related-card images and text are excluded and nested quotations are not duplicated', async (t) => {
  const { call } = await setup(t);
  const html = '<h1>A real article</h1><p>Body</p><blockquote><p>One quote.</p></blockquote>'
    + '<div class="tabs-activity"><h3>Unrelated story</h3><p>Not this adventure</p>'
    + '<img src="/media_other.jpg" alt="Unrelated"></div>';
  const { result } = await call({ action: 'extract', html, url: 'https://example.com/blog/new' });
  assert.deepEqual(result.blocks.map((block) => block.text), ['A real article', 'Body', 'One quote.']);
  assert.deepEqual(result.images, []);
});

test('new adventure progresses idempotently through both knowledge layers and one sync', async (t) => {
  const {
    run, stored, state, db,
  } = await setup(t);
  assert.equal((await run()).status, 'queued');
  const { pending } = await stored();
  assert.match(pending.id, /^auto-blog-[a-f0-9]{24}$/);
  assert.equal((await run()).phase, 'catalogue');
  const mirror = state.documents[pending.mirror];
  assert(mirror.includes('/blog/new-adventure'));
  assert.equal((await run()).phase, 'visibility');
  assert(state.documents['/of1/config/knowledge'].includes('Curated &amp; unchanged'));
  assert(state.documents['/of1/config/knowledge'].includes('Preserve me'));
  assert(state.documents['/of1/config/knowledge'].includes(pending.id));
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM catalogue_backups').first()).count, 1);
  assert.equal(state.syncs, 0);
  assert.equal((await run()).phase, 'sync');
  assert.equal((await run()).phase, 'complete');
  assert.equal(state.syncs, 1);
  assert.equal((await run()).status, 'idle');
  assert.equal(state.syncs, 1);
  assert.equal((await stored()).pending, null);
});

test('observe mode cannot mutate DA, lifecycle or OF1 even without credentials', async (t) => {
  const { run, state, stored } = await setup(t);
  const result = await run({ MODE: 'observe', DA_TOKEN: '' });
  assert.deepEqual(result.candidates, ['/blog/new-adventure']);
  assert.equal(result.writesEnabled, false);
  assert(state.calls.every((key) => key.startsWith('GET ')));
  assert.equal((await stored()).pending, null);
});

test('credentials and verified upstream policy are required before write mode', async (t) => {
  const { call, state } = await setup(t);
  assert.match((await call({ vars: { DA_TOKEN: '' } })).error, /missing/);
  assert.match((await call({ vars: { SYNC_POLICY_VERIFIED: 'false' } })).error, /stale-vector/);
  assert(state.calls.every((key) => key.startsWith('GET ')));
});

test('index pagination is complete, bounded and never silently truncated', async (t) => {
  const { state, call } = await setup(t);
  state.indexRows = Array.from({ length: 1001 }, (_, i) => ({ path: `/page-${i}`, lastModified: i }));
  assert.equal((await call({ action: 'index' })).result.length, 1001);
  [state.indexRows[1000]] = state.indexRows;
  assert.match((await call({ action: 'index' })).error, /Duplicate/);
  state.indexRows = Array.from({ length: 4001 }, (_, i) => ({ path: `/page-${i}`, lastModified: i }));
  assert.match((await call({ action: 'index' })).error, /bounded pagination/);
});

test('publishing failure keeps job pending and retries without duplicate catalogue entries', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  await run();
  const { pending } = await stored();
  state.failure = { key: `POST /live/znikolovski/masterclass-demo/main${pending.mirror}`, status: 503 };
  assert.match((await call()).error, /HTTP 503/);
  assert.equal((await stored()).pending.phase, 'mirror');
  assert.equal(state.syncs, 0);
  state.failure = null;
  await run();
  await run();
  const ids = await call({ action: 'ids', html: state.documents['/of1/config/knowledge'] });
  assert.equal(ids.result.filter((id) => id === pending.id).length, 1);
});

test('author edits and unexpected catalogue formats fail before overwriting', async (t) => {
  const { run, call, state } = await setup(t);
  await run();
  await run();
  state.changingCatalogue = true;
  assert.match((await call()).error, /HTTP 412/);
  assert.equal(state.documents['/of1/config/knowledge'], `${original}<!-- author edited -->`);
  const bad = original.replace('<main>', '<main><table><tr><td>content</td></tr></table>');
  assert.match((await call({
    action: 'catalogue', html: bad, id: 'a', entity: '',
  })).error, /Unsupported/);
});

test('unpublish requires a complete index and confirmed 404, then removes only managed content', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  for (let i = 0; i < 5; i += 1) await run();
  const entry = (await stored()).pages['/blog/new-adventure'];
  state.rows = state.rows.filter((row) => row.path !== '/blog/new-adventure');
  assert.match((await call()).error, /not a confirmed unpublish/);
  delete state.articles['/blog/new-adventure'];
  assert.equal((await run()).status, 'queued-deletion');
  for (let i = 0; i < 4; i += 1) await run();
  assert(!state.documents['/of1/config/knowledge'].includes(entry.id));
  assert(state.documents['/of1/config/knowledge'].includes('Curated &amp; unchanged'));
  assert.equal((await stored()).pages['/blog/new-adventure'].deleted, true);
  assert.equal(state.syncs, 2);
});

test('updates preserve ID and daily hashes detect changes missed by modification metadata', async (t) => {
  const {
    run, state, stored, db,
  } = await setup(t);
  for (let i = 0; i < 5; i += 1) await run();
  const snapshot = await stored();
  const { id } = snapshot.pages['/blog/new-adventure'];
  snapshot.pages['/blog/new-adventure'].checked = 0;
  await db.prepare('UPDATE ingestion_state SET value = ?1').bind(JSON.stringify(snapshot)).run();
  assert.equal((await run()).status, 'unchanged');
  assert.equal(state.syncs, 1);
  state.articles['/blog/new-adventure'] = article.replace('source-backed', 'updated source-backed');
  state.rows.find((row) => row.path === '/blog/new-adventure').lastModified += 1;
  assert.equal((await run()).status, 'queued');
  assert.equal((await stored()).pending.id, id);
});

test('upstream partial sync errors never mark an article ingested', async (t) => {
  const {
    run, call, state, stored, db,
  } = await setup(t);
  for (let i = 0; i < 4; i += 1) await run();
  state.syncResult.errors = ['embedding failed'];
  assert.match((await call()).error, /did not confirm/);
  assert.equal((await stored()).pending.phase, 'sync');
  assert.deepEqual((await stored()).pages, {});
  assert.match((await db.prepare('SELECT last_error FROM ingestion_state').first()).last_error, /did not confirm/);
  state.syncResult.errors = [];
  await run();
  assert.equal((await db.prepare('SELECT last_error FROM ingestion_state').first()).last_error, null);
});

test('current OF1 content sync contract is accepted but malformed success is not', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  for (let i = 0; i < 4; i += 1) await run();
  state.syncResult.synced = ['config', 'templates', 'content'];
  state.syncResult.content.indexed = '5';
  assert.match((await call()).error, /did not confirm/);
  assert.equal((await stored()).pending.phase, 'sync');
  state.syncResult.content.indexed = 5;
  state.syncResult.ok = false;
  assert.match((await call()).error, /did not confirm/);
  state.syncResult.ok = true;
  assert.equal((await run()).phase, 'complete');
});

test('whole-tenant content sync may outlast the ordinary 15-second source timeout', async (t) => {
  const { run, state } = await setup(t);
  for (let i = 0; i < 4; i += 1) await run();
  state.syncDelay = 16000;
  assert.equal((await run()).phase, 'complete');
});

test('D1 lease serializes simultaneous invocations instead of using an eventually consistent KV lock', async (t) => {
  const { state, run, call } = await setup(t);
  let release;
  state.blockIndex = new Promise((resolve) => { release = resolve; });
  let entered;
  const indexStarted = new Promise((resolve) => { entered = resolve; });
  state.onIndex = entered;
  const first = call();
  try {
    await Promise.race([indexStarted, first.then((response) => {
      throw new Error(response.error || 'First run finished before blocking');
    })]);
    assert.equal((await run()).status, 'busy');
  } finally {
    release();
  }
  assert.equal((await first).ok, true);
});

test('source scope excludes drafts, traversal, config and other site content', async (t) => {
  const { run, state } = await setup(t);
  state.rows = [
    { path: '/blog/alpine-cycling', lastModified: 1 },
    ...['/drafts/blog/new', '/blog/../drafts/new', '/of1/knowledge/new', '/about', '/blog/new.html']
      .map((path) => ({ path, lastModified: 2 })),
  ];
  assert.equal((await run()).status, 'idle');
  assert(state.calls.every((key) => key.startsWith('GET ')));
});

test('index failures cannot remove managed content or advance a pending job', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  await run();
  const before = await stored();
  state.failure = { key: 'GET /query-index.json', status: 503 };
  assert.match((await call()).error, /HTTP 503/);
  assert.deepEqual(await stored(), before);
  assert(state.calls.every((key) => key.startsWith('GET ')));
});

test('visibility delays prevent premature sync and retry without republishing documents', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  await run();
  await run();
  await run();
  const [mirror] = state.rows.splice(state.rows.findIndex((row) => row.path.startsWith('/of1/knowledge/')), 1);
  assert.match(mirror.path, /^\/of1\/knowledge\/auto-blog-/);
  state.calls = [];
  assert.match((await call()).error, /Waiting for the published mirror index/);
  assert.equal((await stored()).pending.phase, 'visibility');
  assert.equal(state.syncs, 0);
  assert(state.calls.every((key) => key.startsWith('GET ')));
  state.rows.push(mirror);
  assert.equal((await run()).phase, 'sync');
});

test('withdrawal and republication during a pending job restart the correct phase', async (t) => {
  const {
    run, state, stored,
  } = await setup(t);
  await run();
  state.rows = state.rows.filter((row) => row.path !== '/blog/new-adventure');
  delete state.articles['/blog/new-adventure'];
  assert.equal((await run()).status, 'withdrawal-pending');
  assert.equal((await stored()).pending.operation, 'delete');
  state.rows.push({ path: '/blog/new-adventure', lastModified: 5 });
  state.articles['/blog/new-adventure'] = article;
  assert.equal((await run()).status, 'republication-pending');
  assert.equal((await stored()).pending.operation, 'upsert');
});

test('unchanged IDs and HTTP 200 cannot mask stale delivered catalogue or mirror content', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  await run();
  await run();
  await run();
  const { pending } = await stored();
  state.delivery['/of1/config/knowledge'] = state.documents['/of1/config/knowledge'].replace('source-backed', 'stale');
  assert.match((await call()).error, /updated catalogue contents/);
  delete state.delivery['/of1/config/knowledge'];
  state.delivery[pending.mirror] = state.documents[pending.mirror].replace('source-backed', 'stale');
  assert.match((await call()).error, /updated mirror contents/);
  assert.equal(state.syncs, 0);
  delete state.delivery[pending.mirror];
  assert.equal((await run()).phase, 'sync');
});

test('oversized upstream documents are rejected before extraction or catalogue mutation', async (t) => {
  const { call } = await setup(t);
  const result = await call({
    action: 'extract', html: `<h1>Big</h1><p>${'a'.repeat(1024 * 1024)}</p>`, url: 'https://example.com/blog/big',
  });
  assert.match(result.error, /size limit/);
});

test('unattended IMS credentials are minted only for active jobs and auth failure retains the checkpoint', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  const vars = {
    DA_TOKEN: '', IMS_CLIENT_ID: 'fixture-client', IMS_CLIENT_SECRET: 'fixture-secret', IMS_SCOPES: 'fixture-scope',
  };
  assert.equal((await run(vars)).status, 'queued');
  assert(!state.calls.some((key) => key.includes('/ims/token')));
  assert.equal((await run(vars)).phase, 'catalogue');
  assert.equal(state.calls.filter((key) => key.includes('/ims/token')).length, 1);
  state.failure = { key: 'POST /ims/token/v3', status: 401 };
  assert.match((await call({ vars })).error, /HTTP 401/);
  assert.equal((await stored()).pending.phase, 'catalogue');
  assert.equal(state.syncs, 0);
});

test('missing catalogue ETag uses a server-verified body digest and still writes conditionally', async (t) => {
  const { run, state } = await setup(t);
  await run();
  await run();
  state.omitEtag = true;
  assert.equal((await run()).phase, 'visibility');
  assert(state.documents['/of1/config/knowledge'].includes('Curated &amp; unchanged'));
});

test('a body digest rejected by DA cannot degrade into an unconditional write', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  await run();
  await run();
  state.omitEtag = true;
  state.rejectComputedEtag = true;
  assert.match((await call()).error, /HTTP 412/);
  assert.equal((await stored()).pending.phase, 'catalogue');
  assert.equal(state.documents['/of1/config/knowledge'], original);
});

test('author edits after a verified body digest still reject the atomic catalogue PUT', async (t) => {
  const {
    run, call, state, stored,
  } = await setup(t);
  await run();
  await run();
  state.omitEtag = true;
  state.changingCatalogue = true;
  assert.match((await call()).error, /HTTP 412/);
  assert.equal((await stored()).pending.phase, 'catalogue');
  assert.equal(state.documents['/of1/config/knowledge'], `${original}<!-- author edited -->`);
});

test('published WKND inventory and every existing article satisfy the native extraction contract', {
  skip: !process.env.OF1_LIVE_TEST,
}, async (t) => {
  const { state, run, call } = await setup(t);
  const live = 'https://main--masterclass-demo--znikolovski.aem.live';
  const indexResponse = await fetch(`${live}/query-index.json?limit=500&offset=0`);
  assert.equal(indexResponse.status, 200);
  const index = await indexResponse.json();
  assert.equal(index.total, index.data.length, 'Live fixture download must not be truncated');
  const catalogueResponse = await fetch(`${live}/of1/config/knowledge.plain.html`);
  assert.equal(catalogueResponse.status, 200);
  state.rows = index.data;
  state.documents['/of1/config/knowledge'] = await catalogueResponse.text();
  const observed = await run({ MODE: 'observe', DA_TOKEN: '' });
  assert(observed.publishedAdventures >= 15);
  assert.deepEqual(observed.candidates, [], 'Existing curated source articles must not be duplicated');
  for (const row of index.data.filter((entry) => entry.path.startsWith('/blog/'))) {
    const response = await fetch(`${live}${row.path}.plain.html`);
    assert.equal(response.status, 200);
    const extracted = await call({
      action: 'extract', html: await response.text(), url: `${live}${row.path}`,
    });
    assert.equal(extracted.ok, true, `${row.path}: ${extracted.error}`);
    assert(extracted.result.images.length, `${row.path}: original article images retained`);
    t.diagnostic(`${row.path}: ${extracted.result.blocks.length} text blocks, ${extracted.result.images.length} images`);
  }
  assert(state.calls.every((key) => key.startsWith('GET ')));
});
