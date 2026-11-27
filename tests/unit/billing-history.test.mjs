import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEntitlements } from '../../src/features/billing/entitlements.ts';
import { isUuid, readFilters, rangeError, rangeQuery } from '../../src/features/training-history/filters.ts';
import { numOrNull, parseHistoryItem, parseResult, parseSessionState } from '../../src/features/training-history/parse.ts';

const now = Date.parse('2026-01-10T12:00:00Z');
const entitlement = (overrides = {}) => ({
  startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-20T00:00:00Z',
  status: 'Active', isEffective: false, paymentTransactionId: null, ...overrides,
});

test('billing respects server effectiveness, paid history and renewal window', () => {
  const expired = entitlement({ endsAt: '2026-01-09T00:00:00Z' });
  const upcoming = entitlement({ startsAt: '2026-02-01T00:00:00Z' });
  const current = entitlement({ endsAt: '2026-01-14T00:00:00Z', isEffective: true });
  assert.equal(summarizeEntitlements([expired], now).state, 'expired');
  assert.equal(summarizeEntitlements([expired, upcoming], now).state, 'upcoming');
  const summary = summarizeEntitlements([expired, current], now);
  assert.equal(summary.state, 'expiring');
  assert.equal(summary.current, current);
  assert.equal(summary.purchaseAction, 'New');
  assert.equal(summarizeEntitlements([entitlement({ status: 'Trial', paymentTransactionId: 'trial' })], now).purchaseAction, 'New');
  assert.equal(summarizeEntitlements([entitlement({ paymentTransactionId: 'paid' })], now).purchaseAction, 'Renewal');
  assert.equal(summarizeEntitlements([], now).state, 'none');
});

test('training filters discard invalid URL values and convert inclusive local end day', () => {
  const uuid = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
  const raw = { status: 'invalid', mode: 'invalid', building: uuid, from: '2026-02-30', to: '2026-03-02' };
  const filters = readFilters(key => raw[key] ?? '');
  assert.equal(filters.status, ''); assert.equal(filters.mode, '');
  assert.equal(filters.buildingId, uuid.toLowerCase());
  assert.equal(filters.from, ''); assert.equal(filters.to, '2026-03-02');
  assert.equal(isUuid('not-an-id'), false);
  assert.ok(rangeError({ from: '2026-03-03', to: '2026-03-02' }));
  assert.equal(rangeError({ from: '2026-03-02', to: '2026-03-02' }), undefined);
  assert.deepEqual(rangeQuery('2026-03-01', '2026-03-02'), {
    from: new Date(2026, 2, 1).toISOString(), to: new Date(2026, 2, 3).toISOString(),
  });
});

test('training response parsing tolerates open numeric types and preserves unknown outcomes', () => {
  assert.equal(numOrNull('2.5'), 2.5);
  assert.equal(numOrNull(''), null);
  assert.equal(numOrNull('Infinity'), null);
  assert.equal(parseHistoryItem({ status: 'Running' }), null);
  const item = parseHistoryItem({ sessionId: 's1', status: 'FutureStatus', scenario: { id: 'v1', versionNumber: '7' } });
  assert.equal(item.status, 'FutureStatus'); assert.equal(item.scenario.versionNumber, 7);
  assert.deepEqual(item.building, { id: '', name: '' });
  const result = parseResult({ sessionId: 's1', outcome: 'FutureOutcome', scorePercent: '86.5',
    criteria: [null, { metric: 'time', threshold: '12', mandatory: true, passed: false }], metrics: ['bad'] });
  assert.equal(result.outcome, 'FutureOutcome'); assert.equal(result.scorePercent, 86.5);
  assert.equal(result.criteria.length, 1); assert.equal(result.criteria[0].threshold, 12);
  assert.deepEqual(result.metrics, {});
  assert.equal(parseSessionState({ id: 's1', completion: { endReason: 'WorkerFailed' } }).endReason, 'WorkerFailed');
});
