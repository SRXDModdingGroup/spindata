import Redis from 'ioredis';
import { MemoryStore, RedisStore } from './src/store.js';
import { createRelayServer, createSubscribeServer } from './src/wsServer.js';
import { createHttpServer } from './src/httpApi.js';

const RELAY_PORT     = parseInt(process.env.RELAY_PORT     || '7701');
const SUBSCRIBE_PORT = parseInt(process.env.SUBSCRIBE_PORT || '7702');
const HTTP_PORT      = parseInt(process.env.HTTP_PORT      || '7700');
const REDIS_URL      = process.env.REDIS_URL;

let store;
if (REDIS_URL) {
	const redis = new Redis(REDIS_URL);
	store = new RedisStore(redis);
	console.log('[spindata] using RedisStore');
} else {
	store = new MemoryStore();
	console.log('[spindata] using MemoryStore (no REDIS_URL set)');
}

createHttpServer(HTTP_PORT, store);
createRelayServer(RELAY_PORT, store);
createSubscribeServer(SUBSCRIBE_PORT);
