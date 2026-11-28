import test from 'node:test';
import assert from 'node:assert/strict';
import { idlePollDelay, nextUnchangedCount, pollSignature } from '../../src/api/poll-backoff.ts';

const backoff = { after: 5, factor: 1.5, maxMs: 15_000 };

test('idle backoff is opt-in and keeps the base interval until the threshold', () => {
  for (const unchanged of [0, 1, 50]) assert.equal(idlePollDelay(3000, unchanged), 3000);
  for (const unchanged of [0, 1, 4]) assert.equal(idlePollDelay(3000, unchanged, backoff), 3000);
});
test('idle backoff grows by the factor per unchanged poll and stops at the maximum', () => {
  assert.equal(idlePollDelay(3000, 5, backoff), 4500);
  assert.equal(idlePollDelay(3000, 6, backoff), 6750);
  assert.equal(idlePollDelay(3000, 7, backoff), 10125);
  assert.equal(idlePollDelay(3000, 8, backoff), 15000);
  assert.equal(idlePollDelay(3000, 500, backoff), 15000);
});
test('idle backoff never polls faster than the base interval and ignores a non-growing factor', () => {
  assert.equal(idlePollDelay(3000, 9, { after: 1, factor: 2, maxMs: 1000 }), 3000);
  assert.equal(idlePollDelay(3000, 9, { after: 1, factor: 1, maxMs: 15_000 }), 3000);
  assert.equal(idlePollDelay(3000, 9, { after: 1, factor: 0.5, maxMs: 15_000 }), 3000);
  assert.equal(idlePollDelay(3000, 0, { after: 0, factor: 2, maxMs: 15_000 }), 6000);
});
test('unchanged counter resets on any change and on values that cannot be compared', () => {
  assert.equal(nextUnchangedCount(undefined, 'a', 0), 0);
  assert.equal(nextUnchangedCount('a', 'a', 0), 1);
  assert.equal(nextUnchangedCount('a', 'a', 4), 5);
  assert.equal(nextUnchangedCount('a', 'b', 4), 0);
  assert.equal(nextUnchangedCount('a', undefined, 4), 0);
  assert.equal(nextUnchangedCount(undefined, undefined, 4), 0);
});
test('poll signature defaults to JSON, honours the caller signature and survives values that cannot be serialized', () => {
  assert.equal(pollSignature({ status: 'Processing', n: 1 }), '{"status":"Processing","n":1}');
  assert.equal(pollSignature({ status: 'Processing', n: 1 }, value => value.status), 'Processing');
  const loop = {}; loop.self = loop;
  assert.equal(pollSignature(loop), undefined);
  assert.equal(pollSignature(1, () => { throw new Error('boom'); }), undefined);
});
test('a waiting job polled for a minute costs fewer reads, and one change restores the base cadence', () => {
  let unchanged = 0; let last; let elapsed = 0; let reads = 0;
  while (elapsed < 60_000) {
    const current = pollSignature({ status: 'Processing' });
    unchanged = nextUnchangedCount(last, current, unchanged); last = current; reads += 1;
    elapsed += idlePollDelay(3000, unchanged, backoff);
  }
  assert.ok(reads < 20, `expected fewer than the 20 fixed-interval reads, got ${reads}`);
  unchanged = nextUnchangedCount(last, pollSignature({ status: 'Succeeded' }), unchanged);
  assert.equal(idlePollDelay(3000, unchanged, backoff), 3000);
});
