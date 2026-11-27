import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const slash = value => value.split(sep).join('/');
function walk(directory, extension) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walk(path, extension) : extension.test(path) ? [path] : [];
  });
}
const tests = [...walk('tests/unit', /\.test\.mjs$/), ...walk('tests/adapter', /\.test\.mjs$/),
  ...walk('tests/e2e', /\.spec\.ts$/)];
const direct = new Map();
for (const test of tests) {
  const body = readFileSync(resolve(root, test), 'utf8');
  for (const match of body.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    const source = spec.startsWith('@/') ? `src/${spec.slice(2)}` : slash(relative(root, resolve(root, test, '..', spec)));
    const path = source.replace(/\.(ts|tsx)$/, '');
    if (!path.startsWith('src/')) continue;
    (direct.get(path) ?? direct.set(path, []).get(path)).push(test);
  }
  for (const match of body.matchAll(/import\(\s*`([^`]+)`\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = (match[1] ?? match[2]).split('?')[0];
    const source = spec.startsWith('@/') ? `src/${spec.slice(2)}` : slash(relative(root, resolve(root, test, '..', spec)));
    const path = source.replace(/\.(ts|tsx)$/, '');
    if (path.startsWith('src/')) (direct.get(path) ?? direct.set(path, []).get(path)).push(test);
  }
}
const inventory = walk('src', /\.tsx?$/).sort().map(path => {
  const body = readFileSync(resolve(root, path), 'utf8');
  const exported = [...body.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g)].map(match => match[1]);
  const category = path.startsWith('src/app/') ? 'route'
    : path.endsWith('.tsx') ? 'React component'
      : /(^|\/)(?:use-[^/]+|hooks)\.ts$/.test(path) ? 'React hook'
        : /src\/features\/(?:landing\/scene|pixel-scene|buildings\/scene)\//.test(path)
          || /src\/features\/scenario-editor\/scene\/(?:scene-controller|palette)\.ts$/.test(path) ? 'scene renderer'
          : /(?:\/types\.ts$|\/data\/)/.test(path) ? 'static data/types'
            : exported.length ? 'logic/API' : 'type, data or module wiring';
  const tests = [...new Set(direct.get(path.replace(/\.(ts|tsx)$/, '')) ?? [])];
  const nodeTests = tests.filter(test => test.endsWith('.test.mjs'));
  const playwrightTests = tests.filter(test => test.endsWith('.spec.ts'));
  const pending = /(?:^|\/)(?:api|versions-api|qr-api)\.ts$/.test(path) ? 'HTTP query, payload, ETag and failure contracts'
    : /(?:^|\/)(?:errors|error-text|describe-error)\.ts$/.test(path) ? 'error-code and retry mapping'
      : /(?:^|\/)(?:blocks|content|rich-text|rich-dom|doc-actions|payload)\.ts$/.test(path) ? 'content parsing, edit preservation and validation'
        : /(?:^|\/)(?:format|labels|status|journey)\.ts$/.test(path) ? 'display mapping and boundary values'
          : 'state transitions and malformed-input handling';
  const note = nodeTests.length ? 'Direct Node test; consult assertions and loaded-source coverage.'
    : playwrightTests.length ? 'Existing Playwright spec imports module; inspect whether it runs browser or pure logic.'
    : ['route', 'React component', 'React hook', 'scene renderer'].includes(category) ? 'Outside Node logic/adapter scope; needs component/browser or WebGL coverage.'
      : category === 'logic/API' ? `Pending ${pending} for ${exported.slice(0, 3).join(', ')}; deferred after the high-risk flows in this batch. No coverage claim.`
        : category === 'static data/types' ? 'Static data or type declarations; no standalone behavior test required.'
          : 'Module wiring or no exported executable behavior; inspect if behavior is added.';
  return { path, category, exported, nodeTests, playwrightTests, note };
});
const output = resolve(root, '.codex/local/coverage');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'module-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
const counts = Object.fromEntries(['logic/API', 'React component', 'React hook', 'route', 'scene renderer', 'static data/types', 'type, data or module wiring'].map(category =>
  [category, inventory.filter(item => item.category === category).length]));
const missing = inventory.filter(item => item.category === 'logic/API' && !item.nodeTests.length && !item.playwrightTests.length);
writeFileSync(resolve(output, 'module-inventory.md'), [
  '# FE module inventory', '',
  `Modules: ${inventory.length}; categories: ${JSON.stringify(counts)}.`,
  `Logic/API without a direct Node or existing Playwright test: ${missing.length}. This is an explicit backlog, not a pass claim.`,
  '', '| Module | Category | Exports | Node tests | Existing Playwright specs | Status |', '| --- | --- | --- | --- | --- | --- |',
  ...inventory.map(item => `| ${item.path} | ${item.category} | ${item.exported.join(', ') || '—'} | ${item.nodeTests.join(', ') || '—'} | ${item.playwrightTests.join(', ') || '—'} | ${item.note} |`), '',
].join('\n'));
console.log(`Inventory: ${inventory.length} modules; ${missing.length} logic/API modules without a direct Node or Playwright test.`);
