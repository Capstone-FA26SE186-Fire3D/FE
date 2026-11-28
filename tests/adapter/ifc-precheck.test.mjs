import test from 'node:test';
import assert from 'node:assert/strict';
import { checkIfcHeader, scanIfcContent, ifcCriteria, precheckIfcFile } from '../../src/features/buildings/ifc-precheck.ts';
const header = "ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC4'));ENDSEC;\nDATA;\n";
const entities = '#1=IFCBUILDINGSTOREY();\n#2=IFCSPACE();\n#3=IFCDOOR();\n#4=IFCWALL();\n';

test('header accepts IFC schema but rejects foreign signature, extension, empty and oversized files', async () => {
  assert.deepEqual(await checkIfcHeader(new File([header], 'a.ifc')), { ok: true, schema: 'IFC4' });
  for (const file of [new File(['%PDF-1.0'], 'renamed.ifc'), new File([header], 'a.txt'), new File([], 'empty.ifc'), new File(['not step'], 'a.ifc'), new File([header.replace('IFC4', 'OTHER')], 'a.ifc')]) assert.equal((await checkIfcHeader(file)).ok, false);
  assert.equal((await checkIfcHeader(new File([header], 'a.ifc'), 3)).ok, false);
});
test('streaming parser counts split entities once and reports progress', async () => {
  const data = new TextEncoder().encode(header + entities), progress = [];
  const chunks = [data.slice(0, 77), data.slice(77, 95), data.slice(95)];
  const file = { size: data.length, stream: () => new ReadableStream({ start(c) { chunks.forEach(x => c.enqueue(x)); c.close(); } }) };
  const result = await scanIfcContent(file, { onProgress: n => progress.push(n) });
  assert.deepEqual(result, { storeys: 1, spaces: 1, doors: 1, walls: 1, slabs: 0, stairs: 0 });
  assert.equal(progress.at(-1), 1); assert.ok(progress.every((x, i) => i === 0 || x >= progress[i - 1]));
});
test('abort and stream failure release reader ownership', async () => {
  const controller = new AbortController(); controller.abort();
  const stream = new ReadableStream({ start(c) { c.close(); } });
  await assert.rejects(scanIfcContent({ size: 0, stream: () => stream }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(stream.locked, false);
  const broken = new ReadableStream({ pull(c) { c.error(new Error('read failed')); } });
  await assert.rejects(scanIfcContent({ size: 1, stream: () => broken }), /read failed/);
  assert.equal(broken.locked, false);
});
test('missing stairs block known occupied floors, unknown occupancy only warns; units only warn', () => {
  const counts = { storeys: 2, spaces: 2, doors: 2, walls: 2, slabs: 0, stairs: 0 };
  assert.equal(ifcCriteria(counts).find(x => x.id === 'stair').blocking, false);
  const criteria = ifcCriteria({ ...counts, occupiedStoreys: 2, lengthUnit: 'millimetre' });
  assert.equal(criteria.find(x => x.id === 'stair').blocking, true);
  assert.equal(criteria.find(x => x.id === 'stair').passed, false);
  assert.equal(criteria.find(x => x.id === 'unit').blocking, false);
});
test('full precheck distinguishes header rejection, content rejection and usable model', async () => {
  assert.equal((await precheckIfcFile(new File(['bad'], 'a.ifc'))).stage, 'header');
  assert.equal((await precheckIfcFile(new File([header], 'a.ifc'))).status, 'blocked');
  assert.equal((await precheckIfcFile(new File([header + entities], 'a.ifc'))).status, 'passed');
});
