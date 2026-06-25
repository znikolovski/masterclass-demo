/**
 * Wraps a library snippet (section divs) in a full HTML document for code-bus preview.
 * DA library documents stay as fragments; git copies use this wrapper for EW Sidekick.
 *
 * Sidekick loads `{path}.plain.html` for block markup and `{path}` as the styled shell.
 * Use paths like `/blocks/{name}/{name}.html` in tools/sidekick/library.json.
 */

/**
 * @param {string} daPath e.g. blocks/aero/flight-search/flight-search.html
 * @returns {string} Asset base without extension
 */
export function getBlockAssetPath(daPath) {
  const nested = daPath.match(/^blocks\/aero\/([^/]+)\/\1\.html$/);
  if (nested) return `blocks/aero/${nested[1]}/${nested[1]}`;
  const name = daPath.split('/').pop()?.replace(/\.html$/, '') || '';
  return `blocks/${name}/${name}`;
}

/**
 * @param {string} daPath
 */
export function getPreviewOptionsForDaPath(daPath) {
  const blockName = daPath.split('/').pop()?.replace(/\.html$/, '') || '';
  const isAero = daPath.startsWith('blocks/aero/');
  return {
    blockName,
    blockAssetPath: getBlockAssetPath(daPath),
    stylesheets: isAero ? ['/styles/brands/wknd-aero.css'] : [],
    bodyClasses: isAero ? ['wknd-aero'] : [],
  };
}

/**
 * @param {string} title Page title
 * @param {string} sectionHtml Section divs (library fragment)
 * @param {{ bodyClasses?: string[], stylesheets?: string[], blockName?: string, blockNames?: string[], blockAssetPath?: string }} [options]
 */
export function wrapLibraryPreviewPage(title, sectionHtml, options = {}) {
  let body = sectionHtml.trim();
  if (options.blockName) {
    body = body.replace(
      `class="${options.blockName}"`,
      `class="${options.blockName} sidekick-library"`,
    );
  }
  const indented = body.split('\n').map((line) => `    ${line}`).join('\n');
  const bodyClasses = ['library-preview', 'sidekick-library', ...(options.bodyClasses || [])].filter(Boolean).join(' ');
  const extraStyles = (options.stylesheets || [])
    .map((href) => `    <link rel="stylesheet" href="${href}">`)
    .join('\n');
  const assetPath = options.blockAssetPath
    || (options.blockName ? `blocks/${options.blockName}/${options.blockName}` : null);
  const blockStyles = assetPath
    ? `    <link rel="stylesheet" href="/${assetPath}.css">`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Syncopate:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles/brand.css">
    <link rel="stylesheet" href="/styles/styles.css">
    <link rel="stylesheet" href="/styles/lazy-styles.css">
    <link rel="stylesheet" href="/styles/library-preview.css">
    <link rel="stylesheet" href="/styles/library-sidekick-blocks.css">
${blockStyles}
${extraStyles}
  </head>
  <body class="${bodyClasses}">
    <header></header>
    <main>
${indented}
    </main>
    <footer></footer>
    <script type="module" src="/scripts/library-preview.js"></script>
  </body>
</html>
`;
}
