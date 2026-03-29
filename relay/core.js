/**
 * RelayCore — bridges SpinStatus (local WS) to spindata (upstream WS).
 * Forwards all SpinStatus events verbatim. Emits local events for the tray UI.
 */

const { EventEmitter } = require('events');
const { WebSocket } = require('ws');

const SPINSTATUS_URL = 'ws://localhost:38304';
const RECONNECT_MS = 3000;

function fcFromFullCombo(fc) { return fc != null && fc !== 'None'; }
function pfcFromFullCombo(fc) { return fc === 'PerfectPlus' || fc === 'Perfect'; }

class RelayCore extends EventEmitter {
	constructor() {
		super();
		this._spinstatusWs = null;
		this._spindataWs = null;
		this._reconnectTimer = null;
		this._lastScore = null;
		this._lastFullCombo = null;
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

			// forward verbatim to spindata
			this._spindataWs.send(raw);

			// parse locally only for tray UI events
			let msg;
			try { msg = JSON.parse(raw); } catch { return; }

			if (msg.type === 'scoreEvent') {
				this._lastScore      = msg.status?.score      ?? this._lastScore;
				this._lastFullCombo  = msg.status?.fullCombo  ?? this._lastFullCombo;
				this.emit('live', { score: msg.status?.score, combo: msg.status?.combo });
			}

			if (msg.type === 'trackComplete' || msg.type === 'trackFail') {
				const failed = msg.type === 'trackFail';
				this.emit('chartEnd', {
					score: this._lastScore,
					fc:    failed ? false : fcFromFullCombo(this._lastFullCombo),
					pfc:   failed ? false : pfcFromFullCombo(this._lastFullCombo),
				});
				this._lastScore = null;
				this._lastFullCombo = null;
			}
		});

		ws.on('close', () => {
			this.emit('spinstatus', 'disconnected');
		});

		ws.on('error', () => {});
	}
}

module.exports = { RelayCore };
