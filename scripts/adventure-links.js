import { buildPathWithQueryParam } from './paths.js';
import { pushInteractionEvent } from './analytics-acdl.js';

/**
 * @param {string} path
 * @param {string} cid
 * @returns {string}
 */
export function buildAdventureUrl(path, cid) {
  return buildPathWithQueryParam(path, 'cid', cid);
}

/**
 * @param {object} options
 * @param {string} options.path
 * @param {string} options.analyticsCid
 * @param {string} options.label
 * @param {string} options.className
 * @param {string} [options.blockName]
 * @returns {HTMLAnchorElement}
 */
export function createAdventureCta({
  path,
  analyticsCid,
  label,
  className,
  blockName = 'adventure-map',
}) {
  const cta = document.createElement('a');
  cta.className = className;
  cta.href = buildAdventureUrl(path, analyticsCid);
  cta.textContent = label;
  cta.addEventListener('click', () => {
    pushInteractionEvent('ctaClick', {
      label: cta.textContent.trim(),
      block: blockName,
      detail: cta.getAttribute('href') || '',
    });
  });
  return cta;
}

/**
 * @param {object} options
 * @param {string} options.image
 * @param {string} options.title
 * @param {string} [options.imageClass] Class on the img element
 * @param {string} [options.wrapperClass] Optional wrapper div class
 * @param {string} [options.placeholderClass] Placeholder modifier when image is absent
 * @returns {HTMLElement|null}
 */
export function createAdventureImage({
  image,
  title,
  imageClass,
  wrapperClass,
  placeholderClass,
}) {
  if (image) {
    const img = document.createElement('img');
    if (imageClass) img.className = imageClass;
    img.src = image;
    img.alt = title;
    img.loading = 'lazy';
    if (wrapperClass) {
      const wrap = document.createElement('div');
      wrap.className = wrapperClass;
      wrap.append(img);
      return wrap;
    }
    return img;
  }
  if (placeholderClass && imageClass) {
    const placeholder = document.createElement('div');
    placeholder.className = `${imageClass} ${placeholderClass}`;
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  }
  return null;
}
