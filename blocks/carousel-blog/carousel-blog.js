import { createResponsivePicture } from '../../scripts/media.js';
import { pushCarouselChange } from '../../scripts/analytics-acdl.js';

function updateActiveSlide(block, slideIndex) {
  const slides = block.querySelectorAll('.carousel-blog-slide');
  let index = slideIndex;
  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;
  block.dataset.activeSlide = index;

  slides.forEach((aSlide, idx) => {
    aSlide.setAttribute('aria-hidden', idx !== index);
    aSlide.querySelectorAll('a').forEach((link) => {
      if (idx !== index) link.setAttribute('tabindex', '-1');
      else link.removeAttribute('tabindex');
    });
  });

  block.querySelectorAll('.carousel-blog-slide-indicator').forEach((indicator, idx) => {
    const btn = indicator.querySelector('button');
    if (idx !== index) btn.removeAttribute('disabled');
    else btn.setAttribute('disabled', 'true');
  });

  pushCarouselChange(block, index, 'carousel-blog');
}

function showSlide(block, slideIndex = 0) {
  const slides = block.querySelectorAll('.carousel-blog-slide');
  if (!slides.length) return;

  let index = slideIndex;
  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;

  const track = block.querySelector('.carousel-blog-slides');
  const slide = slides[index];
  track.scrollTo({
    top: 0,
    left: slide.offsetLeft - track.offsetLeft,
    behavior: 'smooth',
  });
  updateActiveSlide(block, index);
}

function isSafePath(path) {
  return typeof path === 'string' && /^\/[a-z0-9\-/]*$/i.test(path);
}

function isSlideRow(row) {
  return Boolean(row.querySelector('picture, img'));
}

/**
 * Config row: no slide image — heading (and optional limit / view-all path).
 * Slide rows use h3 titles; only h2 on a non-slide row is treated as block heading.
 * @param {Element} row
 * @returns {{ heading: string, limit: number|null, viewAllPath: string|null }|null}
 */
function parseConfigRow(row) {
  if (isSlideRow(row)) return null;

  const cells = [...row.children].map((cell) => cell.textContent.trim());
  const viewAllLink = row.querySelector('a');
  const headingEl = row.querySelector('h2');

  if (!headingEl && !cells[0]) return null;

  const heading = headingEl?.textContent?.trim() || cells[0] || '';
  let limit = null;
  let viewAllPath = null;

  if (!headingEl && cells[0]) {
    const limitText = cells[1];
    if (limitText && !Number.isNaN(Number(limitText))) {
      limit = Math.min(Math.max(parseInt(limitText, 10), 1), 12);
    }
    const viewAllText = cells[2];
    if (viewAllLink && isSafePath(viewAllLink.getAttribute('href'))) {
      viewAllPath = viewAllLink.getAttribute('href');
    } else if (viewAllText && isSafePath(viewAllText)) {
      viewAllPath = viewAllText;
    }
  } else if (viewAllLink && isSafePath(viewAllLink.getAttribute('href'))) {
    viewAllPath = viewAllLink.getAttribute('href');
  }

  return { heading, limit, viewAllPath };
}

function parseConfig(block) {
  const rows = [...block.children];
  let heading = 'Recent Field Notes';
  let limit = 6;
  let viewAllPath = '/field-notes';
  let hasConfigRow = false;
  let slideRows = rows;

  if (rows.length > 0) {
    const config = parseConfigRow(rows[0]);
    if (config) {
      hasConfigRow = true;
      if (config.heading) heading = config.heading;
      if (config.limit != null) limit = config.limit;
      if (config.viewAllPath) viewAllPath = config.viewAllPath;
      slideRows = rows.slice(1);
    }
  }

  return {
    heading,
    limit,
    viewAllPath,
    hasConfigRow,
    rows: slideRows,
  };
}

function parseFallbackSlides(rows) {
  return rows.map((row) => {
    const cols = [...row.children];
    const imageCol = cols.find((col) => col.querySelector('picture, img'));
    const contentCol = cols.find((col) => col !== imageCol) || cols[1];
    const img = imageCol?.querySelector('img');
    const link = contentCol?.querySelector('a');
    const tagEl = contentCol?.querySelector('p:not(:has(a))');
    const tag = tagEl?.textContent?.trim() || 'Field Notes';
    const titleEl = contentCol?.querySelector('h3, h2');
    const title = titleEl?.querySelector('a')?.textContent?.trim()
      || titleEl?.textContent?.trim()
      || link?.textContent?.trim()
      || '';
    const description = [...contentCol?.querySelectorAll('p') || []]
      .filter((p) => p !== tagEl && !p.querySelector('a'))
      .map((p) => p.textContent.trim())
      .join(' ')
      || '';
    const path = link?.getAttribute('href') || '#';

    return {
      path: isSafePath(path) ? path : '#',
      title,
      description,
      tag,
      image: img?.getAttribute('src') || '',
      lastModified: 0,
    };
  }).filter((post) => post.title);
}

async function fetchBlogPosts(limit) {
  const base = window.hlx.codeBasePath || '';
  const indexPaths = [`${base}/blog-index.json`, `${base}/query-index.json`];

  const loadIndex = async (indexPath) => {
    const resp = await fetch(indexPath);
    if (!resp.ok) return [];
    const { data } = await resp.json();
    return Array.isArray(data) ? data : [];
  };

  try {
    let data = await loadIndex(indexPaths[0]);
    if (data.length === 0) {
      const all = await loadIndex(indexPaths[1]);
      data = all.filter((entry) => entry.path?.startsWith('/blog/')
        || entry.path?.startsWith('/drafts/blog/'));
    }

    return data
      .filter((entry) => entry.title && isSafePath(entry.path))
      .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function createSlideContent(post, slideIndex, carouselId) {
  const slide = document.createElement('li');
  slide.dataset.slideIndex = slideIndex;
  slide.setAttribute('id', `carousel-blog-${carouselId}-slide-${slideIndex}`);
  slide.classList.add('carousel-blog-slide');
  slide.setAttribute('aria-hidden', slideIndex !== 0);

  const imageWrap = document.createElement('div');
  imageWrap.classList.add('carousel-blog-slide-image');
  if (post.image) {
    const pic = createResponsivePicture(post.image, post.title, false, [{ width: 600 }]);
    const link = document.createElement('a');
    link.href = post.path;
    link.append(pic);
    imageWrap.append(link);
  }

  const content = document.createElement('div');
  content.classList.add('carousel-blog-slide-content');

  const tag = document.createElement('p');
  tag.classList.add('carousel-blog-slide-tag');
  tag.textContent = post.tag || 'Field Notes';
  content.append(tag);

  const title = document.createElement('h3');
  const titleId = `carousel-blog-${carouselId}-title-${slideIndex}`;
  title.id = titleId;
  title.classList.add('carousel-blog-slide-title');
  const titleLink = document.createElement('a');
  titleLink.href = post.path;
  titleLink.textContent = post.title.replace(/\s+—\s+WKND Adventures$/i, '').trim();
  title.append(titleLink);
  slide.setAttribute('aria-labelledby', titleId);

  if (post.description) {
    const desc = document.createElement('p');
    desc.classList.add('carousel-blog-slide-description');
    desc.textContent = post.description;
    content.append(desc);
  }

  const dateText = formatDate(post.lastModified);
  if (dateText) {
    const date = document.createElement('p');
    date.classList.add('carousel-blog-slide-date');
    date.textContent = dateText;
    content.append(date);
  }

  const ctaWrap = document.createElement('p');
  ctaWrap.classList.add('carousel-blog-slide-cta-wrap');
  const readLink = document.createElement('a');
  readLink.href = post.path;
  readLink.textContent = 'Read the Story';
  readLink.classList.add('carousel-blog-slide-cta');
  ctaWrap.append(readLink);
  content.append(ctaWrap);

  slide.append(imageWrap, content);
  return slide;
}

function bindEvents(block) {
  const track = block.querySelector('.carousel-blog-slides');
  const slideIndicators = block.querySelector('.carousel-blog-slide-indicators');
  if (!track || !slideIndicators) return;

  slideIndicators.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const slideIndicator = e.currentTarget.parentElement;
      showSlide(block, parseInt(slideIndicator.dataset.targetSlide, 10));
    });
  });

  block.querySelector('.slide-prev')?.addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) - 1);
  });
  block.querySelector('.slide-next')?.addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
  });

  let scrollTicking = false;
  track.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(() => {
      const slides = [...block.querySelectorAll('.carousel-blog-slide')];
      const trackCenter = track.scrollLeft + track.clientWidth / 2;
      let closest = 0;
      let minDist = Infinity;
      slides.forEach((slide, idx) => {
        const slideCenter = slide.offsetLeft - track.offsetLeft + slide.offsetWidth / 2;
        const dist = Math.abs(slideCenter - trackCenter);
        if (dist < minDist) {
          minDist = dist;
          closest = idx;
        }
      });
      updateActiveSlide(block, closest);
      scrollTicking = false;
    });
  }, { passive: true });
}

let carouselId = 0;

export default async function decorate(block) {
  const {
    heading, limit, viewAllPath, hasConfigRow, rows,
  } = parseConfig(block);

  // Author-authored slide rows win over the blog index feed.
  const authoredSlides = parseFallbackSlides(rows);
  const posts = authoredSlides.length > 0
    ? authoredSlides.slice(0, limit)
    : await fetchBlogPosts(limit);

  block.textContent = '';
  if (posts.length === 0) {
    block.innerHTML = '<p class="carousel-blog-empty">No blog posts found.</p>';
    return;
  }

  carouselId += 1;
  const id = `carousel-blog-${carouselId}`;
  block.id = id;
  block.dataset.activeSlide = 0;
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Carousel');

  const header = document.createElement('div');
  header.classList.add('carousel-blog-header');

  const headerText = document.createElement('div');
  headerText.classList.add('carousel-blog-header-text');
  const title = document.createElement('h2');
  title.textContent = heading;
  if (!hasConfigRow) {
    const eyebrow = document.createElement('p');
    eyebrow.classList.add('carousel-blog-eyebrow');
    eyebrow.textContent = 'Field Notes';
    headerText.append(eyebrow, title);
  } else {
    headerText.append(title);
  }
  header.append(headerText);

  if (viewAllPath) {
    const viewAll = document.createElement('a');
    viewAll.classList.add('carousel-blog-view-all');
    viewAll.href = viewAllPath;
    viewAll.textContent = 'View all stories';
    header.append(viewAll);
  }

  block.append(header);

  const isSingleSlide = posts.length < 2;
  const container = document.createElement('div');
  container.classList.add('carousel-blog-slides-container');

  const slidesWrapper = document.createElement('ul');
  slidesWrapper.classList.add('carousel-blog-slides');

  let slideIndicators;
  if (!isSingleSlide) {
    const controls = document.createElement('div');
    controls.classList.add('carousel-blog-controls');

    const slideNavButtons = document.createElement('div');
    slideNavButtons.classList.add('carousel-blog-navigation-buttons');
    slideNavButtons.innerHTML = `
      <button type="button" class="slide-prev" aria-label="Previous slide"></button>
      <button type="button" class="slide-next" aria-label="Next slide"></button>
    `;
    controls.append(slideNavButtons);

    const slideIndicatorsNav = document.createElement('nav');
    slideIndicatorsNav.setAttribute('aria-label', 'Carousel slide controls');
    slideIndicators = document.createElement('ol');
    slideIndicators.classList.add('carousel-blog-slide-indicators');
    slideIndicatorsNav.append(slideIndicators);
    controls.append(slideIndicatorsNav);

    block.append(controls);
  }

  posts.forEach((post, idx) => {
    const slide = createSlideContent(post, idx, carouselId);
    slidesWrapper.append(slide);

    if (slideIndicators) {
      const indicator = document.createElement('li');
      indicator.classList.add('carousel-blog-slide-indicator');
      indicator.dataset.targetSlide = idx;
      indicator.innerHTML = `<button type="button" aria-label="Show slide ${idx + 1} of ${posts.length}"></button>`;
      slideIndicators.append(indicator);
    }
  });

  container.append(slidesWrapper);
  block.append(container);

  if (!isSingleSlide) {
    bindEvents(block);
    updateActiveSlide(block, 0);
  }
}
