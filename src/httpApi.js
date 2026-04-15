import { createServer } from 'http';

export function createHttpServer(port, store, registry, pushToMatch) {
	const server = createServer(async (req, res) => {
		const url = new URL(req.url, `http://localhost`);

		// POST /match — register a match and get player tokens
		if (req.method === 'POST' && url.pathname === '/match') {
			let body = '';
			for await (const chunk of req) body += chunk;
			let payload;
			try { payload = JSON.parse(body); } catch {
				return send(res, 400, { error: 'invalid json' });
			}

			const { matchId, players } = payload;
			if (!matchId || !Array.isArray(players) || players.length === 0) {
				return send(res, 400, { error: 'matchId and players[] required' });
			}

			const entry = await registry.createMatch(matchId, players);
			return send(res, 200, { matchId: entry.matchId, tokens: entry.tokens });
		}

		// DELETE /match/:matchId — unregister a match
		const deleteMatch_ = url.pathname.match(/^\/match\/([^/]+)$/);
		if (req.method === 'DELETE' && deleteMatch_) {
			const matchId = decodeURIComponent(deleteMatch_[1]);
			await registry.deleteMatch(matchId);
			await store.clearMatch(matchId);
			return send(res, 200, { ok: true });
		}

		// PUT /match/:matchId/expectedHash — set the expected chart hash for server-side validation
		const expectedHashMatch = url.pathname.match(/^\/match\/([^/]+)\/expectedHash$/);
		if (req.method === 'PUT' && expectedHashMatch) {
			const matchId = decodeURIComponent(expectedHashMatch[1]);
			let body = '';
			for await (const chunk of req) body += chunk;
			let payload;
			try { payload = JSON.parse(body); } catch {
				return send(res, 400, { error: 'invalid json' });
			}
			const { chartHash } = payload;
			if (!chartHash || typeof chartHash !== 'string') {
				return send(res, 400, { error: 'chartHash required' });
			}
			await registry.setExpectedHash(matchId, chartHash);
			return send(res, 200, { ok: true });
		}

		// POST /match/:matchId/readyCheck — push a ready check to all connected players
		const readyCheckMatch = url.pathname.match(/^\/match\/([^/]+)\/readyCheck$/);
		if (req.method === 'POST' && readyCheckMatch) {
			const matchId = decodeURIComponent(readyCheckMatch[1]);
			let body = '';
			for await (const chunk of req) body += chunk;
			let payload;
			try { payload = JSON.parse(body); } catch {
				return send(res, 400, { error: 'invalid json' });
			}
			const { fileReference, title } = payload;
			if (!fileReference || typeof fileReference !== 'string') {
				return send(res, 400, { error: 'fileReference required' });
			}
			pushToMatch?.(matchId, { type: 'readyCheck', matchId, fileReference, title: title ?? null });
			return send(res, 200, { ok: true });
		}

		// GET /match/:matchId/results — fetch final scores
		const resultsMatch = url.pathname.match(/^\/match\/([^/]+)\/results$/);
		if (req.method === 'GET' && resultsMatch) {
			const matchId = decodeURIComponent(resultsMatch[1]);
			const results = await store.getResults(matchId);
			return send(res, 200, { matchId, results });
		}

		send(res, 404, { error: 'not found' });
	});

	server.listen(port, () => console.log(`[http] listening on :${port}`));
	return server;
}

function send(res, status, body) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}
