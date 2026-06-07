/**
 * Document-based form submissions for WKND sites.
 * Replaces Adobe Forms submit when AEM adaptive forms are unavailable.
 */

const MAX_TEXT = 2000;
const MAX_SHORT = 120;
const MAX_EMAIL = 254;

/** @typedef {{ required?: boolean, type?: string, max?: number, min?: number }} FormFieldRule */
/** @typedef {{ site: string, fields: Record<string, FormFieldRule> }} FormSchema */

/** @type {Record<string, FormSchema>} */
export const FORM_SCHEMAS = {
  'wknd-contact-b2b': {
    site: 'wknd-business',
    fields: {
      company: { required: true, type: 'text', max: MAX_SHORT },
      contactName: { required: true, type: 'text', max: MAX_SHORT },
      email: { required: true, type: 'email', max: MAX_EMAIL },
      phone: { type: 'text', max: 40 },
      adventureType: { type: 'text', max: 40 },
      message: { required: true, type: 'text', max: MAX_TEXT },
    },
  },
  'wknd-adventure-interest-b2b': {
    site: 'wknd-business',
    fields: {
      company: { required: true, type: 'text', max: MAX_SHORT },
      contactName: { required: true, type: 'text', max: MAX_SHORT },
      email: { required: true, type: 'email', max: MAX_EMAIL },
      teamSize: {
        required: true, type: 'number', min: 2, max: 200,
      },
      adventureType: { type: 'text', max: 40 },
      preferredDates: { type: 'text', max: MAX_SHORT },
      budget: { type: 'text', max: 40 },
      notes: { type: 'text', max: MAX_TEXT },
    },
  },
  'wknd-adventure-interest': {
    site: 'masterclass-demo',
    fields: {
      name: { required: true, type: 'text', max: MAX_SHORT },
      email: { required: true, type: 'email', max: MAX_EMAIL },
      adventure: { type: 'text', max: 80 },
      dates: { type: 'text', max: MAX_SHORT },
      groupSize: { type: 'number', min: 1, max: 50 },
      notes: { type: 'text', max: MAX_TEXT },
    },
  },
};

/**
 * @param {string} email
 */
function isValidEmail(email) {
  return typeof email === 'string'
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && email.length <= MAX_EMAIL;
}

/**
 * @param {unknown} value
 * @param {object} rule
 * @param {string} label
 */
function validateField(value, rule, label) {
  const errors = [];
  const str = value === null || value === undefined ? '' : String(value).trim();

  if (rule.required && !str) {
    errors.push(`${label} is required`);
    return errors;
  }
  if (!str) return errors;

  if (rule.type === 'email' && !isValidEmail(str)) {
    errors.push(`${label} must be a valid email`);
  }
  if (rule.type === 'number') {
    const num = Number(str);
    if (!Number.isFinite(num)) {
      errors.push(`${label} must be a number`);
    } else {
      if (rule.min !== undefined && num < rule.min) {
        errors.push(`${label} must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && num > rule.max) {
        errors.push(`${label} must be at most ${rule.max}`);
      }
    }
  }
  if (rule.max && str.length > rule.max) {
    errors.push(`${label} must be ${rule.max} characters or fewer`);
  }
  return errors;
}

/**
 * @param {string} slug
 * @param {Record<string, unknown>} data
 */
export function validateFormSubmission(slug, data) {
  const schema = FORM_SCHEMAS[slug];
  if (!schema) return { ok: false, errors: ['Unknown form'] };

  const errors = [];
  const cleaned = {};

  Object.entries(schema.fields).forEach(([name, rule]) => {
    const label = name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    const fieldErrors = validateField(data[name], rule, label);
    errors.push(...fieldErrors);
    const raw = data[name];
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      cleaned[name] = rule.type === 'number' ? Number(raw) : String(raw).trim();
    }
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: cleaned, site: schema.site };
}

/**
 * @returns {string}
 */
function newSubmissionId() {
  return `sub_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {string} slug
 * @param {{ json: Function, corsHeaders: Function, checkRateLimit: Function }} helpers
 */
export async function handleFormSubmit(request, env, slug, helpers) {
  const { json, corsHeaders, checkRateLimit } = helpers;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(env.WKND_B2B_DATA, ip)) {
    return json({ error: 'Too many requests' }, 429, corsHeaders(request, env));
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, corsHeaders(request, env));
  }

  const rawData = body?.data && typeof body.data === 'object' ? body.data : body;
  if (!rawData || typeof rawData !== 'object') {
    return json({ error: 'Missing form data' }, 400, corsHeaders(request, env));
  }

  const { __id__, ...fields } = rawData;
  const result = validateFormSubmission(slug, fields);
  if (!result.ok) {
    return json({ error: 'Validation failed', details: result.errors }, 400, corsHeaders(request, env));
  }

  const submissionId = newSubmissionId();
  const record = {
    submissionId,
    formSlug: slug,
    site: result.site,
    data: result.data,
    clientId: typeof __id__ === 'string' ? __id__.slice(0, 64) : null,
    hostname: request.headers.get('x-adobe-form-hostname') || '',
    createdAt: new Date().toISOString(),
  };

  await env.WKND_B2B_DATA.put(`form:submission:${slug}:${submissionId}`, JSON.stringify(record));

  const indexKey = `form:index:${slug}`;
  const indexRaw = await env.WKND_B2B_DATA.get(indexKey);
  const index = indexRaw ? JSON.parse(indexRaw) : [];
  index.unshift(submissionId);
  if (index.length > 500) index.length = 500;
  await env.WKND_B2B_DATA.put(indexKey, JSON.stringify(index));

  return json({
    submissionId,
    thankYouMessage: 'Thank you for your submission. Our team will be in touch soon.',
  }, 201, corsHeaders(request, env));
}
