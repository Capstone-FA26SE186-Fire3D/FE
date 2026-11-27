import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Sha256, sha256HexOfBytes, sha256OfFile } from '../../src/features/buildings/sha256.ts';
import { shapeIssues, situationIssues, completenessIssues, initialStateV1 } from '../../src/features/scenario-editor/v1/state.ts';
import { parsePage, parseSituationRef, parseSourceRef } from '../../src/features/learn/parse.ts';
import { googleErrorMessage } from '../../src/features/auth/google-errors.ts';

test('incremental IFC hash agrees with SHA-256 across block boundaries and file chunks', async () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 1025]) {
    const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251);
    const expected = createHash('sha256').update(bytes).digest('hex');
    const hasher = new Sha256();
    for (let offset = 0; offset < size; offset += 7) hasher.update(bytes.subarray(offset, offset + 7));
    assert.equal(hasher.digestHex(), expected, `incremental size ${size}`);
    assert.equal(sha256HexOfBytes(bytes), expected, `one-shot size ${size}`);
    const progress = [];
    assert.equal(await sha256OfFile(new Blob([bytes]), {
      chunkBytes: 11, nativeLimitBytes: 0, onProgress: (done, total) => progress.push([done, total]),
    }), expected);
    assert.deepEqual(progress.at(-1), [size, size]);
  }
});

test('file hashing honors cancellation before reading and between chunks', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(sha256OfFile(new Blob(['abc']), { signal: before.signal }), { name: 'AbortError' });
  const between = new AbortController();
  const file = new Blob(['abcdef']);
  await assert.rejects(sha256OfFile(file, {
    nativeLimitBytes: 0, chunkBytes: 2, signal: between.signal,
    onProgress: () => between.abort(),
  }), { name: 'AbortError' });
});

test('editor shape rejects invalid pins and PC06 fields before submit', () => {
  const draft = initialStateV1({ artifactId: 'bad', sha256Hash: 'bad' }, {
    audience: 'unknown', workingHours: 'unknown', assumption: { peoplePresent: -1 },
    runtimeVersion: 'latest', unexpected: true,
  });
  const issues = shapeIssues(draft);
  const has = (code, path) => issues.some(item => item.code === code && item.path === path);
  assert.ok(has('STRING_FORMAT_INVALID', '$.geometry.artifactId'));
  assert.ok(has('STRING_FORMAT_INVALID', '$.geometry.sha256Hash'));
  assert.ok(has('STRING_FORMAT_INVALID', '$.runtimeVersion'));
  assert.ok(has('VALUE_UNSUPPORTED', '$.audience'));
  assert.ok(has('NUMBER_OUT_OF_RANGE', '$.assumption.peoplePresent'));
  assert.ok(has('FIELD_UNKNOWN', '$.unexpected'));
  assert.deepEqual(situationIssues({ schemaVersion: draft.schemaVersion }).map(item => item.path),
    ['$.audience', '$.workingHours', '$.assumption']);
});

test('infrastructure scope requires an exit while scenario scope requires a spawn and goal', () => {
  const draft = { schemaVersion: 'fet3d.editor/1' };
  const context = { geometry: null, runtimes: null, metrics: null };
  const scenario = completenessIssues(draft, context).map(item => item.code);
  const infrastructure = completenessIssues(draft, { ...context, scope: 'infrastructure' }).map(item => item.code);
  assert.ok(scenario.includes('SPAWN_REQUIRED'));
  assert.ok(scenario.includes('GOAL_REQUIRED'));
  assert.ok(infrastructure.includes('EXIT_REQUIRED'));
  assert.ok(!infrastructure.includes('SPAWN_REQUIRED'));
});

test('Learn parsers reject malformed rows and preserve usable source references', () => {
  const page = parsePage({ items: [null, { id: 'one' }, 5], total: 'wrong' },
    item => parseSituationRef(item));
  assert.equal(page.total, 1);
  assert.deepEqual(page.items, [{ id: 'one', slug: '', name: '' }]);
  assert.equal(parseSourceRef({ title: 'no id' }), null);
  assert.deepEqual(parseSourceRef({ sourceId: 'src', title: 'Title', locator: { page: 2 } }),
    { sourceId: 'src', title: 'Title', versionLabel: '', role: 'Reference', locator: { page: 2 } });
});

test('Google failure messages distinguish cancelled, blocked, network and account link', () => {
  assert.match(googleErrorMessage({ code: 'auth/popup-closed-by-user' }), /hủy/);
  assert.match(googleErrorMessage({ code: 'auth/popup-blocked' }), /chặn/);
  assert.match(googleErrorMessage(new TypeError('offline')), /mạng/);
  assert.match(googleErrorMessage({ code: 'ACCOUNT_LINK_REQUIRED' }), /email/);
});
