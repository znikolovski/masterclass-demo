import decorateCarouselBlog from '../carousel-blog/carousel-blog.js';

/**
 * UE/DA may author the block as "Carousel" (class carousel).
 * Delegate to carousel-blog decoration and styles.
 * @param {Element} block
 */
export default async function decorate(block) {
  block.classList.add('carousel-blog');
  await decorateCarouselBlog(block);
}
