import { randomBytes } from 'crypto';

const matches = new Map();   // matchId → { matchId, players, tokens: { playerId → token } }
const tokens = new Map();    // token → { matchId, playerId }

function generateToken() {
	return randomBytes(24).toString('hex');
}

export function createMatch(matchId, players) {
	// invalidate tokens from any previous entry for this matchId
	if (matches.has(matchId)) {
		const old = matches.get(matchId);
		for (const tok of Object.values(old.tokens)) tokens.delete(tok);
	}

	const tokenMap = {};
	for (const playerId of players) {
		const token = generateToken();
		tokenMap[playerId] = token;
		tokens.set(token, { matchId, playerId });
	}

	const entry = { matchId, players, tokens: tokenMap };
	matches.set(matchId, entry);
	return entry;
}

export function resolveToken(token) {
	if (!token) return null;
	return tokens.get(token) ?? null;
}

export function getMatch(matchId) {
	return matches.get(matchId) ?? null;
}

export function deleteMatch(matchId) {
	const entry = matches.get(matchId);
	if (!entry) return;
	for (const tok of Object.values(entry.tokens)) tokens.delete(tok);
	matches.delete(matchId);
}
