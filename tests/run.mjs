import { mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { reportCoverage } from './coverage.mjs';

const group = process.argv[2] ?? 'all';
if (!['all', 'unit', 'adapter'].includes(group)) throw new Error(`Unknown group: ${group}`);
const coverage = process.argv.includes('--coverage');
const files = (group === 'all' ? ['unit', 'adapter'] : [group]).flatMap(directory =>
  readdirSync(new URL(`./${directory}/`, import.meta.url))
    .filter(name => name.endsWith('.test.mjs')).map(name => `tests/${directory}/${name}`));
if (!files.length) throw new Error(`No tests in ${group}`);
const output = `.codex/local/coverage/${group}`;
mkdirSync(output, { recursive: true });
const args = ['--import', './tests/support/register.mjs', '--test',
  '--test-reporter=spec', '--test-reporter=junit'];
if (coverage) args.push('--experimental-test-coverage', '--test-coverage-include=src/**', '--test-reporter=lcov');
args.push('--test-reporter-destination=stdout', `--test-reporter-destination=${output}/junit.xml`);
if (coverage) args.push(`--test-reporter-destination=${output}/lcov.info`);
const result = spawnSync(process.execPath, [...args, ...files.sort()], { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
// Preserve measurements even when a regression fails; never call coverage a pass result.
if (coverage) reportCoverage([group]);
