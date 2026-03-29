/**
 * Tests for FC/PFC detection from SpinStatus fullCombo field.
 * Usage: node tests/test-fullcombo.js
 */

import { fcFromFullCombo, pfcFromFullCombo } from '../src/wsServer.js';

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

console.log('\n── fcFromFullCombo ──────────────────────────\n');

assert('PerfectPlus is FC',  fcFromFullCombo('PerfectPlus'), true);
assert('Perfect is FC',      fcFromFullCombo('Perfect'),     true);
assert('Great is FC',        fcFromFullCombo('Great'),       true);
assert('Good is FC',         fcFromFullCombo('Good'),        true);
assert('Okay is FC',         fcFromFullCombo('Okay'),        true);
assert('None is not FC',     fcFromFullCombo('None'),        false);
assert('null is not FC',     fcFromFullCombo(null),          false);
assert('undefined is not FC',fcFromFullCombo(undefined),     false);

console.log('\n── pfcFromFullCombo ──────────────────────────\n');

assert('PerfectPlus is PFC', pfcFromFullCombo('PerfectPlus'), true);
assert('Perfect is PFC',     pfcFromFullCombo('Perfect'),     true);
assert('Great is not PFC',   pfcFromFullCombo('Great'),       false);
assert('Good is not PFC',    pfcFromFullCombo('Good'),        false);
assert('None is not PFC',    pfcFromFullCombo('None'),        false);
assert('null is not PFC',    pfcFromFullCombo(null),          false);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
