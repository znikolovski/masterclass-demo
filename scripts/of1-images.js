let capturedPages;
const attemptedImages = new WeakSet();

function normalizeCaption(caption) {
  return caption.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function getCapturedPages() {
  if (!capturedPages) {
    capturedPages = fetch(new URL('../of1/config/knowledge-pages.json', import.meta.url))
      .then(async (response) => {
        if (!response.ok) throw new Error(`OF1 image provenance returned HTTP ${response.status}`);
        const pages = await response.json();
        if (!Array.isArray(pages)) throw new Error('OF1 image provenance is not a page collection');
        return pages;
      });
  }
  return capturedPages;
}

/**
 * Recover a failed native image only when its caption identifies one captured asset.
 * @param {HTMLImageElement} image Failed generated image
 */
// eslint-disable-next-line import/prefer-default-export
export async function restoreGeneratedImage(image) {
  if (attemptedImages.has(image)) return;
  attemptedImages.add(image);
  const caption = normalizeCaption(image.alt);
  if (!caption) throw new Error('Failed OF1 image has no caption to verify against captured sources');
  const pages = await getCapturedPages();
  const filenames = new Set(pages.flatMap((page) => page.blocks
    .filter((block) => block.tag === 'img' && normalizeCaption(block.alt) === caption)
    .map((block) => new URL(block.src).pathname.split('/').pop())));
  if (filenames.size !== 1) {
    throw new Error(`Failed OF1 image caption identifies ${filenames.size} assets; refusing to guess`);
  }
  const [canonical] = filenames;
  const supplied = new URL(image.currentSrc || image.src).pathname.split('/').pop();
  if (canonical === supplied) throw new Error('The captured OF1 image also failed to load');
  if (!/^media_[a-f0-9]+\.(?:jpe?g|png|webp|avif)$/i.test(canonical)) {
    throw new Error('The captured OF1 image is not a native Media Bus asset');
  }
  image.closest('picture')?.querySelectorAll('source[srcset]').forEach((source) => {
    source.srcset = source.srcset.replaceAll(supplied, canonical);
  });
  if (image.srcset) image.srcset = image.srcset.replaceAll(supplied, canonical);
  image.src = image.src.replaceAll(supplied, canonical);
  // eslint-disable-next-line no-console -- make the upstream asset-ID corruption observable
  console.warn('Restored OF1 image from its captured caption:', supplied, canonical);
}
