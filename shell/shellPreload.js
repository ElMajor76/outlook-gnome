const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shellApi', {
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  getActiveAccount: () => ipcRenderer.invoke('accounts:active'),
  openAppMenu: () => ipcRenderer.invoke('app:openMenu'),
  onActiveChanged: (cb) => ipcRenderer.on('accounts:active-changed', (_e, id) => cb(id)),
  onAccountsRefresh: (cb) => ipcRenderer.on('accounts:refresh', () => cb()),
  getButtonLayout: () => ipcRenderer.invoke('window:get-button-layout'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:maximize-toggle'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onMaximizedChanged: (cb) => ipcRenderer.on('window:maximized-changed', (_e, val) => cb(val)),
});
