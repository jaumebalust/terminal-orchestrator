const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('userData'), 'dev'));
}

const ptyManager = require('./pty-manager');
const state = require('./state');

let mainWindow = null;

function createWindow() {
  // Use persisted theme background for instant window color
  const savedState = state.loadState();
  const bgColor = (savedState.theme && savedState.theme.terminal && savedState.theme.terminal.background) || '#1a1a2e';

  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: bgColor,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 12, y: 12 };
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Close confirmation when processes are running
  let isForceClosing = false;

  mainWindow.on('close', (e) => {
    if (isForceClosing) return;
    e.preventDefault();

    ptyManager.getRunningSet((runningIds) => {
      if (runningIds.size === 0) {
        isForceClosing = true;
        mainWindow.close();
        return;
      }

      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Close', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Close Terminal Orchestrator',
        message: `${runningIds.size} terminal${runningIds.size > 1 ? 's have' : ' has'} running processes.`,
        detail: 'Closing will terminate all running processes. Are you sure?'
      }).then(({ response }) => {
        if (response === 0) {
          isForceClosing = true;
          mainWindow.close();
        }
      });
    });
  });

  // Open devtools for debugging (remove in production)
  // mainWindow.webContents.openDevTools();
}

function buildAppMenu() {
  const workspaceSwitchItems = [];
  for (let i = 1; i <= 9; i++) {
    workspaceSwitchItems.push({
      label: `Workspace ${i}`,
      accelerator: `CmdOrCtrl+${i}`,
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('shortcut:switch-workspace', i - 1);
        }
      }
    });
  }

  const template = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'Workspaces',
      submenu: [
        ...workspaceSwitchItems,
        { type: 'separator' },
        {
          label: 'Quick Switch',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('shortcut:quick-switch');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Undo Delete Terminal',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('shortcut:undo-delete-terminal');
            }
          }
        }
      ]
    },
    { role: 'windowMenu' }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- IPC Handlers ---

ipcMain.handle('pty:spawn', (event, { terminalId, cwd, cols, rows }) => {
  const ptyProcess = ptyManager.spawn(terminalId, cwd, cols, rows);

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:data:${terminalId}`, data);
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    ptyManager.remove(terminalId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:exit:${terminalId}`, { exitCode, signal });
    }
  });

  return { pid: ptyProcess.pid };
});

ipcMain.on('pty:write', (event, { terminalId, data }) => {
  ptyManager.write(terminalId, data);
});

ipcMain.on('pty:resize', (event, { terminalId, cols, rows }) => {
  ptyManager.resize(terminalId, cols, rows);
});

ipcMain.on('pty:kill', (event, { terminalId }) => {
  ptyManager.kill(terminalId);
});

ipcMain.handle('pty:getCwd', (event, { terminalId }) => {
  return ptyManager.getCwd(terminalId);
});

ipcMain.handle('state:load', () => {
  return state.loadState();
});

ipcMain.handle('state:save', (event, stateData) => {
  state.saveState(stateData);
});

// --- Status polling (single ps call for all terminals) ---
const lastStatuses = new Map();

function startStatusPolling() {
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    ptyManager.getRunningSet((runningIds) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      for (const id of ptyManager.getAllIds()) {
        const status = runningIds.has(id) ? 'running' : 'stopped';
        if (lastStatuses.get(id) !== status) {
          lastStatuses.set(id, status);
          mainWindow.webContents.send('pty:status', { terminalId: id, status });
        }
      }
    });
  }, 2000);
}

// --- App lifecycle ---

app.on('before-quit', () => {
  // Save terminal cwds before quitting
  const currentState = state.loadState();
  const ids = ptyManager.getAllIds();
  for (const workspace of currentState.workspaces || []) {
    for (const project of workspace.projects || []) {
      for (const terminal of project.terminals || []) {
        if (ids.includes(terminal.id)) {
          const cwd = ptyManager.getCwd(terminal.id);
          if (cwd) terminal.cwd = cwd;
        }
      }
    }
  }
  state.saveState(currentState);
});

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();
  startStatusPolling();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
