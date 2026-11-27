import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApplyPlan, buildApplyCommand, applyCount } from '../../src/features/org-ai/apply-plan.ts';
import { applyCommand, revertCommand } from '../../src/features/scenario-editor/store/commands.ts';
const geometry = { artifactId: 'artifact', sha256Hash: 'a'.repeat(64) };
const object = (id, kind = 'Spawn') => ({ id, kind, placement: { floorId: 'L1', position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } });

test('product decisions require selection and one undo restores the entire proposal application', () => {
  const draft = { name: 'old', geometry, objects: [] }, proposal = { name: 'new', timeLimitSeconds: 300, geometry, objects: [object('spawn')], unknown: true };
  const before = structuredClone(proposal), plan = buildApplyPlan(proposal, draft, new Set(['L1']));
  assert.equal(plan.fields.find(x => x.key === 'timeLimitSeconds').defaultOn, false);
  assert.deepEqual(plan.ignoredKeys, ['unknown']);
  const chosen = { fields: new Set(['name']), objects: true };
  assert.equal(applyCount(chosen, plan), 2);
  const command = buildApplyCommand(draft, 1, 1, null, plan, chosen), result = applyCommand(draft, command);
  assert.equal(result.name, 'new'); assert.equal(result.timeLimitSeconds, undefined); assert.equal(result.geometry, geometry);
  assert.equal(result.objects.length, 1); assert.deepEqual(revertCommand(result, command), draft); assert.deepEqual(proposal, before);
});
test('mismatched geometry, unknown floors and duplicate IDs prevent spatial application', () => {
  const draft = { geometry, objects: [object('existing')] };
  const proposal = { geometry, objects: [object('existing'), object('new'), object('new'), { ...object('bad'), placement: { ...object('bad').placement, floorId: 'missing' } }] };
  assert.deepEqual(buildApplyPlan(proposal, draft, new Set(['L1'])).objects.map(x => x.eligible), [false, true, false, false]);
  const plan = buildApplyPlan({ ...proposal, geometry: { ...geometry, artifactId: 'other' } }, draft, new Set(['L1']));
  assert.ok(plan.objects.every(x => !x.eligible));
  assert.equal(buildApplyCommand(draft, 1, 1, null, plan, { fields: new Set(), objects: true }), null);
});
test('locked infrastructure objects cannot be added to a situation', () => {
  const plan = buildApplyPlan({ geometry, objects: [object('exit', 'Goal')] }, { geometry, objects: [] }, new Set(['L1']), 'scenario-on-infrastructure');
  assert.equal(plan.objects[0].eligible, false);
});
