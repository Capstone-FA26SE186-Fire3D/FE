import test from 'node:test';
import assert from 'node:assert/strict';
import { billingApi } from '../../src/features/billing/api.ts';
import { buildingsApi } from '../../src/features/buildings/api.ts';
import { scenarioEditorApi } from '../../src/features/scenario-editor/api.ts';
import { trainingHistoryApi } from '../../src/features/training-history/api.ts';
import { mockFetch, json } from '../support/fixtures.mjs';

test('billing quotation and checkout retain key, ETag and pending HTTP status', async t => {
  const calls = mockFetch(t, call => {
    if (call.url.pathname.endsWith('/quotations')) return json({ id: 'q-1', revision: 2 }, 201);
    if (call.url.pathname.endsWith('/payos/create')) return json({ id: 'checkout-1', checkoutStatus: 'Pending' }, 202);
    return json({ id: 'q-1', revision: 3 }, 200, { ETag: '"server-3"' });
  });
  const created = await billingApi.createQuotation('token', [{ packageId: 'p1' }], 'intent-1');
  assert.equal(created.etag, '"billing-q1-2"');
  assert.deepEqual(JSON.parse(calls[0].body), { items: [{ packageId: 'p1' }] });
  assert.equal(calls[0].headers.get('idempotency-key'), 'intent-1');
  const updated = await billingApi.updateDraft('token', 'q-1', { items: [] }, created.etag);
  assert.equal(updated.etag, '"server-3"');
  assert.equal(calls[1].headers.get('if-match'), created.etag);
  assert.equal(calls[1].method, 'PATCH');
  const checkout = await billingApi.createCheckout('token', 'q-1', 'intent-2');
  assert.equal(checkout.httpStatus, 202);
  assert.equal(checkout.checkout.checkoutStatus, 'Pending');
  assert.deepEqual(JSON.parse(calls[2].body), { quotationId: 'q-1' });
  assert.equal(calls[2].headers.get('idempotency-key'), 'intent-2');
});

test('building creation carries tenant in body and IFC process stays keyed', async t => {
  const calls = mockFetch(t, () => json({ id: 'b1' }, 200, { ETag: '"b-v1"' }));
  const created = await buildingsApi.create('token', { name: 'Tower' }, 'create-1', 'org-1');
  assert.equal(created.etag, '"b-v1"');
  assert.deepEqual(JSON.parse(calls[0].body), { name: 'Tower', organizationId: 'org-1' });
  assert.equal(calls[0].url.search, '');
  assert.equal(calls[0].headers.get('idempotency-key'), 'create-1');
  await buildingsApi.update('token', 'b1', { name: 'Tower 2' }, '"b-v1"', 'org-1');
  assert.equal(calls[1].method, 'PUT');
  assert.equal(calls[1].url.searchParams.get('organizationId'), 'org-1');
  assert.equal(calls[1].headers.get('if-match'), '"b-v1"');
  await buildingsApi.processRevision('token', 'r1', 'process-1');
  assert.equal(calls[2].url.pathname, '/api/revisions/r1/process');
  assert.equal(calls[2].headers.get('idempotency-key'), 'process-1');
});

test('scenario editor preserves server ETag and never guesses a missing PUT revision', async t => {
  const calls = mockFetch(t, call => {
    if (call.method === 'PUT') return new Response(null, { status: 204 });
    if (call.url.pathname.endsWith('/validate-state')) return json({ isValid: false, issues: [{ code: 'FIELD_REQUIRED', path: '$.geometry' }] });
    return json({ id: 'd1', state: {}, version: 4 }, 200, { ETag: '"4"' });
  });
  assert.equal((await scenarioEditorApi.getDraft('token', 'd1')).etag, '"4"');
  assert.deepEqual(await scenarioEditorApi.putDraft('token', 'd1', { name: 'Scenario' }, '"4"'), { etag: null });
  assert.equal(calls[1].headers.get('if-match'), '"4"');
  assert.deepEqual(JSON.parse(calls[1].body), { name: 'Scenario' });
  const validation = await scenarioEditorApi.validateState('token', 'd1', { schemaVersion: 'fet3d.editor/1' });
  assert.equal(validation.isValid, false);
  assert.equal(calls[2].method, 'POST');
  assert.equal(calls[2].headers.has('if-match'), false);
});

test('training history maps only RESULT_NOT_READY to state and rejects malformed success', async t => {
  const calls = mockFetch(t, call => {
    if (call.url.pathname.endsWith('/result')) return json({ code: 'RESULT_NOT_READY', title: 'Not ready' }, 409);
    return json({ id: 's1', status: 'Prepared' });
  });
  assert.deepEqual(await trainingHistoryApi.result('token', 's/1'), { kind: 'not-ready' });
  assert.equal(calls[0].url.pathname, '/api/training/sessions/s%2F1/result');
  assert.equal((await trainingHistoryApi.state('token', 's1')).status, 'Prepared');
  mockFetch(t, () => json({ id: 5 }, 200));
  await assert.rejects(trainingHistoryApi.state('token', 's1'), error => error.code === 'INVALID_SESSION_STATE');
});
