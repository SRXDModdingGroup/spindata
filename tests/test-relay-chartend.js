/**
 * Tests for chartHash tracking and server-side hash validation in the relay result builder.
 * Usage: node tests/test-relay-chartend.js
 */

import { buildChartResult } from '../src/wsServer.js';

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		console.log(`  ✓ ${label}`);
		passed++;
	} else {
		console.error(`  ✗ ${label}`);
		console.error(`    expected: ${JSON.stringify(expected)}`);
		console.error(`    actual:   ${JSON.stringify(actual)}`);
		failed++;
	}
}

const HASH = 'deadbeef';
const HASH_OTHER = 'cafebabe';

// ---------------------------------------------------------------------------
// chartHash forwarding (no expected hash)
// ---------------------------------------------------------------------------
console.log('\n── buildChartResult — chartHash forwarding ──────────────────────────\n');

assert(
	'chartHash included, no expected → hashValid null',
	buildChartResult(10000, 'PerfectPlus', HASH, null, false),
	{ score: 10000, fc: true, pfc: true, chartHash: HASH, expectedChartHash: null, hashValid: null },
);

assert(
	'null chartHash, no expected → hashValid null',
	buildChartResult(10000, 'PerfectPlus', null, null, false),
	{ score: 10000, fc: true, pfc: true, chartHash: null, expectedChartHash: null, hashValid: null },
);

assert(
	'undefined chartHash treated as null',
	buildChartResult(10000, 'PerfectPlus', undefined, null, false),
	{ score: 10000, fc: true, pfc: true, chartHash: null, expectedChartHash: null, hashValid: null },
);

// ---------------------------------------------------------------------------
// hashValid — server-side validation
// ---------------------------------------------------------------------------
console.log('\n── buildChartResult — hashValid ──────────────────────────\n');

assert(
	'matching hash → hashValid true',
	buildChartResult(10000, 'PerfectPlus', HASH, HASH, false),
	{ score: 10000, fc: true, pfc: true, chartHash: HASH, expectedChartHash: HASH, hashValid: true },
);

assert(
	'mismatching hash → hashValid false',
	buildChartResult(10000, 'PerfectPlus', HASH, HASH_OTHER, false),
	{ score: 10000, fc: true, pfc: true, chartHash: HASH, expectedChartHash: HASH_OTHER, hashValid: false },
);

assert(
	'null client hash, expected set → hashValid null (nothing to compare)',
	buildChartResult(10000, 'PerfectPlus', null, HASH, false),
	{ score: 10000, fc: true, pfc: true, chartHash: null, expectedChartHash: HASH, hashValid: null },
);

// ---------------------------------------------------------------------------
// failed track
// ---------------------------------------------------------------------------
console.log('\n── buildChartResult — failed track ──────────────────────────\n');

assert(
	'failed track clears fc/pfc, keeps chartHash and hashValid',
	buildChartResult(5000, 'PerfectPlus', HASH, HASH, true),
	{ score: 5000, fc: false, pfc: false, chartHash: HASH, expectedChartHash: HASH, hashValid: true },
);

assert(
	'failed track, null hash',
	buildChartResult(0, null, null, null, true),
	{ score: 0, fc: false, pfc: false, chartHash: null, expectedChartHash: null, hashValid: null },
);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
