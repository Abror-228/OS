/* ================================================================
   AetherOS — Main Application Logic
   A web-based operating system with glassmorphism design
   
   Modules:
   1. State Management & Persistence
   2. Boot & Login
   3. Desktop & Particles
   4. Orbit Bar (clock, workspaces, tray)
   5. Shelf (left dock)
   6. Nexus (command palette)
   7. Window Manager
   8. Virtual File System (localStorage)
   9. Context Menu
   10. Notification Center & Toasts
   11. Dialog System
   12. Apps: File Manager, Text Editor, Terminal,
       Calculator, Settings, Browser, System Monitor
   13. Hotkeys
   ================================================================ */

'use strict';

// ================================================================
// 1. STATE MANAGEMENT & PERSISTENCE
// ================================================================
const STATE_KEY = 'aetheros_state';

const AetherState = {
  username: 'User',
  theme: 'dark',
  accentColor: '#f0a030',
  wallpaperIndex: 0,
  brightness: 100,
  volume: 75,
  widgetNotes: '',
  windowCounter: 0,
  currentWorkspace: 1,
  notifications: [],
  openWindows: [],
};

function loadState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(AetherState, parsed);
    }
  } catch (e) { console.warn('Failed to load state:', e); }
}

function saveState() {
  try {
    // Capture open windows info (without DOM refs)
    AetherState.openWindows = [];
    document.querySelectorAll('.aether-window').forEach(w => {
      AetherState.openWindows.push({
        appId: w.dataset.appId,
        title: w.querySelector('.window-titlebar-text')?.textContent || '',
        x: parseInt(w.style.left) || 100,
        y: parseInt(w.style.top) || 100,
        w: parseInt(w.style.width) || 600,
        h: parseInt(w.style.height) || 400,
        maximized: w.classList.contains('maximized'),
      });
    });
    localStorage.setItem(STATE_KEY, JSON.stringify(AetherState));
  } catch (e) { console.warn('Failed to save state:', e); }
}

// Auto-save every 5 seconds
setInterval(saveState, 5000);

// ================================================================
// 2. VIRTUAL FILE SYSTEM (localStorage based)
// ================================================================
const FS_KEY = 'aetheros_fs';

let fileSystem = {};

function loadFS() {
  try {
    const saved = localStorage.getItem(FS_KEY);
    if (saved) {
      fileSystem = JSON.parse(saved);
    } else {
      // Initialize default file system
      fileSystem = {
        '/': { type: 'dir', children: ['home', 'system', 'docs'] },
        '/home': { type: 'dir', children: ['documents', 'pictures', 'downloads'] },
        '/home/documents': { type: 'dir', children: ['readme.txt', 'notes.txt'] },
        '/home/pictures': { type: 'dir', children: [] },
        '/home/downloads': { type: 'dir', children: [] },
        '/home/documents/readme.txt': { type: 'file', content: 'Welcome to AetherOS!\n\nThis is your virtual file system.\nYou can create, edit, and manage files here.\n\nHotkeys:\n  Ctrl+Space — Open Nexus (command palette)\n  Alt+1-4 — Switch workspaces\n  Alt+F4 — Close window' },
        '/home/documents/notes.txt': { type: 'file', content: 'My notes go here...' },
        '/system': { type: 'dir', children: ['config', 'logs'] },
        '/system/config': { type: 'dir', children: ['theme.cfg'] },
        '/system/config/theme.cfg': { type: 'file', content: 'theme=dark\naccent=#f0a030' },
        '/system/logs': { type: 'dir', children: ['boot.log'] },
        '/system/logs/boot.log': { type: 'file', content: '[OK] Kernel loaded\n[OK] File system mounted\n[OK] Desktop initialized' },
        '/docs': { type: 'dir', children: ['about.txt'] },
        '/docs/about.txt': { type: 'file', content: 'AetherOS v1.0\nA web-based operating system\nBuilt with HTML, CSS, and JavaScript' },
      };
      saveFS();
    }
  } catch (e) {
    console.warn('Failed to load FS:', e);
  }
}

function saveFS() {
  try {
    localStorage.setItem(FS_KEY, JSON.stringify(fileSystem));
  } catch (e) { console.warn('Failed to save FS:', e); }
}

function fsResolvePath(path) {
  // Normalize path
  if (!path.startsWith('/')) path = '/' + path;
  path = path.replace(/\/+/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

function fsExists(path) {
  return fileSystem[fsResolvePath(path)] !== undefined;
}

function fsIsDir(path) {
  const node = fileSystem[fsResolvePath(path)];
  return node && node.type === 'dir';
}

function fsListDir(path) {
  path = fsResolvePath(path);
  const node = fileSystem[path];
  if (!node || node.type !== 'dir') return null;
  return node.children || [];
}

function fsReadFile(path) {
  path = fsResolvePath(path);
  const node = fileSystem[path];
  if (!node || node.type !== 'file') return null;
  return node.content || '';
}

function fsWriteFile(path, content) {
  path = fsResolvePath(path);
  const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
  const fileName = path.substring(path.lastIndexOf('/') + 1);
  
  // Create file node
  fileSystem[path] = { type: 'file', content: content };
  
  // Add to parent if not already there
  if (fileSystem[parentPath] && fileSystem[parentPath].type === 'dir') {
    if (!fileSystem[parentPath].children.includes(fileName)) {
      fileSystem[parentPath].children.push(fileName);
    }
  }
  saveFS();
}

function fsMkdir(path) {
  path = fsResolvePath(path);
  if (fileSystem[path]) return false;
  
  const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
  const dirName = path.substring(path.lastIndexOf('/') + 1);
  
  fileSystem[path] = { type: 'dir', children: [] };
  
  if (fileSystem[parentPath] && fileSystem[parentPath].type === 'dir') {
    if (!fileSystem[parentPath].children.includes(dirName)) {
      fileSystem[parentPath].children.push(dirName);
    }
  }
  saveFS();
  return true;
}

function fsDelete(path) {
  path = fsResolvePath(path);
  if (path === '/') return false;
  
  const node = fileSystem[path];
  if (!node) return false;
  
  // Recursively delete children if directory
  if (node.type === 'dir' && node.children) {
    for (const child of [...node.children]) {
      fsDelete(path + '/' + child);
    }
  }
  
  // Remove from parent
  const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
  const name = path.substring(path.lastIndexOf('/') + 1);
  if (fileSystem[parentPath] && fileSystem[parentPath].children) {
    fileSystem[parentPath].children = fileSystem[parentPath].children.filter(c => c !== name);
  }
  
  delete fileSystem[path];
  saveFS();
  return true;
}

function fsRename(oldPath, newName) {
  oldPath = fsResolvePath(oldPath);
  const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
  const oldName = oldPath.substring(oldPath.lastIndexOf('/') + 1);
  const newPath = parentPath + '/' + newName;
  
  if (fileSystem[newPath]) return false;
  
  // Copy node
  fileSystem[newPath] = { ...fileSystem[oldPath] };
  
  // If directory, update children paths recursively
  if (fileSystem[oldPath].type === 'dir') {
    const updateChildPaths = (oldBase, newBase) => {
      const node = fileSystem[newBase];
      if (node && node.children) {
        for (const child of node.children) {
          const oldChildPath = oldBase + '/' + child;
          const newChildPath = newBase + '/' + child;
          if (fileSystem[oldChildPath]) {
            fileSystem[newChildPath] = { ...fileSystem[oldChildPath] };
            delete fileSystem[oldChildPath];
            if (fileSystem[newChildPath].type === 'dir') {
              updateChildPaths(oldChildPath, newChildPath);
            }
          }
        }
      }
    };
    updateChildPaths(oldPath, newPath);
  }
  
  delete fileSystem[oldPath];
  
  // Update parent
  if (fileSystem[parentPath] && fileSystem[parentPath].children) {
    const idx = fileSystem[parentPath].children.indexOf(oldName);
    if (idx >= 0) fileSystem[parentPath].children[idx] = newName;
  }
  
  saveFS();
  return true;
}

function fsMove(srcPath, destDir) {
  srcPath = fsResolvePath(srcPath);
  destDir = fsResolvePath(destDir);
  
  if (!fileSystem[destDir] || fileSystem[destDir].type !== 'dir') return false;
  
  const name = srcPath.substring(srcPath.lastIndexOf('/') + 1);
  const newPath = destDir + '/' + name;
  
  if (fileSystem[newPath]) return false;
  
  const parentPath = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/';
  
  // Move node
  fileSystem[newPath] = { ...fileSystem[srcPath] };
  delete fileSystem[srcPath];
  
  // Remove from old parent
  if (fileSystem[parentPath] && fileSystem[parentPath].children) {
    fileSystem[parentPath].children = fileSystem[parentPath].children.filter(c => c !== name);
  }
  
  // Add to new parent
  fileSystem[destDir].children.push(name);
  
  saveFS();
  return true;
}

// ================================================================
// 3. BOOT & LOGIN SEQUENCES
// ================================================================
const bootMessages = [
  'Initializing kernel...',
  'Loading drivers...',
  'Mounting file system...',
  'Starting services...',
  'Loading desktop...',
  'Aether ready.'
];

function startBoot() {
  const bar = document.getElementById('boot-bar');
  const status = document.getElementById('boot-status');
  let progress = 0;
  let msgIdx = 0;
  
  const interval = setInterval(() => {
    progress += Math.random() * 15 + 5;
    if (progress > 100) progress = 100;
    bar.style.width = progress + '%';
    
    if (msgIdx < bootMessages.length - 1 && progress > (msgIdx + 1) * (100 / bootMessages.length)) {
      msgIdx++;
      status.textContent = bootMessages[msgIdx];
    }
    
    if (progress >= 100) {
      clearInterval(interval);
      status.textContent = bootMessages[bootMessages.length - 1];
      setTimeout(showLogin, 600);
    }
  }, 200);
}

function showLogin() {
  const boot = document.getElementById('boot-screen');
  const login = document.getElementById('login-screen');
  
  boot.classList.add('hidden');
  setTimeout(() => {
    boot.style.display = 'none';
    login.classList.add('visible');
    updateLoginClock();
    document.getElementById('login-password').focus();
  }, 800);
}

function updateLoginClock() {
  const now = new Date();
  const timeEl = document.getElementById('login-time');
  const dateEl = document.getElementById('login-date');
  
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }
}

setInterval(updateLoginClock, 1000);

function doLogin() {
  const login = document.getElementById('login-screen');
  login.classList.remove('visible');
  login.classList.add('hidden');
  
  setTimeout(() => {
    login.style.display = 'none';
    showDesktop();
  }, 600);
}

// Login event listeners
document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// ================================================================
// 4. DESKTOP & PARTICLES
// ================================================================
function showDesktop() {
  const desktop = document.getElementById('desktop');
  const orbit = document.getElementById('orbit-bar');
  const shelf = document.getElementById('shelf');
  
  desktop.classList.add('visible');
  orbit.style.display = 'flex';
  shelf.style.display = 'flex';
  
  createParticles();
  startClocks();
  applySettings();
  
  // Restore saved windows
  if (AetherState.openWindows && AetherState.openWindows.length > 0) {
    AetherState.openWindows.forEach(win => {
      if (!nexusApps.some(a => a.id === win.appId)) return;
      openApp(win.appId);
      const w = document.querySelector(`.aether-window[data-app-id="${win.appId}"]`);
      if (w) {
        w.style.left = win.x + 'px';
        w.style.top = win.y + 'px';
        if (win.maximized) w.classList.add('maximized');
      }
    });
  }
  
  // Welcome toast
  showToast('Welcome back, ' + AetherState.username, 'AetherOS is ready. Press Ctrl+Space to open Nexus.');
  addNotification('System', 'AetherOS started successfully.');
}

function createParticles() {
  const container = document.getElementById('desktop-particles');
  container.innerHTML = '';
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (Math.random() * 20 + 15) + 's';
    p.style.animationDelay = (Math.random() * 15) + 's';
    p.style.width = (Math.random() * 3 + 1) + 'px';
    p.style.height = p.style.width;
    container.appendChild(p);
  }
}

// ================================================================
// 5. ORBIT BAR (Clock, Workspaces, Tray)
// ================================================================
function startClocks() {
  updateClocks();
  setInterval(updateClocks, 1000);
}

function updateClocks() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  
  // Orbit bar
  const orbitTime = document.getElementById('orbit-time');
  const orbitDate = document.getElementById('orbit-date');
  if (orbitTime) orbitTime.textContent = timeStr;
  if (orbitDate) orbitDate.textContent = dateStr;
  
  // Clock widget
  const wClockTime = document.getElementById('widget-clock-time');
  const wClockSec = document.getElementById('widget-clock-sec');
  const wClockDate = document.getElementById('widget-clock-date');
  if (wClockTime) {
    wClockTime.innerHTML = timeStr + '<span class="widget-clock-seconds" id="widget-clock-sec">' +
      String(now.getSeconds()).padStart(2, '0') + '</span>';
  }
  if (wClockDate) {
    wClockDate.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }
}

// Workspace switching
document.getElementById('workspace-dots').addEventListener('click', e => {
  const dot = e.target.closest('.workspace-dot');
  if (!dot) return;
  switchWorkspace(parseInt(dot.dataset.ws));
});

function switchWorkspace(num) {
  AetherState.currentWorkspace = num;
  document.querySelectorAll('.workspace-dot').forEach(d => {
    d.classList.toggle('active', parseInt(d.dataset.ws) === num);
  });
  // In a full implementation, each workspace would have its own windows
  showToast('Workspace ' + num, 'Switched to workspace ' + num);
}

// Tray interactions
document.getElementById('tray-search').addEventListener('click', toggleNexus);
document.getElementById('tray-notif').addEventListener('click', toggleNotificationCenter);

// ================================================================
// 6. SHELF (Left sidebar dock)
// ================================================================
document.getElementById('shelf').addEventListener('click', e => {
  const item = e.target.closest('.shelf-item');
  if (!item) return;
  
  const appId = item.dataset.app;
  if (appId) {
    openApp(appId);
  }
  
  if (item.id === 'shelf-power') {
    showToast('Power', 'Hold Shift+Click to restart AetherOS');
    if (window.event && window.event.shiftKey) {
      location.reload();
    }
  }
});

function updateShelfIndicators() {
  document.querySelectorAll('.shelf-item[data-app]').forEach(item => {
    const appId = item.dataset.app;
    const isOpen = document.querySelector(`.aether-window[data-app-id="${appId}"]`);
    item.classList.toggle('active', !!isOpen);
    
    // Running dot
    let dot = item.querySelector('.running-dot');
    if (isOpen && !dot) {
      dot = document.createElement('div');
      dot.className = 'running-dot';
      item.appendChild(dot);
    } else if (!isOpen && dot) {
      dot.remove();
    }
  });
}

// ================================================================
// 7. NEXUS (Command Palette)
// ================================================================
const ICONS = (() => {
  const i = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  return {
    folder: i('folder'), file: i('file'),
    filemanager: i('folder'), terminal: i('terminal'), editor: i('edit'),
    calculator: i('calc'), browser: i('globe'), sysmonitor: i('chart'),
    aiimage: i('image'), settings: i('settings'),
  };
})();

const nexusApps = [
  { id: 'filemanager', name: 'File Manager', desc: 'Browse and manage files', icon: ICONS.filemanager, shortcut: '' },
  { id: 'terminal', name: 'Terminal', desc: 'Command line', icon: ICONS.terminal, shortcut: '' },
  { id: 'editor', name: 'Text Editor', desc: 'Edit text files', icon: ICONS.editor, shortcut: '' },
  { id: 'calculator', name: 'Calculator', desc: 'Math calculations', icon: ICONS.calculator, shortcut: '' },
  { id: 'browser', name: 'Browser', desc: 'Web browser (stub)', icon: ICONS.browser, shortcut: '' },
  { id: 'sysmonitor', name: 'System Monitor', desc: 'System performance', icon: ICONS.sysmonitor, shortcut: '' },
  { id: 'aiimage', name: 'Image generator', desc: 'Draw pictures with a local neural network', icon: ICONS.aiimage, shortcut: '' },
  { id: 'settings', name: 'Settings', desc: 'Customize AetherOS', icon: ICONS.settings, shortcut: '' },
];

let nexusOpen = false;
let nexusSelectedIndex = 0;

function toggleNexus() {
  const overlay = document.getElementById('nexus-overlay');
  nexusOpen = !nexusOpen;
  overlay.classList.toggle('visible', nexusOpen);
  
  if (nexusOpen) {
    const input = document.getElementById('nexus-input');
    input.value = '';
    input.focus();
    renderNexusResults('');
  }
}

function renderNexusResults(query) {
  const container = document.getElementById('nexus-results');
  const q = query.toLowerCase().trim();
  
  let results = nexusApps;
  if (q) {
    results = nexusApps.filter(app =>
      app.name.toLowerCase().includes(q) || app.desc.toLowerCase().includes(q)
    );
  }
  
  // Also search files
  const fileResults = [];
  if (q.length >= 2) {
    const searchInDir = (dirPath) => {
      const items = fsListDir(dirPath);
      if (!items) return;
      for (const item of items) {
        const fullPath = dirPath === '/' ? '/' + item : dirPath + '/' + item;
        if (item.toLowerCase().includes(q)) {
          fileResults.push({
            id: '_file_' + fullPath,
            name: item,
            desc: fullPath,
            icon: fsIsDir(fullPath) ? ICONS.folder : ICONS.file,
            filePath: fullPath
          });
        }
        if (fsIsDir(fullPath)) searchInDir(fullPath);
      }
    };
    searchInDir('/');
  }
  
  const allResults = [...results, ...fileResults].slice(0, 10);
  nexusSelectedIndex = 0;
  
  container.innerHTML = allResults.map((r, i) => `
    <div class="nexus-result ${i === 0 ? 'selected' : ''}" data-idx="${i}" data-id="${r.id}" ${r.filePath ? 'data-filepath="' + r.filePath + '"' : ''}>
      <div class="nexus-result-icon">${r.icon}</div>
      <div class="nexus-result-info">
        <div class="nexus-result-name">${r.name}</div>
        <div class="nexus-result-desc">${r.desc}</div>
      </div>
      ${r.shortcut ? '<span class="nexus-result-shortcut">' + r.shortcut + '</span>' : ''}
    </div>
  `).join('');
  
  // Click handlers
  container.querySelectorAll('.nexus-result').forEach(el => {
    el.addEventListener('click', () => {
      const fp = el.dataset.filepath;
      if (fp) {
        // Open file in editor
        openFileInEditor(fp);
      } else {
        openApp(el.dataset.id);
      }
      toggleNexus();
    });
  });
}

document.getElementById('nexus-input').addEventListener('input', e => {
  renderNexusResults(e.target.value);
});

document.getElementById('nexus-input').addEventListener('keydown', e => {
  const results = document.querySelectorAll('.nexus-result');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    nexusSelectedIndex = Math.min(nexusSelectedIndex + 1, results.length - 1);
    results.forEach((r, i) => r.classList.toggle('selected', i === nexusSelectedIndex));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    nexusSelectedIndex = Math.max(nexusSelectedIndex - 1, 0);
    results.forEach((r, i) => r.classList.toggle('selected', i === nexusSelectedIndex));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (results[nexusSelectedIndex]) results[nexusSelectedIndex].click();
  } else if (e.key === 'Escape') {
    toggleNexus();
  }
});

document.getElementById('nexus-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('nexus-overlay')) toggleNexus();
});

// ================================================================
// 8. WINDOW MANAGER
// ================================================================
let windowZIndex = 100;
let activeWindow = null;
let dragState = null;
let resizeState = null;

function createWindow(appId, title, width = 700, height = 500, content = '') {
  AetherState.windowCounter++;
  const winId = 'win-' + AetherState.windowCounter;
  
  const win = document.createElement('div');
  win.className = 'aether-window';
  win.id = winId;
  win.dataset.appId = appId;
  win.style.width = width + 'px';
  win.style.height = height + 'px';
  
  // Center with slight offset to prevent overlap
  const offset = (AetherState.windowCounter % 5) * 30;
  win.style.left = Math.max(80, (window.innerWidth - width) / 2 + offset) + 'px';
  win.style.top = Math.max(60, (window.innerHeight - height) / 2 + offset) + 'px';
  win.style.zIndex = ++windowZIndex;
  
  const appInfo = nexusApps.find(a => a.id === appId);
  const icon = appInfo ? appInfo.icon : ICONS.aiimage;
  
  win.innerHTML = `
    <div class="window-titlebar" data-win-id="${winId}">
      <span class="window-titlebar-icon">${icon}</span>
      <span class="window-titlebar-text">${title}</span>
      <div class="window-controls">
        <button class="window-ctrl minimize" data-action="minimize" title="Minimize"></button>
        <button class="window-ctrl maximize" data-action="maximize" title="Maximize"></button>
        <button class="window-ctrl close" data-action="close" title="Close"></button>
      </div>
    </div>
    <div class="window-body">${content}</div>
    <div class="resize-handle top"></div>
    <div class="resize-handle bottom"></div>
    <div class="resize-handle left"></div>
    <div class="resize-handle right"></div>
    <div class="resize-handle top-left"></div>
    <div class="resize-handle top-right"></div>
    <div class="resize-handle bottom-left"></div>
    <div class="resize-handle bottom-right"></div>
  `;
  
  document.getElementById('windows-container').appendChild(win);
  
  // Focus
  focusWindow(win);
  
  // Titlebar drag
  const titlebar = win.querySelector('.window-titlebar');
  titlebar.addEventListener('mousedown', e => {
    if (e.target.closest('.window-controls')) return;
    if (win.classList.contains('maximized')) return;
    focusWindow(win);
    dragState = {
      win,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: parseInt(win.style.left),
      origTop: parseInt(win.style.top),
    };
    e.preventDefault();
  });
  
  // Double-click titlebar to maximize
  titlebar.addEventListener('dblclick', e => {
    if (e.target.closest('.window-controls')) return;
    toggleMaximize(win);
  });
  
  // Window controls
  win.querySelector('.window-ctrl.close').addEventListener('click', () => closeWindow(win));
  win.querySelector('.window-ctrl.minimize').addEventListener('click', () => minimizeWindow(win));
  win.querySelector('.window-ctrl.maximize').addEventListener('click', () => toggleMaximize(win));
  
  // Click to focus
  win.addEventListener('mousedown', () => focusWindow(win));
  
  // Resize handles
  win.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      if (win.classList.contains('maximized')) return;
      e.preventDefault();
      e.stopPropagation();
      focusWindow(win);
      
      const rect = win.getBoundingClientRect();
      resizeState = {
        win,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: rect.left,
        origTop: rect.top,
        origWidth: rect.width,
        origHeight: rect.height,
        direction: [...handle.classList].find(c => c !== 'resize-handle'),
      };
    });
  });
  
  updateShelfIndicators();
  return win;
}

function focusWindow(win) {
  if (activeWindow) activeWindow.classList.remove('focused');
  win.style.zIndex = ++windowZIndex;
  win.classList.add('focused');
  activeWindow = win;
}

function closeWindow(win) {
  win.classList.add('closing');
  setTimeout(() => {
    win.remove();
    updateShelfIndicators();
    if (activeWindow === win) activeWindow = null;
    // Clean up sysmonitor intervals
    if (win._sysmonInterval) clearInterval(win._sysmonInterval);
  }, 200);
}

function minimizeWindow(win) {
  win.classList.add('minimizing');
  setTimeout(() => {
    win.style.display = 'none';
    win.classList.remove('minimizing');
  }, 250);
}

function restoreWindow(win) {
  win.style.display = 'flex';
  focusWindow(win);
  win.style.animation = 'windowOpen 0.25s ease forwards';
}

function toggleMaximize(win) {
  win.classList.toggle('maximized');
  // Store pre-maximize state
  if (win.classList.contains('maximized')) {
    win.dataset.preMaxLeft = win.style.left;
    win.dataset.preMaxTop = win.style.top;
    win.dataset.preMaxWidth = win.style.width;
    win.dataset.preMaxHeight = win.style.height;
  } else {
    win.style.left = win.dataset.preMaxLeft || '100px';
    win.style.top = win.dataset.preMaxTop || '100px';
    win.style.width = win.dataset.preMaxWidth || '700px';
    win.style.height = win.dataset.preMaxHeight || '500px';
  }
}

// Global mouse handlers for drag and resize
document.addEventListener('mousemove', e => {
  if (dragState) {
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    dragState.win.style.left = (dragState.origLeft + dx) + 'px';
    dragState.win.style.top = Math.max(0, dragState.origTop + dy) + 'px';
  }
  
  if (resizeState) {
    const dx = e.clientX - resizeState.startX;
    const dy = e.clientY - resizeState.startY;
    const dir = resizeState.direction;
    const minW = 320;
    const minH = 200;
    
    let newW = resizeState.origWidth;
    let newH = resizeState.origHeight;
    let newL = resizeState.origLeft;
    let newT = resizeState.origTop;
    
    if (dir.includes('right')) newW = Math.max(minW, resizeState.origWidth + dx);
    if (dir.includes('bottom')) newH = Math.max(minH, resizeState.origHeight + dy);
    if (dir.includes('left')) {
      newW = Math.max(minW, resizeState.origWidth - dx);
      if (newW > minW) newL = resizeState.origLeft + dx;
    }
    if (dir.includes('top')) {
      newH = Math.max(minH, resizeState.origHeight - dy);
      if (newH > minH) newT = Math.max(0, resizeState.origTop + dy);
    }
    
    resizeState.win.style.width = newW + 'px';
    resizeState.win.style.height = newH + 'px';
    resizeState.win.style.left = newL + 'px';
    resizeState.win.style.top = newT + 'px';
  }
});

document.addEventListener('mouseup', () => {
  dragState = null;
  resizeState = null;
});

// ================================================================
// 9. CONTEXT MENU
// ================================================================
const contextMenu = document.getElementById('context-menu');

document.getElementById('desktop').addEventListener('contextmenu', e => {
  // Only show on desktop background
  if (e.target.closest('.aether-window') || e.target.closest('#shelf') || e.target.closest('.widget')) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, [
    { icon: '', label: 'New Folder', action: () => showDialog('New Folder', 'Folder name:', name => { if (name) { fsMkdir('/home/' + name); showToast('Created', 'Folder "' + name + '" created'); } }) },
    { icon: '', label: 'New File', action: () => showDialog('New File', 'File name:', name => { if (name) { fsWriteFile('/home/' + name, ''); showToast('Created', 'File "' + name + '" created'); } }) },
    { separator: true },
    { icon: '↻', label: 'Refresh', action: () => showToast('Refreshed', 'Desktop refreshed') },
    { icon: '', label: 'Change Wallpaper', action: () => openApp('settings') },
    { separator: true },
    { icon: '', label: 'Open Terminal', shortcut: '', action: () => openApp('terminal') },
    { icon: '', label: 'Settings', action: () => openApp('settings') },
    { separator: true },
    { icon: '', label: 'About AetherOS', action: () => showToast('AetherOS v1.0', 'A web-based operating system built with HTML, CSS & JS') },
  ]);
});

function showContextMenu(x, y, items) {
  contextMenu.innerHTML = items.map(item => {
    if (item.separator) return '<div class="context-separator"></div>';
    return `<div class="context-item">
      <span class="context-item-icon">${item.icon || ''}</span>
      ${item.label}
      ${item.shortcut ? '<span class="context-item-shortcut">' + item.shortcut + '</span>' : ''}
    </div>`;
  }).join('');
  
  // Position
  const menuW = 220;
  const menuH = items.length * 36;
  contextMenu.style.left = Math.min(x, window.innerWidth - menuW) + 'px';
  contextMenu.style.top = Math.min(y, window.innerHeight - menuH) + 'px';
  contextMenu.classList.add('visible');
  
  // Click handlers
  let itemIdx = 0;
  contextMenu.querySelectorAll('.context-item').forEach(el => {
    // Find matching non-separator item
    while (itemIdx < items.length && items[itemIdx].separator) itemIdx++;
    if (itemIdx < items.length) {
      const action = items[itemIdx].action;
      el.addEventListener('click', () => {
        hideContextMenu();
        if (action) action();
      });
      itemIdx++;
    }
  });
}

function hideContextMenu() {
  contextMenu.classList.remove('visible');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#context-menu')) hideContextMenu();
});

document.addEventListener('contextmenu', e => {
  if (!e.target.closest('#desktop')) return;
});

// ================================================================
// 10. NOTIFICATION CENTER & TOASTS
// ================================================================
let notifCenterOpen = false;

function toggleNotificationCenter() {
  notifCenterOpen = !notifCenterOpen;
  document.getElementById('notification-center').classList.toggle('visible', notifCenterOpen);
}

// Close on click outside
document.addEventListener('click', e => {
  if (notifCenterOpen && !e.target.closest('#notification-center') && !e.target.closest('#tray-notif')) {
    toggleNotificationCenter();
  }
});

function addNotification(title, body) {
  const list = document.getElementById('notif-list');
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const item = document.createElement('div');
  item.className = 'notif-item';
  item.innerHTML = `
    <div class="notif-item-title">${title}</div>
    <div class="notif-item-body">${body}</div>
    <div class="notif-item-time">${timeStr}</div>
  `;
  list.prepend(item);
  
  AetherState.notifications.push({ title, body, time: timeStr });
}

document.getElementById('notif-clear-btn').addEventListener('click', () => {
  document.getElementById('notif-list').innerHTML = '';
  AetherState.notifications = [];
});

function showToast(title, body, duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-body">${body}</div>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Quick settings toggles
document.querySelectorAll('.quick-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    
    if (toggle.id === 'qs-darkmode') {
      const isDark = !toggle.classList.contains('active');
      AetherState.theme = isDark ? 'dark' : 'light';
      document.documentElement.dataset.theme = AetherState.theme;
      saveState();
    }
  });
});

// Volume slider
document.getElementById('qs-volume').addEventListener('input', e => {
  AetherState.volume = parseInt(e.target.value);
});

// Brightness slider
document.getElementById('qs-brightness').addEventListener('input', e => {
  AetherState.brightness = parseInt(e.target.value);
  document.documentElement.style.setProperty('--brightness', AetherState.brightness / 100);
});

// ================================================================
// 11. DIALOG SYSTEM
// ================================================================
let dialogCallback = null;

function showDialog(title, placeholder, callback) {
  const overlay = document.getElementById('dialog-overlay');
  const titleEl = document.getElementById('dialog-title');
  const input = document.getElementById('dialog-input');
  
  titleEl.textContent = title;
  input.placeholder = placeholder || '';
  input.value = '';
  dialogCallback = callback;
  
  overlay.classList.add('visible');
  setTimeout(() => input.focus(), 100);
}

document.getElementById('dialog-ok').addEventListener('click', () => {
  const val = document.getElementById('dialog-input').value;
  document.getElementById('dialog-overlay').classList.remove('visible');
  if (dialogCallback) dialogCallback(val);
  dialogCallback = null;
});

document.getElementById('dialog-cancel').addEventListener('click', () => {
  document.getElementById('dialog-overlay').classList.remove('visible');
  dialogCallback = null;
});

document.getElementById('dialog-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('dialog-ok').click();
  if (e.key === 'Escape') document.getElementById('dialog-cancel').click();
});

// ================================================================
// 12. APPS
// ================================================================

function openApp(appId) {
  // Check if already open, restore if minimized
  const existing = document.querySelector(`.aether-window[data-app-id="${appId}"]`);
  if (existing) {
    if (existing.style.display === 'none') {
      restoreWindow(existing);
    } else {
      focusWindow(existing);
    }
    return;
  }
  
  switch (appId) {
    case 'filemanager': createFileManagerWindow(); break;
    case 'editor': createEditorWindow(); break;
    case 'terminal': createTerminalWindow(); break;
    case 'calculator': createCalculatorWindow(); break;
    case 'settings': createSettingsWindow(); break;
    case 'browser': createBrowserWindow(); break;
    case 'sysmonitor': createSysMonitorWindow(); break;
    case 'aiimage': createAiImageWindow(); break;
    default: showToast('Error', 'Unknown app: ' + appId);
  }
}

function openFileInEditor(path) {
  const content = fsReadFile(path);
  if (content === null) return;
  createEditorWindow(path, content);
}

// ── FILE MANAGER ──
function createFileManagerWindow() {
  let currentPath = '/home';
  
  const content = `<div class="file-manager">
    <div class="fm-sidebar">
      <div class="fm-sidebar-item active" data-path="/home"> Home</div>
      <div class="fm-sidebar-item" data-path="/home/documents"> Documents</div>
      <div class="fm-sidebar-item" data-path="/home/pictures"> Pictures</div>
      <div class="fm-sidebar-item" data-path="/home/downloads"> Downloads</div>
      <div class="fm-sidebar-item" data-path="/"> Root</div>
      <div class="fm-sidebar-item" data-path="/system"> System</div>
    </div>
    <div class="fm-main">
      <div class="fm-toolbar">
        <button class="fm-toolbar-btn" id="fm-back" title="Back">←</button>
        <button class="fm-toolbar-btn" id="fm-up" title="Up">↑</button>
        <button class="fm-toolbar-btn" id="fm-refresh" title="Refresh">↻</button>
        <div class="fm-path" id="fm-pathbar">/home</div>
        <button class="fm-toolbar-btn" id="fm-newfolder" title="New Folder">+ Folder</button>
        <button class="fm-toolbar-btn" id="fm-newfile" title="New File">+ File</button>
      </div>
      <div class="fm-content" id="fm-content"></div>
    </div>
  </div>`;
  
  const win = createWindow('filemanager', 'File Manager', 750, 500, content);
  const body = win.querySelector('.window-body');
  const history = ['/home'];
  let historyIdx = 0;
  
  function navigateTo(path) {
    path = fsResolvePath(path);
    if (!fsExists(path) || !fsIsDir(path)) {
      showToast('Error', 'Directory not found: ' + path);
      return;
    }
    currentPath = path;
    if (history[historyIdx] !== path) {
      history.splice(historyIdx + 1);
      history.push(path);
      historyIdx = history.length - 1;
    }
    renderFM();
  }
  
  function renderFM() {
    const pathBar = body.querySelector('#fm-pathbar');
    const contentArea = body.querySelector('#fm-content');
    if (pathBar) pathBar.textContent = currentPath;
    
    // Update sidebar active
    body.querySelectorAll('.fm-sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.path === currentPath);
    });
    
    const items = fsListDir(currentPath);
    if (!items || items.length === 0) {
      contentArea.innerHTML = '<div class="fm-empty">This folder is empty</div>';
      return;
    }
    
    contentArea.innerHTML = items.map(name => {
      const fullPath = currentPath === '/' ? '/' + name : currentPath + '/' + name;
      const isDir = fsIsDir(fullPath);
      return `<div class="fm-item" data-name="${name}" data-path="${fullPath}" data-isdir="${isDir}">
        <div class="fm-item-icon">${isDir ? ICONS.folder : getFileIcon(name)}</div>
        <div class="fm-item-name" title="${name}">${name}</div>
      </div>`;
    }).join('');
    
    // Click handlers
    contentArea.querySelectorAll('.fm-item').forEach(el => {
      el.addEventListener('dblclick', () => {
        if (el.dataset.isdir === 'true') {
          navigateTo(el.dataset.path);
        } else {
          const filePath = el.dataset.path;
          if (/\.(png|jpe?g|webp|gif|svg)$/i.test(filePath)) {
            showImageViewer(filePath);
          } else {
            openFileInEditor(filePath);
          }
        }
      });
      
      el.addEventListener('click', (e) => {
        contentArea.querySelectorAll('.fm-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
      });
      
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, [
          { icon: '', label: 'Open', action: () => {
            if (el.dataset.isdir === 'true') navigateTo(el.dataset.path);
            else openFileInEditor(el.dataset.path);
          }},
          { separator: true },
          { icon: '', label: 'Rename', action: () => {
            showDialog('Rename', 'New name:', newName => {
              if (newName && fsRename(el.dataset.path, newName)) {
                renderFM();
                showToast('Renamed', `"${el.dataset.name}" → "${newName}"`);
              }
            });
          }},
          { icon: '', label: 'Delete', action: () => {
            if (fsDelete(el.dataset.path)) {
              renderFM();
              showToast('Deleted', `"${el.dataset.name}" deleted`);
            }
          }},
          { separator: true },
          { icon: '', label: 'Copy Path', action: () => {
            navigator.clipboard?.writeText(el.dataset.path);
            showToast('Copied', el.dataset.path);
          }},
        ]);
      });
    });
  }
  
  // Sidebar navigation
  body.querySelectorAll('.fm-sidebar-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.path));
  });
  
  // Toolbar
  body.querySelector('#fm-back').addEventListener('click', () => {
    if (historyIdx > 0) { historyIdx--; currentPath = history[historyIdx]; renderFM(); }
  });
  body.querySelector('#fm-up').addEventListener('click', () => {
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    navigateTo(parent);
  });
  body.querySelector('#fm-refresh').addEventListener('click', renderFM);
  body.querySelector('#fm-newfolder').addEventListener('click', () => {
    showDialog('New Folder', 'Folder name:', name => {
      if (name) { fsMkdir(currentPath + '/' + name); renderFM(); }
    });
  });
  body.querySelector('#fm-newfile').addEventListener('click', () => {
    showDialog('New File', 'File name:', name => {
      if (name) { fsWriteFile(currentPath + '/' + name, ''); renderFM(); }
    });
  });
  
  // Context menu on empty space
  body.querySelector('#fm-content').addEventListener('contextmenu', e => {
    if (e.target.closest('.fm-item')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { icon: '', label: 'New Folder', action: () => {
        showDialog('New Folder', 'Folder name:', name => {
          if (name) { fsMkdir(currentPath + '/' + name); renderFM(); }
        });
      }},
      { icon: '', label: 'New File', action: () => {
        showDialog('New File', 'File name:', name => {
          if (name) { fsWriteFile(currentPath + '/' + name, ''); renderFM(); }
        });
      }},
      { separator: true },
      { icon: '↻', label: 'Refresh', action: renderFM },
    ]);
  });
  
  renderFM();
}

function getFileIcon(name) {
  return ICONS.file;
}

// ── TEXT EDITOR ──
function createEditorWindow(filePath, initialContent) {
  const fileName = filePath ? filePath.split('/').pop() : 'untitled.txt';
  
  const content = `<div class="text-editor">
    <div class="te-toolbar">
      <button class="te-toolbar-btn" id="te-new">New</button>
      <button class="te-toolbar-btn" id="te-open">Open</button>
      <button class="te-toolbar-btn" id="te-save">Save</button>
      <button class="te-toolbar-btn" id="te-saveas">Save As</button>
      <span class="te-filename" id="te-filename">${fileName}</span>
    </div>
    <div class="te-content">
      <div class="te-line-numbers" id="te-lines">1</div>
      <textarea class="te-area" id="te-area" spellcheck="false" placeholder="Start typing...">${initialContent || ''}</textarea>
    </div>
    <div class="te-statusbar">
      <span id="te-status-line">Ln 1, Col 1</span>
      <span id="te-status-chars">0 chars</span>
      <span style="flex:1"></span>
      <span>UTF-8</span>
    </div>
  </div>`;
  
  const win = createWindow('editor', 'Editor — ' + fileName, 700, 500, content);
  const body = win.querySelector('.window-body');
  let currentFile = filePath || null;
  
  const textarea = body.querySelector('#te-area');
  const lineNumbers = body.querySelector('#te-lines');
  const statusLine = body.querySelector('#te-status-line');
  const statusChars = body.querySelector('#te-status-chars');
  const fileNameEl = body.querySelector('#te-filename');
  
  function updateLineNumbers() {
    const lines = textarea.value.split('\n').length;
    lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  }
  
  function updateStatus() {
    const val = textarea.value;
    const pos = textarea.selectionStart;
    const lines = val.substring(0, pos).split('\n');
    statusLine.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
    statusChars.textContent = `${val.length} chars`;
  }
  
  textarea.addEventListener('input', () => { updateLineNumbers(); updateStatus(); });
  textarea.addEventListener('click', updateStatus);
  textarea.addEventListener('keyup', updateStatus);
  
  textarea.addEventListener('scroll', () => {
    lineNumbers.scrollTop = textarea.scrollTop;
  });
  
  // Tab support
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(textarea.selectionEnd);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      updateLineNumbers();
    }
    // Ctrl+S to save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
  });
  
  function saveFile() {
    if (currentFile) {
      fsWriteFile(currentFile, textarea.value);
      showToast('Saved', 'File saved: ' + currentFile);
    } else {
      showDialog('Save As', 'File path (e.g. /home/documents/file.txt):', path => {
        if (path) {
          currentFile = path;
          fsWriteFile(currentFile, textarea.value);
          fileNameEl.textContent = path.split('/').pop();
          win.querySelector('.window-titlebar-text').textContent = 'Editor — ' + path.split('/').pop();
          showToast('Saved', 'File saved: ' + path);
        }
      });
    }
  }
  
  body.querySelector('#te-new').addEventListener('click', () => {
    currentFile = null;
    textarea.value = '';
    fileNameEl.textContent = 'untitled.txt';
    win.querySelector('.window-titlebar-text').textContent = 'Editor — untitled.txt';
    updateLineNumbers();
    updateStatus();
  });
  
  body.querySelector('#te-open').addEventListener('click', () => {
    showDialog('Open File', 'File path:', path => {
      if (path) {
        const c = fsReadFile(path);
        if (c !== null) {
          currentFile = path;
          textarea.value = c;
          fileNameEl.textContent = path.split('/').pop();
          win.querySelector('.window-titlebar-text').textContent = 'Editor — ' + path.split('/').pop();
          updateLineNumbers();
          updateStatus();
        } else {
          showToast('Error', 'File not found: ' + path);
        }
      }
    });
  });
  
  body.querySelector('#te-save').addEventListener('click', saveFile);
  body.querySelector('#te-saveas').addEventListener('click', () => {
    showDialog('Save As', 'File path:', path => {
      if (path) {
        currentFile = path;
        fsWriteFile(currentFile, textarea.value);
        fileNameEl.textContent = path.split('/').pop();
        win.querySelector('.window-titlebar-text').textContent = 'Editor — ' + path.split('/').pop();
        showToast('Saved', 'File saved: ' + path);
      }
    });
  });
  
  updateLineNumbers();
  updateStatus();
}

// ── TERMINAL ──
function createTerminalWindow() {
  let termCwd = '/home';
  const cmdHistory = [];
  let historyPos = -1;
  
  const content = `<div class="terminal">
    <div class="term-output" id="term-output"><span class="term-info">AetherOS Terminal v1.0
Type 'help' for available commands.

</span></div>
    <div class="term-input-line">
      <span class="term-prompt-symbol" id="term-prompt">${AetherState.username}@aether:/home $</span>
      <input type="text" class="term-input" id="term-input" autofocus spellcheck="false">
    </div>
  </div>`;
  
  const win = createWindow('terminal', 'Terminal', 650, 420, content);
  const body = win.querySelector('.window-body');
  const output = body.querySelector('#term-output');
  const input = body.querySelector('#term-input');
  const promptEl = body.querySelector('#term-prompt');
  
  function updatePrompt() {
    promptEl.textContent = `${AetherState.username}@aether:${termCwd} $`;
  }
  
  function termPrint(text, cls = '') {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text;
    output.appendChild(span);
    output.scrollTop = output.scrollHeight;
  }
  
  function termPrintHTML(html) {
    const div = document.createElement('span');
    div.innerHTML = html;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }
  
  function executeCommand(cmdLine) {
    const parts = cmdLine.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    
    termPrintHTML(`<span class="term-prompt">${AetherState.username}@aether:${termCwd} $ </span><span class="term-cmd">${cmdLine}</span>\n`);
    
    if (!cmd) return;
    
    switch (cmd) {
      case 'help':
        termPrint(`Available commands:
  ls [path]      - List directory contents
  cd <path>      - Change directory
  pwd            - Print working directory
  mkdir <name>   - Create directory
  touch <name>   - Create empty file
  cat <file>     - Display file content
  echo <text>    - Print text (use > file to write)
  rm <path>      - Delete file or directory
  mv <src> <dst> - Move file or directory
  clear          - Clear terminal
  whoami         - Display current user
  date           - Show date and time
  uname          - System info
  neofetch       - System info (fancy)
  ai [prompt]    - Open image generator (and draw [prompt])
  python         - How to start the image server
  help           - Show this help
\n`, 'term-info');
        break;
        
      case 'ls': {
        const target = args[0] ? resolveTermPath(args[0]) : termCwd;
        const items = fsListDir(target);
        if (items === null) {
          termPrint(`ls: cannot access '${args[0] || target}': No such directory\n`, 'term-error');
        } else if (items.length === 0) {
          termPrint('(empty)\n', 'term-info');
        } else {
          items.forEach(item => {
            const fullPath = target === '/' ? '/' + item : target + '/' + item;
            const isDir = fsIsDir(fullPath);
            termPrintHTML(`<span style="color:${isDir ? '#60a5fa' : '#c0c0d0'}">${isDir ? item + '/' : item}</span>  `);
          });
          termPrint('\n');
        }
        break;
      }
      
      case 'cd': {
        if (!args[0] || args[0] === '~') {
          termCwd = '/home';
        } else if (args[0] === '..') {
          termCwd = termCwd.substring(0, termCwd.lastIndexOf('/')) || '/';
        } else {
          const target = resolveTermPath(args[0]);
          if (fsIsDir(target)) {
            termCwd = target;
          } else {
            termPrint(`cd: no such directory: ${args[0]}\n`, 'term-error');
          }
        }
        updatePrompt();
        break;
      }
      
      case 'pwd':
        termPrint(termCwd + '\n');
        break;
        
      case 'mkdir':
        if (!args[0]) { termPrint('mkdir: missing operand\n', 'term-error'); break; }
        if (fsMkdir(resolveTermPath(args[0]))) {
          termPrint('', ''); // success, no output
        } else {
          termPrint(`mkdir: cannot create '${args[0]}': already exists\n`, 'term-error');
        }
        break;
        
      case 'touch':
        if (!args[0]) { termPrint('touch: missing operand\n', 'term-error'); break; }
        fsWriteFile(resolveTermPath(args[0]), '');
        break;
        
      case 'cat': {
        if (!args[0]) { termPrint('cat: missing operand\n', 'term-error'); break; }
        const c = fsReadFile(resolveTermPath(args[0]));
        if (c === null) {
          termPrint(`cat: ${args[0]}: No such file\n`, 'term-error');
        } else {
          termPrint(c + '\n');
        }
        break;
      }
      
      case 'echo': {
        const text = args.join(' ');
        // Support echo text > file
        const redirectIdx = args.indexOf('>');
        if (redirectIdx >= 0 && args[redirectIdx + 1]) {
          const fileText = args.slice(0, redirectIdx).join(' ');
          const filePath = resolveTermPath(args[redirectIdx + 1]);
          fsWriteFile(filePath, fileText);
        } else {
          termPrint(text + '\n');
        }
        break;
      }
      
      case 'rm':
        if (!args[0]) { termPrint('rm: missing operand\n', 'term-error'); break; }
        if (fsDelete(resolveTermPath(args[0]))) {
          termPrint(''); 
        } else {
          termPrint(`rm: cannot remove '${args[0]}': No such file or directory\n`, 'term-error');
        }
        break;
        
      case 'mv':
        if (args.length < 2) { termPrint('mv: missing destination\n', 'term-error'); break; }
        if (fsMove(resolveTermPath(args[0]), resolveTermPath(args[1]))) {
          termPrint('');
        } else {
          termPrint(`mv: failed to move '${args[0]}' to '${args[1]}'\n`, 'term-error');
        }
        break;
        
      case 'clear':
        output.innerHTML = '';
        break;
        
      case 'whoami':
        termPrint(AetherState.username + '\n');
        break;
        
      case 'date':
        termPrint(new Date().toString() + '\n');
        break;
        
      case 'uname':
        termPrint('AetherOS 1.0 x86_64 Web/JS\n');
        break;
        
            case 'python':
      case 'python3':
        termPrint('Это встроенный терминал AetherOS, Python тут не запускается.\nЗапусти сервер генератора в обычной консоли (cmd или PowerShell) в папке проекта:\n  python ai_images.py\n', 'term-info');
        break;

      case 'ai':
      case 'ai-images': {
        const promptArg = args.join(' ');
        openApp('aiimage');
        if (promptArg) {
          setTimeout(() => {
            const input = document.getElementById('ai-prompt-input');
            if (input) {
              input.value = promptArg;
              const genBtn = document.getElementById('ai-generate-btn');
              if (genBtn) genBtn.click();
            }
          }, 400);
        }
        termPrint('Открываю генератор картинок...\n');
        break;
      }

      case 'neofetch':
        termPrintHTML(`<span class="term-info">
     ╭──────╮       <span style="color:var(--accent)">${AetherState.username}</span>@<span style="color:var(--accent)">aether</span>
    ╭│ <span style="color:var(--accent)">◉</span>    │╮      ──────────────
   ╭│╰──────╯│╮     OS: AetherOS 1.0
   │╰────────╯│     Kernel: Web/JS
   ╰──────────╯     Shell: aether-term
                    Resolution: ${window.innerWidth}x${window.innerHeight}
                    Theme: ${AetherState.theme}
                    Uptime: ${Math.floor(performance.now() / 1000)}s
</span>\n`);
        break;
        
      default:
        termPrint(`${cmd}: command not found\n`, 'term-error');
    }
  }
  
  function resolveTermPath(p) {
    if (p.startsWith('/')) return fsResolvePath(p);
    if (p.startsWith('~')) return fsResolvePath('/home' + p.substring(1));
    return fsResolvePath(termCwd + '/' + p);
  }
  
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const cmd = input.value;
      if (cmd.trim()) {
        cmdHistory.push(cmd);
        historyPos = cmdHistory.length;
      }
      executeCommand(cmd);
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyPos > 0) {
        historyPos--;
        input.value = cmdHistory[historyPos];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyPos < cmdHistory.length - 1) {
        historyPos++;
        input.value = cmdHistory[historyPos];
      } else {
        historyPos = cmdHistory.length;
        input.value = '';
      }
    }
  });
  
  // Click on terminal focuses input
  body.querySelector('.terminal').addEventListener('click', () => input.focus());
  
  updatePrompt();
  setTimeout(() => input.focus(), 100);
}

// ── CALCULATOR ──
function createCalculatorWindow() {
  const content = `<div class="calculator">
    <div class="calc-display">
      <div class="calc-expression" id="calc-expr"></div>
      <div class="calc-result" id="calc-result">0</div>
    </div>
    <div class="calc-buttons">
      <button class="calc-btn function" data-val="C">C</button>
      <button class="calc-btn function" data-val="±">±</button>
      <button class="calc-btn function" data-val="%">%</button>
      <button class="calc-btn operator" data-val="/">÷</button>
      
      <button class="calc-btn number" data-val="7">7</button>
      <button class="calc-btn number" data-val="8">8</button>
      <button class="calc-btn number" data-val="9">9</button>
      <button class="calc-btn operator" data-val="*">×</button>
      
      <button class="calc-btn number" data-val="4">4</button>
      <button class="calc-btn number" data-val="5">5</button>
      <button class="calc-btn number" data-val="6">6</button>
      <button class="calc-btn operator" data-val="-">−</button>
      
      <button class="calc-btn number" data-val="1">1</button>
      <button class="calc-btn number" data-val="2">2</button>
      <button class="calc-btn number" data-val="3">3</button>
      <button class="calc-btn operator" data-val="+">+</button>
      
      <button class="calc-btn number" data-val="0" style="grid-column: span 2">0</button>
      <button class="calc-btn number" data-val=".">.</button>
      <button class="calc-btn equals" data-val="=">=</button>
    </div>
  </div>`;
  
  const win = createWindow('calculator', 'Calculator', 340, 480, content);
  const body = win.querySelector('.window-body');
  const exprEl = body.querySelector('#calc-expr');
  const resultEl = body.querySelector('#calc-result');
  
  let currentVal = '0';
  let previousVal = '';
  let operator = null;
  let shouldReset = false;
  
  body.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      
      if (val === 'C') {
        currentVal = '0';
        previousVal = '';
        operator = null;
        exprEl.textContent = '';
        resultEl.textContent = '0';
        return;
      }
      
      if (val === '±') {
        currentVal = String(-parseFloat(currentVal));
        resultEl.textContent = currentVal;
        return;
      }
      
      if (val === '%') {
        currentVal = String(parseFloat(currentVal) / 100);
        resultEl.textContent = currentVal;
        return;
      }
      
      if (['+', '-', '*', '/'].includes(val)) {
        if (operator && !shouldReset) {
          calculate();
        }
        previousVal = currentVal;
        operator = val;
        shouldReset = true;
        exprEl.textContent = previousVal + ' ' + { '+': '+', '-': '−', '*': '×', '/': '÷' }[val];
        return;
      }
      
      if (val === '=') {
        if (operator) {
          exprEl.textContent = previousVal + ' ' + { '+': '+', '-': '−', '*': '×', '/': '÷' }[operator] + ' ' + currentVal;
          calculate();
          operator = null;
        }
        return;
      }
      
      // Number/decimal
      if (shouldReset) {
        currentVal = val === '.' ? '0.' : val;
        shouldReset = false;
      } else {
        if (val === '.' && currentVal.includes('.')) return;
        currentVal = currentVal === '0' && val !== '.' ? val : currentVal + val;
      }
      
      resultEl.textContent = currentVal;
    });
  });
  
  function calculate() {
    const prev = parseFloat(previousVal);
    const curr = parseFloat(currentVal);
    let result = 0;
    
    switch (operator) {
      case '+': result = prev + curr; break;
      case '-': result = prev - curr; break;
      case '*': result = prev * curr; break;
      case '/': result = curr !== 0 ? prev / curr : 'Error'; break;
    }
    
    currentVal = typeof result === 'number' ? String(Math.round(result * 1e10) / 1e10) : result;
    previousVal = '';
    resultEl.textContent = currentVal;
    shouldReset = true;
  }
}

// ── SETTINGS ──
function createSettingsWindow() {
  const wallpapers = [
    { name: 'Graphite', gradient: '#1b1c1f' },
    { name: 'Slate', gradient: '#1a2128' },
    { name: 'Moss', gradient: '#1b231d' },
    { name: 'Brick', gradient: '#2a1d1b' },
    { name: 'Ink', gradient: '#14161c' },
    { name: 'Plum', gradient: '#251c26' },
  ];
  
  const accentColors = [
    { name: 'Amber', color: '#f0a030' },
    { name: 'Coral', color: '#e06848' },
    { name: 'Blue', color: '#60a5fa' },
    { name: 'Purple', color: '#a78bfa' },
    { name: 'Green', color: '#4ade80' },
    { name: 'Teal', color: '#22d3ee' },
    { name: 'Pink', color: '#f472b6' },
    { name: 'Red', color: '#f87171' },
  ];
  
  const content = `<div class="settings-app">
    <div class="settings-nav">
      <div class="settings-nav-item active" data-section="general"> Appearance</div>
      <div class="settings-nav-item" data-section="wallpaper"> Wallpaper</div>
      <div class="settings-nav-item" data-section="account"> Account</div>
      <div class="settings-nav-item" data-section="about"> About</div>
    </div>
    <div class="settings-content" id="settings-content">
      <!-- Will be rendered dynamically -->
    </div>
  </div>`;
  
  const win = createWindow('settings', 'Settings', 700, 500, content);
  const body = win.querySelector('.window-body');
  let currentSection = 'general';
  
  function renderSection(section) {
    currentSection = section;
    const contentArea = body.querySelector('#settings-content');
    
    body.querySelectorAll('.settings-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === section);
    });
    
    switch (section) {
      case 'general':
        contentArea.innerHTML = `
          <div class="settings-section-title">Appearance</div>
          <div class="settings-group">
            <div class="settings-group-title">Theme</div>
            <div class="settings-row">
              <div>
                <div class="settings-row-label">Dark Mode</div>
                <div class="settings-row-desc">Switch between dark and light theme</div>
              </div>
              <button class="toggle-switch ${AetherState.theme === 'dark' ? 'active' : ''}" id="settings-theme-toggle"></button>
            </div>
          </div>
          <div class="settings-group">
            <div class="settings-group-title">Accent Color</div>
            <div class="settings-color-swatch">
              ${accentColors.map(c => `<div class="color-swatch ${AetherState.accentColor === c.color ? 'active' : ''}" style="background:${c.color}" data-color="${c.color}" title="${c.name}"></div>`).join('')}
            </div>
          </div>
          <div class="settings-group">
            <div class="settings-group-title">Display</div>
            <div class="settings-row">
              <div>
                <div class="settings-row-label">Brightness</div>
                <div class="settings-row-desc">Adjust screen brightness</div>
              </div>
              <input type="range" class="quick-slider" id="settings-brightness" min="30" max="100" value="${AetherState.brightness}" style="width:150px">
            </div>
          </div>
        `;
        
        // Theme toggle
        contentArea.querySelector('#settings-theme-toggle').addEventListener('click', function() {
          this.classList.toggle('active');
          AetherState.theme = this.classList.contains('active') ? 'dark' : 'light';
          document.documentElement.dataset.theme = AetherState.theme;
          saveState();
        });
        
        // Accent colors
        contentArea.querySelectorAll('.color-swatch').forEach(swatch => {
          swatch.addEventListener('click', () => {
            contentArea.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            AetherState.accentColor = swatch.dataset.color;
            applyAccentColor(swatch.dataset.color);
            saveState();
          });
        });
        
        // Brightness
        contentArea.querySelector('#settings-brightness').addEventListener('input', e => {
          AetherState.brightness = parseInt(e.target.value);
          document.documentElement.style.setProperty('--brightness', AetherState.brightness / 100);
        });
        break;
        
      case 'wallpaper':
        contentArea.innerHTML = `
          <div class="settings-section-title">Wallpaper</div>
          <div class="settings-group">
            <div class="settings-group-title">Choose Wallpaper</div>
            <div class="wallpaper-grid">
              ${wallpapers.map((wp, i) => `<div class="wallpaper-option ${AetherState.wallpaperIndex === i ? 'active' : ''}" style="background:${wp.gradient}" data-idx="${i}" title="${wp.name}"></div>`).join('')}
            </div>
          </div>
        `;
        
        contentArea.querySelectorAll('.wallpaper-option').forEach(opt => {
          opt.addEventListener('click', () => {
            contentArea.querySelectorAll('.wallpaper-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            const idx = parseInt(opt.dataset.idx);
            AetherState.wallpaperIndex = idx;
            document.documentElement.style.setProperty('--wallpaper', wallpapers[idx].gradient);
            document.getElementById('desktop').style.background = wallpapers[idx].gradient;
            saveState();
          });
        });
        break;
        
      case 'account':
        contentArea.innerHTML = `
          <div class="settings-section-title">Account</div>
          <div class="settings-group">
            <div class="settings-group-title">Profile</div>
            <div class="settings-row">
              <div>
                <div class="settings-row-label">Username</div>
                <div class="settings-row-desc">Your display name</div>
              </div>
              <input type="text" class="settings-input" id="settings-username" value="${AetherState.username}" placeholder="Enter username">
            </div>
          </div>
        `;
        
        contentArea.querySelector('#settings-username').addEventListener('change', e => {
          AetherState.username = e.target.value || 'User';
          document.getElementById('login-avatar').textContent = AetherState.username[0].toUpperCase();
          document.getElementById('login-username-display').textContent = AetherState.username;
          showToast('Updated', 'Username changed to ' + AetherState.username);
          saveState();
        });
        break;
        
      case 'about':
        contentArea.innerHTML = `
          <div class="settings-section-title">About AetherOS</div>
          <div class="settings-group">
            <div style="text-align:center; padding: 20px;">
              <div style="font-size:48px; margin-bottom:12px;">◉</div>
              <div style="font-size:24px; font-weight:700; margin-bottom:4px;">AetherOS</div>
              <div style="color:var(--text-muted); margin-bottom:20px;">Version 1.0</div>
              <div style="color:var(--text-secondary); line-height:1.6; max-width:400px; margin:0 auto;">
                A modern web-based operating system built entirely with HTML, CSS, and JavaScript.
                Features a glassmorphism design, virtual file system, and multiple built-in applications.
              </div>
              <div style="margin-top:20px; color:var(--text-muted); font-size:12px;">
                Resolution: ${window.innerWidth}×${window.innerHeight}<br>
                Uptime: ${Math.floor(performance.now() / 1000)}s<br>
                Storage: localStorage
              </div>
            </div>
          </div>
        `;
        break;
    }
  }
  
  // Navigation
  body.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => renderSection(item.dataset.section));
  });
  
  renderSection('general');
}

function applyAccentColor(color) {
  document.documentElement.style.setProperty('--accent', color);
  // Compute lighter and darker variants
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  document.documentElement.style.setProperty('--accent-light', `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`);
  document.documentElement.style.setProperty('--accent-dark', `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.3)`);
}

// ── BROWSER (Stub) ──
function createBrowserWindow() {
  const content = `<div class="browser-app">
    <div class="browser-toolbar">
      <button class="browser-nav-btn">←</button>
      <button class="browser-nav-btn">→</button>
      <button class="browser-nav-btn">↻</button>
      <input type="text" class="browser-url" id="browser-url" value="aether://newtab" placeholder="Enter URL...">
    </div>
    <div class="browser-content" id="browser-page">
      <div class="browser-content-icon"></div>
      <div class="browser-content-title">AetherBrowse</div>
      <div style="color:var(--text-muted); max-width:400px;">
        Welcome to AetherBrowse. This is a browser stub within AetherOS.
        External navigation is not available in this environment.
      </div>
      <div style="margin-top:20px; display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
        <div class="quick-toggle" style="min-width:100px; cursor:pointer;" onclick="this.closest('.browser-app').querySelector('#browser-url').value='aether://bookmarks'"> Bookmarks</div>
        <div class="quick-toggle" style="min-width:100px; cursor:pointer;" onclick="this.closest('.browser-app').querySelector('#browser-url').value='aether://history'"> History</div>
        <div class="quick-toggle" style="min-width:100px; cursor:pointer;" onclick="this.closest('.browser-app').querySelector('#browser-url').value='aether://settings'"> Settings</div>
      </div>
    </div>
  </div>`;
  
  createWindow('browser', 'AetherBrowse', 800, 550, content);
}

// ── SYSTEM MONITOR ──
function createSysMonitorWindow() {
  const content = `<div class="sys-monitor">
    <div class="sysmon-card">
      <div class="sysmon-card-title">CPU Usage</div>
      <div class="sysmon-stat-row">
        <span class="sysmon-stat-label">Usage</span>
        <span class="sysmon-stat-value" id="sysmon-cpu-val">0%</span>
      </div>
      <div class="sysmon-bar"><div class="sysmon-bar-fill cpu" id="sysmon-cpu-bar" style="width:0%"></div></div>
      <div class="sysmon-graph"><canvas id="sysmon-cpu-graph"></canvas></div>
    </div>
    
    <div class="sysmon-card">
      <div class="sysmon-card-title">Memory</div>
      <div class="sysmon-stat-row">
        <span class="sysmon-stat-label">Used / Total</span>
        <span class="sysmon-stat-value" id="sysmon-mem-val">0 / 16 GB</span>
      </div>
      <div class="sysmon-bar"><div class="sysmon-bar-fill memory" id="sysmon-mem-bar" style="width:0%"></div></div>
    </div>
    
    <div class="sysmon-card">
      <div class="sysmon-card-title">Disk</div>
      <div class="sysmon-stat-row">
        <span class="sysmon-stat-label">Used / Total</span>
        <span class="sysmon-stat-value" id="sysmon-disk-val">0 / 512 GB</span>
      </div>
      <div class="sysmon-bar"><div class="sysmon-bar-fill disk" id="sysmon-disk-bar" style="width:0%"></div></div>
    </div>
    
    <div class="sysmon-card">
      <div class="sysmon-card-title">Processes</div>
      <table class="sysmon-processes">
        <thead><tr><th>Name</th><th>CPU</th><th>Memory</th><th>Status</th></tr></thead>
        <tbody id="sysmon-proc-list"></tbody>
      </table>
    </div>
  </div>`;
  
  const win = createWindow('sysmonitor', 'System Monitor', 500, 600, content);
  const body = win.querySelector('.window-body');
  
  // Fake data
  const cpuHistory = new Array(50).fill(0);
  let canvas, ctx;
  
  function initGraph() {
    canvas = body.querySelector('#sysmon-cpu-graph');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
  }
  
  function drawGraph() {
    if (!ctx || !canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);
    
    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i);
      ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }
    
    // Line
    ctx.beginPath();
    ctx.strokeStyle = AetherState.accentColor || '#f0a030';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    
    const step = w / (cpuHistory.length - 1);
    cpuHistory.forEach((val, i) => {
      const x = i * step;
      const y = h - (val / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Fill under line
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = `rgba(${parseInt((AetherState.accentColor || '#f0a030').slice(1, 3), 16)}, ${parseInt((AetherState.accentColor || '#f0a030').slice(3, 5), 16)}, ${parseInt((AetherState.accentColor || '#f0a030').slice(5, 7), 16)}, 0.1)`;
    ctx.fill();
  }
  
  const fakeProcesses = [
    { name: 'aether-core', cpu: () => (Math.random() * 5).toFixed(1), mem: '120 MB', status: 'Running' },
    { name: 'window-mgr', cpu: () => (Math.random() * 3).toFixed(1), mem: '85 MB', status: 'Running' },
    { name: 'file-daemon', cpu: () => (Math.random() * 1).toFixed(1), mem: '45 MB', status: 'Idle' },
    { name: 'render-srv', cpu: () => (Math.random() * 8).toFixed(1), mem: '200 MB', status: 'Running' },
    { name: 'net-daemon', cpu: () => (Math.random() * 2).toFixed(1), mem: '30 MB', status: 'Running' },
    { name: 'audio-srv', cpu: () => (Math.random() * 0.5).toFixed(1), mem: '15 MB', status: 'Idle' },
  ];
  
  function updateSysmon() {
    const cpuVal = Math.floor(Math.random() * 30 + 15 + Math.sin(Date.now() / 3000) * 20);
    const cpuClamped = Math.max(0, Math.min(100, cpuVal));
    cpuHistory.push(cpuClamped);
    cpuHistory.shift();
    
    const memUsed = (Math.random() * 2 + 6).toFixed(1);
    const diskUsed = Math.floor(Math.random() * 20 + 180);
    
    const cpuValEl = body.querySelector('#sysmon-cpu-val');
    const cpuBar = body.querySelector('#sysmon-cpu-bar');
    const memValEl = body.querySelector('#sysmon-mem-val');
    const memBar = body.querySelector('#sysmon-mem-bar');
    const diskValEl = body.querySelector('#sysmon-disk-val');
    const diskBar = body.querySelector('#sysmon-disk-bar');
    
    if (cpuValEl) cpuValEl.textContent = cpuClamped + '%';
    if (cpuBar) cpuBar.style.width = cpuClamped + '%';
    if (memValEl) memValEl.textContent = memUsed + ' / 16 GB';
    if (memBar) memBar.style.width = ((memUsed / 16) * 100) + '%';
    if (diskValEl) diskValEl.textContent = diskUsed + ' / 512 GB';
    if (diskBar) diskBar.style.width = ((diskUsed / 512) * 100) + '%';
    
    // Processes
    const procList = body.querySelector('#sysmon-proc-list');
    if (procList) {
      procList.innerHTML = fakeProcesses.map(p => `
        <tr>
          <td>${p.name}</td>
          <td>${p.cpu()}%</td>
          <td>${p.mem}</td>
          <td>${p.status}</td>
        </tr>
      `).join('');
    }
    
    drawGraph();
  }
  
  setTimeout(initGraph, 100);
  updateSysmon();
  win._sysmonInterval = setInterval(updateSysmon, 1500);
}


// (окно генератора картинок: ai_studio.js)

// ── IMAGE VIEWER ──
function showImageViewer(filePath) {
  const content = fsReadFile(filePath);
  if (!content) return;
  const fileName = filePath.split('/').pop();
  
  const html = `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:var(--bg-primary);padding:16px;">
    <div style="flex:1;display:flex;align-items:center;justify-content:center;width:100%;overflow:hidden;">
      <img src="${content}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--radius-md);box-shadow:var(--shadow-lg);" alt="${fileName}" />
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;">
      <button class="btn" id="iv-wallpaper"> На обои</button>
      <button class="btn" id="iv-download"> Скачать</button>
    </div>
  </div>`;
  
  const win = createWindow('imgview', fileName, 600, 480, html);
  const body = win.querySelector('.window-body');
  
  body.querySelector('#iv-wallpaper')?.addEventListener('click', () => {
    const desktop = document.getElementById('desktop');
    desktop.style.background = `url("${content}") center/cover no-repeat`;
    desktop.style.backgroundSize = 'cover';
    showToast('Обои обновлены', 'Файл установлен фоном рабочего стола!');
  });
  
  body.querySelector('#iv-download')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = content;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// ================================================================
// 13. APPLY SETTINGS
// ================================================================
function applySettings() {
  // Theme
  document.documentElement.dataset.theme = AetherState.theme;
  
  // Accent color
  if (AetherState.accentColor) {
    applyAccentColor(AetherState.accentColor);
  }
  
  // Wallpaper
  const wallpapers = [
    '#1b1c1f',
    '#1a2128',
    '#1b231d',
    '#2a1d1b',
    '#14161c',
    '#251c26',
  ];
  
  if (AetherState.wallpaperIndex < wallpapers.length) {
    document.getElementById('desktop').style.background = wallpapers[AetherState.wallpaperIndex];
  }
  
  // Brightness
  document.documentElement.style.setProperty('--brightness', AetherState.brightness / 100);
  
  // Username
  document.getElementById('login-avatar').textContent = AetherState.username[0].toUpperCase();
  document.getElementById('login-username-display').textContent = AetherState.username;
  
  // Quick settings state
  const qsDark = document.getElementById('qs-darkmode');
  if (qsDark) qsDark.classList.toggle('active', AetherState.theme === 'dark');
  
  // Volume & brightness sliders
  const volSlider = document.getElementById('qs-volume');
  const brSlider = document.getElementById('qs-brightness');
  if (volSlider) volSlider.value = AetherState.volume;
  if (brSlider) brSlider.value = AetherState.brightness;
  
  // Widget notes
  const notesArea = document.getElementById('widget-notes-area');
  if (notesArea) notesArea.value = AetherState.widgetNotes || '';
}

// ================================================================
// 14. HOTKEYS
// ================================================================
document.addEventListener('keydown', e => {
  // Ctrl+Space: Nexus
  if (e.ctrlKey && e.code === 'Space') {
    e.preventDefault();
    toggleNexus();
    return;
  }
  
  // Alt+1-4: Switch workspace
  if (e.altKey && e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    switchWorkspace(parseInt(e.key));
    return;
  }
  
  // Alt+F4: Close active window
  if (e.altKey && e.key === 'F4') {
    e.preventDefault();
    if (activeWindow) closeWindow(activeWindow);
    return;
  }
  
  // Escape: Close nexus, context menu, notification center
  if (e.key === 'Escape') {
    if (nexusOpen) { toggleNexus(); return; }
    if (notifCenterOpen) { toggleNotificationCenter(); return; }
    hideContextMenu();
  }
});

// ================================================================
// 15. WIDGET NOTES PERSISTENCE
// ================================================================
document.getElementById('widget-notes-area')?.addEventListener('input', e => {
  AetherState.widgetNotes = e.target.value;
});

// ================================================================
// INITIALIZATION
// ================================================================
loadState();
loadFS();

// Update login display from saved state
document.getElementById('login-avatar').textContent = AetherState.username[0].toUpperCase();
document.getElementById('login-username-display').textContent = AetherState.username;

// Start boot sequence
startBoot();
