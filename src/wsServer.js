import { WebSocketServer, WebSocket } from 'ws';
import { resolveToken } from './matchRegistry.js';

// subscribers: matchId → Set of WebSocket clients (sssopanel-next etc.)
const subscribers = new Map();

export function createRelayServer(port, store) {
	const wss = new WebSocketServer({ port });

	wss.on('connection', (ws, req) => {
		const url = new URL(req.url, 'http://localhost');
		const token = url.searchParams.get('token');
		const identity = resolveToken(token);

		if (!identity) {
			ws.close(4001, 'invalid token');
			return;
		}

		const { matchId, playerId } = identity;
		console.log(`[relay] ${playerId} connected (match ${matchId})`);

		ws.on('message', async (raw) => {
			let msg;
			try { msg = JSON.parse(raw); } catch { return; }

			if (msg.type === 'live') {
				const data = { score: msg.score, combo: msg.combo, accuracy: msg.accuracy };
				await store.setLive(matchId, playerId, data);
				broadcast(matchId, { type: 'live', matchId, playerId, ...data });

			} else if (msg.type === 'chartEnd') {
				const result = { score: msg.score, fc: !!msg.fc, pfc: !!msg.pfc };
				await store.setResult(matchId, playerId, result);
				broadcast(matchId, { type: 'chartEnd', matchId, playerId, ...result });
				console.log(`[relay] chartEnd ${playerId} score=${msg.score} fc=${msg.fc} pfc=${msg.pfc}`);
			}
		});

		ws.on('close', () => {
			console.log(`[relay] ${playerId} disconnected (match ${matchId})`);
		});
	});

	console.log(`[relay] listening on :${port}`);
	return wss;
}

export function createSubscribeServer(port) {
	const wss = new WebSocketServer({ port });

	wss.on('connection', (ws, req) => {
		const url = new URL(req.url, 'http://localhost');
		const matchId = url.searchParams.get('matchId');

		if (!matchId) {
			ws.close(4002, 'matchId required');
			return;
		}

		if (!subscribers.has(matchId)) subscribers.set(matchId, new Set());
		subscribers.get(matchId).add(ws);
		console.log(`[subscribe] client subscribed to match ${matchId}`);

		ws.on('close', () => {
			subscribers.get(matchId)?.delete(ws);
		});
	});

	console.log(`[subscribe] listening on :${port}`);
	return wss;
}

function broadcast(matchId, payload) {
	const subs = subscribers.get(matchId);
	if (!subs?.size) return;
	const msg = JSON.stringify(payload);
	for (const ws of subs) {
		if (ws.readyState === WebSocket.OPEN) ws.send(msg);
	}
}
