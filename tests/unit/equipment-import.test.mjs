import test from 'node:test';
import assert from 'node:assert/strict';
import { decidedKey, planEquipmentImport, importEquipmentCommand } from '../../src/features/scenario-editor/v1/equipment-import.ts';

const candidate = (id, decision = { decision: 'Confirmed' }) => ({
  ifcGlobalId: id, catalogKey: 'portable.extinguisher', decision,
  floorId: 'F1', position: [1.12345, 0, 2], rotationY: 90,
});
const runtime = { runtimeVersion: '1.0.0', protocolVersion: '1', capabilities: [{
  id: 'portable.extinguisher', version: '1.2.0', objectKinds: ['Equipment'],
  fields: [{ name: 'charge', type: 'number', required: true }],
}] };
const geometry = { floors: [{ id: 'F1' }], semantic: [
  { ifcGlobalId: 'A', floorId: 'F1' }, { ifcGlobalId: 'B', floorId: 'F1' },
] };

test('IFC equipment import needs explicit decision and accepted geometry/runtime pins', () => {
  assert.equal(decidedKey(candidate('A', null)), null);
  assert.equal(decidedKey(candidate('A', { decision: 'Rejected' })), null);
  assert.equal(decidedKey(candidate('A')), 'portable.extinguisher');
  assert.equal(planEquipmentImport({ draft: {}, candidates: [], runtime, geometry: null }).blocked, 'geometry');
  assert.equal(planEquipmentImport({ draft: {}, candidates: [], runtime: undefined, geometry }).blocked, 'runtime');
  const plan = planEquipmentImport({ draft: {}, candidates: [candidate('A', null), candidate('B')], runtime, geometry });
  assert.deepEqual(plan.rows.map(row => row.status === 'skip' ? row.reason : row.status), ['not-decided', 'add']);
  assert.equal(plan.rows[1].object.anchorId, 'B');
  assert.equal(plan.rows[1].object.capability.version, '1.2.0');
  assert.deepEqual(plan.rows[1].requiredParameters, ['charge']);
  assert.equal(plan.rows[1].object.parameters, undefined);
});

test('equipment import refuses existing anchors, duplicates and cross-floor placement', () => {
  const draft = { objects: [{ id: 'equipment-1', kind: 'Equipment', anchorId: 'A' }] };
  const rows = planEquipmentImport({ draft, candidates: [candidate('A'), candidate('B'), candidate('B'),
    { ...candidate('B'), ifcGlobalId: 'C' }], runtime, geometry }).rows;
  assert.deepEqual(rows.map(row => row.status === 'skip' ? row.reason : row.status),
    ['present', 'add', 'duplicate', 'anchor-missing']);
  const wrongFloor = planEquipmentImport({ draft: {}, candidates: [{ ...candidate('A'), floorId: 'F2' }],
    runtime, geometry: { ...geometry, floors: [...geometry.floors, { id: 'F2' }] } });
  assert.equal(wrongFloor.rows[0].reason, 'floor-mismatch');
});

test('accepted equipment becomes one undoable command and empty plan creates none', () => {
  const row = planEquipmentImport({ draft: {}, candidates: [candidate('A'), candidate('B')], runtime, geometry }).rows;
  const added = row.map(item => item.object);
  const command = importEquipmentCommand({}, 7, added, 100, null);
  assert.equal(command.id, 7);
  assert.equal(command.patches.filter(patch => patch.op === 'insert').length, 2);
  assert.deepEqual(command.selectAfter, { kind: 'object', index: 0 });
  assert.equal(importEquipmentCommand({}, 8, [], 100, null), null);
});
