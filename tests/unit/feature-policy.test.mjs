import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLearnQuery, toSearchParams, learnQueryKey } from '../../src/features/learn/query.ts';
import { httpsUrl, videoLink, embedUrl } from '../../src/features/learn/safe-url.ts';
import { acceptStatus, heldCodeState, canCancel, formatCountdown } from '../../src/features/playtest/status.ts';
import { describeBlockers } from '../../src/features/playtest/availability.ts';
import { attemptEndReasonText } from '../../src/configs/processing-end-reason.ts';
import { validateReason, describeDecisionError } from '../../src/features/expert-reviews/api.ts';
import { ApiError } from '../../src/api/types/common.ts';

test('Learn URL parsing deduplicates filters, retains unknown kinds and clamps invalid page', () => {
  const query = parseLearnQuery(new URLSearchParams('search=%20fire%20&kind=tip&kind=Tip&kind=unknown&situation=school&situation=school&page=-2'));
  assert.deepEqual(query, { search: 'fire', kinds: ['Tip', 'unknown'], situations: ['school'], page: 1 });
  assert.equal(toSearchParams(query).getAll('kind').length, 2);
  assert.notEqual(learnQueryKey(query, 20), learnQueryKey({ ...query, page: 2 }, 20));
});

test('video URLs reject credentials, ports and lookalike hosts', () => {
  assert.equal(httpsUrl('https://user:pass@example.com/a'), null);
  assert.equal(httpsUrl('http://www.youtube.com/a'), null);
  assert.equal(httpsUrl('https://www.youtube.com:8443/a'), null);
  assert.equal(videoLink('YouTube', 'https://www.youtube.com.evil.test/watch?v=x'), null);
  assert.match(embedUrl('YouTube', 'AbCdEfGhI12', 'ignored'), /youtube-nocookie/);
  assert.equal(embedUrl('YouTube', 'bad', 'ignored'), null);
});

test('late playtest response cannot regress lifecycle or replace terminal outcome', () => {
  const current = { id: 'p1', status: 'Running', grant: { generation: 2 } };
  assert.equal(acceptStatus(current, { ...current, status: 'Launching' }), current);
  const done = { ...current, status: 'Completed' };
  assert.equal(acceptStatus(done, { ...current, status: 'Cancelled' }), done);
  assert.equal(acceptStatus(current, { ...current, status: 'Completed' }).status, 'Completed');
  assert.equal(heldCodeState({ openHandoffId: 'new', boundToMobile: false }, 'old'), 'replaced');
  assert.equal(canCancel({ status: 'Completed', recovery: { canCancel: true } }), false);
  assert.equal(formatCountdown(1010), '0:02');
});

test('playtest blockers preserve server decision and suppress duplicate package guidance', () => {
  assert.equal(describeBlockers({ canCreate: false, blockers: [] })[0].code, '');
  const lines = describeBlockers({ canCreate: false, blockers: ['PLAYTEST_PACKAGE_REQUIRED', 'UNKNOWN', 'ALSO_UNKNOWN'] }, true);
  assert.equal(lines.length, 1); assert.equal(lines[0].code, 'UNKNOWN');
});

test('processing end reason is only shown for interruption or worker failure', () => {
  assert.match(attemptEndReasonText('LeaseExpired', 'xử lý'), /giao lại/);
  assert.match(attemptEndReasonText('WorkerFailed', 'dựng'), /báo lỗi/);
  assert.equal(attemptEndReasonText('Completed', 'xử lý'), null);
});

test('expert reason validation and conflicts retain appropriate retry policy', () => {
  assert.match(validateReason('  '), /lý do/);
  assert.equal(validateReason('ok'), undefined);
  assert.match(validateReason('x'.repeat(2001)), /2000/);
  assert.equal(describeDecisionError(new ApiError('conflict', 412)).kind, 'reload');
  assert.equal(describeDecisionError(new ApiError('invalid', 400)).kind, 'fix');
  assert.equal(describeDecisionError(new ApiError('busy', 429, {}, 5)).kind, 'retry');
  assert.equal(describeDecisionError(new Error('network')).kind, 'retry');
});
