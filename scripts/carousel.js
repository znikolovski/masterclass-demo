/** @see docs/DRY-ANALYSIS.md */

/**
 * @typedef {object} CarouselSelectors
 * @property {string} slide CSS selector for slide elements
 * @property {string} track CSS selector for horizontal scroll track
 * @property {string} [prev] CSS selector for previous control
 * @property {string} [next] CSS selector for next control
 * @property {string} [indicator] CSS selector for slide indicator items
 */

/**
 * @typedef {object} CarouselOptions
 * @property {CarouselSelectors} selectors
 * @property {(root: Element, index: number) => void} [onSlideChange]
 * @property {boolean} [respectReducedMotion]
 */

/**
 * @param {number} slideIndex
 * @param {number} slideCount
 * @returns {number}
 */
export function normalizeSlideIndex(slideIndex, slideCount) {
  if (slideCount === 0) return 0;
  let index = slideIndex;
  if (index < 0) index = slideCount - 1;
  if (index >= slideCount) index = 0;
  return index;
}

/**
 * @param {Element} root
 * @param {number} slideIndex
 * @param {CarouselOptions} options
 */
export function updateCarouselSlide(root, slideIndex, options) {
  const { selectors, onSlideChange } = options;
  const slides = root.querySelectorAll(selectors.slide);
  if (!slides.length) return;

  const index = normalizeSlideIndex(slideIndex, slides.length);
  root.dataset.activeSlide = String(index);

  slides.forEach((slide, idx) => {
    slide.setAttribute('aria-hidden', idx !== index ? 'true' : 'false');
    slide.querySelectorAll('a').forEach((link) => {
      if (idx !== index) link.setAttribute('tabindex', '-1');
      else link.removeAttribute('tabindex');
    });
  });

  if (selectors.indicator) {
    root.querySelectorAll(selectors.indicator).forEach((indicator, idx) => {
      const btn = indicator.querySelector('button');
      if (!btn) return;
      if (idx !== index) btn.removeAttribute('disabled');
      else btn.setAttribute('disabled', 'true');
    });
  }

  onSlideChange?.(root, index);
}

/**
 * @param {Element} root
 * @param {number} slideIndex
 * @param {CarouselOptions} options
 */
export function showCarouselSlide(root, slideIndex, options) {
  const { selectors, respectReducedMotion = false } = options;
  const slides = root.querySelectorAll(selectors.slide);
  const track = root.querySelector(selectors.track);
  if (!slides.length || !track) return;

  const index = normalizeSlideIndex(slideIndex, slides.length);
  const slide = slides[index];
  const prefersReducedMotion = respectReducedMotion
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  track.scrollTo({
    top: 0,
    left: slide.offsetLeft - track.offsetLeft,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
  updateCarouselSlide(root, index, options);
}

/**
 * @param {Element} root
 * @param {CarouselOptions} options
 */
export function bindCarouselScrollSync(root, options) {
  const track = root.querySelector(options.selectors.track);
  if (!track) return;

  let scrollTicking = false;
  track.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(() => {
      const slides = [...root.querySelectorAll(options.selectors.slide)];
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
      updateCarouselSlide(root, closest, options);
      scrollTicking = false;
    });
  }, { passive: true });
}

/**
 * @param {Element} root
 * @param {CarouselOptions} options
 */
export function bindCarouselNavigation(root, options) {
  const { selectors } = options;
  const getActive = () => parseInt(root.dataset.activeSlide || '0', 10);

  if (selectors.prev || selectors.next) {
    root.addEventListener('click', (event) => {
      const { target } = event;
      if (!(target instanceof HTMLElement)) return;
      if (selectors.prev && target.closest(selectors.prev)) {
        showCarouselSlide(root, getActive() - 1, options);
      } else if (selectors.next && target.closest(selectors.next)) {
        showCarouselSlide(root, getActive() + 1, options);
      }
    });
  }

  if (selectors.indicator) {
    root.querySelectorAll(`${selectors.indicator} button`).forEach((button) => {
      button.addEventListener('click', (e) => {
        const slideIndicator = e.currentTarget.parentElement;
        if (!slideIndicator?.dataset.targetSlide) return;
        showCarouselSlide(root, parseInt(slideIndicator.dataset.targetSlide, 10), options);
      });
    });
  }

  bindCarouselScrollSync(root, options);
}
