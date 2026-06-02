/**
 * Wraps a library snippet (section divs) in a full HTML document for code-bus preview.
 * DA library documents stay as fragments; only git copies use this wrapper.
 */

export function wrapLibraryPreviewPage(title, sectionHtml) {
  const body = sectionHtml.trim();
  const indented = body.split('\n').map((line) => `    ${line}`).join('\n');

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
    <link rel="stylesheet" href="/styles/library-preview.css">
  </head>
  <body class="library-preview">
    <header></header>
    <main>
${indented}
    </main>
    <footer></footer>
  </body>
</html>
`;
}
