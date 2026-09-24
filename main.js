const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');
const {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  Tray,
  Notification,
  ipcMain,
  session,
  nativeImage,
  nativeTheme,
  shell,
  net,
  dialog,
} = require('electron');
const Store = require('electron-store');

app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

const store = new Store({
  defaults: { accounts: [], autostart: false },
});

const ICON_DIR = path.join(__dirname, 'assets');
const REAL_ICON_PATH = path.join(ICON_DIR, 'icon-real.png');
let APP_ICON = nativeImage.createFromPath(
  fs.existsSync(REAL_ICON_PATH) ? REAL_ICON_PATH : path.join(ICON_DIR, 'icon-512.png')
);
let TRAY_ICON = APP_ICON.resize({ width: 24, height: 24 });
let iconCaptured = fs.existsSync(REAL_ICON_PATH);

const HEADER_HEIGHT = 38;

let cachedButtonLayout = null;

function getButtonLayout() {
  if (cachedButtonLayout) return cachedButtonLayout;
  const clean = (s) =>
    (s || '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && t !== 'appmenu' && t !== 'icon');
  try {
    const raw = execSync('gsettings get org.gnome.desktop.wm.preferences button-layout')
      .toString()
      .trim()
      .replace(/^'|'$/g, '');
    const [left, right] = raw.split(':');
    cachedButtonLayout = { left: clean(left), right: clean(right) };
  } catch {
    cachedButtonLayout = { left: [], right: ['minimize', 'maximize', 'close'] };
  }
  return cachedButtonLayout;
}

const MAIL_URLS = {
  work: 'https://outlook.office.com/mail/',
  personal: 'https://outlook.live.com/mail/',
};

const NOTIFICATION_BRIDGE_SCRIPT = `(() => {
  if (window.__outlookGnomePatched) return;
  window.__outlookGnomePatched = true;
  function FakeNotification(title, options) {
    try {
      if (window.outlookGnomeBridge) {
        window.outlookGnomeBridge.notify(title, options || {});
      }
    } catch (e) {}
    this.title = title;
    this.onclick = null;
    this.onclose = null;
    this.onerror = null;
    this.onshow = null;
    this.close = function () {};
    this.addEventListener = function () {};
  }
  FakeNotification.permission = 'granted';
  FakeNotification.requestPermission = function (cb) {
    if (cb) cb('granted');
    return Promise.resolve('granted');
  };
  window.Notification = FakeNotification;

  async function gatherIcons() {
    try {
      const icons = [];
      document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
        if (l.href) icons.push(l.href);
      });
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink && manifestLink.href) {
        const res = await fetch(manifestLink.href);
        const json = await res.json();
        if (Array.isArray(json.icons)) {
          json.icons.forEach((ic) => {
            if (ic.src) icons.push(new URL(ic.src, manifestLink.href).href);
          });
        }
      }
      if (window.outlookGnomeBridge) window.outlookGnomeBridge.reportIcons(icons);
    } catch (e) {
      // best-effort icon discovery; ignore failures
    }
  }
  gatherIcons();
})();`;

let mainWindow = null;
let addAccountWindow = null;
let tray = null;
/** @type {Map<string, { view: WebContentsView, account: object, unread: number }>} */
const views = new Map();
let activeAccountId = null;
let isQuitting = false;

function getAccounts() {
  return store.get('accounts', []);
}

function saveAccounts(accounts) {
  store.set('accounts', accounts);
}

function findAccountByWebContentsId(webContentsId) {
  for (const entry of views.values()) {
    if (entry.view.webContents.id === webContentsId) return entry.account;
  }
  return null;
}

function layoutActiveView() {
  if (!mainWindow) return;
  const [w, h] = mainWindow.getContentSize();
  for (const entry of views.values()) {
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  const active = activeAccountId && views.get(activeAccountId);
  if (active) {
    active.view.setBounds({
      x: 0,
      y: HEADER_HEIGHT,
      width: w,
      height: h - HEADER_HEIGHT,
    });
  }
}

function totalUnread() {
  let total = 0;
  for (const entry of views.values()) total += entry.unread || 0;
  return total;
}

function refreshTray() {
  if (!tray) return;
  const unread = totalUnread();
  tray.setToolTip(unread > 0 ? `Outlook — ${unread} non lu(s)` : 'Outlook');
  app.setBadgeCount ? app.setBadgeCount(unread) : null;

  const accountItems = getAccounts().map((acct) => {
    const entry = views.get(acct.id);
    const unreadFor = entry ? entry.unread : 0;
    const label = unreadFor > 0 ? `${acct.label} (${unreadFor})` : acct.label;
    return {
      label,
      click: () => showAndFocusAccount(acct.id),
    };
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Ouvrir Outlook', click: () => showMainWindow() },
    { type: 'separator' },
    ...(accountItems.length ? accountItems : [{ label: 'Aucun compte configuré', enabled: false }]),
    { type: 'separator' },
    {
      label: 'Démarrage automatique',
      type: 'checkbox',
      checked: store.get('autostart', false),
      click: (item) => setAutostart(item.checked),
    },
    {
      label: 'Notification de test',
      click: () => {
        const n = new Notification({
          title: 'Outlook — test',
          body: 'Si tu vois ceci, les notifications natives GNOME fonctionnent.',
          icon: APP_ICON,
        });
        n.show();
      },
    },
    { type: 'separator' },
    { label: 'Quitter', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

function bumpUnread(accountId, delta) {
  const entry = views.get(accountId);
  if (!entry) return;
  entry.unread = Math.max(0, (entry.unread || 0) + delta);
  refreshTray();
}

function setUnread(accountId, count) {
  const entry = views.get(accountId);
  if (!entry) return;
  entry.unread = Math.max(0, count);
  refreshTray();
}

function downloadBuffer(url, ses) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, session: ses });
    const chunks = [];
    request.on('response', (response) => {
      if (response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        response.resume();
        return;
      }
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

function orderedFaviconCandidates(urls) {
  const scored = urls.map((u) => {
    const typeScore = /\.png(\?|$)/i.test(u) ? 2 : /\.ico(\?|$)/i.test(u) ? 0 : 1;
    const sizeMatch = u.match(/(\d{2,4})x?\1?/);
    const sizeScore = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
    return { u, typeScore, sizeScore };
  });
  scored.sort((a, b) => b.typeScore - a.typeScore || b.sizeScore - a.sizeScore);
  return [...new Set(scored.map((s) => s.u))];
}

async function captureRealIcon(favicons, ses) {
  if (iconCaptured || !favicons || !favicons.length) return;
  for (const url of orderedFaviconCandidates(favicons)) {
    try {
      const buffer = await downloadBuffer(url, ses);
      const img = nativeImage.createFromBuffer(buffer);
      if (img.isEmpty()) continue;
      iconCaptured = true;
      fs.writeFileSync(REAL_ICON_PATH, img.toPNG());
      const large = img.getSize().width >= 128 ? img : img.resize({ width: 256, height: 256, quality: 'best' });
      APP_ICON = large;
      TRAY_ICON = img.resize({ width: 24, height: 24, quality: 'best' });
      if (tray) tray.setImage(TRAY_ICON);
      if (mainWindow) mainWindow.setIcon(APP_ICON);
      return;
    } catch {
      // try the next candidate
    }
  }
}

function partitionFor(account) {
  return account.type === 'shared' && account.parentId
    ? `persist:acct-${account.parentId}`
    : `persist:acct-${account.id}`;
}

function startUrlFor(account) {
  if (account.type === 'shared' && account.email) {
    return `https://outlook.office.com/mail/${encodeURIComponent(account.email)}/`;
  }
  return MAIL_URLS[account.type] || MAIL_URLS.work;
}

function createMailView(account) {
  const partition = partitionFor(account);
  const view = new WebContentsView({
    webPreferences: {
      partition,
      preload: path.join(__dirname, 'mailPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  const acctSession = session.fromPartition(partition);
  acctSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications');
  });

  const injectBridge = () => {
    const url = view.webContents.getURL();
    if (/outlook\.(office|live)\.com|outlook\.cloud\.microsoft/.test(url)) {
      view.webContents.executeJavaScript(NOTIFICATION_BRIDGE_SCRIPT).catch(() => {});
    }
  };
  view.webContents.on('dom-ready', injectBridge);
  view.webContents.on('did-navigate-in-page', injectBridge);

  view.webContents.on('page-favicon-updated', (_event, favicons) => {
    captureRealIcon(favicons, acctSession);
  });

  view.webContents.on('page-title-updated', (_event, title) => {
    const match = title.match(/^\((\d+)\)/);
    setUnread(account.id, match ? parseInt(match[1], 10) : 0);
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  view.webContents.loadURL(startUrlFor(account));

  views.set(account.id, { view, account, unread: 0 });
  if (mainWindow) mainWindow.contentView.addChildView(view);
}

function removeMailView(accountId) {
  const entry = views.get(accountId);
  if (!entry) return;
  if (mainWindow) mainWindow.contentView.removeChildView(entry.view);
  entry.view.webContents.close();
  views.delete(accountId);
}

function switchToAccount(accountId) {
  if (!views.has(accountId)) return;
  activeAccountId = accountId;
  layoutActiveView();
  if (mainWindow) mainWindow.webContents.send('accounts:active-changed', accountId);
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showAndFocusAccount(accountId) {
  showMainWindow();
  switchToAccount(accountId);
  setUnread(accountId, 0);
}

function addAccount({ label, type, email, parentId }) {
  const account = { id: crypto.randomUUID(), label: label || 'Compte' };
  if (type === 'shared') {
    account.type = 'shared';
    account.email = (email || '').trim();
    account.parentId = parentId;
  } else {
    account.type = type === 'personal' ? 'personal' : 'work';
  }
  const accounts = getAccounts();
  accounts.push(account);
  saveAccounts(accounts);
  createMailView(account);
  switchToAccount(account.id);
  refreshTray();
  return account;
}

function removeAccount(accountId) {
  removeMailView(accountId);
  const dependents = getAccounts().filter((a) => a.type === 'shared' && a.parentId === accountId);
  for (const dep of dependents) removeMailView(dep.id);
  const dependentIds = new Set(dependents.map((d) => d.id));
  const accounts = getAccounts().filter((a) => a.id !== accountId && !dependentIds.has(a.id));
  saveAccounts(accounts);
  if (activeAccountId === accountId || dependentIds.has(activeAccountId)) {
    activeAccountId = accounts.length ? accounts[0].id : null;
    if (activeAccountId) switchToAccount(activeAccountId);
    else layoutActiveView();
  }
  refreshTray();
}

function setAutostart(enabled) {
  store.set('autostart', enabled);
  const autostartDir = path.join(app.getPath('home'), '.config', 'autostart');
  const desktopPath = path.join(autostartDir, 'outlook-gnome.desktop');
  const fs = require('node:fs');
  if (enabled) {
    fs.mkdirSync(autostartDir, { recursive: true });
    const execPath = path.join(__dirname, 'start.sh');
    const contents = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Outlook',
      `Exec=${execPath} --hidden`,
      `Icon=${path.join(ICON_DIR, 'icon-app-v2.png')}`,
      'X-GNOME-Autostart-enabled=true',
      'Terminal=false',
      '',
    ].join('\n');
    fs.writeFileSync(desktopPath, contents, { mode: 0o755 });
  } else if (fs.existsSync(desktopPath)) {
    fs.unlinkSync(desktopPath);
  }
}

function themeBackground() {
  return nativeTheme.shouldUseDarkColors ? '#242424' : '#fafafa';
}

function openAddAccountWindow() {
  if (addAccountWindow) {
    addAccountWindow.focus();
    return;
  }
  addAccountWindow = new BrowserWindow({
    width: 380,
    height: 480,
    parent: mainWindow,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    icon: APP_ICON,
    title: 'Ajouter un compte',
    backgroundColor: themeBackground(),
    webPreferences: {
      preload: path.join(__dirname, 'shell', 'addAccountPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  addAccountWindow.setMenuBarVisibility(false);
  addAccountWindow.loadFile(path.join(__dirname, 'shell', 'addAccount.html'));
  addAccountWindow.on('closed', () => {
    addAccountWindow = null;
  });
}

function confirmAndRemoveAccount(account) {
  const dependents = getAccounts().filter((a) => a.type === 'shared' && a.parentId === account.id);
  let detail;
  if (account.type === 'shared') {
    detail = `Boîte partagée : ${account.email}`;
  } else if (dependents.length) {
    detail = `Les boîtes partagées suivantes, déléguées depuis ce compte, seront retirées aussi : ${dependents.map((d) => d.label).join(', ')}.`;
  } else {
    detail = 'La session de ce compte sera supprimée de l\'application.';
  }
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    buttons: ['Annuler', 'Retirer'],
    defaultId: 0,
    cancelId: 0,
    message: `Retirer le compte « ${account.label} » ?`,
    detail,
  });
  if (result === 1) {
    removeAccount(account.id);
    if (mainWindow) mainWindow.webContents.send('accounts:refresh');
  }
}

function openAppMenu() {
  const accounts = getAccounts();
  const accountItems = accounts.map((a) => {
    const entry = views.get(a.id);
    const unread = entry ? entry.unread : 0;
    const label = unread > 0 ? `${a.label} (${unread})` : a.label;
    return {
      label,
      type: 'radio',
      checked: a.id === activeAccountId,
      click: () => showAndFocusAccount(a.id),
    };
  });

  const template = [
    ...(accountItems.length ? accountItems : [{ label: 'Aucun compte configuré', enabled: false }]),
    { type: 'separator' },
    { label: 'Ajouter un compte…', click: () => openAddAccountWindow() },
    {
      label: 'Supprimer un compte',
      enabled: accounts.length > 0,
      submenu: accounts.length
        ? accounts.map((a) => ({ label: a.label, click: () => confirmAndRemoveAccount(a) }))
        : [{ label: 'Aucun compte', enabled: false }],
    },
    { type: 'separator' },
    {
      label: 'Démarrage automatique',
      type: 'checkbox',
      checked: store.get('autostart', false),
      click: (item) => setAutostart(item.checked),
    },
    { type: 'separator' },
    { label: 'À propos d\'Outlook', click: () => app.showAboutPanel() },
  ];
  Menu.buildFromTemplate(template).popup({ window: mainWindow });
}

function createTray() {
  tray = new Tray(TRAY_ICON);
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showMainWindow();
  });
  refreshTray();
}

function createMainWindow(startHidden) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 560,
    minHeight: 400,
    icon: APP_ICON,
    show: !startHidden,
    frame: false,
    backgroundColor: themeBackground(),
    webPreferences: {
      preload: path.join(__dirname, 'shell', 'shellPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'shell', 'index.html'));

  const sendMaximizedState = () => {
    if (mainWindow) mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', sendMaximizedState);
  mainWindow.on('unmaximize', sendMaximizedState);

  mainWindow.on('resize', layoutActiveView);
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  for (const account of getAccounts()) {
    createMailView(account);
  }
  const accounts = getAccounts();
  if (accounts.length) switchToAccount(accounts[0].id);
}

ipcMain.handle('accounts:list', () => getAccounts());
ipcMain.handle('accounts:active', () => activeAccountId);
ipcMain.handle('app:openMenu', () => openAppMenu());

ipcMain.handle('window:get-button-layout', () => getButtonLayout());
ipcMain.handle('window:is-maximized', () => (mainWindow ? mainWindow.isMaximized() : false));
ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('window:maximize-toggle', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow && mainWindow.close());

ipcMain.handle('dialog:parent-accounts', () =>
  getAccounts()
    .filter((a) => a.type !== 'shared')
    .map((a) => ({ id: a.id, label: a.label }))
);
ipcMain.handle('dialog:submit', (_event, payload) => {
  const account = addAccount(payload);
  if (addAccountWindow) addAccountWindow.close();
  if (mainWindow) mainWindow.webContents.send('accounts:refresh');
  return account;
});
ipcMain.handle('dialog:cancel', () => {
  if (addAccountWindow) addAccountWindow.close();
});

ipcMain.on('mail:icons', (event, icons) => {
  captureRealIcon(icons, event.sender.session);
});

ipcMain.on('mail:notification', (event, payload) => {
  const account = findAccountByWebContentsId(event.sender.id);
  if (!account) return;
  const n = new Notification({
    title: `${payload.title || 'Outlook'} — ${account.label}`,
    body: (payload.options && payload.options.body) || '',
    icon: APP_ICON,
  });
  n.on('click', () => showAndFocusAccount(account.id));
  n.show();
  bumpUnread(account.id, 1);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    app.setAboutPanelOptions({
      applicationName: 'Outlook',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: 'Copyright © 2026 TitanSurtur — Licence MIT',
      iconPath: path.join(ICON_DIR, 'icon-app-v2.png'),
    });
    const startHidden = process.argv.includes('--hidden');
    createMainWindow(startHidden);
    createTray();
  });

  app.on('window-all-closed', () => {
    // keep running in tray
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });
}
