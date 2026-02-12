const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // PTY
  spawnPty: (opts) => ipcRenderer.invoke('pty:spawn', opts),
  writePty: (terminalId, data) => ipcRenderer.send('pty:write', { terminalId, data }),
  resizePty: (terminalId, cols, rows) => ipcRenderer.send('pty:resize', { terminalId, cols, rows }),
  killPty: (terminalId) => ipcRenderer.send('pty:kill', { terminalId }),
  getCwd: (terminalId) => ipcRenderer.invoke('pty:getCwd', { terminalId }),

  onPtyData: (terminalId, callback) => {
    const channel = `pty:data:${terminalId}`;
    const listener = (event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  onPtyExit: (terminalId, callback) => {
    const channel = `pty:exit:${terminalId}`;
    const listener = (event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  onTerminalStatus: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('pty:status', listener);
    return () => ipcRenderer.removeListener('pty:status', listener);
  },

  // Keyboard shortcuts from app menu
  onSwitchWorkspaceShortcut: (callback) => {
    const listener = (event, index) => callback(index);
    ipcRenderer.on('shortcut:switch-workspace', listener);
    return () => ipcRenderer.removeListener('shortcut:switch-workspace', listener);
  },

  onQuickSwitchShortcut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('shortcut:quick-switch', listener);
    return () => ipcRenderer.removeListener('shortcut:quick-switch', listener);
  },

  onUndoDeleteTerminalShortcut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('shortcut:undo-delete-terminal', listener);
    return () => ipcRenderer.removeListener('shortcut:undo-delete-terminal', listener);
  },

  // Shell actions
  openInEditor: (folderPath) => ipcRenderer.invoke('shell:openInEditor', { folderPath }),
  openInFileManager: (folderPath) => ipcRenderer.invoke('shell:openInFileManager', { folderPath }),

  // State
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state)
});
