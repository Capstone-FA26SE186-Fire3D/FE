import test from 'node:test';
import assert from 'node:assert/strict';
import { readTokens, persistTokens, openSessionChannel, withRefreshLock } from '../../src/features/auth/session-store.ts';
import { browser, deferred, replace } from '../support/fixtures.mjs';
const key = 'fire3d-auth-tokens';
const tokens = { accessToken: 'access', refreshToken: 'refresh' };

test('new cookie replaces legacy copies and logout removes every persisted copy', t => {
  const b = browser(t);
  b.sessionStorage.setItem(key, JSON.stringify({ accessToken: 'old', refreshToken: 'old' }));
  assert.equal(readTokens().accessToken, 'old');
  persistTokens(tokens);
  assert.deepEqual(readTokens(), tokens);
  assert.equal(b.sessionStorage.getItem(key), null);
  assert.match(b.writes.at(-1), /SameSite=Lax; Secure/);
  persistTokens(null);
  assert.equal(readTokens(), null);
});
test('blocked and oversized cookies fall back to local storage; corrupt legacy content is ignored', t => {
  const b = browser(t); b.blockedCookies = true;
  b.sessionStorage.setItem(key, '{bad');
  assert.equal(readTokens(), null);
  persistTokens(tokens);
  assert.deepEqual(JSON.parse(b.localStorage.getItem(key)), tokens);
  b.blockedCookies = false;
  const large = { ...tokens, accessToken: 'x'.repeat(5000) };
  persistTokens(large);
  assert.deepEqual(readTokens(), large);
});
test('write failures do not crash persistence or logout', t => {
  const b = browser(t); b.blockedCookies = true;
  b.localStorage.fault = b.sessionStorage.fault = new Error('blocked');
  assert.doesNotThrow(() => persistTokens(tokens));
  assert.doesNotThrow(() => persistTokens(null));
});
test('session notifications reach peers and close releases listeners', t => {
  const b = browser(t), received = [];
  const first = openSessionChannel(() => assert.fail('sender must not receive its own message'));
  const second = openSessionChannel(value => received.push(value));
  first.post({ type: 'session', tokens });
  first.post({ type: 'logout' });
  assert.deepEqual(received, [{ type: 'session', tokens }, { type: 'logout' }]);
  second.close(); first.post({ type: 'logout' }); first.close();
  assert.equal(received.length, 2); assert.equal(b.channelCount(), 0);
});
test('refresh lock serializes tasks and continues after rejection', async t => {
  browser(t);
  const entered = deferred(), release = deferred(), order = [];
  const first = withRefreshLock(async () => { order.push('first'); entered.resolve(); await release.promise; throw new Error('failed'); });
  const rejection = assert.rejects(first, /failed/);
  await entered.promise;
  const second = withRefreshLock(async () => { order.push('second'); return 'ok'; });
  assert.deepEqual(order, ['first']); release.resolve();
  await rejection; assert.equal(await second, 'ok'); assert.deepEqual(order, ['first', 'second']);
});
test('missing browser locks and broadcast are supported', async t => {
  replace(t, globalThis, 'navigator', {}); replace(t, globalThis, 'BroadcastChannel', undefined);
  assert.equal(await withRefreshLock(() => 42), 42);
  const channel = openSessionChannel(() => assert.fail()); channel.post({ type: 'logout' }); channel.close();
});
