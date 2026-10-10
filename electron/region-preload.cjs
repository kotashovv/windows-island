const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('selection',{finish:value=>ipcRenderer.send('record-region-result',value)});
