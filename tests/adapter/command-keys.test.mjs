import test from 'node:test';
import assert from 'node:assert/strict';
import { browser, replace } from '../support/fixtures.mjs';
let instance = 0;
const fresh = () => import(`../../src/api/command-keys.ts?instance=${++instance}`);
const storageKey = 'fet3d:learn-command-keys:v1';

test('retry and module reload retain identity, changed intent and success create new keys', async t => {
  browser(t); const keys = await fresh();
  const intent = { resource: 'post', etag: 'v1', payload: { a: 1, b: 2 } };
  const key = keys.commandKey(intent);
  assert.equal(keys.commandKey({ payload: { b: 2, a: 1 }, resource: 'post', etag: 'v1' }), key);
  assert.equal((await fresh()).commandKey(intent), key);
  assert.notEqual(keys.commandKey({ ...intent, etag: 'v2' }), key);
  assert.notEqual(keys.commandKey({ ...intent, payload: { a: 2 } }), key);
  keys.commandDone(intent); assert.notEqual(keys.commandKey(intent), key);
});
test('expired entries disappear on reload and capacity evicts oldest intent', async t => {
  const b = browser(t); replace(t, Date, 'now', () => 1000);
  const keys = await fresh(), first = keys.commandKey({ n: 0 });
  for (let n = 1; n <= 60; n++) keys.commandKey({ n });
  assert.equal(Object.keys(JSON.parse(b.sessionStorage.getItem(storageKey))).length, 60);
  assert.notEqual(keys.commandKey({ n: 0 }), first);
  const before = keys.commandKey({ n: 60 });
  replace(t, Date, 'now', () => 1000 + 24 * 60 * 60 * 1000);
  assert.notEqual((await fresh()).commandKey({ n: 60 }), before);
});
test('corrupt or unavailable storage still supports stable in-memory retries', async t => {
  const b = browser(t); b.sessionStorage.setItem(storageKey, '{broken');
  const keys = await fresh(); const first = keys.commandKey('x');
  b.sessionStorage.fault = new Error('quota');
  assert.equal(keys.commandKey('x'), first);
  keys.commandDone('x'); assert.notEqual(keys.commandKey('x'), first);
});
