/*
 * Cart-reminder email preference (explicit opt-in, off unless the customer turns it on).
 * Reads/writes Customer.wknd_recovery_email_opt_in through the Commerce backend; the section stays
 * hidden when the backend does not support it. Independent of orders and checkout.
 */
import { CORE_FETCH_GRAPHQL } from '../../scripts/commerce.js';

const READ = 'query WkndEmailPreference { customer { wknd_recovery_email_opt_in } }';
const WRITE = 'mutation SetWkndEmailPreference($optIn: Boolean!) { setWkndRecoveryEmailOptIn(opt_in: $optIn) }';

async function request(query, variables) {
  const { data, errors } = await CORE_FETCH_GRAPHQL.fetchGraphQl(query, { method: 'POST', variables });
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

/**
 * @param {Element} $section the (hidden) preferences section
 */
export default async function initEmailPreferences($section) {
  let optedIn;
  try {
    optedIn = (await request(READ))?.customer?.wknd_recovery_email_opt_in;
  } catch (e) {
    return;
  }
  if (typeof optedIn !== 'boolean') return;
  const $input = $section.querySelector('input[type="checkbox"]');
  const $status = $section.querySelector('.account__preference-status');
  $input.checked = optedIn;
  $section.hidden = false;
  $input.addEventListener('change', async () => {
    const wanted = $input.checked;
    $input.disabled = true;
    $status.textContent = 'Saving…';
    try {
      const saved = (await request(WRITE, { optIn: wanted }))?.setWkndRecoveryEmailOptIn;
      $input.checked = saved === true;
      $status.textContent = saved ? 'You’ll get at most one reminder per cart.' : 'Cart reminders are off.';
    } catch (e) {
      $input.checked = !wanted;
      $status.textContent = 'We couldn’t save your preference. Please try again.';
    } finally {
      $input.disabled = false;
    }
  });
}
