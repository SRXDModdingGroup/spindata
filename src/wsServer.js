import { WebSocketServer, WebSocket } from 'ws';

// subscribers: matchId → Set of WebSocket clients (sssopanel-next etc.)
const subscribers = new Map();

export function fcFromFullCombo(fullCombo) {
	return fullCombo != null && fullCombo !== 'None';
}

export function pfcFromFullCombo(fullCombo) {
	return fullCombo === 'PerfectPlus' || fullCombo === 'Perfect';
}

export function createRelayServer(port, store, registry) {
	const wss = new WebSocketServer({ port });

	wss.on('connection', async (ws, req) => {
		const url = new URL(req.url, 'http://localhost');
		const token = url.searchParams.get('token');
		const identity = await registry.resolveToken(token);

		if (!identity) {
			ws.close(4001, 'invalid token');
			return;
		}

		const { matchId, playerId } = identity;
		console.log(`[relay] ${playerId} connected (match ${matchId})`);

		// per-connection state tracked for result storage
		let lastScore = null;
		let lastFullCombo = null;

		ws.on('message', async (raw) => {
			let msg;
			try { msg = JSON.parse(raw); } catch { return; }

			// tag every event with matchId + playerId before broadcasting
			const tagged = { matchId, playerId, ...msg };

			if (msg.type === 'scoreEvent') {
				lastScore      = msg.status?.score      ?? lastScore;
				lastFullCombo  = msg.status?.fullCombo  ?? lastFullCombo;
				await store.setLive(matchId, playerId, {
					score:      msg.status?.score,
					combo:      msg.status?.combo,
					fullCombo:  msg.status?.fullCombo,
				});
			}

			if (msg.type === 'trackComplete' || msg.type === 'trackFail') {
				const failed = msg.type === 'trackFail';
				const result = {
					score: lastScore,
					fc:    failed ? false : fcFromFullCombo(lastFullCombo),
					pfc:   failed ? false : pfcFromFullCombo(lastFullCombo),
				};
				await store.setResult(matchId, playerId, result);
				console.log(`[relay] chartEnd ${playerId} score=${result.score} fc=${result.fc} pfc=${result.pfc}`);

				// broadcast the raw event first, then a synthetic chartEnd for convenience
				broadcast(matchId, tagged);
				broadcast(matchId, { type: 'chartEnd', matchId, playerId, ...result });
				lastScore = null;
				lastFullCombo = null;
				return;
			}

			broadcast(matchId, tagged);
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
