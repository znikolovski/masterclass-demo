import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateBlock,
  getMetadata,
  waitForFirstImage,
  loadBlock,
  loadCSS,
  readBlockConfig,
  toClassName,
  toCamelCase,
} from './aem.js';
import { initAssetAnalytics } from './asset-analytics.js';
import { pushAnalyticsPageContext, pushErrorPageContext } from './analytics-page.js';
import {
  getTargetZones,
  hoistTargetLocationToSection,
  initTargetDelivery,
  markTargetZone,
  refreshTargetZones,
  getTargetDecisionScopes,
  buildTargetApplyMetadata,
  finalizeTargetZonesAfterApply,
  revealTargetZones,
  shouldRequestNamedTargetScopes,
} from './target-delivery.js';
import { initTargetAnalytics, pushTargetPageContext } from './target-analytics.js';
import { optimizePictures, buildHeroAdventureLcpUrls, enrichHeroPictureAfterLcp } from './media.js';
import {
  WEB_SDK_CONFIG,
  isMartechConfigured,
  getLaunchUrls,
} from './martech-config.js';
import addMarkdownAlternateLink from './markdown-alternate.js';

/** Instrument Sans (body) + Syncopate (headings); Syncopate woff2 preloaded in head.html */
const GOOGLE_FONTS_STYLESHEET = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Syncopate:wght@700&display=swap';

const HERO_HEADING_FONT = 'Syncopate';

const HERO_BLOCK_SELECTOR = '.hero-adventure, .carousel-hero, .hero';

/** Blocks that must load before revealing the first section (LCP). */
const EAGER_FIRST_BLOCK_NAMES = new Set(['hero-adventure', 'carousel-hero', 'hero']);

/** Section layout shells from inline fragments — not blocks (no blocks/{name}/ CSS). */
const LAYOUT_CLASS_NAMES = new Set([
  'section',
  'narrow',
  'inverse',
  'secondary',
  'accent',
  'block',
  'default-content-wrapper',
  'target',
  'section-metadata',
  'richtext',
]);

/**
 * @param {string} [name]
 * @returns {boolean}
 */
function isLayoutClassName(name) {
  return !name
    || LAYOUT_CLASS_NAMES.has(name)
    || name.endsWith('-wrapper')
    || name.endsWith('-container')
    || name.endsWith('-track');
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function isBlockRootCandidate(el) {
  if (el.tagName !== 'DIV') return false;
  if (el.classList.contains('block')) return false;
  const name = el.classList[0];
  if (!name || isLayoutClassName(name)) return false;
  return el.children.length > 0
    && [...el.children].every((child) => child.tagName === 'DIV');
}

/**
 * Find innermost block roots inside a section (handles server-inlined fragments in layout shells).
 * @param {Element} section
 * @returns {Element[]}
 */
function collectSectionBlocks(section) {
  const candidates = [...section.querySelectorAll(':scope div[class]')].filter(isBlockRootCandidate);
  return candidates.filter(
    (el) => !candidates.some((other) => other !== el && el.contains(other)),
  );
}

/**
 * Decorate real blocks only — skip section style shells (e.g. narrow) from inlined fragments.
 * @param {Element} main
 */
function decoratePageBlocks(main) {
  main.querySelectorAll('div.section').forEach((section) => {
    collectSectionBlocks(section).forEach(decorateBlock);
  });
}

/**
 * Eager-load hero block CSS so above-fold layout is stable before block decoration.
 * @param {Element} main
 */
async function loadHeroBlockCss(main) {
  const codeBase = window.hlx.codeBasePath;
  if (main.querySelector('.hero-adventure, .carousel-hero')) {
    const href = `${codeBase}/blocks/hero-adventure/hero-adventure.css`;
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"], link[rel="stylesheet"][href="/blocks/hero-adventure/hero-adventure.css"]`)) {
      return;
    }
    await loadCSS(href);
  } else if (main.querySelector('.hero')) {
    await loadCSS(`${codeBase}/blocks/hero/hero.css`);
  }
}

/**
 * @param {string} href
 * @returns {boolean}
 */
function hasImagePreload(href) {
  return [...document.querySelectorAll('link[rel="preload"][as="image"]')]
    .some((link) => link.href === href);
}

/**
 * Preload LCP candidate from og:image before module JS runs (aligned with hero-adventure URLs).
 * @param {Document} doc
 */
function preloadOgImage(doc = document) {
  const og = getMetadata('og:image', doc);
  if (!og) return;
  try {
    const { preloadHref } = buildHeroAdventureLcpUrls(
      og,
      doc.baseURI || window.location.href,
    );
    if (hasImagePreload(preloadHref)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = preloadHref;
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
  } catch {
    // ignore invalid og:image
  }
}

/**
 * Start hero image fetch immediately — delivery HTML injects loading="lazy" on images.
 * @param {ParentNode} root
 */
function primeLcpImage(root) {
  const img = root.querySelector(`${HERO_BLOCK_SELECTOR} picture img, .section:first-of-type picture img`);
  if (!img || img.dataset.lcpPrimed) return;
  const picture = img.closest('picture');
  picture?.querySelectorAll('source').forEach((source) => source.remove());
  try {
    const { preloadHref, heroBaseSrc } = buildHeroAdventureLcpUrls(img.src);
    img.dataset.lcpPrimed = 'true';
    img.dataset.mediaOptimized = 'true';
    img.dataset.heroBaseSrc = heroBaseSrc;
    img.setAttribute('loading', 'eager');
    img.setAttribute('fetchpriority', 'high');
    img.setAttribute('sizes', '100vw');
    img.src = preloadHref;
  } catch {
    img.dataset.lcpPrimed = 'true';
    img.setAttribute('loading', 'eager');
    img.setAttribute('fetchpriority', 'high');
  }
}

/**
 * Preload the LCP hero image so the browser starts fetch before first paint.
 * @param {Element} section
 */
function preloadLcpHeroImage(section) {
  const img = section.querySelector(`${HERO_BLOCK_SELECTOR} picture img, picture img`);
  if (!img?.src) return;
  try {
    const { preloadHref } = buildHeroAdventureLcpUrls(img.src);
    if (hasImagePreload(preloadHref)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = preloadHref;
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
  } catch {
    const href = img.currentSrc || img.getAttribute('src');
    if (!href || hasImagePreload(href)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    const srcset = img.getAttribute('srcset');
    if (srcset) link.setAttribute('imagesrcset', srcset);
    const sizes = img.getAttribute('sizes');
    if (sizes) link.setAttribute('imagesizes', sizes);
    document.head.appendChild(link);
  }
}

/**
 * Hide hero H1 until Syncopate is active to prevent font-swap layout shift.
 * @param {Element} section
 */
async function waitForHeroHeadingFont(section) {
  const h1 = section.querySelector('.hero-adventure h1, .hero h1');
  if (!h1) return;

  h1.classList.add('hero-heading-pending');
  try {
    const size = window.getComputedStyle(h1).fontSize || '56px';
    await Promise.race([
      document.fonts.load(`700 ${size} ${HERO_HEADING_FONT}`),
      new Promise((resolve) => { setTimeout(resolve, 2000); }),
    ]);
  } finally {
    h1.classList.remove('hero-heading-pending');
    h1.classList.add('hero-heading-ready');
  }
}

/**
 * Upgrade hero to full responsive quality after LCP (does not replace the painted img).
 * @param {Element} section
 */
function scheduleHeroDisplayUpgrade(section) {
  const img = section.querySelector(`${HERO_BLOCK_SELECTOR} picture img`);
  if (!img || img.dataset.heroDisplayUpgraded === 'true') return;

  const run = () => enrichHeroPictureAfterLcp(img);

  const schedule = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 5000 });
    } else {
      setTimeout(run, 3000);
    }
  };

  if (document.readyState === 'complete') {
    setTimeout(schedule, 1500);
    return;
  }

  window.addEventListener('load', () => setTimeout(schedule, 1500), { once: true });
}

/** @type {Promise<typeof import('../plugins/martech/src/index.js')>|null} */
let martechModulePromise = null;

/** @returns {Promise<typeof import('../plugins/martech/src/index.js')>} */
function getMartechModule() {
  if (!martechModulePromise) {
    /* eslint-disable import/no-relative-packages -- aem-martech git subtree */
    martechModulePromise = import('../plugins/martech/src/index.js');
    /* eslint-enable import/no-relative-packages */
  }
  return martechModulePromise;
}

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    // Check if h1 or picture is already inside a hero block
    if (h1.closest('[class*="hero"]') || picture.closest('[class*="hero"]')) {
      return;
    }
    if (main.querySelector('.hero-adventure')) {
      return;
    }
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  loadCSS(GOOGLE_FONTS_STYLESHEET);
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Warm-cache a stylesheet without blocking first paint (promoted in loadLazy).
 * @param {string} href Stylesheet URL
 */
function prefetchStylesheet(href) {
  if (document.querySelector(`head > link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'style';
  link.href = href;
  document.head.append(link);
}

/**
 * Promote a preload link to an applied stylesheet, or insert a new one.
 * loadCSS in aem.js skips insertion when *any* same-href link exists (including preload).
 * @param {string} href Stylesheet URL
 * @returns {HTMLLinkElement|null}
 */
function attachStylesheetLink(href) {
  let link = document.querySelector(`head > link[rel="stylesheet"][href="${href}"]`);
  if (link) return link;

  const preload = document.querySelector(`head > link[rel="preload"][href="${href}"]`);
  if (preload) {
    preload.rel = 'stylesheet';
    preload.removeAttribute('as');
    return preload;
  }

  link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
  return link;
}

/**
 * Load a stylesheet and wait until it is applied (handles preload + in-flight link tags).
 * @param {string} href Stylesheet URL
 * @returns {Promise<void>}
 */
async function ensureStylesheet(href) {
  let link = attachStylesheetLink(href);
  if (link.sheet) return;
  await Promise.race([
    new Promise((resolve, reject) => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', reject, { once: true });
    }),
    new Promise((resolve) => { setTimeout(resolve, 4000); }),
  ]).catch(() => {});
  if (!link.sheet) {
    link = attachStylesheetLink(href);
  }
}

/**
 * @param {string} blockName
 * @returns {string}
 */
function getBlockStylesheetHref(blockName) {
  return `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`;
}

/**
 * @param {Element} root
 * @returns {boolean}
 */
function hasPrimedLcpHero(root) {
  return Boolean(root?.querySelector(
    `${HERO_BLOCK_SELECTOR} picture img[data-lcp-primed="true"]`,
  ));
}

/**
 * @param {Element} block
 * @returns {boolean}
 */
function isFragmentBlock(block) {
  const name = block.dataset.blockName || block.classList[0] || '';
  return name === 'fragment';
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    const lcpSection = main.querySelector(HERO_BLOCK_SELECTOR)
      ? [...main.children].find((child) => child.tagName === 'DIV' && child.querySelector(HERO_BLOCK_SELECTOR))
      : null;
    // auto load `*/fragments/*` references (skip homepage LCP section — loaded in lazy phase)
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')]
      .filter((f) => !f.closest('.fragment'))
      .filter((f) => !lcpSection?.contains(f));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment, resolveFragmentPath }) => {
        fragments.forEach(async (fragment) => {
          const wrapper = fragment.closest('.fragment') || fragment.parentElement;
          try {
            if (wrapper) wrapper.classList.add('fragment-loading');
            const path = resolveFragmentPath(fragment.getAttribute('href') || fragment.href);
            const frag = path ? await loadFragment(path) : null;
            if (frag) fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          } finally {
            if (wrapper) wrapper.classList.remove('fragment-loading');
          }
        });
      });
    }

    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

function decorateButtonGroups(main) {
  main.querySelectorAll('.default-content-wrapper > p').forEach((p) => {
    const links = p.querySelectorAll(':scope > a[href]');
    if (links.length === 0) return;
    const textContent = p.textContent.trim();
    const linkText = Array.from(links).map((a) => a.textContent.trim()).join(' ');
    if (textContent !== linkText) return;

    if (links.length >= 2) {
      const div = document.createElement('div');
      div.className = 'button-group';
      links.forEach((a, i) => {
        if (i === 0) a.classList.add('button');
        else a.classList.add('button-ghost');
        div.append(a);
      });
      p.replaceWith(div);
    } else if (links.length === 1 && p === p.parentElement.lastElementChild) {
      links[0].classList.add('button');
    }
  });
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) {
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Push ctaClick ACDL events for decorated buttons (Launch ACDL rule → event1).
 * @param {HTMLElement} main
 */
function bindCtaAnalytics(main) {
  if (!main || main.dataset.ctaAnalyticsBound === 'true') return;
  main.dataset.ctaAnalyticsBound = 'true';
  main.addEventListener('click', (event) => {
    const link = event.target.closest(
      'a.button, a.button-ghost, a.button.primary, a.button.secondary, .button-container a, .hero-adventure a, .quiz-results-cta a',
    );
    if (!link || !main.contains(link)) return;
    import('./analytics-acdl.js').then((mod) => {
      mod.pushInteractionEvent('ctaClick', {
        label: (link.textContent || '').trim(),
        block: link.closest('[class*="block"]')?.classList?.item(0) || 'cta',
        detail: link.getAttribute('href') || '',
      });
    }).catch(() => {});
  });
}

/**
 * Decorates all sections in a container element.
 * Overrides aem.js version to support UE richtext class handling.
 * @param {Element} main The container element
 */
function isEmptySection(section) {
  const text = section.textContent.trim();
  const hasMedia = section.querySelector('img, picture, video, svg, iframe');
  return !text && !hasMedia;
}

function applySectionMetadata(section, sectionMeta) {
  const meta = readBlockConfig(sectionMeta);
  Object.keys(meta).forEach((key) => {
    if (key === 'style') {
      const styles = meta.style
        .split(',')
        .filter((style) => style)
        .map((style) => toClassName(style.trim()));
      styles.forEach((style) => section.classList.add(style));
    } else {
      section.dataset[toCamelCase(key)] = meta[key];
    }
  });
  if (meta.targetlocation || meta['target-location']) {
    markTargetZone(section);
  }
  const wrapper = sectionMeta.closest('.section-metadata-wrapper') || sectionMeta.parentElement;
  if (wrapper && wrapper !== section) wrapper.remove();
  else sectionMeta.remove();
}

function decorateSections(main) {
  const sections = [...main.querySelectorAll(':scope > div')];
  sections.forEach((section, index) => {
    if (isEmptySection(section)) {
      section.remove();
      return;
    }

    const wrappers = [];
    let defaultContent = false;
    [...section.children].forEach((e) => {
      if (e.classList.contains('richtext')) {
        e.removeAttribute('class');
        if (!defaultContent) {
          const wrapper = document.createElement('div');
          wrapper.classList.add('default-content-wrapper');
          wrappers.push(wrapper);
          defaultContent = true;
        }
      } else if (e.tagName === 'DIV' || !defaultContent) {
        const wrapper = document.createElement('div');
        wrappers.push(wrapper);
        defaultContent = e.tagName !== 'DIV';
        if (defaultContent) wrapper.classList.add('default-content-wrapper');
      }
      wrappers[wrappers.length - 1].append(e);
    });
    wrappers.forEach((wrapper) => section.append(wrapper));
    section.classList.add('section');
    section.dataset.sectionStatus = 'initialized';
    if (section.querySelector(HERO_BLOCK_SELECTOR)) {
      section.classList.add('hero-adventure-container');
    }
    const primedHero = hasPrimedLcpHero(section);
    const lcpHero = primedHero || Boolean(section.querySelector(HERO_BLOCK_SELECTOR));
    const isFirstSection = index === 0;
    if (lcpHero || isFirstSection) {
      section.classList.add('lcp-section');
      section.style.display = null;
    } else {
      section.style.display = 'none';
    }

    section.querySelectorAll('div.section-metadata').forEach((sectionMeta) => {
      applySectionMetadata(section, sectionMeta);
    });
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decoratePageBlocks(main);
  hoistTargetLocationToSection(main);
  decorateButtonGroups(main);
  getTargetZones(main).forEach(markTargetZone);
}

/**
 * Reads page metadata from head or the in-document metadata block (library/git previews).
 * @param {string} name Metadata key
 * @param {Document} doc Document to search
 * @returns {string}
 */
function getPageMetadataValue(name, doc = document) {
  const fromHead = getMetadata(name, doc);
  if (fromHead) return fromHead;
  const block = doc.querySelector('main .metadata');
  if (!block) return '';
  const row = [...block.children].find((child) => {
    const cells = child.querySelectorAll(':scope > div');
    return cells.length >= 2
      && cells[0].textContent.trim().toLowerCase() === name.toLowerCase();
  });
  if (!row) return '';
  const cells = row.querySelectorAll(':scope > div');
  return cells[1]?.textContent.trim() || '';
}

/** Repoless sites with token overrides in styles/brands/{site}.css */
const SITE_BRAND_OVERRIDES = new Set(['wknd-business']);

/**
 * Site slug from AEM preview/live hostname ({branch}--{site}--{org}.aem.page|.aem.live|.aem.network).
 * @param {Document} [doc]
 * @returns {string}
 */
function getRepolessSiteSlug(doc = document) {
  const override = new URLSearchParams(window.location.search).get('site');
  if (override) return toClassName(override) || override;

  const brandMeta = getPageMetadataValue('brand', doc);
  if (brandMeta) return toClassName(brandMeta) || brandMeta;

  const { hostname } = window.location;
  if (hostname.endsWith('.aem.page') || hostname.endsWith('.aem.live') || hostname.endsWith('.aem.network')) {
    const parts = hostname.replace(/\.aem\.(page|live|network)$/, '').split('--');
    if (parts.length >= 3) return parts[parts.length - 2];
  }
  return 'masterclass-demo';
}

/**
 * Load repoless site brand overrides before first paint (token overrides only).
 * @param {string} site
 */
async function loadSiteBrandCss(site) {
  if (!SITE_BRAND_OVERRIDES.has(site)) return;
  const href = `${window.hlx.codeBasePath}/styles/brands/${site}.css`;
  try {
    await loadCSS(href);
  } catch {
    // optional per-site brand file
  }
}

/**
 * Applies template/theme body classes from head meta or metadata block.
 * @param {Document} doc Document to read metadata from
 */
function applyTemplateAndTheme(doc = document) {
  const addClasses = (element, classes) => {
    classes.split(',').forEach((c) => {
      const cls = toClassName(c.trim());
      if (cls) element.classList.add(cls);
    });
  };
  const template = getPageMetadataValue('template', doc);
  if (template) addClasses(document.body, template);
  const theme = getPageMetadataValue('theme', doc);
  if (theme) addClasses(document.body, theme);
}

/**
 * @param {Document} doc Document
 * @returns {boolean}
 */
function isBlogArticlePage(doc = document) {
  const template = getPageMetadataValue('template', doc);
  return document.body.classList.contains('blog-article')
    || template === 'blog-article'
    || window.location.pathname.includes('/blog/')
    || window.location.pathname.includes('/templates/blog-article/');
}

/**
 * Git-hosted block/template shells used by the EW Sidekick library iframe.
 * @param {Document} doc
 * @returns {boolean}
 */
function isLibraryPreviewShell(doc = document) {
  return (doc.body.classList.contains('library-preview')
    || doc.body.classList.contains('sidekick-library'))
    && window.location.pathname.endsWith('.html');
}

/**
 * DA library block documents served from the content bus at /blocks/{name}/{name}.
 * @returns {string|null} block name
 */
function getLibraryBlockDocument() {
  const match = window.location.pathname.match(/^\/blocks\/([^/]+)\/([^/]+)\/?$/);
  if (!match || match[1] !== match[2]) return null;
  return match[1];
}

/**
 * @param {Document} doc
 * @returns {boolean}
 */
function isLibraryPreview(doc = document) {
  return isLibraryPreviewShell(doc) || Boolean(getLibraryBlockDocument());
}

/**
 * EW block library previews on the content bus need library CSS even before decorate().
 * @param {Document} doc
 */
async function bootstrapLibraryBlockDocument(doc) {
  const blockName = getLibraryBlockDocument();
  if (!blockName) return;
  const base = window.hlx?.codeBasePath || '';
  doc.body.classList.add('library-preview', 'sidekick-library', 'appear');
  doc.querySelector('header')?.remove();
  doc.querySelector('footer')?.remove();
  await Promise.all([
    loadCSS(`${base}/styles/library-preview.css`),
    loadCSS(`${base}/styles/library-sidekick-blocks.css`),
    loadCSS(`${base}/styles/lazy-styles.css`),
    loadCSS(`${base}/blocks/${blockName}/${blockName}.css`),
  ]);
  doc.querySelector('main')?.querySelector(`.${blockName}`)?.classList.add('sidekick-library');
}

/** Page metadata keys that opt in to Adobe Target (DA publishes `adobetarget` in head). */
const TARGET_METADATA_KEYS = ['target', 'adobetarget', 'adobe-target'];

/**
 * @param {string} name Metadata key
 * @param {Document} doc Document
 * @returns {boolean}
 */
function isPageMetadataOn(name, doc = document) {
  const value = getPageMetadataValue(name, doc).toLowerCase();
  return value === 'on' || value === 'true' || value === 'yes';
}

/**
 * @param {Document} doc Document
 * @returns {boolean}
 */
function isAnalyticsEnabled(doc = document) {
  const value = getPageMetadataValue('analytics', doc).toLowerCase();
  if (value === 'off' || value === 'false' || value === 'no') return false;
  return true;
}

/**
 * Phase 1 consent stub; wire CMP and updateUserConsent() for production.
 * @returns {boolean}
 */
function isConsentGiven() {
  const { hostname } = window.location;
  return hostname === 'localhost'
    || hostname === 'localhost.local'
    || hostname.endsWith('.page')
    || hostname.endsWith('.live')
    || hostname.endsWith('.network');
}

/**
 * @param {Document} doc Document
 * @returns {boolean}
 */
function isPersonalizationEnabled(doc = document) {
  const enabled = TARGET_METADATA_KEYS.some((key) => isPageMetadataOn(key, doc));
  return enabled && isConsentGiven();
}

/** @type {Promise<void>|null} */
let martechLoadedPromise = null;

/**
 * @param {Document} doc Document
 * @returns {Promise<void>|null}
 */
async function loadMartech(doc = document) {
  if (!isMartechConfigured()) return null;
  if (!martechLoadedPromise) {
    const main = doc.querySelector('main');
    martechLoadedPromise = getMartechModule().then((martech) => martech.initMartech(
      WEB_SDK_CONFIG,
      {
        personalization: isPersonalizationEnabled(doc),
        analytics: isAnalyticsEnabled(doc),
        trackPageView: isAnalyticsEnabled(doc),
        launchUrls: getLaunchUrls(),
        decisionScopes: getTargetDecisionScopes(main, doc),
        propositionMetadata: buildTargetApplyMetadata(main, doc),
      },
    ).then(() => {
      if (!isConsentGiven()) return undefined;
      return martech.updateUserConsent({
        collect: true,
        personalize: isPersonalizationEnabled(doc),
        marketing: true,
        share: true,
      });
    }));
  }
  return martechLoadedPromise;
}

/**
 * @param {Element} block
 * @returns {boolean}
 */
function isEagerFirstBlock(block) {
  const name = block.dataset.blockName || block.classList[0] || '';
  return EAGER_FIRST_BLOCK_NAMES.has(name);
}

/**
 * @param {Element} section
 * @returns {Promise<void>}
 */
async function finishFirstSectionPaint(section) {
  const lcpImg = section.querySelector(`${HERO_BLOCK_SELECTOR} picture img[data-lcp-primed="true"]`);
  if (!lcpImg) {
    optimizePictures(section, {
      eagerSelector: HERO_BLOCK_SELECTOR,
      eagerAll: true,
    });
    primeLcpImage(section);
  }
  if (!document.body.classList.contains('quick-edit')) {
    if (!lcpImg) {
      await waitForFirstImage(section);
    }
    waitForHeroHeadingFont(section);
    scheduleHeroDisplayUpgrade(section);
  }
}

/**
 * Defer hero block JS decoration when head.html already primed the LCP image.
 * @param {Element} section
 */
function schedulePrimedHeroBlockLoad(section) {
  const heroBlock = section.querySelector(`${HERO_BLOCK_SELECTOR}.block`);
  if (!heroBlock || heroBlock.dataset.blockStatus === 'loaded') return;

  const run = () => loadBlock(heroBlock).catch(() => {});
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 2000);
  }
}

/**
 * Load hero/LCP blocks first, reveal the section, then finish other blocks in the background.
 * @param {Element} section
 * @returns {Promise<void>}
 */
async function loadEagerFirstSection(section) {
  const status = section.dataset.sectionStatus;
  if (!status || status === 'loaded') return;

  section.dataset.sectionStatus = 'loading';
  const blocks = [...section.querySelectorAll('div.block')];
  const eagerBlocks = blocks.filter(isEagerFirstBlock);
  const deferredBlocks = blocks.filter((block) => !isEagerFirstBlock(block));
  const primedHero = section.querySelector(
    `${HERO_BLOCK_SELECTOR} picture img[data-lcp-primed="true"]`,
  );
  const lcpHero = primedHero || section.classList.contains('lcp-section');
  const postLcpBlocks = lcpHero
    ? deferredBlocks.filter((block) => !isFragmentBlock(block))
    : deferredBlocks;

  if (lcpHero) {
    if (!primedHero) {
      primeLcpImage(section);
    }
    section.style.display = null;
    section.dataset.sectionStatus = 'loaded';
    finishFirstSectionPaint(section).catch(() => {});
    schedulePrimedHeroBlockLoad(section);
    if (postLcpBlocks.length) {
      Promise.all(postLcpBlocks.map((block) => loadBlock(block))).catch(() => {});
    }
    return;
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const block of eagerBlocks) {
    // eslint-disable-next-line no-await-in-loop
    await loadBlock(block);
  }

  await finishFirstSectionPaint(section);
  section.dataset.sectionStatus = 'loaded';
  section.style.display = null;

  if (deferredBlocks.length) {
    Promise.all(deferredBlocks.map((block) => loadBlock(block))).catch(() => {});
  }
}

/**
 * Target personalization on the eager path — preview/live only, never blocks LCP.
 * @param {Element} main
 * @param {Document} doc
 */
function scheduleEagerTargetDelivery(main, doc) {
  loadMartech(doc)?.then(() => getMartechModule().then(async (m) => {
    m.setDecisionScopes(getTargetDecisionScopes(main, doc));
    m.setPropositionMetadata(buildTargetApplyMetadata(main, doc));
    initTargetDelivery(main);
    await m.martechEager();
    revealTargetZones(main);
    await finalizeTargetZonesAfterApply(main);
  })).catch(() => {});
}

/**
 * Warm-cache below-fold CSS during eager (preload only — never render-blocking).
 * @param {Element} main
 * @param {Document} doc
 */
function prefetchBelowFoldStyles(main, doc) {
  if (isLibraryPreview(doc) || !main) return;
  prefetchStylesheet(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  main.querySelectorAll('.block[data-block-name]').forEach((block) => {
    const { blockName } = block.dataset;
    if (!blockName || blockName === 'hero-adventure' || isLayoutClassName(blockName)) {
      return;
    }
    prefetchStylesheet(getBlockStylesheetHref(blockName));
  });
}

/**
 * Load a deferred section only after lazy + block CSS is applied.
 * @param {Element} section
 * @returns {Promise<void>}
 */
async function loadDeferredSection(section) {
  const status = section.dataset.sectionStatus;
  if (status && status !== 'initialized') return;

  section.dataset.sectionStatus = 'loading';
  const blocks = [...section.querySelectorAll('div.block')];
  await Promise.all(blocks.map(async (block) => {
    const name = block.dataset.blockName || block.classList[0];
    if (name && !isLayoutClassName(name)) {
      await ensureStylesheet(getBlockStylesheetHref(name));
    }
    await loadBlock(block);
  }));
  section.dataset.sectionStatus = 'loaded';
  section.style.display = null;
}

/**
 * @param {Element} main
 * @returns {Promise<void>}
 */
async function loadDeferredSections(main) {
  if (!main) return;
  const sections = [...main.querySelectorAll('div.section')];
  // eslint-disable-next-line no-restricted-syntax
  for (const section of sections) {
    // eslint-disable-next-line no-await-in-loop
    await loadDeferredSection(section);
  }
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  doc.body?.classList.add('appear');
  await bootstrapLibraryBlockDocument(doc);
  if (!doc.querySelector('link[rel="alternate"][type="text/markdown"]')) {
    addMarkdownAlternateLink(doc);
  }
  preloadOgImage(doc);
  applyTemplateAndTheme(doc);

  if (isBlogArticlePage(doc)) {
    await loadCSS(`${window.hlx.codeBasePath}/styles/blog.css`);
  }

  loadSiteBrandCss(getRepolessSiteSlug(doc));

  const main = doc.querySelector('main');
  if (main) {
    const primedHero = hasPrimedLcpHero(main);
    const lcpHero = primedHero || Boolean(main.querySelector(HERO_BLOCK_SELECTOR));
    if (!lcpHero) {
      primeLcpImage(main);
      await loadHeroBlockCss(main);
    }
    decorateMain(main);
    applyTemplateAndTheme(doc);

    const needsEagerMartech = isMartechConfigured()
      && isPersonalizationEnabled(doc)
      && shouldRequestNamedTargetScopes(doc)
      && !isLibraryPreview(doc);
    if (needsEagerMartech) {
      scheduleEagerTargetDelivery(main, doc);
    }
    if (!primedHero) {
      primeLcpImage(main);
    }
    document.body.classList.add('appear');
    const firstSection = main.querySelector('.section');
    if (firstSection && !lcpHero) preloadLcpHeroImage(firstSection);
    const loadFirstSection = firstSection
      ? loadEagerFirstSection(firstSection)
      : Promise.resolve();

    await loadFirstSection;
    prefetchBelowFoldStyles(main, doc);
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  if (!isLibraryPreviewShell(doc)) {
    await ensureStylesheet(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  }

  loadFonts().catch(() => {});

  if (!martechLoadedPromise && isMartechConfigured() && !isLibraryPreview(doc)) {
    loadMartech(doc);
  }

  if (!isLibraryPreview(doc)) {
    loadHeader(doc.querySelector('header'));
  }

  const main = doc.querySelector('main');
  const lcpSection = main?.querySelector('.section.lcp-section');
  if (lcpSection) {
    const fragmentBlocks = [...lcpSection.querySelectorAll('.fragment.block')]
      .filter((block) => block.dataset.blockStatus !== 'loaded');
    if (fragmentBlocks.length) {
      const loadLcpFragments = () => Promise.all(fragmentBlocks.map(async (block) => {
        await ensureStylesheet(getBlockStylesheetHref('fragment'));
        await loadBlock(block);
      })).catch(() => {});
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => { loadLcpFragments(); }, { timeout: 2500 });
      } else {
        setTimeout(loadLcpFragments, 100);
      }
    }
  }

  await loadDeferredSections(main);

  const needsTargetRefresh = isPersonalizationEnabled(doc)
    && shouldRequestNamedTargetScopes(doc)
    && !isLibraryPreview(doc);
  if (main && needsTargetRefresh) {
    await refreshTargetZones(main);
  }

  if (main) {
    optimizePictures(main, { eagerSelector: HERO_BLOCK_SELECTOR });
    if (isAnalyticsEnabled(doc) && !isLibraryPreview(doc)) {
      bindCtaAnalytics(main);
    }
  }

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  if (martechLoadedPromise && !isLibraryPreview(doc)) {
    await martechLoadedPromise;
    if (isAnalyticsEnabled(doc)) {
      pushAnalyticsPageContext(doc, getPageMetadataValue);
      if (window.isErrorPage) {
        pushErrorPageContext();
      }
    }
    if (isPersonalizationEnabled(doc)) {
      pushTargetPageContext(doc, getPageMetadataValue);
      if (main) initTargetAnalytics(main);
    }
    await getMartechModule().then((m) => m.martechLazy());
    if (main && isPersonalizationEnabled(doc)) {
      await refreshTargetZones(main);
    }
  }

  const loadQuickEdit = async (...args) => {
    // eslint-disable-next-line import/no-cycle
    const { default: initQuickEdit } = await import('../tools/quick-edit/quick-edit.js');
    initQuickEdit(...args);
  };

  const addSidekickListeners = (sk) => {
    sk.addEventListener('custom:quick-edit', loadQuickEdit);
  };

  const sk = document.querySelector('aem-sidekick');
  if (sk) {
    addSidekickListeners(sk);
  } else {
    // wait for sidekick to be loaded
    document.addEventListener('sidekick-ready', () => {
    // sidekick now loaded
      addSidekickListeners(document.querySelector('aem-sidekick'));
    }, { once: true });
  }
}

(() => {
  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
  // eslint-disable-next-line import/no-cycle
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
})();

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  window.setTimeout(() => {
    if (!isLibraryPreview(document)) {
      loadFooter(document.querySelector('footer'));
    }
    if (martechLoadedPromise) {
      martechLoadedPromise.then(() => getMartechModule().then(async (m) => {
        await m.martechDelayed();
        const main = document.querySelector('main');
        if (main && isAnalyticsEnabled(document)) {
          initAssetAnalytics(main);
        }
      }));
    }
    // eslint-disable-next-line import/no-cycle
    import('./delayed.js');
  }, 3000);
}

export async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

// UE Editor support before page load
if (/\.(stage-ue|ue)\.da\.live$/.test(window.location.hostname)) {
  // eslint-disable-next-line import/no-unresolved
  await import(`${window.hlx.codeBasePath}/ue/scripts/ue.js`).then(({ default: ue }) => ue());
}

loadPage();

(function da() {
  const { searchParams } = new URL(window.location.href);
  const lp = searchParams.get('dapreview');
  // eslint-disable-next-line import/no-unresolved
  if (lp) import('https://da.live/scripts/dapreview.js').then((mod) => mod.default(loadPage));

  const exp = searchParams.get('daexperiment');
  // eslint-disable-next-line import/no-unresolved
  if (exp) import('https://da.live/nx/public/plugins/exp/exp.js');
}());
