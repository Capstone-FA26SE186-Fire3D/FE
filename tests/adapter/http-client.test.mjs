import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, buildUrl } from '../../src/api/client.ts';
import { mockFetch, json } from '../support/fixtures.mjs';

test('query keeps false/zero, repeated values and existing query; omits nullish entries', () => {
  const url = new URL(buildUrl('/items?existing=yes', { q: 'a & b', page: 0, enabled: false, tag: ['one', 'two'], absent: null }), 'https://test.invalid');
  assert.equal(url.searchParams.get('q'), 'a & b');
  assert.equal(url.searchParams.get('page'), '0');
  assert.equal(url.searchParams.get('enabled'), 'false');
  assert.deepEqual(url.searchParams.getAll('tag'), ['one', 'two']);
  assert.equal(url.searchParams.has('absent'), false);
});
test('JSON request carries caller identity, concurrency and retry headers plus abort signal', async t => {
  const calls = mockFetch(t, () => json({ id: 'saved' }, 201, { ETag: 'v2' }));
  const signal = new AbortController().signal;
  const result = await apiClient.requestWithMeta('/items', { json: { a: 1 }, idempotencyKey: 'intent-1', ifMatch: 'v1', headers: { Authorization: 'Bearer test' }, signal });
  assert.deepEqual(result.data, { id: 'saved' });
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('etag'), 'v2');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body, '{"a":1}');
  assert.equal(calls[0].cache, 'no-store');
  assert.equal(calls[0].signal, signal);
  for (const [key, value] of Object.entries({ authorization: 'Bearer test', 'idempotency-key': 'intent-1', 'if-match': 'v1', 'content-type': 'application/json' })) assert.equal(calls[0].headers.get(key), value);
});
test('FormData retains browser boundary and ambiguous body is rejected before sending', async t => {
  const calls = mockFetch(t);
  const body = new FormData(); body.append('file', new Blob(['x']), 'x.ifc');
  await apiClient.request('/upload', { body });
  assert.equal(calls[0].body, body);
  assert.equal(calls[0].headers.has('content-type'), false);
  await assert.rejects(apiClient.request('/bad', { body, json: {} }), TypeError);
  assert.equal(calls.length, 1);
});
test('empty and malformed JSON responses preserve observable status and body', async t => {
  const responses = [new Response(null, { status: 204 }), new Response('', { headers: { 'content-type': 'application/json' } }), new Response('<html>', { headers: { 'content-type': 'application/json' } })];
  mockFetch(t, () => responses.shift());
  assert.equal(await apiClient.request('/empty'), undefined);
  assert.equal(await apiClient.request('/empty-json'), undefined);
  assert.equal(await apiClient.request('/proxy'), '<html>');
});
test('failure retains conflict ETag and retry metadata; network failure is not silently retried', async t => {
  const calls = mockFetch(t, () => json({ code: 'CONFLICT', detail: 'changed' }, 412, { ETag: 'new', 'Retry-After': '3' }));
  await assert.rejects(apiClient.request('/conflict'), e => e.status === 412 && e.code === 'CONFLICT' && e.headers.get('etag') === 'new' && e.retryAfterSeconds === 3);
  assert.equal(calls.length, 1);
  const failure = new DOMException('cancelled', 'AbortError');
  mockFetch(t, () => { throw failure; });
  await assert.rejects(apiClient.request('/abort'), e => e === failure);
});
