/**
 * Wraps a library snippet (section divs) in a full HTML document for code-bus preview.
 * DA library documents stay as fragments; git copies use this wrapper for EW Sidekick.
 *
 * Sidekick loads `{path}.plain.html` for block markup and `{path}` as the styled shell.
 * Use paths like `/blocks/{name}/{name}.html` in tools/sidekick/library.json.
 */

/**
 * @param {string} title Page title
 * @param {string} sectionHtml Section divs (library fragment)
 * @param {{ bodyClasses?: string[], stylesheets?: string[], blockName?: string, blockNames?: string[] }} [options]
 */
export function wrapLibraryPreviewPage(title, sectionHtml, options = {}) {
  const body = sectionHtml.trim();
  const indented = body.split('\n').map((line) => `    ${line}`).join('\n');
  const bodyClasses = ['library-preview', ...(options.bodyClasses || [])].filter(Boolean).join(' ');
  const extraStyles = (options.stylesheets || [])
    .map((href) => `    <link rel="stylesheet" href="${href}">`)
    .join('\n');
  const blockNames = [
    ...(options.blockNames || []),
    ...(options.blockName ? [options.blockName] : []),
  ].filter(Boolean);
  const blockStyles = blockNames
    .map((name) => `    <link rel="stylesheet" href="/blocks/${name}/${name}.css">`)
    .join('\n');

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
    <script src="/scripts/aem.js" type="module"></script>
    <script src="/scripts/scripts.js" type="module"></script>
    <link rel="stylesheet" href="/styles/styles.css">
    <link rel="stylesheet" href="/styles/lazy-styles.css">
    <link rel="stylesheet" href="/styles/library-preview.css">
${blockStyles}
${extraStyles}
  </head>
  <body class="${bodyClasses}">
    <header></header>
    <main>
${indented}
    </main>
    <footer></footer>
  </body>
</html>
`;
}
