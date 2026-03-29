/**
 * Tests for FC/PFC detection logic in relay/judgments.js.
 * Usage: node tests/test-relay-judgments.js
 */

import { isFc, isPfc } from '../relay/judgments.js';

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
	const ok = actual === expected;
	if (ok) {
		console.log(`  ✓ ${label}`);
		passed++;
	} else {
		console.error(`  ✗ ${label}`);
		console.error(`    expected: ${expected}`);
		console.error(`    actual:   ${actual}`);
		failed++;
	}
}

const clean = { PerfectPlus: 50, Perfect: 0, Great: 0, Good: 0, OK: 0, Bad: 0, Failed: 0 };
const withPerfect = { PerfectPlus: 48, Perfect: 2, Great: 0, Good: 0, OK: 0, Bad: 0, Failed: 0 };
const withGreat = { PerfectPlus: 45, Perfect: 2, Great: 3, Good: 0, OK: 0, Bad: 0, Failed: 0 };
const withBad = { PerfectPlus: 40, Perfect: 2, Great: 3, Good: 2, OK: 1, Bad: 1, Failed: 0 };
const withFailed = { PerfectPlus: 40, Perfect: 2, Great: 3, Good: 2, OK: 1, Bad: 0, Failed: 1 };

// ---------------------------------------------------------------------------
// isFc
// ---------------------------------------------------------------------------
console.log('\n── isFc ──────────────────────────\n');

assert('all PerfectPlus is FC', isFc(clean), true);
assert('with Perfect is FC', isFc(withPerfect), true);
assert('with Great is FC', isFc(withGreat), true);
assert('with Bad is FC', isFc(withBad), true);
assert('with Failed is not FC', isFc(withFailed), false);
assert('null judgments returns false', isFc(null), false);
assert('empty judgments returns false', isFc({}), false);

// ---------------------------------------------------------------------------
// isPfc
// ---------------------------------------------------------------------------
console.log('\n── isPfc ──────────────────────────\n');

assert('all PerfectPlus is PFC', isPfc(clean), true);
assert('with Perfect is not PFC', isPfc(withPerfect), false);
assert('with Great is not PFC', isPfc(withGreat), false);
assert('with Failed is not PFC', isPfc(withFailed), false);
assert('null judgments returns false', isPfc(null), false);
assert('empty judgments returns false', isPfc({}), false);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
