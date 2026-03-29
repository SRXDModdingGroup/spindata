/**
 * MemoryStore: in-memory match state store.
 * Drop-in replaceable with a RedisStore for persistence across restarts.
 */
export class MemoryStore {
	constructor() {
		this._live = new Map();    // `${matchId}:${playerId}` → live data
		this._results = new Map(); // `${matchId}:${playerId}` → result
	}

	_liveKey(matchId, playerId) { return `${matchId}:${playerId}`; }

	setLive(matchId, playerId, data) {
		this._live.set(this._liveKey(matchId, playerId), data);
	}

	getLive(matchId, playerId) {
		return this._live.get(this._liveKey(matchId, playerId)) ?? null;
	}

	setResult(matchId, playerId, result) {
		this._results.set(this._liveKey(matchId, playerId), result);
	}

	getResult(matchId, playerId) {
		return this._results.get(this._liveKey(matchId, playerId)) ?? null;
	}

	getResults(matchId) {
		const out = {};
		for (const [key, val] of this._results.entries()) {
			if (key.startsWith(`${matchId}:`)) {
				const playerId = key.slice(matchId.length + 1);
				out[playerId] = val;
			}
		}
		return out;
	}

	clearMatch(matchId) {
		for (const key of [...this._live.keys()]) {
			if (key.startsWith(`${matchId}:`)) this._live.delete(key);
		}
		for (const key of [...this._results.keys()]) {
			if (key.startsWith(`${matchId}:`)) this._results.delete(key);
		}
	}
}

/**
 * RedisStore: persistent store backed by Redis.
 * Uses the same interface as MemoryStore.
 */
export class RedisStore {
	constructor(redis) {
		this._redis = redis;
	}

	_liveKey(matchId, playerId) { return `spindata:live:${matchId}:${playerId}`; }
	_resultKey(matchId, playerId) { return `spindata:result:${matchId}:${playerId}`; }

	async setLive(matchId, playerId, data) {
		await this._redis.set(this._liveKey(matchId, playerId), JSON.stringify(data), 'EX', 86400);
	}

	async getLive(matchId, playerId) {
		const raw = await this._redis.get(this._liveKey(matchId, playerId));
		return raw ? JSON.parse(raw) : null;
	}

	async setResult(matchId, playerId, result) {
		await this._redis.set(this._resultKey(matchId, playerId), JSON.stringify(result), 'EX', 86400);
	}

	async getResult(matchId, playerId) {
		const raw = await this._redis.get(this._resultKey(matchId, playerId));
		return raw ? JSON.parse(raw) : null;
	}

	async getResults(matchId) {
		const keys = await this._redis.keys(`spindata:result:${matchId}:*`);
		if (!keys.length) return {};
		const values = await this._redis.mget(...keys);
		const out = {};
		for (let i = 0; i < keys.length; i++) {
			const playerId = keys[i].split(':').pop();
			out[playerId] = JSON.parse(values[i]);
		}
		return out;
	}

	async clearMatch(matchId) {
		const liveKeys = await this._redis.keys(`spindata:live:${matchId}:*`);
		const resultKeys = await this._redis.keys(`spindata:result:${matchId}:*`);
		const all = [...liveKeys, ...resultKeys];
		if (all.length) await this._redis.del(...all);
	}
}
