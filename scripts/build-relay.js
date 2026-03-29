/**
 * Bundles and packages the relay client into standalone binaries.
 *
 * Outputs:
 *   dist/spindata-relay.exe        (Windows x64)
 *   dist/spindata-relay-linux      (Linux x64)
 *
 * Usage: node scripts/build-relay.js
 */

import { build } from 'esbuild';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';

mkdirSync('dist', { recursive: true });

console.log('[1/2] bundling relay with esbuild...');
await build({
	entryPoints: ['relay/index.js'],
	bundle: true,
	platform: 'node',
	target: 'node20',
	format: 'cjs',
	outfile: 'dist/relay.cjs',
	external: [],
});

console.log('[2/2] packaging with pkg...');
execSync(
	'npx pkg dist/relay.cjs --targets node20-win-x64,node20-linux-x64 --output dist/spindata-relay',
	{ stdio: 'inherit' }
);

console.log('\ndone!');
console.log('  dist/spindata-relay.exe');
console.log('  dist/spindata-relay-linux');
