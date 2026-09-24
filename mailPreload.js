const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('outlookGnomeBridge', {
  notify: (title, options) => ipcRenderer.send('mail:notification', { title, options }),
  reportIcons: (icons) => ipcRenderer.send('mail:icons', icons),
});
