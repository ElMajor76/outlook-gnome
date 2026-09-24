const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dialogApi', {
  listParentAccounts: () => ipcRenderer.invoke('dialog:parent-accounts'),
  submit: (payload) => ipcRenderer.invoke('dialog:submit', payload),
  cancel: () => ipcRenderer.invoke('dialog:cancel'),
});
