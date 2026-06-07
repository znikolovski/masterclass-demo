/** Blog index URL — form block fetches pathname on the current site origin. */
export const BLOG_ARTICLES_OPTIONS_URL = 'https://www.aem.live/blog-index.json';

/**
 * Build document-based adaptive form sheet JSON for EDS form block.
 * @param {Array<Record<string, string>>} fields
 * @param {{ formSlug?: string }} [opts]
 */
export function buildFormSheet(fields, opts = {}) {
  return {
    ':type': 'sheet',
    formSlug: opts.formSlug || '',
    total: fields.length,
    offset: 0,
    limit: fields.length,
    data: fields,
  };
}

/**
 * @param {string} name
 * @param {string} type
 * @param {string} label
 * @param {object} [opts]
 */
export function field(name, type, label, opts = {}) {
  return {
    Name: name,
    Type: type,
    Description: opts.description || '',
    Placeholder: opts.placeholder || '',
    Label: label,
    'Read Only': '',
    Mandatory: opts.mandatory ? 'true' : '',
    Pattern: opts.pattern || '',
    Step: '',
    Min: opts.min || '',
    Max: opts.max || '',
    Value: opts.value || '',
    Options: opts.options || '',
    OptionNames: opts.optionNames || '',
    Fieldset: opts.fieldset || '',
    Repeatable: opts.repeatable || '',
  };
}

/**
 * @param {object} json
 */
export function embeddedFormJson(json) {
  return JSON.stringify(json).replace(/</g, '\\u003c');
}

/**
 * DA author hint (HTML comment — not shown on the live site).
 * @param {object} json
 */
export function formFieldsAuthorComment(json) {
  const rows = json.data
    .filter((row) => row.Type && row.Type !== 'submit')
    .map((row) => {
      const req = row.Mandatory === 'true' ? ' (required)' : '';
      const opts = row.Options ? ` — ${row.OptionNames || row.Options}` : '';
      return `${row.Label || row.Name} [${row.Type}]${req}${opts}`;
    })
    .join('; ');
  return `<!-- form fields: ${rows} -->`;
}

/**
 * Adaptive form block with embedded sheet JSON (avoids broken .json content-bus 404s).
 * @param {object} json
 */
export function formBlockHtml(json) {
  const jsonStr = embeddedFormJson(json);
  return `<div class="form">
    <div><div>Form</div></div>
    <div><div><pre><code>${jsonStr}</code></pre></div></div>
  </div>`;
}

/**
 * EDS page: single section so the form block loads in the first (eager) section.
 * @param {string} title
 * @param {object} json
 * @param {string} [description]
 */
export function formPageHtml(title, json, description = '') {
  const intro = description ? `<p>${description}</p>` : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <header></header>
  <main>
    <div>
      <h1>${title}</h1>
      ${intro}
      ${formFieldsAuthorComment(json)}
      ${formBlockHtml(json)}
    </div>
  </main>
  <footer></footer>
</body>
</html>`;
}

/**
 * Form section for appending to an existing page.
 * @param {object} json
 * @param {{ title?: string, description?: string }} [opts]
 */
/**
 * Section content: heading + form block as siblings (required for EDS block detection).
 * @param {object} json
 * @param {{ title?: string, description?: string }} [opts]
 */
export function formBlockSection(json, opts = {}) {
  const title = opts.title || 'Register your interest';
  const description = opts.description
    ? `<p>${opts.description}</p>\n`
    : '';
  return `<h2>${title}</h2>
${description}${formFieldsAuthorComment(json)}
${formBlockHtml(json)}`;
}

export const WKND_FORMS = {
  'wknd-contact-b2b': buildFormSheet([
    field('company', 'text', 'Company name', { mandatory: true }),
    field('contactName', 'text', 'Your name', { mandatory: true }),
    field('email', 'email', 'Email', { mandatory: true }),
    field('phone', 'tel', 'Phone'),
    field('adventureType', 'select', 'Adventure type', {
      options: 'Trekking,Climbing,Water,Winter,Cycling,Desert,General',
      optionNames: 'Trekking,Climbing,Water,Winter,Cycling,Desert,General',
    }),
    field('message', 'textarea', 'Message', { mandatory: true }),
    field('submit', 'submit', 'Send message'),
  ], { formSlug: 'wknd-contact-b2b' }),
  'wknd-adventure-interest': buildFormSheet([
    field('name', 'text', 'Your name', { mandatory: true }),
    field('email', 'email', 'Email', { mandatory: true }),
    field('adventure', 'select', 'Adventure interest', {
      placeholder: 'Select an adventure',
      options: BLOG_ARTICLES_OPTIONS_URL,
      optionNames: BLOG_ARTICLES_OPTIONS_URL,
    }),
    field('dates', 'text', 'Preferred dates'),
    field('groupSize', 'number', 'Group size', { min: '1', max: '50' }),
    field('notes', 'textarea', 'Anything else we should know?'),
    field('submit', 'submit', 'Register interest'),
  ], { formSlug: 'wknd-adventure-interest' }),
  'wknd-adventure-interest-b2b': buildFormSheet([
    field('company', 'text', 'Company name', { mandatory: true }),
    field('contactName', 'text', 'Contact name', { mandatory: true }),
    field('email', 'email', 'Work email', { mandatory: true }),
    field('teamSize', 'number', 'Team size', { mandatory: true, min: '2', max: '200' }),
    field('adventureType', 'select', 'Adventure type', {
      options: 'Trekking,Climbing,Water,Winter,Retreat,Custom',
      optionNames: 'Trekking,Climbing,Water,Winter,Leadership retreat,Custom itinerary',
    }),
    field('preferredDates', 'text', 'Preferred dates'),
    field('budget', 'select', 'Budget range', {
      options: 'Under10k,10k-25k,25k-50k,50k+',
      optionNames: 'Under $10k,$10k–$25k,$25k–$50k,$50k+',
    }),
    field('notes', 'textarea', 'Goals and requirements'),
    field('submit', 'submit', 'Submit request'),
  ], { formSlug: 'wknd-adventure-interest-b2b' }),
};
