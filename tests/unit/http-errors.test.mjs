import test from 'node:test';
import assert from 'node:assert/strict';
import { parseErrorCode, parseErrorMessage, parseFieldErrors, parseRetryAfter } from '../../src/api/errors.ts';
import { ApiError } from '../../src/api/types/common.ts';

test('ProblemDetails and both field error formats preserve machine codes and paths', () => {
  assert.equal(parseErrorCode({ errorCode: 'CONFLICT' }), 'CONFLICT');
  assert.equal(parseErrorMessage({ title: 'Conflict' }, 'fallback'), 'Conflict');
  assert.deepEqual(parseFieldErrors({ code: 'invalid', errors: { name: ['required', '', null], ignored: 3 } }), [{ code: 'invalid', path: 'name', message: 'required' }]);
  assert.deepEqual(parseFieldErrors({ errors: [{ field: '$.name', detail: 'required' }, null, {}] }), [{ code: 'validation_error', path: '$.name', message: 'required' }]);
  for (const value of [null, [], 'html', 5]) {
    assert.equal(parseErrorCode(value), undefined);
    assert.equal(parseErrorMessage(value, 'fallback'), 'fallback');
    assert.deepEqual(parseFieldErrors(value), []);
  }
});
test('Retry-After accepts delta and HTTP date, clamps past dates and rejects junk', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  assert.equal(parseRetryAfter(' 30 ', now), 30);
  assert.equal(parseRetryAfter('Thu, 01 Jan 2026 00:00:02 GMT', now), 2);
  assert.equal(parseRetryAfter('Wed, 31 Dec 2025 00:00:00 GMT', now), 0);
  for (const value of [null, 'nonsense', '999999999999999999999999']) assert.equal(parseRetryAfter(value, now), undefined);
});
test('ApiError retains server evidence and supports normalized field lookup', () => {
  const headers = new Headers({ ETag: 'v2' });
  const error = new ApiError('server message', 412, {}, 2, 'CUSTOM', [{ code: 'CUSTOM', path: '$.Name', message: 'field' }], headers);
  assert.equal(error.serverMessage, 'server message');
  assert.equal(error.isPreconditionFailed, true);
  assert.equal(error.fieldMessage('name'), 'Tên chưa hợp lệ.');
  assert.equal(error.headers.get('etag'), 'v2');
});
