/**
 * spindata relay client
 *
 * Bridges SpinStatus (local WS on the player's machine) to the spindata server.
 *
 * Config (via .env or environment variables):
 *   SPINDATA_URL    — relay WS endpoint, e.g. ws://tournament.example.com:7701
 *   SPINDATA_TOKEN  — player token issued by refbot for this match
 *
 * Usage: node --env-file=.env relay/index.js
 */

import { WebSocket } from 'ws';
import { isFc, isPfc } from './judgments.js';

const SPINSTATUS_URL = 'ws://localhost:38304';
const SPINDATA_URL   = process.env.SPINDATA_URL;
const SPINDATA_TOKEN = process.env.SPINDATA_TOKEN;
const RECONNECT_MS   = 3000;

if (!SPINDATA_URL || !SPINDATA_TOKEN) {
	console.error('SPINDATA_URL and SPINDATA_TOKEN must be set');
	process.exit(1);
}

let lastJudgments = null;
let lastScore = null;

function connectSpindata() {
	const url = `${SPINDATA_URL}?token=${encodeURIComponent(SPINDATA_TOKEN)}`;
	const upstream = new WebSocket(url);

	upstream.on('open', () => {
		console.log('[spindata] connected');
		connectSpinStatus(upstream);
	});

	upstream.on('close', (code, reason) => {
		console.warn(`[spindata] disconnected (${code} ${reason}) — retrying in ${RECONNECT_MS}ms`);
		setTimeout(connectSpindata, RECONNECT_MS);
	});

	upstream.on('error', (err) => {
		console.error('[spindata] error:', err.message);
	});
}

function connectSpinStatus(upstream) {
	const local = new WebSocket(SPINSTATUS_URL);

	local.on('open', () => {
		console.log('[SpinStatus] connected');
	});

	local.on('message', (raw) => {
		let msg;
		try { msg = JSON.parse(raw); } catch { return; }

		if (upstream.readyState !== WebSocket.OPEN) return;

		if (msg.type === 'scoreEvent') {
			const s = msg.status;
			lastJudgments = s.judgments ?? null;
			lastScore = s.score ?? null;
			upstream.send(JSON.stringify({
				type: 'live',
				score: s.score,
				combo: s.combo,
				accuracy: deriveAccuracy(s.judgments),
			}));
		}

		if (msg.type === 'trackComplete') {
			upstream.send(JSON.stringify({
				type: 'chartEnd',
				score: lastScore,
				fc: isFc(lastJudgments),
				pfc: isPfc(lastJudgments),
			}));
			lastJudgments = null;
			lastScore = null;
		}

		if (msg.type === 'trackFail') {
			upstream.send(JSON.stringify({
				type: 'chartEnd',
				score: lastScore,
				fc: false,
				pfc: false,
			}));
			lastJudgments = null;
			lastScore = null;
		}
	});

	local.on('close', () => {
		console.warn('[SpinStatus] disconnected — game closed or mod not running');
	});

	local.on('error', (err) => {
		console.warn('[SpinStatus] error:', err.message);
	});

	// if spindata disconnects, close the local connection too so we reconnect cleanly
	upstream.on('close', () => local.close());
}

/**
 * Derives an accuracy percentage (0–100) from the judgments breakdown.
 * Weights: PerfectPlus=1.0, Perfect=1.0, Great=0.75, Good=0.5, OK=0.25, Bad=0.1, Failed=0
 */
function deriveAccuracy(judgments) {
	if (!judgments) return null;
	const weights = { PerfectPlus: 1.0, Perfect: 1.0, Great: 0.75, Good: 0.5, OK: 0.25, Bad: 0.1, Failed: 0 };
	let weighted = 0;
	let total = 0;
	for (const [k, w] of Object.entries(weights)) {
		const count = judgments[k] ?? 0;
		weighted += count * w;
		total += count;
	}
	if (total === 0) return null;
	return Math.round((weighted / total) * 10000) / 100;
}

connectSpindata();
