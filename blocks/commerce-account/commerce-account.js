/*
 * WKND account (/account) — overview, order history and saved addresses (Adobe Commerce account
 * drop-in). Customers sign in with the WKND account shared with WKND Aero (Auth0).
 * Authoring: none. The page paints from the cached account state (no flash of the sign-in
 * prompt for returning customers); the session is restored and the drop-ins load afterwards.
 */
import { getAccountState, setAccountState } from '../../scripts/account-state.js';
import { shopPromises } from '../../scripts/shop-promises.js';
import { shopStylesReady } from '../../scripts/shop-styles.js';

const ICONS = {
  orders: '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  checkout: '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
  addresses: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  aero: '<path d="M3 13.5 21 6l-3 13-6-5-4 4v-6z"/>',
};

const BENEFITS = [
  ['orders', 'Track your orders', 'Order history and status for all your WKND gear'],
  ['checkout', 'Faster checkout', 'Your details and addresses filled in for you'],
  ['addresses', 'Saved addresses', 'Ship to home, the office or basecamp'],
  ['aero', 'One WKND account', 'The same sign-in works for WKND Aero bookings'],
];

function benefitsList() {
  const ul = document.createElement('ul');
  ul.className = 'shop-promises account__benefits';
  BENEFITS.forEach(([icon, title, caption]) => {
    const li = document.createElement('li');
    li.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[icon]}</svg><span><strong></strong></span>`;
    li.querySelector('strong').textContent = title;
    li.querySelector('span').append(caption);
    ul.append(li);
  });
  return ul;
}

function renderSignedOut(block, { expired = false } = {}) {
  const fragment = document.createRange().createContextualFragment(`
    <div class="account__signin">
      <div class="account__signin-card">
        <p class="shop-eyebrow">WKND account</p>
        <h2>${expired ? 'Please sign in again' : 'Sign in to your account'}</h2>
        <p>${expired ? 'Your session has ended.' : 'New to WKND? Create an account in a minute.'} Sign in to see your orders and saved addresses.</p>
        <div class="account__signin-actions">
          <button type="button" class="button primary" data-action="signin">Sign in</button>
          <button type="button" class="button secondary" data-action="signup">Create account</button>
        </div>
        <p class="account__error" role="alert"></p>
      </div>
    </div>`);
  fragment.querySelector('.account__signin').append(benefitsList());
  const error = fragment.querySelector('.account__error');
  fragment.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      error.textContent = '';
      button.disabled = true;
      try {
        const shopAuth = await import('../../scripts/shop-auth.js');
        await shopAuth.signInToShop({ signup: button.dataset.action === 'signup', surface: 'account' });
        window.location.reload();
      } catch (e) {
        error.textContent = e?.message && !/cancel|closed/i.test(e.message)
          ? e.message
          : 'Sign-in was cancelled. Try again when you are ready.';
      } finally {
        button.disabled = false;
      }
    });
  });
  block.classList.remove('commerce-account--signed-in');
  block.replaceChildren(fragment);
}

function renderSignedInShell(block, state) {
  const fragment = document.createRange().createContextualFragment(`
    <div class="account__layout">
      <aside class="account__aside">
        <div class="account__profile">
          <span class="account__avatar" aria-hidden="true"></span>
          <div>
            <p class="account__name"></p>
            <p class="account__email"></p>
          </div>
        </div>
        <nav class="account__nav" aria-label="Account sections">
          <ul>
            <li><a href="#overview">Overview</a></li>
            <li><a href="#orders">Orders</a></li>
            <li><a href="#addresses">Saved addresses</a></li>
          </ul>
        </nav>
        <button type="button" class="button secondary account__signout">Sign out</button>
      </aside>
      <div class="account__content">
        <section id="overview" class="account__section" aria-labelledby="account-overview-title">
          <h2 id="account-overview-title">Overview</h2>
          <dl class="account__details">
            <div><dt>Name</dt><dd class="account__detail-name">—</dd></div>
            <div><dt>Email</dt><dd class="account__detail-email">—</dd></div>
            <div><dt>Sign-in</dt><dd>WKND account (also used for WKND Aero)</dd></div>
          </dl>
        </section>
        <section id="orders" class="account__section" aria-labelledby="account-orders-title">
          <h2 id="account-orders-title">Orders</h2>
          <div class="account__orders"><p class="account__loading">Loading your orders…</p></div>
        </section>
        <section id="addresses" class="account__section" aria-labelledby="account-addresses-title">
          <h2 id="account-addresses-title">Saved addresses</h2>
          <div class="account__addresses"><p class="account__loading">Loading your addresses…</p></div>
        </section>
        <section id="preferences" class="account__section" aria-labelledby="account-preferences-title" hidden>
          <h2 id="account-preferences-title">Email preferences</h2>
          <p class="account__preference-intro">Choose the emails you’d like from WKND Adventures. Each one is optional and off unless you turn it on.</p>
          <label class="account__preference" data-purpose="recovery">
            <input type="checkbox" name="recovery-email">
            <span><strong>Cart reminders</strong> Email me a reminder if I leave gear in my cart — at most one per cart, sometimes with a one-off offer.</span>
          </label>
          <label class="account__preference" data-purpose="audience" hidden>
            <input type="checkbox" name="marketing-email">
            <span><strong>WKND news &amp; offers</strong> Email me gear offers, trip ideas and member deals from WKND Adventures. These may be tailored to what I browse and buy on WKND websites and apps.</span>
          </label>
          <p class="account__preference-status" role="status" aria-live="polite"></p>
          <p class="account__preference-note">You can change your mind at any time here or with the unsubscribe link in every email — unsubscribing stops all marketing email from us. We use your email address and activity as described in our <a href="/privacy">Privacy Policy</a>. This is a demo store.</p>
        </section>
      </div>
    </div>`);
  fragment.querySelector('.account__avatar').textContent = state.initials;
  fragment.querySelector('.account__name').textContent = state.firstName || 'Your account';
  fragment.querySelector('#overview').append(shopPromises(['shipping', 'warranty', 'tested']));
  fragment.querySelector('.account__signout').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const shopAuth = await import('../../scripts/shop-auth.js');
    shopAuth.signOutOfShop({ surface: 'account' });
  });
  block.classList.add('commerce-account--signed-in');
  block.replaceChildren(fragment);
}

async function hydrate(block) {
  const [commerce, shopAuth] = await Promise.all([
    import('../../scripts/commerce.js'),
    import('../../scripts/shop-auth.js'),
  ]);
  const { initializeCommerce, getProductLink, SHOP_PATHS } = commerce;
  await initializeCommerce();
  if (!await shopAuth.restoreShopSession().catch(() => false)) {
    renderSignedOut(block, { expired: true });
    return;
  }

  shopAuth.getShopProfile().then((profile) => {
    if (!profile) return;
    const state = setAccountState(profile);
    block.querySelector('.account__avatar').textContent = state.initials;
    const realName = (v) => (v && !v.includes('@') ? v : '');
    const name = realName([profile.given_name, profile.family_name].filter(Boolean).join(' '))
      || realName(profile.name) || realName(profile.nickname);
    block.querySelector('.account__name').textContent = name || 'Your account';
    block.querySelector('.account__email').textContent = profile.email || '';
    block.querySelector('.account__detail-name').textContent = name || '—';
    block.querySelector('.account__detail-email').textContent = profile.email || '—';
  });

  import('./email-preferences.js')
    .then(({ default: init }) => init(block.querySelector('#preferences')))
    .catch(() => {});

  await import('../../scripts/initializers/account.js');
  const [
    { render: AccountProvider }, { default: OrdersList }, { default: Addresses },
    { tryRenderAemAssetsImage }, { events },
  ] = await Promise.all([
    import('@dropins/storefront-account/render.js'),
    import('@dropins/storefront-account/containers/OrdersList.js'),
    import('@dropins/storefront-account/containers/Addresses.js'),
    import('@dropins/tools/lib/aem/assets.js'),
    import('@dropins/tools/event-bus.js'),
  ]);
  const $orders = block.querySelector('.account__orders');
  const $addresses = block.querySelector('.account__addresses');
  $orders.replaceChildren();
  $addresses.replaceChildren();

  await Promise.all([
    AccountProvider.render(OrdersList, {
      minifiedView: false,
      withHeader: false,
      routeOrderDetails: (orderNumber) => `${SHOP_PATHS.order}?orderRef=${encodeURIComponent(orderNumber)}`,
      routeReturnDetails: () => SHOP_PATHS.account,
      routeOrderProduct: (item) => getProductLink(item?.product?.urlKey),
      slots: {
        OrderItemImage: (ctx) => {
          const { data, defaultImageProps } = ctx;
          tryRenderAemAssetsImage(ctx, {
            alias: data.product?.sku,
            imageProps: defaultImageProps,
            params: { width: defaultImageProps.width, height: defaultImageProps.height },
          });
        },
      },
    })($orders),
    AccountProvider.render(Addresses, { minifiedView: false, withHeader: false })($addresses),
  ]);

  events.on('authenticated', (signedIn) => {
    if (!signedIn) window.location.reload();
  });
  // in-page anchors (#orders) target sections that only exist after decoration
  document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
}

/** Cached account state; sessions from before it existed are verified by hydrate(). */
function knownAccount() {
  const state = getAccountState();
  if (state) return state;
  let hinted = document.cookie.split('; ').some((c) => c.startsWith('auth_dropin_user_token='));
  try {
    hinted ||= localStorage.getItem('wknd:signed-in') === '1';
  } catch { /* storage unavailable */ }
  return hinted ? { firstName: '', initials: '' } : null;
}

export default async function decorate(block) {
  const state = knownAccount();
  await shopStylesReady();
  if (!state) {
    renderSignedOut(block);
    return;
  }
  renderSignedInShell(block, state);
  // Don't await: the section is revealed when decorate() resolves
  hydrate(block).catch((e) => {
    // eslint-disable-next-line no-console
    console.error('commerce-account', e);
  });
}
