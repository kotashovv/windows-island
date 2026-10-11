const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('island', {
  recordSources:()=>ipcRenderer.invoke('record-sources'),
  recordRegion:id=>ipcRenderer.invoke('record-region',id),
  recordBegin:options=>ipcRenderer.invoke('record-begin',options),
  recordStarted:id=>ipcRenderer.invoke('record-started',id),
  recordChunk:(id,bytes)=>ipcRenderer.invoke('record-chunk',id,bytes),
  recordFinish:(id,error)=>ipcRenderer.invoke('record-finish',id,error),
  recordOpenFolder:id=>ipcRenderer.invoke('record-open-folder',id),
  captureShortcut: value => ipcRenderer.invoke('shortcut-capture',value),
  pin: value => ipcRenderer.send('overlay-pin',value),
  setShortcut: value => ipcRenderer.invoke('shortcut',value),
  agentHooks:remove=>ipcRenderer.invoke('agent-hooks',remove),
  read: () => ipcRenderer.invoke('read'),
  act: (action, input) => ipcRenderer.invoke('act', action, input),
  resize: mode => ipcRenderer.send('resize', mode),
  hitRegion: region => ipcRenderer.send('hit-region',region),
  capture: value => ipcRenderer.send('pointer-capture',value),
  weather: () => ipcRenderer.invoke('weather'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  restartUpdate: () => ipcRenderer.invoke('restart-update'),
  cities: name => ipcRenderer.invoke('cities', name),
  chooseReportFolder: () => ipcRenderer.invoke('report-folder'),
  report: () => ipcRenderer.invoke('report'),
  open: url => ipcRenderer.invoke('open', url),
  jump: target => ipcRenderer.invoke('jump',target),
  mediaControl: (action,sourceId) => ipcRenderer.invoke('media-control',action,sourceId),
  mediaSource: sourceId => ipcRenderer.invoke('media-source',sourceId),
  notificationSettings: () => ipcRenderer.invoke('notification-settings'),
  importCalendar: () => ipcRenderer.invoke('import-calendar'),
  mcpConfig: () => ipcRenderer.invoke('mcp-config'),
  copyConfig: text => ipcRenderer.invoke('copy-config', text),
  contextMenu: () => ipcRenderer.send('capsule-menu'),
  on: (channel, callback) => {
    if (!['record-stop','state','runtime','notification','contrast','expand','overlay-blocked','update-progress'].includes(channel)) return () => {};
    const listener = (_, data) => callback(data); ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
