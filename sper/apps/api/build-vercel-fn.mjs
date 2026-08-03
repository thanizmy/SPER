import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'fs';

/**
 * Vercel runs the deployed function as plain ESM Node, which -- unlike a
 * bundler -- requires exact file extensions on relative imports. Rather
 * than rewrite every relative import in the codebase, bundle the whole
 * function into one self-contained file: real npm packages stay as
 * ordinary `import` specifiers (Node resolves those fine via their own
 * published package.json), while our own workspace packages (which point
 * their "main" straight at TypeScript source, for bundler-based
 * consumers like Expo) get inlined away along with everything else.
 */
mkdirSync('api', { recursive: true });

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => name !== '@sper/shared-types');

await build({
  entryPoints: ['vercel-fn.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external,
});
