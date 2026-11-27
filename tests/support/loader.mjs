import { existsSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'react' && context.parentURL?.includes('/src/api/idempotency.ts')) {
    return { url: pathToFileURL(join(root, 'tests/support/react.mjs')).href, shortCircuit: true };
  }
  let path;
  const [name, query] = specifier.split('?');
  if (name.startsWith('@/')) path = join(root, 'src', name.slice(2));
  else if (name.startsWith('.') && context.parentURL?.startsWith('file:')) {
    path = resolvePath(dirname(fileURLToPath(context.parentURL)), name);
  }
  if (path) {
    const file = [path, `${path}.ts`, `${path}.mjs`, join(path, 'index.ts')]
      .find(candidate => /\.(ts|mjs|js)$/.test(candidate) && existsSync(candidate));
    if (file) return { url: pathToFileURL(file).href + (query ? `?${query}` : ''), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
