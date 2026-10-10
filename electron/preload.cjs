const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('island', {
  read: () => ipcRenderer.invoke('read'),
  act: (action, input) => ipcRenderer.invoke('act', action, input),
  resize: mode => ipcRenderer.send('resize', mode),
  hitRegion: region => ipcRenderer.send('hit-region',region),
  capture: value => ipcRenderer.send('pointer-capture',value),
  weather: () => ipcRenderer.invoke('weather'),
  cities: name => ipcRenderer.invoke('cities', name),
  report: () => ipcRenderer.invoke('report'),
  open: url => ipcRenderer.invoke('open', url),
  jump: target => ipcRenderer.invoke('jump',target),
  notificationSettings: () => ipcRenderer.invoke('notification-settings'),
  importCalendar: () => ipcRenderer.invoke('import-calendar'),
  mcpConfig: () => ipcRenderer.invoke('mcp-config'),
  copyConfig: text => ipcRenderer.invoke('copy-config', text),
  quit: () => ipcRenderer.send('quit'),
  on: (channel, callback) => {
    if (!['state','notification','contrast','expand','overlay-blocked'].includes(channel)) return () => {};
    const listener = (_, data) => callback(data); ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
