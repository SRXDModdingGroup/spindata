/**
 * Integration tests for hash mismatch notification.
 * Spins up a real relay server, connects a WS client, and verifies the server
 * sends chartHashMismatch back when the client sends a wrong chartHash on trackStart.
 * Usage: node tests/test-relay-hashmismatch.js
 */

import { WebSocket } from 'ws';
import { createRelayServer } from '../src/wsServer.js';
import { MemoryRegistry } from '../src/matchRegistry.js';
import { MemoryStore } from '../src/store.js';

const PORT = 9171;

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

// connect, send one message, collect all server responses until timeout
function sendAndCollect(token, payload, timeoutMs = 300) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://localhost:${PORT}?token=${token}`);
		const messages = [];
		ws.on('open', () => ws.send(JSON.stringify(payload)));
		ws.on('message', raw => messages.push(JSON.parse(raw)));
		ws.on('error', err => reject(err));
		setTimeout(() => { ws.close(); resolve(messages); }, timeoutMs);
	});
}

function setup() {
	const registry = new MemoryRegistry();
	const store    = new MemoryStore();
	const match    = registry.createMatch('m1', ['p1', 'p2']);
	return { registry, store, match };
}

// wait for wss to be listening
function serve(store, registry) {
	return new Promise(resolve => {
		const wss = createRelayServer(PORT, store, registry);
		wss.on('listening', () => resolve(wss));
	});
}

// ---------------------------------------------------------------------------

console.log('\n── hash mismatch notification ───────────────────────────────────────\n');

const { registry, store, match } = setup();
registry.setExpectedHash('m1', 'correcthash');
const tokenP1 = match.tokens['p1'];
const tokenP2 = match.tokens['p2'];

const wss = await serve(store, registry);

// wrong hash → server should send chartHashMismatch back
const msgsWrong = await sendAndCollect(tokenP1,
	{ type: 'trackStart', status: { chartHash: 'wronghash' } });
const mismatch = msgsWrong.find(m => m.type === 'chartHashMismatch');
assert('wrong hash → receives chartHashMismatch', mismatch != null, true);

// correct hash → no mismatch message
const msgsCorrect = await sendAndCollect(tokenP2,
	{ type: 'trackStart', status: { chartHash: 'correcthash' } });
const noMismatch = msgsCorrect.find(m => m.type === 'chartHashMismatch');
assert('correct hash → no chartHashMismatch', noMismatch, undefined);

// no expected hash → no mismatch message
const { registry: r2, store: s2, match: m2 } = setup();
const wss2 = await new Promise(resolve => {
	// reuse port after closing first server
	wss.close(() => {
		const w = createRelayServer(PORT, s2, r2);
		w.on('listening', () => resolve(w));
	});
});
const msgsNoExpected = await sendAndCollect(m2.tokens['p1'],
	{ type: 'trackStart', status: { chartHash: 'somehash' } });
const noMismatch2 = msgsNoExpected.find(m => m.type === 'chartHashMismatch');
assert('no expected hash → no chartHashMismatch', noMismatch2, undefined);

// null chartHash (mod failed to compute) → no mismatch message
const msgsNullHash = await sendAndCollect(m2.tokens['p2'],
	{ type: 'trackStart', status: { chartHash: null } });
const noMismatch3 = msgsNullHash.find(m => m.type === 'chartHashMismatch');
assert('null chartHash → no chartHashMismatch', noMismatch3, undefined);

wss2.close();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
