/**
 * RelayCore — manages WebSocket connections between SpinStatus (local) and spindata (upstream).
 * Emits events so the Electron main process can react to state changes.
 */

const { EventEmitter } = require('events');
const { WebSocket } = require('ws');
const { isFc, isPfc } = require('./judgments');

const SPINSTATUS_URL = 'ws://localhost:38304';
const RECONNECT_MS = 3000;

const WEIGHTS = { PerfectPlus: 1.0, Perfect: 1.0, Great: 0.75, Good: 0.5, OK: 0.25, Bad: 0.1, Failed: 0 };

function deriveAccuracy(judgments) {
	if (!judgments) return null;
	let weighted = 0, total = 0;
	for (const [k, w] of Object.entries(WEIGHTS)) {
		const count = judgments[k] ?? 0;
		weighted += count * w;
		total += count;
	}
	return total === 0 ? null : Math.round((weighted / total) * 10000) / 100;
}

class RelayCore extends EventEmitter {
	constructor() {
		super();
		this._spinstatusWs = null;
		this._spindataWs = null;
		this._reconnectTimer = null;
		this._lastJudgments = null;
		this._lastScore = null;
		this._active = false;
		this._url = null;
		this._token = null;
	}

	connect(url, token) {
		this._active = true;
		this._url = url;
		this._token = token;
		this._connectSpindata();
	}

	disconnect() {
		this._active = false;
		clearTimeout(this._reconnectTimer);
		this._spinstatusWs?.close();
		this._spindataWs?.close();
		this._spinstatusWs = null;
		this._spindataWs = null;
		this.emit('spinstatus', 'disconnected');
		this.emit('spindata', 'disconnected');
	}

	_connectSpindata() {
		if (!this._active) return;
		this.emit('spindata', 'connecting');

		const ws = new WebSocket(`${this._url}?token=${encodeURIComponent(this._token)}`);
		this._spindataWs = ws;

		ws.on('open', () => {
			this.emit('spindata', 'connected');
			this._connectSpinStatus();
		});

		ws.on('close', () => {
			this.emit('spindata', 'disconnected');
			this.emit('spinstatus', 'disconnected');
			this._spinstatusWs?.close();
			this._spinstatusWs = null;
			if (this._active) {
				this._reconnectTimer = setTimeout(() => this._connectSpindata(), RECONNECT_MS);
			}
		});

		ws.on('error', () => {});
	}

	_connectSpinStatus() {
		if (!this._active) return;
		this.emit('spinstatus', 'connecting');

		const ws = new WebSocket(SPINSTATUS_URL);
		this._spinstatusWs = ws;

		ws.on('open', () => {
			this.emit('spinstatus', 'connected');
		});

		ws.on('message', (raw) => {
			if (this._spindataWs?.readyState !== WebSocket.OPEN) return;
			let msg;
			try { msg = JSON.parse(raw); } catch { return; }

			if (msg.type === 'scoreEvent') {
				const s = msg.status;
				this._lastJudgments = s.judgments ?? null;
				this._lastScore = s.score ?? null;
				const payload = { type: 'live', score: s.score, combo: s.combo, accuracy: deriveAccuracy(s.judgments) };
				this._spindataWs.send(JSON.stringify(payload));
				this.emit('live', payload);
			}

			if (msg.type === 'trackComplete' || msg.type === 'trackFail') {
				const failed = msg.type === 'trackFail';
				const result = {
					type: 'chartEnd',
					score: this._lastScore,
					fc: failed ? false : isFc(this._lastJudgments),
					pfc: failed ? false : isPfc(this._lastJudgments),
				};
				this._spindataWs.send(JSON.stringify(result));
				this.emit('chartEnd', result);
				this._lastJudgments = null;
				this._lastScore = null;
			}
		});

		ws.on('close', () => {
			this.emit('spinstatus', 'disconnected');
		});

		ws.on('error', () => {});
	}
}

module.exports = { RelayCore };
