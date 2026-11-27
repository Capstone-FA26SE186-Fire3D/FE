import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/api/types/common.ts';
import { describeApiError, messageOf } from '../../src/api/describe-error.ts';
import { friendlyMessage, friendlyFieldMessage } from '../../src/api/error-text.ts';
import { normalizePage } from '../../src/api/pagination.ts';
import { billingErrorText } from '../../src/features/billing/errors.ts';
import { outcomeIsUnknown } from '../../src/features/playtest/errors.ts';
import { describeFailure } from '../../src/features/training-history/errors.ts';
import { splitUnits } from '../../src/features/org-ai/quota-units.ts';

test('API and billing failures keep conflict, rate-limit and network meanings separate', () => {
  const conflict = new ApiError('English conflict', 412);
  assert.match(describeApiError(conflict, 'fallback'), /thay đổi/);
  assert.match(billingErrorText(conflict), /thay đổi/);
  assert.match(describeApiError(new ApiError('Busy', 429, {}, 7), 'fallback'), /7/);
  assert.equal(messageOf(new Error('English internal detail'), 'fallback'), 'fallback');
  assert.match(describeApiError(new TypeError('offline'), 'fallback'), /mạng/);
});

test('pagination accepts both backend envelopes and error text never echoes English', () => {
  assert.deepEqual(normalizePage({ items: [1, 2], totalCount: 1, page: 3 }, { pageSize: 10 }),
    { items: [1, 2], totalCount: 2, page: 3, pageSize: 10 });
  assert.equal(normalizePage({ items: ['x'], total: 7 }).totalCount, 7);
  assert.equal(normalizePage({ items: null }).totalCount, 0);
  assert.match(friendlyMessage(undefined, 429, 'Rate limited', 5), /5/);
  assert.ok(!friendlyMessage(undefined, 500, 'Internal server error').includes('Internal'));
  assert.match(friendlyFieldMessage('$.items[0].email', undefined, 'Invalid'), /Email/);
});

test('playtest retains retry identity only when execution outcome is uncertain', () => {
  assert.equal(outcomeIsUnknown(new TypeError('offline')), true);
  assert.equal(outcomeIsUnknown(new ApiError('server', 503)), true);
  assert.equal(outcomeIsUnknown(new ApiError('busy', 429)), true);
  assert.equal(outcomeIsUnknown(new ApiError('rejected', 400)), false);
  assert.equal(outcomeIsUnknown(new ApiError('conflict', 409)), false);
  assert.equal(describeFailure(new ApiError('forbidden', 403), 'detail').retryable, false);
  assert.equal(describeFailure(new ApiError('busy', 429, {}, 9), 'list').retryable, true);
});

test('AI quota shows active policy units with no grant as zero and keeps old grants separate', () => {
  const units = [{ quotaUnit: 'Tokens', available: 9 }, { quotaUnit: 'OldUnit', available: 12 }];
  const limits = [
    { operation: 'Answer', quotaUnit: ' tokens ', policyActive: true },
    { operation: 'Draft', quotaUnit: 'Requests', policyActive: true },
    { operation: 'Inactive', quotaUnit: 'OldUnit', policyActive: false },
  ];
  const result = splitUnits(units, limits);
  assert.deepEqual(result.inUse.map(entry => [entry.balance.quotaUnit, entry.operations]),
    [['Tokens', ['Answer']], ['Requests', ['Draft']]]);
  assert.equal(result.inUse[1].balance.available, 0);
  assert.deepEqual(result.unused, [units[1]]);
  assert.equal(splitUnits(units, undefined).inUse.length, 2);
});
