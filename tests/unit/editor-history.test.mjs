import test from 'node:test';
import assert from 'node:assert/strict';
import { setFieldCommand, applyCommand, revertCommand, pushCommand, placeCommand, transformCommand } from '../../src/features/scenario-editor/store/commands.ts';
import { editorReducer, initialEditorState, isDirty, saveStatus } from '../../src/features/scenario-editor/store/editor-store.ts';
import { compareDrafts, resolveMerge } from '../../src/features/scenario-editor/store/merge.ts';
import { normalizeEtag, draftEtag } from '../../src/features/scenario-editor/store/etag.ts';
const field = (draft, value, id = 1, at = 1) => setFieldCommand(draft, id, ['name'], value, { at, label: 'rename', selection: null, mergeKey: 'typing:name' });

test('commands preserve unknown data and reverse creation of missing ancestors', () => {
  const draft = { unknown: { server: true } };
  const command = setFieldCommand(draft, 1, ['nested', 'value'], 3, { at: 1, label: 'set', selection: null });
  const edited = applyCommand(draft, command);
  assert.equal(edited.nested.value, 3); assert.equal(edited.unknown, draft.unknown);
  assert.deepEqual(revertCommand(edited, command), draft); assert.equal(draft.nested, undefined);
});
test('typing merges to one undo and a gesture returning to origin leaves no history', () => {
  const draft = { name: 'a' }, first = field(draft, 'b'), second = field({ name: 'b' }, 'c', 2, 10);
  let history = pushCommand({ past: [], future: [] }, first);
  history = pushCommand(history, second);
  assert.equal(history.past.length, 1);
  assert.deepEqual(revertCommand({ name: 'c' }, history.past[0]), draft);
  history = pushCommand(history, field({ name: 'c' }, 'a', 3, 20));
  assert.equal(history.past.length, 0);
});
test('history expires typing merge window, caps entries and clears redo after edit', () => {
  let history = { past: [], future: [{ id: -1 }] };
  for (let i = 0; i < 205; i++) history = pushCommand(history, field({ name: String(i) }, String(i + 1), i, i * 2000));
  assert.equal(history.past.length, 200); assert.equal(history.past[0].id, 5); assert.deepEqual(history.future, []);
});
test('place and transform undo leave unrelated object properties intact', () => {
  const draft = { opaque: 1 };
  const place = placeCommand(draft, 1, 'spawn', { x: 1, y: 2, z: 3, rotation: 0 }, 1, null);
  const placed = applyCommand(draft, place); placed.spawnPoints[0].extra = 'keep';
  const move = transformCommand(placed, 2, 'spawn', 0, { x: 9 }, { at: 2, label: 'move' });
  const moved = applyCommand(placed, move);
  assert.equal(moved.spawnPoints[0].extra, 'keep'); assert.equal(moved.spawnPoints[0].x, 9);
  assert.deepEqual(revertCommand(moved, move), placed);
  assert.deepEqual(revertCommand(placed, place), draft);
});
test('reducer saves the sent baseline without losing edits made during save', () => {
  let state = editorReducer(initialEditorState, { type: 'loaded', draft: { name: 'a' }, etag: 'v1', version: 1 });
  assert.equal(isDirty(state), false);
  state = editorReducer(state, { type: 'edit', build: d => field(d, 'b') });
  const sent = state.draft;
  state = editorReducer(state, { type: 'save-start' });
  state = editorReducer(state, { type: 'edit', build: d => field(d, 'c', 2, 2000) });
  state = editorReducer(state, { type: 'save-ok', payload: sent, etag: 'v2' });
  assert.equal(state.draft.name, 'c'); assert.equal(state.baseline.name, 'b'); assert.equal(isDirty(state), true);
  state = editorReducer(state, { type: 'save-fail', conflict: true, message: 'changed' });
  assert.equal(saveStatus(state, true), 'conflict'); assert.equal(state.draft.name, 'c');
});
test('undo/redo and replacement reset history against the new base', () => {
  let state = editorReducer(initialEditorState, { type: 'loaded', draft: { name: 'a' }, etag: 'v1', version: 1 });
  state = editorReducer(state, { type: 'edit', build: d => field(d, 'b') });
  state = editorReducer(state, { type: 'undo' }); assert.equal(state.draft.name, 'a');
  state = editorReducer(state, { type: 'redo' }); assert.equal(state.draft.name, 'b');
  state = editorReducer(state, { type: 'replace', draft: { name: 'new' }, baseline: { name: 'new' }, etag: 'v3', version: 3 });
  assert.equal(state.history.past.length, 0); assert.equal(editorReducer(state, { type: 'undo' }), state);
});
test('three-way merge keeps local changes and allows explicit conflict resolution', () => {
  const base = { name: 'a', count: 1, extra: true }, mine = { name: 'mine', count: 1 }, theirs = { name: 'server', count: 2, extra: true };
  const units = compareDrafts(mine, theirs, base);
  assert.equal(units.find(x => x.key === 'name').status, 'conflict');
  assert.deepEqual(resolveMerge(theirs, units, {}), { name: 'mine', count: 2 });
  assert.deepEqual(resolveMerge(theirs, units, { name: 'theirs' }), { name: 'server', count: 2 });
  assert.equal(theirs.extra, true);
});
test('ETag prefers server header and rejects wildcard or lists', () => {
  assert.equal(draftEtag(new Headers({ ETag: '"52"' }), 3), '"52"');
  assert.equal(draftEtag(new Headers(), 3), '"3"');
  for (const raw of ['*', '"1","2"', '0', 'abc', null]) assert.equal(normalizeEtag(raw), null);
});
