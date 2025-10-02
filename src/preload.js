// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  importAudio: () => ipcRenderer.invoke('import-audio'),
  exportVideo: (data) => ipcRenderer.invoke('export-video', data),
});
