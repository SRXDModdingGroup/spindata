/**
 * Tests for matchRegistry.js - match/token management logic.
 * No redis required. Usage: node tests/test-match-registry.js
 */

import { MemoryRegistry } from '../src/matchRegistry.js';

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

function assertNotNull(label, actual) {
	const ok = actual !== null && actual !== undefined;
	if (ok) {
		console.log(`  ✓ ${label}`);
		passed++;
	} else {
		console.error(`  ✗ ${label}`);
		console.error(`    expected non-null, got: ${JSON.stringify(actual)}`);
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

const reg = new MemoryRegistry();

// ---------------------------------------------------------------------------
// createMatch
// ---------------------------------------------------------------------------
console.log('\n── createMatch ──────────────────────────\n');

const match1 = reg.createMatch('match-1', ['alice', 'bob']);
assertNotNull('returns tokens for alice', match1.tokens['alice']);
assertNotNull('returns tokens for bob', match1.tokens['bob']);

const tokAlice = match1.tokens['alice'];
const tokBob = match1.tokens['bob'];
assert('tokens are unique', tokAlice !== tokBob, true);
assert('matchId is preserved', match1.matchId, 'match-1');
assert('players list is preserved', match1.players, ['alice', 'bob']);

// ---------------------------------------------------------------------------
// resolveToken
// ---------------------------------------------------------------------------
console.log('\n── resolveToken ──────────────────────────\n');

const resolvedAlice = reg.resolveToken(tokAlice);
assert('resolves alice token to correct matchId', resolvedAlice.matchId, 'match-1');
assert('resolves alice token to correct playerId', resolvedAlice.playerId, 'alice');

const resolvedBob = reg.resolveToken(tokBob);
assert('resolves bob token to correct playerId', resolvedBob.playerId, 'bob');

assertNull('unknown token returns null', reg.resolveToken('bogus-token'));
assertNull('empty token returns null', reg.resolveToken(''));
assertNull('null token returns null', reg.resolveToken(null));

// ---------------------------------------------------------------------------
// getMatch
// ---------------------------------------------------------------------------
console.log('\n── getMatch ──────────────────────────\n');

const fetched = reg.getMatch('match-1');
assert('getMatch returns correct matchId', fetched.matchId, 'match-1');
assert('getMatch returns correct players', fetched.players, ['alice', 'bob']);
assertNull('getMatch on unknown id returns null', reg.getMatch('nope'));

// ---------------------------------------------------------------------------
// deleteMatch
// ---------------------------------------------------------------------------
console.log('\n── deleteMatch ──────────────────────────\n');

const match2 = reg.createMatch('match-2', ['charlie']);
const tokCharlie = match2.tokens['charlie'];
assertNotNull('token resolves before delete', reg.resolveToken(tokCharlie));

reg.deleteMatch('match-2');
assertNull('getMatch returns null after delete', reg.getMatch('match-2'));
assertNull('token no longer resolves after delete', reg.resolveToken(tokCharlie));

// ---------------------------------------------------------------------------
// duplicate matchId
// ---------------------------------------------------------------------------
console.log('\n── duplicate matchId ──────────────────────────\n');

reg.createMatch('match-3', ['dave']);
const replaced = reg.createMatch('match-3', ['eve']);
assert('re-registering a matchId replaces old entry', replaced.players, ['eve']);
assertNull('old player token is invalidated after replacement', reg.resolveToken(replaced.tokens['dave']));

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
