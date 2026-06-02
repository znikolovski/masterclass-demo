const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/**
 * Extract a validated 11-character YouTube video ID from a URL string.
 * @param {string} input Author-provided URL
 * @returns {string|null} Video ID or null when invalid / not YouTube
 */
function parseYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;

  let id = null;

  if (url.hostname.includes('youtu.be')) {
    const [, idFromPath] = url.pathname.split('/');
    id = idFromPath;
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) {
    const [, , idFromPath] = url.pathname.split('/');
    id = idFromPath;
  }

  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
}

/**
 * Read authored block rows into URL, caption, and autoplay flag.
 * @param {Element} block
 */
function parseConfig(block) {
  let videoUrl = '';
  let title = '';
  let autoplay = false;

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const link = row.querySelector('a');
    const label = cells[0]?.textContent.trim().toLowerCase() || '';
    const value = cells[1]?.textContent.trim() || cells[0]?.textContent.trim() || '';

    if (label.includes('youtube') || (link && parseYouTubeId(link.href))) {
      videoUrl = link?.href || cells[1]?.textContent.trim() || '';
      return;
    }

    if (label === 'title') {
      title = cells[1]?.textContent.trim() || '';
      return;
    }

    if (label === 'autoplay') {
      autoplay = true;
      return;
    }

    if (!videoUrl && (link || parseYouTubeId(value))) {
      videoUrl = link?.href || value;
    } else if (!title && value && !parseYouTubeId(value)) {
      title = value;
    }
  });

  return { videoUrl, title, autoplay };
}

/**
 * Build a privacy-enhanced YouTube embed URL from a validated video ID.
 * @param {string} id
 * @param {boolean} autoplay
 */
function buildEmbedSrc(id, autoplay) {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (autoplay) {
    params.set('autoplay', '1');
    params.set('mute', '1');
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/**
 * Decorate the youtube-video block.
 * @param {Element} block
 */
export default function decorate(block) {
  const { videoUrl, title, autoplay } = parseConfig(block);
  const videoId = parseYouTubeId(videoUrl);

  block.replaceChildren();

  if (!videoId) {
    const message = document.createElement('p');
    message.className = 'youtube-video-error';
    message.textContent = 'Unable to embed video. Please provide a valid YouTube URL.';
    block.append(message);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'youtube-video-embed';

  const iframe = document.createElement('iframe');
  iframe.src = buildEmbedSrc(videoId, autoplay);
  iframe.title = title || 'YouTube video player';
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

  wrapper.append(iframe);
  block.append(wrapper);

  if (title) {
    const caption = document.createElement('p');
    caption.className = 'youtube-video-caption';
    caption.textContent = title;
    block.append(caption);
  }
}
