import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const slash = (path) => path.split(sep).join('/');
function sources(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = directory + '/' + entry.name;
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

/** Union executable line hits across groups; unloaded modules are listed, never hidden in a percentage. */
export function reportCoverage(groups) {
  const hits = new Map();
  for (const group of groups) {
    if (!['all', 'unit', 'adapter'].includes(group)) throw new Error('Unknown coverage group');
    const lcov = readFileSync(resolve(root, '.codex/local/coverage', group, 'lcov.info'), 'utf8');
    let lines;
    for (const row of lcov.split(/\r?\n/)) {
      if (row.startsWith('SF:')) {
        const source = row.slice(3).replace(/\?real$/, '');
        const absolute = source.startsWith('file:') ? fileURLToPath(source) : resolve(root, source);
        const path = slash(relative(root, absolute));
        if (!hits.has(path)) hits.set(path, new Map());
        lines = hits.get(path);
      } else if (row.startsWith('DA:') && lines) {
        const [number, count] = row.slice(3).split(',').map(Number);
        lines.set(number, (lines.get(number) ?? 0) + count);
      }
    }
  }
  const inventory = sources('src').sort().map((path) => {
    const lines = hits.get(path);
    const found = lines?.size ?? 0;
    const covered = lines ? [...lines.values()].filter((n) => n > 0).length : 0;
    return {
      path,
      kind: path.endsWith('.d.ts')
        ? 'declaration'
        : path.endsWith('.tsx')
          ? 'React/UI'
          : 'TypeScript module',
      loaded: found > 0,
      covered,
      found,
    };
  });
  const loaded = inventory.filter((item) => item.loaded);
  const covered = loaded.reduce((sum, item) => sum + item.covered, 0);
  const found = loaded.reduce((sum, item) => sum + item.found, 0);
  const summary = [
    '# FE Node coverage',
    '',
    `Groups: ${groups.join(', ')}. Loaded source files: ${loaded.length}/${inventory.length}.`,
    `Loaded-source executable lines: ${covered}/${found} (${found ? ((100 * covered) / found).toFixed(2) : '0.00'}%).`,
    '',
    'This percentage covers only sources loaded by Node, using V8 coverage of stripped TypeScript. It is not whole-app coverage.',
    'Not loaded means not measured, not zero executable lines. Loading a module alone does not prove its behavior is tested.',
    'React components/hooks, browser multi-tab behavior, WebGL and real providers require separate tests.',
    '',
    '| Source | Kind | Loaded executable lines |',
    '| --- | --- | --- |',
    ...inventory.map(
      (item) =>
        `| ${item.path} | ${item.kind} | ${item.loaded ? item.covered + '/' + item.found : 'Not loaded'} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(resolve(root, '.codex/local/coverage/summary.md'), summary);
  writeFileSync(
    resolve(root, '.codex/local/coverage/inventory.json'),
    JSON.stringify(inventory, null, 2) + '\n',
  );
  console.log(
    `Coverage inventory: ${loaded.length}/${inventory.length} loaded source files; ${covered}/${found} loaded-source lines. See .codex/local/coverage/summary.md`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const groups = process.argv.slice(2);
  if (!groups.length) throw new Error('Provide coverage groups: all, or unit adapter');
  reportCoverage(groups);
}
