const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { RelayCore } = require('./core');
const { ICONS } = require('./icons');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
	try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return { url: '', token: '' }; }
}

function saveConfig(cfg) {
	fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let tray = null;
let win = null;
const relay = new RelayCore();

let status = { spinstatus: 'disconnected', spindata: 'disconnected' };
let lastResult = null;

function overallState() {
	if (status.spindata === 'connected' && status.spinstatus === 'connected') return 'connected';
	if (status.spindata === 'connecting' || status.spinstatus === 'connecting') return 'connecting';
	return 'disconnected';
}

function updateTray() {
	if (!tray) return;
	const state = overallState();
	tray.setImage(nativeImage.createFromBuffer(ICONS[state]));
	const labels = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Disconnected' };
	tray.setToolTip(`Spindata Relay — ${labels[state]}`);
}

function broadcastStatus() {
	win?.webContents.send('status', { ...status, lastResult });
	updateTray();
}

// ---------------------------------------------------------------------------
// Relay events
// ---------------------------------------------------------------------------

relay.on('spinstatus', (state) => { status.spinstatus = state; broadcastStatus(); });
relay.on('spindata',   (state) => { status.spindata   = state; broadcastStatus(); });
relay.on('chartEnd',   (result) => { lastResult = result; broadcastStatus(); });

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
	win = new BrowserWindow({
		width: 380,
		height: 420,
		resizable: false,
		maximizable: false,
		title: 'Spindata Relay',
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	win.loadFile(path.join(__dirname, 'window', 'index.html'));
	win.setMenuBarVisibility(false);

	win.on('close', (e) => {
		e.preventDefault();
		win.hide();
	});
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle('config:get', () => loadConfig());

ipcMain.handle('config:save', (_e, cfg) => {
	saveConfig(cfg);
});

ipcMain.handle('relay:connect', () => {
	const cfg = loadConfig();
	if (!cfg.url || !cfg.token) return { error: 'url and token required' };
	relay.connect(cfg.url, cfg.token);
	return { ok: true };
});

ipcMain.handle('relay:disconnect', () => {
	relay.disconnect();
	return { ok: true };
});

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
	app.setAppUserModelId('com.srxd.spindata-relay');

	tray = new Tray(nativeImage.createFromBuffer(ICONS.disconnected));
	tray.setToolTip('Spindata Relay — Disconnected');

	const menu = Menu.buildFromTemplate([
		{ label: 'Show settings', click: () => { win.show(); win.focus(); } },
		{ type: 'separator' },
		{ label: 'Quit', click: () => { app.exit(0); } },
	]);
	tray.setContextMenu(menu);
	tray.on('double-click', () => { win.show(); win.focus(); });

	createWindow();

	// auto-connect if config exists
	const cfg = loadConfig();
	if (cfg.url && cfg.token) relay.connect(cfg.url, cfg.token);
});

app.on('window-all-closed', (e) => e.preventDefault());
