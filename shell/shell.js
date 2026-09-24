const emptyState = document.getElementById('empty-state');
const headerTitle = document.getElementById('header-title');
const headerLeft = document.getElementById('header-left');
const headerRight = document.getElementById('header-right');

const WINCTL_ICONS = {
  minimize: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="m 4 10.007812 h 8 v 1.988282 h -8 z m 0 0"/></svg>',
  maximize: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="m 3.988281 3.992188 v 8.011718 h 8.011719 v -8.011718 z m 2 2 h 4.011719 v 4.011718 h -4.011719 z m 0 0"/></svg>',
  restore: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="m 4.988281 4.992188 v 6.011718 h 6.011719 v -6.011718 z m 2 2 h 2.011719 v 2.011718 h -2.011719 z m 0 0"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="m 4 4 h 1 h 0.03125 c 0.253906 0.011719 0.511719 0.128906 0.6875 0.3125 l 2.28125 2.28125 l 2.3125 -2.28125 c 0.265625 -0.230469 0.445312 -0.304688 0.6875 -0.3125 h 1 v 1 c 0 0.285156 -0.035156 0.550781 -0.25 0.75 l -2.28125 2.28125 l 2.25 2.25 c 0.1875 0.1875 0.28125 0.453125 0.28125 0.71875 v 1 h -1 c -0.265625 0 -0.53125 -0.09375 -0.71875 -0.28125 l -2.28125 -2.28125 l -2.28125 2.28125 c -0.1875 0.1875 -0.453125 0.28125 -0.71875 0.28125 h -1 v -1 c 0 -0.265625 0.09375 -0.53125 0.28125 -0.71875 l 2.28125 -2.25 l -2.28125 -2.28125 c -0.210938 -0.195312 -0.304688 -0.46875 -0.28125 -0.75 z m 0 0"/></svg>',
};

const MENU_ICON = '<svg viewBox="0 0 16 16"><g fill="currentColor"><path d="m 1 2 h 14 v 2 h -14 z m 0 0"/><path d="m 1 7 h 14 v 2 h -14 z m 0 0"/><path d="m 1 12 h 14 v 2 h -14 z m 0 0"/></g></svg>';

let isMaximized = false;
let accounts = [];
let activeId = null;
let buttonLayout = { left: [], right: [] };

function buildWinCtl(kind) {
  const btn = document.createElement('button');
  const iconKind = kind === 'maximize' && isMaximized ? 'restore' : kind;
  btn.className = 'winctl';
  btn.innerHTML = WINCTL_ICONS[iconKind];
  btn.title = { minimize: 'Réduire', maximize: isMaximized ? 'Restaurer' : 'Agrandir', close: 'Fermer' }[kind];
  btn.onclick = () => {
    if (kind === 'minimize') window.shellApi.minimizeWindow();
    else if (kind === 'maximize') window.shellApi.toggleMaximizeWindow();
    else if (kind === 'close') window.shellApi.closeWindow();
  };
  return btn;
}

function buildHamburger() {
  const btn = document.createElement('button');
  btn.className = 'hamburger-btn';
  btn.innerHTML = MENU_ICON;
  btn.title = 'Menu';
  btn.onclick = () => window.shellApi.openAppMenu();
  return btn;
}

function renderHeader() {
  const { left, right } = buttonLayout;
  headerLeft.innerHTML = '';
  headerRight.innerHTML = '';
  left.forEach((kind) => headerLeft.appendChild(buildWinCtl(kind)));
  headerRight.appendChild(buildHamburger());
  if (right.length) {
    const sep = document.createElement('div');
    sep.className = 'header-separator';
    headerRight.appendChild(sep);
  }
  right.forEach((kind) => headerRight.appendChild(buildWinCtl(kind)));
}

function updateTitle() {
  const active = accounts.find((a) => a.id === activeId);
  headerTitle.textContent = active ? active.label : 'Outlook';
}

async function refresh() {
  accounts = await window.shellApi.listAccounts();
  activeId = await window.shellApi.getActiveAccount();
  emptyState.classList.toggle('hidden', accounts.length > 0);
  updateTitle();
}

window.shellApi.onActiveChanged((id) => {
  activeId = id;
  updateTitle();
});

window.shellApi.onAccountsRefresh(refresh);

window.shellApi.onMaximizedChanged((val) => {
  isMaximized = val;
  renderHeader();
});

Promise.all([window.shellApi.getButtonLayout(), window.shellApi.isMaximized()]).then(([layout, maximized]) => {
  buttonLayout = layout;
  isMaximized = maximized;
  renderHeader();
});

document.getElementById('headerbar').addEventListener('dblclick', (e) => {
  if (e.target.closest('.winctl') || e.target.closest('.hamburger-btn')) return;
  window.shellApi.toggleMaximizeWindow();
});

refresh();
