/**
 * Tests for store.js - in-memory match state store (no redis required).
 * Usage: node tests/test-store.js
 */

import { MemoryStore } from '../src/store.js';

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

function assertNull(label, actual) {
	const ok = actual === null || actual === undefined;
	if (ok) {
		console.log(`  ✓ ${label}`);
		passed++;
	} else {
		console.error(`  ✗ ${label}`);
		console.error(`    expected null/undefined, got: ${JSON.stringify(actual)}`);
		failed++;
	}
}

const store = new MemoryStore();

// ---------------------------------------------------------------------------
// setLive / getLive
// ---------------------------------------------------------------------------
console.log('\n── setLive / getLive ──────────────────────────\n');

store.setLive('match-1', 'alice', { score: 5000, combo: 50, accuracy: 98.5 });
assert('getLive returns stored data', store.getLive('match-1', 'alice'), { score: 5000, combo: 50, accuracy: 98.5 });

store.setLive('match-1', 'alice', { score: 8000, combo: 80, accuracy: 99.0 });
assert('getLive returns updated data', store.getLive('match-1', 'alice'), { score: 8000, combo: 80, accuracy: 99.0 });

assertNull('getLive unknown match returns null', store.getLive('nope', 'alice'));
assertNull('getLive unknown player returns null', store.getLive('match-1', 'nobody'));

// ---------------------------------------------------------------------------
// setResult / getResult / getResults
// ---------------------------------------------------------------------------
console.log('\n── setResult / getResult / getResults ──────────────────────────\n');

store.setResult('match-1', 'alice', { score: 12345, fc: true, pfc: false });
assert('getResult returns stored result', store.getResult('match-1', 'alice'), { score: 12345, fc: true, pfc: false });

store.setResult('match-1', 'bob', { score: 11000, fc: false, pfc: false });
assert('getResults returns all players', store.getResults('match-1'), {
	alice: { score: 12345, fc: true, pfc: false },
	bob: { score: 11000, fc: false, pfc: false },
});

assertNull('getResult unknown player returns null', store.getResult('match-1', 'nobody'));
assert('getResults unknown match returns empty object', store.getResults('nope'), {});

store.setResult('match-2', 'carol', { score: 9000, fc: true, pfc: false, chartHash: 'abc123' });
assert('getResult preserves chartHash', store.getResult('match-2', 'carol'), { score: 9000, fc: true, pfc: false, chartHash: 'abc123' });

store.setResult('match-2', 'dave', { score: 8000, fc: false, pfc: false, chartHash: null });
assert('getResult preserves null chartHash', store.getResult('match-2', 'dave'), { score: 8000, fc: false, pfc: false, chartHash: null });

assert('getResults includes chartHash for all players', store.getResults('match-2'), {
	carol: { score: 9000, fc: true, pfc: false, chartHash: 'abc123' },
	dave:  { score: 8000, fc: false, pfc: false, chartHash: null },
});

// ---------------------------------------------------------------------------
// clearMatch
// ---------------------------------------------------------------------------
console.log('\n── clearMatch ──────────────────────────\n');

store.clearMatch('match-1');
assertNull('getLive cleared after clearMatch', store.getLive('match-1', 'alice'));
assertNull('getResult cleared after clearMatch', store.getResult('match-1', 'alice'));
assert('getResults cleared after clearMatch', store.getResults('match-1'), {});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
