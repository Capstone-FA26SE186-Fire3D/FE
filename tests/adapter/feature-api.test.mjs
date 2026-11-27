import test from 'node:test';
import assert from 'node:assert/strict';
import { playtestApi } from '../../src/features/playtest/api.ts';
import { qrLandingApi } from '../../src/features/qr-landing/api.ts';
import { learnApi } from '../../src/features/learn/api.ts';
import { orgAiApi } from '../../src/features/org-ai/api.ts';
import { expertReviewsApi } from '../../src/features/expert-reviews/api.ts';
import { mockFetch, json } from '../support/fixtures.mjs';

test('playtest prepare pins version and idempotency; web only requests handoff and cancel', async t => {
  const calls = mockFetch(t);
  await playtestApi.prepare('token', 'scenario-1', 'building-1', { revisionId: 'revision-1', scenarioVersionId: 'version-1' }, 'key-1');
  await playtestApi.createHandoff('token', 'playtest-1', 'key-2');
  await playtestApi.cancel('token', 'playtest-1', 'key-3');
  assert.equal(calls[0].url.pathname, '/api/scenarios/scenario-1/playtests');
  assert.equal(calls[0].url.searchParams.get('buildingId'), 'building-1');
  assert.deepEqual(JSON.parse(calls[0].body), { revisionId: 'revision-1', scenarioVersionId: 'version-1' });
  assert.deepEqual(calls.map(c => c.headers.get('idempotency-key')), ['key-1', 'key-2', 'key-3']);
  assert.deepEqual(calls.map(c => c.url.pathname), ['/api/scenarios/scenario-1/playtests', '/api/playtests/playtest-1/handoffs', '/api/playtests/playtest-1/cancel']);
  assert.ok(calls.every(c => c.headers.get('authorization') === 'Bearer token'));
});

test('Learn list keeps repeated filters and discards malformed response rows', async t => {
  const calls = mockFetch(t, () => json({ items: [null, { id: 'post-1', slug: 'fire', kind: 'Tip', title: 'Fire' }, { id: 9, slug: 'bad' }], total: 9, page: 2, pageSize: 5 }));
  const page = await learnApi.posts({ search: '  fire  ', situations: ['school', 'home'], kinds: ['Tip', 'Video'], page: 2, pageSize: 5 });
  assert.equal(page.items.length, 1); assert.equal(page.total, 9);
  assert.equal(calls[0].url.searchParams.get('search'), 'fire');
  assert.deepEqual(calls[0].url.searchParams.getAll('situation'), ['school', 'home']);
  assert.deepEqual(calls[0].url.searchParams.getAll('kind'), ['Tip', 'Video']);
  assert.equal(calls[0].headers.has('authorization'), false);
});

test('Learn bookmark retry uses desired state even when server returns an empty body', async t => {
  const calls = mockFetch(t, () => new Response(null, { status: 204 }));
  assert.deepEqual(await learnApi.bookmark('token', 'post/a'), { postId: 'post/a', bookmarked: true });
  assert.deepEqual(await learnApi.unbookmark('token', 'post/a'), { postId: 'post/a', bookmarked: false });
  assert.deepEqual(calls.map(c => c.method), ['PUT', 'DELETE']);
  assert.ok(calls.every(c => c.url.pathname.endsWith('/post%2Fa')));
});

test('AI submits one keyed request and looks up unknown outcome by request id', async t => {
  const calls = mockFetch(t);
  const input = { text: 'where is exit?' };
  await orgAiApi.submitAnswer('token', input, 'intent-1');
  await orgAiApi.getRequest('token', 'req/1');
  assert.equal(calls[0].url.pathname, '/api/ai/organization/answer');
  assert.deepEqual(JSON.parse(calls[0].body), input);
  assert.equal(calls[0].headers.get('idempotency-key'), 'intent-1');
  assert.equal(calls[1].url.pathname, '/api/ai/requests/req%2F1');
  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[1].headers.has('idempotency-key'), false);
});

test('expert decision carries ETag and key, trims rejection reason, and approve has no body', async t => {
  const calls = mockFetch(t);
  await expertReviewsApi.decide('token', 'reject', 'review/1', '"4"', 'intent-1', '  missing exit  ');
  await expertReviewsApi.decide('token', 'approve', 'review/2', '"5"', 'intent-2');
  assert.equal(calls[0].url.pathname, '/api/expert/reviews/review%2F1/reject');
  assert.equal(calls[0].headers.get('if-match'), '"4"');
  assert.equal(calls[0].headers.get('idempotency-key'), 'intent-1');
  assert.deepEqual(JSON.parse(calls[0].body), { reason: 'missing exit' });
  assert.equal(calls[1].body, undefined);
});

test('QR sends code once in JSON body; resolution token stays in path', async t => {
  const calls = mockFetch(t);
  await qrLandingApi.resolve('token', 'opaque');
  await qrLandingApi.verifyParticipation('token', 'building-1', 'private-code');
  assert.equal(calls[0].url.pathname, '/api/qr/opaque');
  assert.equal(calls[0].url.search, '');
  assert.deepEqual(JSON.parse(calls[1].body), { code: 'private-code' });
  assert.equal(calls[1].url.search, '');
  assert.equal(calls[1].headers.has('idempotency-key'), false);
});
