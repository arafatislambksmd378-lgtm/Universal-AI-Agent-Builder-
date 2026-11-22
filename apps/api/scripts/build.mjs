#!/usr/bin/env node
/**
 * Bundle the Worker exactly as it will ship. This catches import errors and
 * accidental Node-only dependencies before `wrangler deploy` runs.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

await build({
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'browser'],
  external: ['@cloudflare/workers-types', 'node:*'],
  logLevel: 'info',
  sourcemap: false,
  minify: false,
});

console.log('Worker bundle written to apps/api/dist/index.js');
