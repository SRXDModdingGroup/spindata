const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	getConfig: ()           => ipcRenderer.invoke('config:get'),
	saveConfig: (cfg)       => ipcRenderer.invoke('config:save', cfg),
	connect: ()             => ipcRenderer.invoke('relay:connect'),
	disconnect: ()          => ipcRenderer.invoke('relay:disconnect'),
	onStatus:   (cb)        => ipcRenderer.on('status', (_e, s) => cb(s)),
	onChartEnd: (cb)        => ipcRenderer.on('chartEnd', (_e, r) => cb(r)),
});
