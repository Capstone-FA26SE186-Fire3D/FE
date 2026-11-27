import test from 'node:test';
import assert from 'node:assert/strict';
import { learnAdminApi, parsePost } from '../../src/features/admin-learn/api.ts';
import { libraryApi, libraryAdminApi, parseVersion } from '../../src/features/library/api.ts';
import { mockFetch, json } from '../support/fixtures.mjs';

test('Learn CMS rejects malformed rows and retains post ETag across keyed lifecycle', async t => {
  assert.equal(parsePost({ id: 1 }), null);
  const calls = mockFetch(t, call => {
    if (call.url.pathname.endsWith('/publish')) return json({ id: 'p1', revision: 3, publicationStatus: 'Published' });
    return json({ id: 'p1', revision: 1, publicationStatus: 'Unpublished' }, 201);
  });
  const created = await learnAdminApi.createPost('token', { slug: 'fire', title: 'Fire' }, 'post-create');
  assert.equal(created.etag, '"1"');
  assert.equal(calls[0].headers.get('idempotency-key'), 'post-create');
  const published = await learnAdminApi.publishVersion('token', 'v1', '"2"', 'publish-1');
  assert.equal(published.etag, '"3"');
  assert.equal(calls[1].headers.get('if-match'), '"2"');
  assert.equal(calls[1].headers.get('idempotency-key'), 'publish-1');
  assert.equal(calls[1].url.pathname, '/api/admin/learn/versions/v1/publish');
});

test('Learn source query remains Common and rejects malformed media descriptor', async t => {
  const calls = mockFetch(t, call => call.url.pathname.endsWith('/validate')
    ? json({ provider: 'YouTube' }) : json({ items: [{ id: 'src1', approvalStatus: 'Approved' }, null], total: 2 }));
  const sources = await learnAdminApi.listSources('token', { status: 'Approved', page: 1, pageSize: 10 });
  assert.equal(sources.items.length, 1);
  assert.equal(calls[0].url.searchParams.get('visibility'), 'Common');
  assert.equal(calls[0].url.searchParams.get('status'), 'Approved');
  await assert.rejects(learnAdminApi.validateMedia('token', 'https://example.invalid/video'),
    error => error.code === 'LEARN_MEDIA_MALFORMED');
});

test('Library public list omits admin filters and admin writes carry ETag and key', async t => {
  assert.equal(parseVersion({ id: 'v1', kind: 'Unknown' }), null);
  const calls = mockFetch(t, call => call.url.pathname.endsWith('/items') && call.method === 'GET'
    ? json({ items: [{ id: 'i1', kind: 'Equipment', isActive: true }, { id: 9, kind: 'Equipment' }], total: 2 })
    : json({ id: 'i1', kind: 'Equipment', isActive: false, revision: 3 }));
  const page = await libraryApi.listItems('token', { kind: 'Equipment', page: 2, pageSize: 5 });
  assert.equal(page.items.length, 1);
  assert.equal(calls[0].url.searchParams.get('page'), '2');
  assert.equal(calls[0].url.searchParams.has('search'), false);
  const updated = await libraryAdminApi.updateItem('token', 'i1', { isActive: false }, '"2"', 'item-update');
  assert.equal(updated.etag, '"3"');
  assert.deepEqual(JSON.parse(calls[1].body), { isActive: false });
  assert.equal(calls[1].headers.get('if-match'), '"2"');
  assert.equal(calls[1].headers.get('idempotency-key'), 'item-update');
});
