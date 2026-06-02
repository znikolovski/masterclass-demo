import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateBlocks,
  getMetadata,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  readBlockConfig,
  toClassName,
  toCamelCase,
} from './aem.js';

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
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
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
  const wrapper = sectionMeta.closest('.section-metadata-wrapper') || sectionMeta.parentElement;
  if (wrapper && wrapper !== section) wrapper.remove();
  else sectionMeta.remove();
}

function decorateSections(main) {
  main.querySelectorAll(':scope > div').forEach((section) => {
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
    section.style.display = 'none';

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
  decorateBlocks(main);
  decorateButtonGroups(main);
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
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  applyTemplateAndTheme(doc);
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    applyTemplateAndTheme(doc);
    document.body.classList.add('appear');
    const firstSection = main.querySelector('.section');
    if (firstSection) {
      await loadSection(firstSection, (section) => {
        if (document.body.classList.contains('quick-edit')) return Promise.resolve();
        return waitForFirstImage(section);
      });
    }
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  const template = getPageMetadataValue('template', doc);
  const isBlogArticle = document.body.classList.contains('blog-article')
    || template === 'blog-article'
    || window.location.pathname.includes('/blog/')
    || window.location.pathname.includes('/templates/blog-article/');
  if (isBlogArticle) {
    loadCSS(`${window.hlx.codeBasePath}/styles/blog.css`);
  }
  loadFonts();

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

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
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
