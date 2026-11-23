// Unit tests for the LLM shop widget offer state (run: npm run test:llmapp-shop).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerState, offerCopy } from '../../scripts/llmapp-shop.js';
import { previewSample, SAMPLE_CART } from '../../scripts/llmapp-shop-samples.js';

const aud = (value) => ({ value, currency: 'AUD' });
const offer = (overrides = {}) => ({
  kind: 'welcome_back',
  status: 'ELIGIBLE',
  saving: aud(25),
  current_saving: aud(20),
  percent_off: 10,
  max_discount: aud(25),
  expires_at: '2026-12-01T09:00:00.000Z',
  replaces_code: 'TRAILREADY',
  ...overrides,
});
const UNAVAILABLE = 'The welcome-back offer can’t be checked right now. Please try again shortly.';

test('ELIGIBLE and CLAIMED offers that save more are actionable', () => {
  ['ELIGIBLE', 'CLAIMED'].forEach((status) => {
    const state = offerState(offer({ status }));
    assert.equal(state.kind, 'actionable');
    assert.deepEqual(state.saving, aud(25));
    assert.deepEqual(state.current, aud(20));
    assert.equal(state.replaces, 'TRAILREADY');
  });
});

test('no offer, other statuses and unknown statuses render nothing', () => {
  [null, undefined, 'x', {}, offer({ status: 'INELIGIBLE' }), offer({ status: 'REDEEMED' }),
    offer({ status: 'SIGN_IN_REQUIRED' }), offer({ status: 'SOMETHING_NEW' }), offer({ status: undefined })]
    .forEach((value) => assert.equal(offerState(value), null, JSON.stringify(value)));
});

test('zero or equal savings render nothing (strictly greater only)', () => {
  assert.equal(offerState(offer({ saving: aud(0), current_saving: aud(0) })), null);
  assert.equal(offerState(offer({ saving: aud(20), current_saving: aud(20) })), null);
  assert.equal(offerState(offer({ saving: aud(19.99), current_saving: aud(20) })), null);
});

test('UNAVAILABLE is an explicit non-actionable state with the tool message', () => {
  assert.deepEqual(
    offerState({ kind: 'welcome_back', status: 'UNAVAILABLE', message: 'Shop says: try later.' }),
    { kind: 'unavailable', message: 'Shop says: try later.' },
  );
  assert.deepEqual(offerState({ status: 'UNAVAILABLE' }), { kind: 'unavailable', message: UNAVAILABLE });
});

test('malformed ELIGIBLE/CLAIMED money is unavailable, never coerced or defaulted', () => {
  const malformed = [
    { current_saving: undefined }, // missing current saving is not treated as 0
    { current_saving: null },
    { saving: null },
    { saving: { value: '25', currency: 'AUD' } }, // string value
    { current_saving: { value: '20', currency: 'AUD' } },
    { saving: { value: Number.NaN, currency: 'AUD' } },
    { saving: { value: Infinity, currency: 'AUD' } },
    { saving: aud(-1) },
    { saving: { value: 25 } }, // missing currency
    { saving: { value: 25, currency: 'aud' } }, // not an ISO code
    { saving: { value: 25, currency: 'NZD' } }, // currency mismatch
  ];
  malformed.forEach((overrides) => {
    assert.deepEqual(
      offerState(offer(overrides)),
      { kind: 'unavailable', message: UNAVAILABLE },
      JSON.stringify(overrides),
    );
  });
});

test('amounts keep their own currency', () => {
  const nzd = (value) => ({ value, currency: 'NZD' });
  const state = offerState(offer({
    saving: nzd(25), current_saving: nzd(0), max_discount: nzd(25),
  }));
  assert.equal(state.kind, 'actionable');
  assert.equal(state.saving.currency, 'NZD');
  assert.deepEqual(state.max, nzd(25));
});

test('a cap in another currency or a malformed percent is left out of the terms', () => {
  const state = offerState(offer({ max_discount: { value: 25, currency: 'USD' }, percent_off: '10' }));
  assert.equal(state.max, null);
  assert.equal(state.percent, null);
});

test('welcome-back copy is unchanged; a missing kind is the welcome-back offer', () => {
  [offer({ expires_at: null }), offer({ kind: undefined, expires_at: null })].forEach((value) => {
    assert.deepEqual(offerCopy(value), {
      label: 'Welcome-back offer',
      eyebrow: 'Welcome back',
      title: 'Save $25.00 on this cart',
      details: '10% off your gear, up to $25. One use per account. Replaces code TRAILREADY.',
      claimable: true,
    });
  });
});

test('the climbing planner offer is worded as automatic, with no claim step', () => {
  const copy = offerCopy(offer({
    kind: 'climbing_planner', current_saving: aud(0), expires_at: null, replaces_code: null,
  }));
  assert.equal(copy.eyebrow, 'Climbing planner');
  assert.equal(copy.details, '10% off selected climbing gear, up to $25. Applied automatically while your cart qualifies — no code needed.');
  assert.equal(copy.claimable, false);
});

test('an offer kind the widget cannot word is not shown', () => {
  assert.equal(offerCopy(offer({ kind: 'mystery' })), null);
  assert.equal(offerCopy({ kind: 'climbing_planner', status: 'UNAVAILABLE' }), null);
});

test('preview scenarios: default samples, consistent planner fixtures, unknown names fail', () => {
  const host = (previewScenario) => ({ hostContext: { preview: true, previewScenario } });
  assert.equal(previewSample('cart', host()), SAMPLE_CART);

  const cart = previewSample('cart', host('planner-offer'));
  const subtotal = cart.cart.lines.reduce((sum, l) => sum + l.row_total.value, 0);
  assert.equal(cart.cart.totals.subtotal.value, subtotal);
  assert.deepEqual(cart.offer.saving, aud(Math.min(subtotal * 0.1, cart.offer.max_discount.value)));
  assert.equal(offerState(cart.offer).kind, 'actionable');

  const checkout = previewSample('checkout', host('planner-offer'));
  const t = checkout.cart.totals;
  const discounts = t.discounts.reduce((sum, d) => sum + d.amount.value, 0);
  assert.equal(t.subtotal.value - discounts + t.shipping.value, t.grand_total.value);
  assert.equal(checkout.cart.offer_applied, false);

  ['cart', 'checkout'].forEach((view) => {
    assert.equal(offerState(previewSample(view, host('planner-offer-unavailable')).offer).kind, 'unavailable');
  });
  assert.throws(() => previewSample('cart', host('nope')), /no "nope" preview scenario/);
  assert.doesNotMatch(JSON.stringify([cart, checkout]), /RECOVER10/i);
});
