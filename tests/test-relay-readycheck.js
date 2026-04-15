/**
 * Integration tests for the ready check push and playerReady broadcast.
 * Usage: node tests/test-relay-readycheck.js
 */

import { WebSocket } from 'ws';
import { createRelayServer, createSubscribeServer } from '../src/wsServer.js';
import { createHttpServer } from '../src/httpApi.js';
import { MemoryRegistry } from '../src/matchRegistry.js';
import { MemoryStore } from '../src/store.js';

const RELAY_PORT     = 9172;
const SUBSCRIBE_PORT = 9173;
const HTTP_PORT      = 9174;

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

function collectWs(url, timeoutMs = 300) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const messages = [];
		ws.on('open',    ()    => {});
		ws.on('message', raw  => messages.push(JSON.parse(raw)));
		ws.on('error',   err  => reject(err));
		setTimeout(() => { ws.close(); resolve(messages); }, timeoutMs);
	});
}

function sendAndCollect(url, payload, timeoutMs = 300) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const messages = [];
		ws.on('open',    ()    => ws.send(JSON.stringify(payload)));
		ws.on('message', raw  => messages.push(JSON.parse(raw)));
		ws.on('error',   err  => reject(err));
		setTimeout(() => { ws.close(); resolve(messages); }, timeoutMs);
	});
}

async function post(path, body) {
	const res = await fetch(`http://localhost:${HTTP_PORT}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------

const registry = new MemoryRegistry();
const store    = new MemoryStore();
const match    = registry.createMatch('m1', ['p1', 'p2']);
const tokenP1  = match.tokens['p1'];
const tokenP2  = match.tokens['p2'];

const { wss: relayWss, pushToMatch } = await new Promise(resolve => {
	const result = createRelayServer(RELAY_PORT, store, registry);
	result.wss.on('listening', () => resolve(result));
});
const subWss = await new Promise(resolve => {
	const wss = createSubscribeServer(SUBSCRIBE_PORT);
	wss.on('listening', () => resolve(wss));
});
const httpServer = await new Promise(resolve => {
	const s = createHttpServer(HTTP_PORT, store, registry, pushToMatch);
	s.on('listening', () => resolve(s));
});

// ---------------------------------------------------------------------------
console.log('\n── readyCheck push ──────────────────────────────────────────────────\n');

// connect both players first, then fire readyCheck
const p1Promise = collectWs(`ws://localhost:${RELAY_PORT}?token=${tokenP1}`);
const p2Promise = collectWs(`ws://localhost:${RELAY_PORT}?token=${tokenP2}`);
await new Promise(r => setTimeout(r, 50)); // let connections establish

const rc = await post('/match/m1/readyCheck', { fileReference: 'myFileRef', title: 'My Song' });
assert('POST readyCheck returns 200', rc.status, 200);

const [p1Msgs, p2Msgs] = await Promise.all([p1Promise, p2Promise]);
const p1rc = p1Msgs.find(m => m.type === 'readyCheck');
const p2rc = p2Msgs.find(m => m.type === 'readyCheck');
assert('p1 receives readyCheck', p1rc != null, true);
assert('p2 receives readyCheck', p2rc != null, true);
assert('readyCheck has fileReference', p1rc?.fileReference, 'myFileRef');
assert('readyCheck has title',         p1rc?.title,         'My Song');

// no connected players → still 200, no crash
const { wss: wss2, pushToMatch: push2 } = await new Promise(resolve => {
	const r2 = createRelayServer(RELAY_PORT + 10, store, registry);
	r2.wss.on('listening', () => resolve(r2));
});
const httpServer2 = await new Promise(resolve => {
	const s2 = createHttpServer(HTTP_PORT + 10, store, registry, push2);
	s2.on('listening', () => resolve(s2));
});
const emptyRc = await fetch(`http://localhost:${HTTP_PORT + 10}/match/m1/readyCheck`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ fileReference: 'ref', title: 'title' }),
});
assert('POST readyCheck with no players returns 200', emptyRc.status, 200);

// ---------------------------------------------------------------------------
console.log('\n── playerReady broadcast ────────────────────────────────────────────\n');

const match2   = registry.createMatch('m2', ['p1', 'p2']);
const token2P1 = match2.tokens['p1'];

// subscriber connects first, then player sends playerReady
const subPromise = collectWs(`ws://localhost:${SUBSCRIBE_PORT}?matchId=m2`);
await new Promise(r => setTimeout(r, 50));

const playerMsgs = await sendAndCollect(
	`ws://localhost:${RELAY_PORT}?token=${token2P1}`,
	{ type: 'playerReady' },
);

const subMsgs = await subPromise;
const readyMsg = subMsgs.find(m => m.type === 'playerReady');
assert('subscriber receives playerReady', readyMsg != null, true);
assert('playerReady has playerId',         readyMsg?.playerId, 'p1');
assert('playerReady has matchId',          readyMsg?.matchId,  'm2');

// ---------------------------------------------------------------------------

relayWss.close();
wss2.close();
httpServer2.close();
subWss.close();
httpServer.close();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
