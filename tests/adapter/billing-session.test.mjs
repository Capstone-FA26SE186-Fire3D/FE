import test from 'node:test';
import assert from 'node:assert/strict';
import { browser, replace } from '../support/fixtures.mjs';
import { savePendingCheckout, readPendingCheckout, clearPendingCheckout } from '../../src/features/billing/pending-payment.ts';

const checkout = { checkoutId: 'c1', paymentRequestId: 'p1', quotationId: 'q1', returnTo: '/workspace/billing' };

test('checkout return remembers identity but never treats the redirect as payment proof', t => {
  const state = browser(t);
  replace(t, Date, 'now', () => 123456);
  savePendingCheckout(checkout);
  assert.deepEqual(readPendingCheckout(), { ...checkout, savedAt: 123456 });
  clearPendingCheckout(); assert.equal(readPendingCheckout(), null);
  assert.equal(state.localStorage.getItem('fet3d:billing:pending-checkout:v1'), null);
});

test('checkout resume rejects external redirects and corrupt storage safely', t => {
  const state = browser(t);
  const key = 'fet3d:billing:pending-checkout:v1';
  state.localStorage.setItem(key, JSON.stringify({ ...checkout, returnTo: '//evil.invalid' }));
  assert.equal(readPendingCheckout(), null);
  state.localStorage.setItem(key, JSON.stringify({ ...checkout, returnTo: 'https://evil.invalid' }));
  assert.equal(readPendingCheckout(), null);
  state.localStorage.setItem(key, '{bad'); assert.equal(readPendingCheckout(), null);
  state.localStorage.fault = new Error('storage disabled');
  assert.doesNotThrow(() => savePendingCheckout(checkout));
  assert.equal(readPendingCheckout(), null);
  assert.doesNotThrow(clearPendingCheckout);
});
