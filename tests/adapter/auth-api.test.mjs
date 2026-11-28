import test from 'node:test';
import assert from 'node:assert/strict';
import { authApi, firstLoginChallengeOf } from '../../src/features/auth/api.ts';
import { mockFetch, json } from '../support/fixtures.mjs';

const user = { id: 'u1', role: 'FireSafetyExpert', gender: 'Female' };
const session = { accessToken: 'access', refreshToken: 'refresh', user };

test('login normalizes server role/gender and rejects an incomplete session', async t => {
  mockFetch(t, () => json(session));
  const result = await authApi.login('a@test.invalid', 'password');
  assert.equal(result.user.role, 3); assert.equal(result.user.gender, 1);
  mockFetch(t, () => json({ ...session, refreshToken: '' }));
  await assert.rejects(authApi.login('a@test.invalid', 'password'), /phiên đăng nhập hợp lệ/);
});

test('Google account-link refusal does not become an authenticated session', async t => {
  mockFetch(t, () => json({ code: 'ACCOUNT_LINK_REQUIRED' }, 409));
  assert.deepEqual(await authApi.loginFirebase('firebase-proof'), { status: 'AccountLinkRequired' });
});

test('first-login challenge validates proof and rounds positive resend delay', () => {
  assert.equal(firstLoginChallengeOf(null), null);
  assert.equal(firstLoginChallengeOf({ challengeToken: '' }), null);
  assert.deepEqual(firstLoginChallengeOf({ challengeToken: 'proof', resendAfterSeconds: 2.1 }), {
    challengeToken: 'proof', challengeExpiresAt: '', codeExpiresAt: '', emailHint: '', resendAfterSeconds: 3,
  });
});

test('registration keeps OTP proof and chooses account-specific endpoint', async t => {
  const calls = mockFetch(t, () => json(user));
  const common = { email: 'a@test.invalid', password: 'secret', confirmPassword: 'secret', fullName: 'A', registrationToken: 'otp-proof' };
  await authApi.register({ ...common, accountType: 'trainee', username: 'learner' });
  await authApi.register({ ...common, accountType: 'organization', organizationName: 'School', organizationAddress: 'Street', organizationPhoneNumber: '123' });
  assert.deepEqual(calls.map(c => c.url.pathname), ['/api/auth/register/trainee', '/api/auth/register/organization']);
  assert.equal(JSON.parse(calls[0].body).registrationToken, 'otp-proof');
  assert.equal(JSON.parse(calls[0].body).username, 'learner');
  assert.equal(JSON.parse(calls[1].body).organizationName, 'School');
  assert.equal(JSON.parse(calls[1].body).username, undefined);
});

test('avatar completion follows successful signed upload and retains ETag', async t => {
  const calls = mockFetch(t, c => c.url.pathname.endsWith('/upload-intent')
    ? json({ uploadUrl: 'https://storage.test/object', uploadId: 'upload-1' })
    : c.url.host === 'storage.test' ? new Response(null, { status: 200 }) : json({ avatarUrl: 'ready' }, 200, { ETag: '"5"' }));
  const file = new File(['bytes'], 'avatar.png', { type: 'image/png' });
  const result = await authApi.uploadAvatar('access', '"4"', file);
  assert.equal(result.headers.get('etag'), '"5"');
  assert.deepEqual(calls.map(c => c.url.host + c.url.pathname), [
    'test.invalid/api/me/avatar/upload-intent', 'storage.test/object', 'test.invalid/api/me/avatar/complete',
  ]);
  assert.equal(calls[1].body, file); assert.equal(calls[1].headers.get('content-type'), 'image/png');
  assert.equal(calls[1].headers.has('authorization'), false);
  assert.equal(calls[2].headers.get('if-match'), '"4"');
  assert.deepEqual(JSON.parse(calls[2].body), { uploadId: 'upload-1' });
});

test('failed signed upload never calls avatar completion', async t => {
  const calls = mockFetch(t, c => c.url.pathname.endsWith('/upload-intent')
    ? json({ uploadUrl: 'https://storage.test/object', uploadId: 'upload-1' })
    : new Response('denied', { status: 403 }));
  await assert.rejects(authApi.uploadAvatar('access', '"4"', new File(['x'], 'a.png', { type: 'image/png' })), /Không thể tải ảnh/);
  assert.equal(calls.length, 2);
});
