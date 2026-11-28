import test from 'node:test';
import assert from 'node:assert/strict';
import { qaVerdict, technicalGate, approvalGate, isJobTerminal } from '../../src/features/scenarios/version-readiness.ts';
import { deriveQaVerdict, newestGeometryJob, attemptReasonText } from '../../src/features/buildings/pipeline.ts';

test('a succeeded package job without a validation run remains unverified', () => {
  const job = { job: { status: 'Succeeded' } };
  assert.deepEqual(qaVerdict([], []), { kind: 'none' });
  assert.equal(technicalGate({ job, verdict: { kind: 'none' }, hasJobs: true }).label, 'Dựng xong, chờ kiểm tra');
  assert.equal(isJobTerminal('Succeeded'), true);
});

test('newest run and its own blocking issue decide package QA', () => {
  const older = { id: 'old', createdAt: '2026-01-01', status: 'Failed' }, newer = { id: 'new', createdAt: '2026-01-02', status: 'Passed' };
  assert.equal(qaVerdict([older, newer], [{ validationRunId: 'old', severity: 'Critical' }]).kind, 'passed');
  assert.equal(qaVerdict([older, newer], [{ validationRunId: 'new', severity: 'Error' }]).kind, 'failed');
  assert.equal(approvalGate('Approved').label, 'Đạt thẩm định');
  assert.equal(approvalGate(null).known, false);
});

test('IFC job completion alone never grants QA; only current run and issues can pass', () => {
  const job = { status: 'Succeeded' };
  assert.equal(deriveQaVerdict({ job, qa: null }, []).state, 'unavailable');
  const qa = { validationRuns: { items: [{ outcome: 'Passed' }] } };
  assert.equal(deriveQaVerdict({ job, qa }, []).state, 'passed');
  assert.equal(deriveQaVerdict({ job, qa }, [{ severity: 'Critical' }]).state, 'failed');
  assert.equal(deriveQaVerdict({ job, qa, qaError: new Error('read') }, []).state, 'unavailable');
});

test('only Geometry jobs select the current IFC attempt; lease expiry is explained', () => {
  const jobs = [{ kind: 'Geometry', createdAt: '2026-01-01', id: 'old' }, { kind: 'PlaytestPackage', createdAt: '2026-03-01' }, { kind: 'Geometry', createdAt: '2026-02-01', id: 'new' }];
  assert.equal(newestGeometryJob(jobs).id, 'new');
  assert.match(attemptReasonText({ endReason: 'LeaseExpired', message: null }), /giao lại/);
  assert.equal(attemptReasonText({ endReason: 'Completed', message: null }), '');
});
