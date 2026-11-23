/*
 * Email preferences: separate, explicit opt-ins (Spam Act 2003 express consent), each unticked
 * unless the customer turns it on and saved on its own. The Commerce backend records every change
 * with the wording version shown here. Options the backend does not support stay hidden.
 */
import { CORE_FETCH_GRAPHQL } from '../../scripts/commerce.js';

// Bump a version whenever its wording in commerce-account.js changes (consent evidence).
const PURPOSES = {
  recovery: {
    field: 'wknd_recovery_email_opt_in',
    mutation: 'setWkndRecoveryEmailOptIn',
    wordingVersion: 'recovery-2026-11-23',
    on: 'Cart reminders are on — at most one per period of inactivity.',
    off: 'Cart reminders are off.',
  },
  audience: {
    field: 'wknd_marketing_email_opt_in',
    mutation: 'setWkndMarketingEmailOptIn',
    wordingVersion: 'news-offers-2026-11',
    on: 'You’ll get WKND news & offers by email.',
    off: 'WKND news & offers emails are off.',
  },
};

async function request(query, variables) {
  const { data, errors } = await CORE_FETCH_GRAPHQL.fetchGraphQl(query, { method: 'POST', variables });
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

/** Current preferences for the purposes this backend supports (newest first, then fallback). */
async function readPreferences() {
  const attempts = [['recovery', 'audience'], ['recovery']];
  for (let i = 0; i < attempts.length; i += 1) {
    const purposes = attempts[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const customer = (await request(`query WkndEmailPreferences { customer { ${purposes.map((p) => PURPOSES[p].field).join(' ')} } }`))?.customer;
      const values = Object.fromEntries(purposes.map((p) => [p, customer?.[PURPOSES[p].field]]));
      if (Object.values(values).every((v) => typeof v === 'boolean')) return values;
    } catch (e) {
      // older backend: retry with fewer purposes
    }
  }
  return null;
}

/**
 * @param {Element} $section the (hidden) preferences section
 */
export default async function initEmailPreferences($section) {
  const values = await readPreferences();
  if (!values) return;
  const $status = $section.querySelector('.account__preference-status');

  Object.entries(values).forEach(([purpose, optedIn]) => {
    const def = PURPOSES[purpose];
    const $label = $section.querySelector(`.account__preference[data-purpose="${purpose}"]`);
    const $input = $label?.querySelector('input[type="checkbox"]');
    if (!$input) return;
    $label.hidden = false;
    $input.checked = optedIn;
    $input.addEventListener('change', async () => {
      const wanted = $input.checked;
      $input.disabled = true;
      $status.textContent = 'Saving…';
      try {
        const query = `mutation SetWkndEmailPreference($optIn: Boolean!, $wording: String) {
          ${def.mutation}(opt_in: $optIn, wording_version: $wording, source: WEB) }`;
        const variables = { optIn: wanted, wording: def.wordingVersion };
        const saved = (await request(query, variables))?.[def.mutation];
        $input.checked = saved === true;
        $status.textContent = saved ? def.on : def.off;
      } catch (e) {
        $input.checked = !wanted;
        $status.textContent = 'We couldn’t save your preference. Please try again.';
      } finally {
        $input.disabled = false;
      }
    });
  });
  $section.hidden = false;
}
