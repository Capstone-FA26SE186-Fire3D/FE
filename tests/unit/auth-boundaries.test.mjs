import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRole, roleToApiName } from '../../src/features/auth/roles.ts';
import { safeNext, postLoginRoute, dashboardRouteFor } from '../../src/features/auth/redirect.ts';
import { accessTokenExpiry } from '../../src/features/auth/token-expiry.ts';

test('supported roles round trip between wire names and numeric state', () => {
  ['PlatformAdmin', 'OrganizationUser', 'Trainee', 'FireSafetyExpert'].forEach((name, role) => {
    assert.equal(normalizeRole(name), role); assert.equal(normalizeRole(role), role); assert.equal(roleToApiName(role), name);
  });
  for (const invalid of [null, '', 4, -1, 'Admin', '1', {}]) assert.throws(() => normalizeRole(invalid));
});
test('redirect rejects external or malformed paths and enforces role and first-login flow', () => {
  for (const path of ['https://evil.test', '//evil.test', '/\\evil', '/%2f%2fevil', '/unknown']) assert.equal(safeNext(path), '/learning-hub');
  assert.equal(safeNext('/learn?search=fire#top'), '/learn?search=fire#top');
  assert.equal(postLoginRoute({ role: 2 }, '/admin/accounts'), '/learning-hub');
  assert.equal(postLoginRoute({ role: 3 }, '/expert/reviews'), '/expert/reviews');
  assert.equal(postLoginRoute({ role: 1, firstLoginStep: 'ChangePassword' }, '/learn'), '/workspace/buildings');
  assert.equal(dashboardRouteFor({ role: 0 }), '/admin/overview');
});
test('JWT expiry is only a display hint and malformed payloads remain unreadable', () => {
  const token = body => `header.${Buffer.from(JSON.stringify(body)).toString('base64url')}.signature`;
  assert.equal(accessTokenExpiry(token({ exp: 123 })), 123000);
  for (const value of ['', 'bad', 'h.bad.s', token({ exp: '123' }), token({})]) assert.equal(accessTokenExpiry(value), null);
});
