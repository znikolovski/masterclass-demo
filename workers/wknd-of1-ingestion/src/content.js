import { decodeHTML } from 'entities';

const MAX_BYTES = 1024 * 1024;
const text = (value) => decodeHTML(value).replace(/\s+/g, ' ').trim();
export const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export async function boundedText(response, maxBytes = MAX_BYTES) {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error('Response exceeds ingestion size limit');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Response exceeds ingestion size limit');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function digest(value, algorithm = 'SHA-256') {
  const bytes = await crypto.subtle.digest(algorithm, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function imageIdentity(value) {
  const url = new URL(decodeHTML(value), 'https://relative.invalid/');
  return url.pathname.match(/\/media_([a-f0-9]+)\./)?.[1] || url.href;
}

export async function articleFingerprint(article) {
  return digest(JSON.stringify([
    article.title, article.blocks.map((block) => block.text),
    article.images.map((image) => imageIdentity(image.src)),
  ]));
}

function safeUrl(value, base) {
  try {
    const url = new URL(decodeHTML(value), base);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export async function extractArticle(html, url) {
  const blocks = [];
  const images = [];
  const links = [];
  let active = null;
  let ignored = 0;
  const rewriter = new HTMLRewriter()
    .on('script, style, nav, header, footer, .metadata, .section-metadata, .tabs-activity, .cards, .cards-adventure, .newsletter, .form, .fragment', {
      element(element) {
        ignored += 1;
        element.onEndTag(() => { ignored -= 1; });
      },
    })
    .on('h1, h2, h3, h4, p, li, blockquote', {
      element(element) {
        if (ignored || active) return;
        const block = { tag: element.tagName, text: '' };
        active = block;
        blocks.push(block);
        element.onEndTag(() => { active = null; });
      },
    })
    .on('img', {
      element(element) {
        if (ignored) return;
        const raw = element.getAttribute('src');
        const src = raw ? safeUrl(raw, url) : null;
        if (src && !images.some((image) => image.src === src)) {
          images.push({ src, alt: text(element.getAttribute('alt') || '') });
        }
      },
    })
    .on('a[href]', {
      element(element) {
        if (ignored) return;
        const href = safeUrl(element.getAttribute('href'), url);
        if (href && !links.includes(href)) links.push(href);
      },
    })
    .onDocument({
      text(chunk) { if (active && !ignored) active.text += chunk.text; },
    });
  await boundedText(rewriter.transform(new Response(html)));
  const cleaned = blocks.map((block) => ({ ...block, text: text(block.text) }))
    .filter((block) => block.text);
  const title = cleaned.find((block) => block.tag === 'h1')?.text;
  const paragraphs = cleaned.filter((block) => block.tag === 'p' || block.tag === 'li');
  if (!title || !paragraphs.length) throw new Error('Published article needs a heading and body text');
  if (cleaned.length > 600 || images.length > 60 || links.length > 200) {
    throw new Error('Published article exceeds extraction limits');
  }
  return {
    title, blocks: cleaned, images, links, url,
  };
}

export function renderMirror(article) {
  const body = article.blocks.map((block) => {
    const tag = block.tag === 'li' ? 'p' : block.tag;
    return `<${tag}>${escape(block.text)}</${tag}>`;
  }).join('\n');
  const images = article.images.map((image) => (
    `<p><picture><img src="${escape(image.src)}" alt="${escape(image.alt)}"></picture></p>`
  )).join('\n');
  const sources = [...new Set([article.url, ...article.links])]
    .map((url) => `<p><a href="${escape(url)}">${escape(url)}</a></p>`).join('\n');
  return `<body><header></header><main><div>${body}\n${images}\n<h2>Sources</h2>${sources}</div></main><footer></footer></body>`;
}

export function renderEntity(article, id) {
  const row = (key, value) => `<div><div>${key}</div><div>${value}</div></div>`;
  const paragraphs = article.blocks.filter((block) => ['p', 'li'].includes(block.tag));
  const list = (values) => `<ul>${values.map((value) => `<li>${escape(value)}</li>`).join('')}</ul>`;
  const keywords = [...new Set(article.title.toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu) || [])];
  return `<div class="of1-config">${
    row('id', escape(id))
    + row('title', escape(article.title))
    + row('type', 'product')
    + row('url', escape(article.url))
    + row('description', escape(paragraphs[0].text))
    + row('keywords', list(keywords))
    + row('facts', list([...paragraphs.slice(0, 8).map((block) => block.text), `Source: ${article.url}`]))
    + row('images', article.images.slice(0, 4).map((image) => (
      `<p><picture><img src="${escape(image.src)}" alt="${escape(image.alt)}"></picture></p>`
    )).join(''))
  }</div>`;
}

async function readCatalogue(html) {
  const records = [];
  let block = null;
  let key = '';
  let value = '';
  let blocks = 0;
  let tables = 0;
  const rewriter = new HTMLRewriter()
    .on('table', { element() { tables += 1; } })
    .on('.of1-config', {
      element(element) {
        blocks += 1;
        block = { id: '', fields: {}, images: [] };
        element.onEndTag(() => { records.push(block); block = null; });
      },
    })
    .on('.of1-config > div > div:first-child', {
      element() { key = ''; },
      text(chunk) { key += chunk.text; },
    })
    .on('.of1-config > div > div:nth-child(2)', {
      element(element) {
        value = '';
        element.onEndTag(() => {
          if (!block) return;
          const name = text(key);
          block.fields[name] = value;
          if (name === 'id') block.id = text(value);
        });
      },
      text(chunk) { value += chunk.text; },
    })
    .on('.of1-config > div > div:nth-child(2) li, .of1-config > div > div:nth-child(2) p', {
      element() { value += ' '; },
    })
    .on('.of1-config img[src]', {
      element(element) { if (block) block.images.push(element.getAttribute('src')); },
    });
  await boundedText(rewriter.transform(new Response(html)));
  const ids = records.map((record) => record.id);
  if (!blocks || tables || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error('Unsupported or ambiguous DA catalogue; refusing to rewrite curated content');
  }
  return records;
}

export async function catalogueIds(html) {
  return (await readCatalogue(html)).map((record) => record.id);
}

export async function catalogueFingerprint(html, id) {
  const record = (await readCatalogue(html)).find((entry) => entry.id === id);
  if (!record) return null;
  const fields = Object.entries(record.fields).filter(([key]) => key !== 'images')
    .map(([key, value]) => [key, text(value)]).sort(([left], [right]) => left.localeCompare(right));
  return digest(JSON.stringify([fields, record.images.map(imageIdentity)]));
}

export async function updateCatalogue(html, id, entity) {
  const ids = await catalogueIds(html);
  const target = ids.indexOf(id);
  let position = 0;
  let mainCount = 0;
  const rewriter = new HTMLRewriter()
    .on('main', {
      element(element) {
        mainCount += 1;
        if (entity) element.append(`<div>${entity}</div>`, { html: true });
      },
    })
    .on('.of1-config', {
      element(element) {
        if (position === target) element.remove();
        position += 1;
      },
    });
  const result = await boundedText(rewriter.transform(new Response(html)));
  if (mainCount !== 1) throw new Error('DA source must contain exactly one main element');
  return result;
}
