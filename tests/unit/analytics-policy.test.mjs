import test from 'node:test';
import assert from 'node:assert/strict';
import { fillPeriods, periodTick, periodTitle } from '../../src/features/analytics/periods.ts';
import { withPracticeLogNote, lastPlayedText, PRACTICE_LOG_NOTE } from '../../src/features/analytics/practice-log-model.ts';
import { formatRate, formatSeconds } from '../../src/features/analytics/format.ts';

test('quiet UTC days are filled without dropping server rows or changing their values', () => {
  const row = { key: '2026-01-02', plays: 5, passRate: null };
  const extra = { key: '2026-02-01', plays: 7 };
  const rows = fillPeriods([row, extra], 'day', '2026-01-01', '2026-01-04');
  assert.deepEqual(rows.map(x => x.key), ['2026-01-01', '2026-01-02', '2026-01-03', '2026-02-01']);
  assert.equal(rows[1], row); assert.equal(rows[0].plays, 0); assert.equal(rows[0].passRate, null);
  assert.equal(rows.at(-1), extra);
});

test('week starts Monday and month rollover uses UTC calendar', () => {
  assert.deepEqual(fillPeriods([], 'week', '2026-01-01', '2026-01-14').map(x => x.key), ['2025-12-29', '2026-01-05', '2026-01-12']);
  assert.deepEqual(fillPeriods([], 'month', '2025-12-31', '2026-02-02').map(x => x.key), ['2025-12', '2026-01', '2026-02']);
  assert.equal(periodTick('2026-01'), '01/2026');
  assert.equal(periodTitle('2026-01-05', 'week'), 'Tuần từ 05/01/2026');
});

test('invalid or non-time ranges are passed through and overlong expansion stops', () => {
  const rows = [{ key: 'custom' }];
  assert.equal(fillPeriods(rows, 'building', 'bad', 'bad'), rows);
  assert.equal(fillPeriods(rows, 'day', 'bad', '2026-01-01'), rows);
  assert.ok(fillPeriods([], 'day', '2020-01-01', '2030-01-01').length <= 400);
});

test('practice log note is added once and absent metrics remain neutral', () => {
  const csv = 'header,data\n1,2';
  const once = withPracticeLogNote(csv);
  assert.equal(once, `${PRACTICE_LOG_NOTE}\n${csv}`);
  assert.equal(withPracticeLogNote(once), once);
  assert.equal(withPracticeLogNote(`\uFEFF${once}`), `\uFEFF${once}`);
  assert.equal(formatRate(null), 'Chưa có mẫu');
  assert.equal(formatSeconds(null), 'Chưa có mẫu');
  assert.equal(lastPlayedText('bad date'), null);
});
