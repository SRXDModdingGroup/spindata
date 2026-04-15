import Redis from 'ioredis';
import { MemoryStore, RedisStore } from './src/store.js';
import { MemoryRegistry, RedisRegistry } from './src/matchRegistry.js';
import { createRelayServer, createSubscribeServer } from './src/wsServer.js';
import { createHttpServer } from './src/httpApi.js';

const RELAY_PORT     = parseInt(process.env.RELAY_PORT     || '7701');
const SUBSCRIBE_PORT = parseInt(process.env.SUBSCRIBE_PORT || '7702');
const HTTP_PORT      = parseInt(process.env.HTTP_PORT      || '7700');
const REDIS_URL      = process.env.REDIS_URL;

let store, registry;
if (REDIS_URL) {
	const redis = new Redis(REDIS_URL);
	store    = new RedisStore(redis);
	registry = new RedisRegistry(redis);
	console.log('[spindata] using RedisStore + RedisRegistry');
} else {
	store    = new MemoryStore();
	registry = new MemoryRegistry();
	console.log('[spindata] using MemoryStore + MemoryRegistry (no REDIS_URL set)');
}

const { pushToMatch } = createRelayServer(RELAY_PORT, store, registry);
createHttpServer(HTTP_PORT, store, registry, pushToMatch);
createSubscribeServer(SUBSCRIBE_PORT);
