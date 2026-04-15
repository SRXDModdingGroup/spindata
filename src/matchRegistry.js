import { randomBytes } from 'crypto';

function generateToken() {
	return randomBytes(24).toString('hex');
}

/**
 * MemoryRegistry: in-memory token/match registry.
 * Drop-in replaceable with RedisRegistry for persistence across restarts.
 */
export class MemoryRegistry {
	constructor() {
		this._matches = new Map(); // matchId → { matchId, players, tokens: { playerId → token } }
		this._tokens  = new Map(); // token → { matchId, playerId }
	}

	createMatch(matchId, players) {
		if (this._matches.has(matchId)) {
			const old = this._matches.get(matchId);
			for (const tok of Object.values(old.tokens)) this._tokens.delete(tok);
		}
		const tokenMap = {};
		for (const playerId of players) {
			const token = generateToken();
			tokenMap[playerId] = token;
			this._tokens.set(token, { matchId, playerId });
		}
		const entry = { matchId, players, tokens: tokenMap };
		this._matches.set(matchId, entry);
		return entry;
	}

	resolveToken(token) {
		if (!token) return null;
		return this._tokens.get(token) ?? null;
	}

	getMatch(matchId) {
		return this._matches.get(matchId) ?? null;
	}

	setExpectedHash(matchId, hash) {
		const entry = this._matches.get(matchId);
		if (!entry) return;
		entry.expectedHash = hash;
	}

	getExpectedHash(matchId) {
		return this._matches.get(matchId)?.expectedHash ?? null;
	}

	deleteMatch(matchId) {
		const entry = this._matches.get(matchId);
		if (!entry) return;
		for (const tok of Object.values(entry.tokens)) this._tokens.delete(tok);
		this._matches.delete(matchId);
	}
}

/**
 * RedisRegistry: persistent token/match registry backed by Redis.
 * Survives server restarts. Uses the same interface as MemoryRegistry.
 */
export class RedisRegistry {
	constructor(redis) {
		this._redis = redis;
	}

	_tokenKey(token)   { return `spindata:registry:token:${token}`; }
	_matchKey(matchId) { return `spindata:registry:match:${matchId}`; }

	async createMatch(matchId, players) {
		// Invalidate tokens from any previous entry for this matchId
		const oldRaw = await this._redis.get(this._matchKey(matchId));
		if (oldRaw) {
			const old = JSON.parse(oldRaw);
			const pipe = this._redis.pipeline();
			for (const tok of Object.values(old.tokens)) pipe.del(this._tokenKey(tok));
			await pipe.exec();
		}

		const tokenMap = {};
		for (const playerId of players) {
			tokenMap[playerId] = generateToken();
		}

		const entry = { matchId, players, tokens: tokenMap };
		const pipe = this._redis.pipeline();
		pipe.set(this._matchKey(matchId), JSON.stringify(entry), 'EX', 86400);
		for (const [playerId, token] of Object.entries(tokenMap)) {
			pipe.set(this._tokenKey(token), JSON.stringify({ matchId, playerId }), 'EX', 86400);
		}
		await pipe.exec();
		return entry;
	}

	async resolveToken(token) {
		if (!token) return null;
		const raw = await this._redis.get(this._tokenKey(token));
		return raw ? JSON.parse(raw) : null;
	}

	async getMatch(matchId) {
		const raw = await this._redis.get(this._matchKey(matchId));
		return raw ? JSON.parse(raw) : null;
	}

	_expectedHashKey(matchId) { return `spindata:registry:expectedHash:${matchId}`; }

	async setExpectedHash(matchId, hash) {
		await this._redis.set(this._expectedHashKey(matchId), hash, 'EX', 86400);
	}

	async getExpectedHash(matchId) {
		return await this._redis.get(this._expectedHashKey(matchId));
	}

	async deleteMatch(matchId) {
		const raw = await this._redis.get(this._matchKey(matchId));
		if (!raw) return;
		const entry = JSON.parse(raw);
		const pipe = this._redis.pipeline();
		pipe.del(this._matchKey(matchId));
		pipe.del(this._expectedHashKey(matchId));
		for (const tok of Object.values(entry.tokens)) pipe.del(this._tokenKey(tok));
		await pipe.exec();
	}
}
