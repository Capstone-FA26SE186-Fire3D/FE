import test from 'node:test';
import assert from 'node:assert/strict';
import { pagesAfterFirst } from '../../src/api/paging.ts';

test('pages after the first cover the total and respect the cap', () => {
  assert.deepEqual(pagesAfterFirst(0, 100, 5), []);
  assert.deepEqual(pagesAfterFirst(100, 100, 5), []);
  assert.deepEqual(pagesAfterFirst(101, 100, 5), [2]);
  assert.deepEqual(pagesAfterFirst(450, 100, 5), [2, 3, 4, 5]);
  assert.deepEqual(pagesAfterFirst(5000, 100, 5), [2, 3, 4, 5]);
  assert.deepEqual(pagesAfterFirst(120, 50, 10), [2, 3]);
});
test('an empty first page, a missing total or a cap of one page asks for nothing more', () => {
  assert.deepEqual(pagesAfterFirst(300, 0, 5), []);
  assert.deepEqual(pagesAfterFirst(Number.NaN, 100, 5), []);
  assert.deepEqual(pagesAfterFirst(-1, 100, 5), []);
  assert.deepEqual(pagesAfterFirst(300, 100, 1), []);
});
