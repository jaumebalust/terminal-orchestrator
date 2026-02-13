/* global Sidebar, TerminalManager, CommandPalette */

(async function () {
  // --- State ---
  let state = await window.api.loadState();
  const commandBuffers = new Map(); // terminalId -> string
  const exitCleanups = new Map();   // terminalId -> cleanup function
  const prefilledTerminals = new Set(); // terminals that have lastCommand pre-filled at prompt
  const terminalReady = new Set();      // terminals that have finished shell init (quiescent)
  const quiescenceTimers = new Map();   // terminalId -> setTimeout id for output quiescence

  // --- DOM ---
  const sidebarEl = document.getElementById('sidebar');
  const terminalContainer = document.getElementById('terminal-container');
  const resizeHandle = document.getElementById('resize-handle');

  // --- Sidebar resize ---
  if (state.sidebarWidth) {
    document.documentElement.style.setProperty('--sidebar-width', state.sidebarWidth + 'px');
  }

  (function initResizeHandle() {
    let dragging = false;

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      resizeHandle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const width = Math.max(120, Math.min(e.clientX, 500));
      document.documentElement.style.setProperty('--sidebar-width', width + 'px');
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const width = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'));
      state.sidebarWidth = width;
      persist();
      terminalManager.fitActive();
    });
  })();

  // --- Managers ---
  const terminalManager = new TerminalManager(terminalContainer);
  const commandPalette = new CommandPalette();

  // --- Theme Editor ---
  const themeEditor = new ThemeEditor(
    (theme) => {
      terminalManager.setTheme(theme.terminal);
      state.theme = themeEditor.getSerializable();
      window.api.saveState(state);
    },
    (shellConfig) => {
      state.defaultShell = shellConfig;
      persist();
    }
  );

  const loadedTheme = themeEditor.loadTheme(state.theme);
  themeEditor.applyTheme(loadedTheme);
  themeEditor.loadShellConfig(state.defaultShell || null);

  document.getElementById('theme-btn').addEventListener('click', () => {
    themeEditor.toggle();
  });

  const sidebar = new Sidebar(sidebarEl, {
    onSelectTerminal,
    onAddProject,
    onAddTerminal,
    onPlayCommand,
    onStopTerminal,
    onRenameProject,
    onRenameTerminal,
    onDeleteProject,
    onDeleteTerminal,
    onMoveTerminal,
    onReorderProject,
    onSwitchWorkspace,
    onCreateWorkspace,
    onRenameWorkspace,
    onDeleteWorkspace,
    onChangeWorkspaceColor,
    onResolvePath,
    onOpenInEditor,
    onOpenInFileManager
  });

  // --- Modal prompt (Electron doesn't support window.prompt) ---
  function showPrompt(message, defaultValue) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'modal-dialog';

      const label = document.createElement('label');
      label.className = 'modal-label';
      label.textContent = message;

      const input = document.createElement('input');
      input.className = 'modal-input';
      input.type = 'text';
      if (defaultValue !== undefined) input.value = defaultValue;

      const buttons = document.createElement('div');
      buttons.className = 'modal-buttons';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'modal-btn modal-btn-cancel';
      cancelBtn.textContent = 'Cancel';

      const okBtn = document.createElement('button');
      okBtn.className = 'modal-btn modal-btn-ok';
      okBtn.textContent = 'OK';

      const finish = (value) => {
        overlay.remove();
        resolve(value);
      };

      cancelBtn.addEventListener('click', () => finish(null));
      okBtn.addEventListener('click', () => finish(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(input.value);
        if (e.key === 'Escape') finish(null);
      });

      buttons.appendChild(cancelBtn);
      buttons.appendChild(okBtn);
      dialog.appendChild(label);
      dialog.appendChild(input);
      dialog.appendChild(buttons);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  // --- Confirm dialog ---
  function showConfirm(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'modal-dialog';

      const label = document.createElement('label');
      label.className = 'modal-label';
      label.textContent = message;

      const buttons = document.createElement('div');
      buttons.className = 'modal-buttons';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'modal-btn modal-btn-cancel';
      cancelBtn.textContent = 'Cancel';

      const okBtn = document.createElement('button');
      okBtn.className = 'modal-btn modal-btn-danger';
      okBtn.textContent = 'Delete';

      const finish = (value) => {
        overlay.remove();
        resolve(value);
      };

      cancelBtn.addEventListener('click', () => finish(false));
      okBtn.addEventListener('click', () => finish(true));
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') finish(false);
        if (e.key === 'Enter') finish(true);
      });

      buttons.appendChild(cancelBtn);
      buttons.appendChild(okBtn);
      dialog.appendChild(label);
      dialog.appendChild(buttons);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      cancelBtn.focus();
    });
  }

  // --- Helpers ---
  function generateId() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16)
    );
  }

  const WORKSPACE_COLORS = ['#4a6fa5', '#6b5b95', '#88b04b', '#d65076', '#f7786b', '#efc050', '#5b5ea6', '#45b8ac'];

  function nextWorkspaceColor() {
    return WORKSPACE_COLORS[state.workspaces.length % WORKSPACE_COLORS.length];
  }

  function getActiveWorkspace() {
    return state.workspaces.find((ws) => ws.id === state.activeWorkspaceId) || null;
  }

  function findProject(projectId) {
    const ws = getActiveWorkspace();
    if (!ws) return null;
    return ws.projects.find((p) => p.id === projectId) || null;
  }

  function findTerminal(projectId, terminalId) {
    const project = findProject(projectId);
    if (!project) return null;
    return project.terminals.find((t) => t.id === terminalId);
  }

  function findTerminalAcrossProjects(terminalId) {
    for (const workspace of state.workspaces) {
      for (const project of workspace.projects) {
        const terminal = project.terminals.find((t) => t.id === terminalId);
        if (terminal) return { workspace, project, terminal };
      }
    }
    return null;
  }

  function syncActiveCwd() {
    if (!state.activeTerminalId) return;
    window.api.getCwd(state.activeTerminalId).then((cwd) => {
      if (cwd) {
        const found = findTerminalAcrossProjects(state.activeTerminalId);
        if (found) found.terminal.cwd = cwd;
      }
    }).catch(() => {});
  }

  function persist(skipRender) {
    window.api.saveState(state);
    if (!skipRender) sidebar.setState(state);
  }

  // --- PTY spawning ---
  async function spawnTerminal(terminalId, cwd) {
    const xterm = terminalManager.create(terminalId);

    const found = findTerminalAcrossProjects(terminalId);

    // Get dimensions after creating
    const dims = terminalManager.getDimensions(terminalId) || { cols: 80, rows: 24 };

    const shellConfig = state.defaultShell || null;
    await window.api.spawnPty({
      terminalId,
      cwd: cwd || undefined,
      cols: dims.cols,
      rows: dims.rows,
      shell: shellConfig ? shellConfig.path : undefined,
      shellArgs: shellConfig ? shellConfig.args : undefined
    });

    // Pre-fill last command at the prompt so user can just press Enter
    if (found && found.terminal.lastCommand) {
      prefilledTerminals.add(terminalId);
      setTimeout(() => {
        window.api.writePty(terminalId, found.terminal.lastCommand);
      }, 300);
    }

    // Command buffer for tracking
    commandBuffers.set(terminalId, '');

    // Listen for BEL character in PTY output (attention detection for non-active terminals)
    // Also track output quiescence: once 1s of silence passes after spawn, mark terminal as ready
    const removeBelListener = window.api.onPtyData(terminalId, (data) => {
      // Reset quiescence timer on every output chunk until terminal is marked ready
      if (!terminalReady.has(terminalId)) {
        clearTimeout(quiescenceTimers.get(terminalId));
        quiescenceTimers.set(terminalId, setTimeout(() => {
          terminalReady.add(terminalId);
          quiescenceTimers.delete(terminalId);
        }, 1000));
      }

      if (data.includes('\x07') && terminalId !== state.activeTerminalId) {
        if (terminalReady.has(terminalId)) {
          const f = findTerminalAcrossProjects(terminalId);
          if (f && !f.terminal.needsAttention) {
            f.terminal.needsAttention = true;
            persist();
          }
        }
      }
    });

    // Listen for exit
    const removeExit = window.api.onPtyExit(terminalId, ({ exitCode, signal }) => {
      const f = findTerminalAcrossProjects(terminalId);
      if (f) {
        if (signal || (exitCode !== null && exitCode !== 0)) {
          f.terminal.status = 'crashed';
        } else {
          f.terminal.status = 'stopped';
        }
        persist();
      }
    });
    exitCleanups.set(terminalId, () => {
      removeExit();
      removeBelListener();
    });

    // Intercept input for command tracking
    const entry = terminalManager.terminals.get(terminalId);
    if (entry) {
      // Add a second onData listener to track commands (first one in terminal-manager sends to PTY)
      const disposeTracker = entry.xterm.onData((data) => {
        trackCommand(terminalId, data);
      });
      entry.cleanup.push(() => disposeTracker.dispose());
    }

    persist();
  }

  function readCommandFromBuffer(terminalId) {
    const entry = terminalManager.terminals.get(terminalId);
    if (!entry) return null;
    const buf = entry.xterm.buffer.active;
    const lineY = buf.cursorY + buf.baseY;
    const line = buf.getLine(lineY);
    if (!line) return null;
    const text = line.translateToString(true);
    if (!text) return null;
    // Strip prompt: match last prompt-ending char ($ % > # ❯ » →), then capture the command
    const match = text.match(/^.*[\$%>#❯»→]\s(.+)$/);
    return match ? match[1].trim() : null;
  }

  function trackCommand(terminalId, data) {
    if (data === '\r') {
      prefilledTerminals.delete(terminalId);

      // Read full command from xterm buffer (captures tab completions, history, etc.)
      let command = readCommandFromBuffer(terminalId);

      // Fallback to keystroke buffer
      if (!command) {
        const typed = commandBuffers.get(terminalId) || '';
        command = typed.trim() || null;
      }

      if (command) {
        const found = findTerminalAcrossProjects(terminalId);
        if (found) {
          found.terminal.lastCommand = command;
          persist(true);
        }
      }
      commandBuffers.set(terminalId, '');
    } else if (data === '\x03') {
      // Ctrl+C: only save from keystroke buffer (xterm cursor may be on output)
      prefilledTerminals.delete(terminalId);
      const typed = (commandBuffers.get(terminalId) || '').trim();
      if (typed) {
        const found = findTerminalAcrossProjects(terminalId);
        if (found) {
          found.terminal.lastCommand = typed;
          persist(true);
        }
      }
      commandBuffers.set(terminalId, '');
    } else if (data === '\x7f') {
      // Backspace
      const buffer = commandBuffers.get(terminalId) || '';
      commandBuffers.set(terminalId, buffer.slice(0, -1));
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      // Printable character
      const buffer = commandBuffers.get(terminalId) || '';
      commandBuffers.set(terminalId, buffer + data);
    } else if (data.length > 1 && !data.startsWith('\x1b')) {
      // Pasted text (not escape sequence)
      const buffer = commandBuffers.get(terminalId) || '';
      commandBuffers.set(terminalId, buffer + data);
    }
  }

  // --- Callbacks ---
  function onSelectTerminal(projectId, terminalId) {
    // Save cwd of terminal we're leaving
    syncActiveCwd();

    state.activeProjectId = projectId;
    state.activeTerminalId = terminalId;
    // Clear attention flag when selecting a terminal
    const found = findTerminalAcrossProjects(terminalId);
    if (found && found.terminal.needsAttention) {
      found.terminal.needsAttention = false;
    }
    terminalManager.show(terminalId);
    persist();
  }

  async function onAddProject() {
    const name = await showPrompt('Project name:');
    if (!name || !name.trim()) return;

    const cwd = await showPrompt('Working directory (leave empty for home):');

    const ws = getActiveWorkspace();
    if (!ws) return;

    const project = {
      id: generateId(),
      name: name.trim(),
      cwd: cwd && cwd.trim() ? cwd.trim() : null,
      terminals: []
    };

    ws.projects.push(project);
    state.activeProjectId = project.id;
    persist();

    // Auto-create first terminal
    await onAddTerminal(project.id);
  }

  async function onAddTerminal(projectId) {
    const project = findProject(projectId);
    if (!project) return;

    const termNum = project.terminals.length + 1;
    const terminal = {
      id: generateId(),
      name: `Terminal ${termNum}`,
      lastCommand: '',
      status: 'stopped'
    };

    // Resolve cwd: try live cwd of last terminal, then its saved cwd, then project cwd
    let cwd = project.cwd;
    if (project.terminals.length > 0) {
      const lastTerm = project.terminals[project.terminals.length - 1];
      try {
        const liveCwd = await window.api.getCwd(lastTerm.id);
        if (liveCwd) {
          cwd = liveCwd;
        } else if (lastTerm.cwd) {
          cwd = lastTerm.cwd;
        }
      } catch {
        if (lastTerm.cwd) cwd = lastTerm.cwd;
      }
    }

    project.terminals.push(terminal);
    state.activeProjectId = projectId;
    state.activeTerminalId = terminal.id;

    await spawnTerminal(terminal.id, cwd);
    terminalManager.show(terminal.id);
    persist();
  }

  function onPlayCommand(terminalId, command) {
    const found = findTerminalAcrossProjects(terminalId);
    if (!found) return;

    // Switch to terminal
    state.activeProjectId = found.project.id;
    state.activeTerminalId = terminalId;
    terminalManager.show(terminalId);

    // If PTY is dead (shell exited), re-spawn first
    if (!terminalManager.terminals.has(terminalId) || found.terminal.status === 'crashed') {
      respawnAndRun(terminalId, found.terminal.cwd || found.project.cwd, command);
    } else if (prefilledTerminals.has(terminalId)) {
      // Command already pre-filled at prompt, just press Enter
      prefilledTerminals.delete(terminalId);
      window.api.writePty(terminalId, '\r');
    } else {
      // Write command to running PTY
      window.api.writePty(terminalId, command + '\r');
    }
    persist();
  }

  function onStopTerminal(terminalId) {
    const found = findTerminalAcrossProjects(terminalId);
    if (!found) return;

    state.activeProjectId = found.project.id;
    state.activeTerminalId = terminalId;
    terminalManager.show(terminalId);

    window.api.killPty(terminalId);
    persist();
  }

  async function respawnAndRun(terminalId, cwd, command) {
    // Destroy old xterm instance
    const oldCleanup = exitCleanups.get(terminalId);
    if (oldCleanup) oldCleanup();
    terminalManager.destroy(terminalId);

    // Spawn fresh
    await spawnTerminal(terminalId, cwd);
    terminalManager.show(terminalId);

    // Wait a moment for shell to initialize, then send command
    setTimeout(() => {
      window.api.writePty(terminalId, command + '\r');
    }, 300);
  }

  function onRenameProject(projectId, newName) {
    const project = findProject(projectId);
    if (project) {
      project.name = newName;
      persist();
    }
  }

  function onRenameTerminal(projectId, terminalId, newName) {
    const terminal = findTerminal(projectId, terminalId);
    if (terminal) {
      terminal.name = newName;
      persist();
    }
  }

  function onDeleteProject(projectId) {
    const project = findProject(projectId);
    if (!project) return;

    // Guard: can't delete project with terminals
    if (project.terminals.length > 0) return;

    const ws = getActiveWorkspace();
    if (!ws) return;

    ws.projects = ws.projects.filter((p) => p.id !== projectId);

    // Reset active if deleted
    if (state.activeProjectId === projectId) {
      state.activeProjectId = ws.projects.length > 0 ? ws.projects[0].id : null;
      state.activeTerminalId = null;
      if (ws.projects.length > 0 && ws.projects[0].terminals.length > 0) {
        state.activeTerminalId = ws.projects[0].terminals[0].id;
        terminalManager.show(state.activeTerminalId);
      }
    }

    persist();
  }

  async function onDeleteTerminal(projectId, terminalId) {
    const project = findProject(projectId);
    if (!project) return;

    const terminal = project.terminals.find((t) => t.id === terminalId);
    if (!terminal) return;

    // Confirmation dialog
    const confirmed = await showConfirm(`Delete terminal "${terminal.name}"?`);
    if (!confirmed) return;

    // Push to deleted stack for undo
    state.deletedTerminalStack.push({
      terminal: { ...terminal },
      projectId,
      workspaceId: state.activeWorkspaceId,
      deletedAt: Date.now()
    });
    // Cap at 10
    if (state.deletedTerminalStack.length > 10) {
      state.deletedTerminalStack = state.deletedTerminalStack.slice(-10);
    }

    window.api.killPty(terminalId);
    terminalManager.destroy(terminalId);
    const cleanup = exitCleanups.get(terminalId);
    if (cleanup) cleanup();

    project.terminals = project.terminals.filter((t) => t.id !== terminalId);

    if (state.activeTerminalId === terminalId) {
      state.activeTerminalId = null;
      // Switch to another terminal in the project
      if (project.terminals.length > 0) {
        state.activeTerminalId = project.terminals[0].id;
        terminalManager.show(state.activeTerminalId);
      } else {
        // Try another project in active workspace
        const ws = getActiveWorkspace();
        if (ws) {
          for (const p of ws.projects) {
            if (p.terminals.length > 0) {
              state.activeProjectId = p.id;
              state.activeTerminalId = p.terminals[0].id;
              terminalManager.show(state.activeTerminalId);
              break;
            }
          }
        }
      }
    }

    persist();
  }

  function onMoveTerminal(terminalId, sourceProjectId, targetProjectId, targetIndex) {
    const sourceProject = findProject(sourceProjectId);
    const targetProject = findProject(targetProjectId);
    if (!sourceProject || !targetProject) return;

    const termIdx = sourceProject.terminals.findIndex((t) => t.id === terminalId);
    if (termIdx === -1) return;

    const [terminal] = sourceProject.terminals.splice(termIdx, 1);

    // Adjust target index if moving within same project and source was before target
    let insertAt = targetIndex;
    if (sourceProjectId === targetProjectId && termIdx < targetIndex) {
      insertAt--;
    }
    insertAt = Math.max(0, Math.min(insertAt, targetProject.terminals.length));

    targetProject.terminals.splice(insertAt, 0, terminal);
    persist();
  }

  function onReorderProject(projectId, targetIndex) {
    const ws = getActiveWorkspace();
    if (!ws) return;

    const srcIdx = ws.projects.findIndex((p) => p.id === projectId);
    if (srcIdx === -1) return;

    const [project] = ws.projects.splice(srcIdx, 1);

    let insertAt = targetIndex;
    if (srcIdx < targetIndex) {
      insertAt--;
    }
    insertAt = Math.max(0, Math.min(insertAt, ws.projects.length));

    ws.projects.splice(insertAt, 0, project);
    persist();
  }

  // --- Workspace CRUD ---
  function onSwitchWorkspace(wsId) {
    if (state.activeWorkspaceId === wsId) return;

    // Save cwd of terminal we're leaving
    syncActiveCwd();

    // Save current position on the workspace we're leaving
    const prevWs = getActiveWorkspace();
    if (prevWs) {
      prevWs.lastActiveProjectId = state.activeProjectId;
      prevWs.lastActiveTerminalId = state.activeTerminalId;
    }

    state.activeWorkspaceId = wsId;
    const ws = getActiveWorkspace();
    if (ws) {
      // Restore last position if it still exists in this workspace
      const restoredProject = ws.lastActiveProjectId
        ? ws.projects.find((p) => p.id === ws.lastActiveProjectId)
        : null;
      const restoredTerminal = restoredProject && ws.lastActiveTerminalId
        ? restoredProject.terminals.find((t) => t.id === ws.lastActiveTerminalId)
        : null;

      if (restoredTerminal) {
        state.activeProjectId = restoredProject.id;
        state.activeTerminalId = restoredTerminal.id;
        terminalManager.show(restoredTerminal.id);
      } else if (ws.projects.length > 0) {
        const firstProject = ws.projects[0];
        state.activeProjectId = firstProject.id;
        if (firstProject.terminals.length > 0) {
          state.activeTerminalId = firstProject.terminals[0].id;
          terminalManager.show(state.activeTerminalId);
        } else {
          state.activeTerminalId = null;
        }
      } else {
        state.activeProjectId = null;
        state.activeTerminalId = null;
      }
    } else {
      state.activeProjectId = null;
      state.activeTerminalId = null;
    }
    persist();
  }

  async function onCreateWorkspace() {
    const name = await showPrompt('Workspace name:');
    if (!name || !name.trim()) return;

    const ws = {
      id: generateId(),
      name: name.trim(),
      color: nextWorkspaceColor(),
      projects: []
    };

    state.workspaces.push(ws);
    onSwitchWorkspace(ws.id);
  }

  async function onRenameWorkspace(wsId) {
    const ws = state.workspaces.find((w) => w.id === wsId);
    if (!ws) return;
    const name = await showPrompt('Rename workspace:', ws.name);
    if (!name || !name.trim()) return;
    ws.name = name.trim();
    persist();
  }

  function onChangeWorkspaceColor(wsId, color) {
    const ws = state.workspaces.find((w) => w.id === wsId);
    if (!ws) return;
    ws.color = color;
    persist();
  }

  async function onResolvePath(terminalId, fallbackCwd) {
    const found = findTerminalAcrossProjects(terminalId);
    try {
      const liveCwd = await window.api.getCwd(terminalId);
      if (liveCwd) {
        if (found) found.terminal.cwd = liveCwd;
        return liveCwd;
      }
    } catch {
      // ignore
    }
    return (found && found.terminal.cwd) || fallbackCwd || null;
  }

  async function onOpenInEditor(terminalId, fallbackCwd) {
    const cwd = await onResolvePath(terminalId, fallbackCwd);
    if (cwd) window.api.openInEditor(cwd);
  }

  async function onOpenInFileManager(terminalId, fallbackCwd) {
    const cwd = await onResolvePath(terminalId, fallbackCwd);
    if (cwd) window.api.openInFileManager(cwd);
  }

  function onDeleteWorkspace(wsId) {
    const ws = state.workspaces.find((w) => w.id === wsId);
    if (!ws) return;
    // Guard: can't delete workspace with projects
    if (ws.projects.length > 0) return;

    state.workspaces = state.workspaces.filter((w) => w.id !== wsId);

    if (state.activeWorkspaceId === wsId) {
      if (state.workspaces.length > 0) {
        onSwitchWorkspace(state.workspaces[0].id);
      } else {
        state.activeWorkspaceId = null;
        state.activeProjectId = null;
        state.activeTerminalId = null;
        persist();
      }
    } else {
      persist();
    }
  }

  // --- Undo delete terminal ---
  async function onUndoDeleteTerminal() {
    if (state.deletedTerminalStack.length === 0) return;

    const entry = state.deletedTerminalStack.pop();
    const { terminal, projectId, workspaceId } = entry;

    // Try to find original workspace and project
    let targetProject = null;
    const targetWs = state.workspaces.find((ws) => ws.id === workspaceId);
    if (targetWs) {
      targetProject = targetWs.projects.find((p) => p.id === projectId);
    }

    // Fallback: first project in active workspace
    if (!targetProject) {
      const activeWs = getActiveWorkspace();
      if (activeWs && activeWs.projects.length > 0) {
        targetProject = activeWs.projects[0];
      }
    }

    // If still no project, create one in active workspace
    if (!targetProject) {
      const activeWs = getActiveWorkspace();
      if (!activeWs) return;
      targetProject = {
        id: generateId(),
        name: 'Default',
        cwd: null,
        terminals: []
      };
      activeWs.projects.push(targetProject);
    }

    // Assign new ID to avoid conflicts
    const newTerminal = { ...terminal, id: generateId(), status: 'stopped' };
    targetProject.terminals.push(newTerminal);

    state.activeProjectId = targetProject.id;
    state.activeTerminalId = newTerminal.id;

    await spawnTerminal(newTerminal.id, newTerminal.cwd || targetProject.cwd);
    terminalManager.show(newTerminal.id);
    persist();
  }

  // --- Quick switch palette ---
  function showQuickSwitchPalette() {
    const terminalStats = new Map();
    for (const ws of state.workspaces) {
      let running = 0, attention = 0;
      for (const p of ws.projects || []) {
        for (const t of p.terminals || []) {
          if (t.status === 'running') running++;
          if (t.needsAttention) attention++;
        }
      }
      terminalStats.set(ws.id, { running, attention });
    }
    commandPalette.show(state.workspaces, state.activeWorkspaceId, terminalStats, (wsId) => {
      onSwitchWorkspace(wsId);
    });
  }

  // --- Init ---
  async function init() {
    // If no workspaces, create a default one with a default project + terminal
    if (state.workspaces.length === 0) {
      const termId = generateId();
      const projId = generateId();
      const wsId = generateId();
      const workspace = {
        id: wsId,
        name: 'Default',
        color: WORKSPACE_COLORS[0],
        projects: [{
          id: projId,
          name: 'Default',
          cwd: null,
          terminals: [{
            id: termId,
            name: 'Terminal 1',
            lastCommand: '',
            status: 'stopped'
          }]
        }]
      };
      state.workspaces.push(workspace);
      state.activeWorkspaceId = wsId;
      state.activeProjectId = projId;
      state.activeTerminalId = termId;
    }

    // Spawn PTYs for all terminals across all workspaces
    for (const workspace of state.workspaces) {
      for (const project of workspace.projects) {
        for (const terminal of project.terminals) {
          await spawnTerminal(terminal.id, terminal.cwd || project.cwd);
        }
      }
    }

    // Clear attention flags on startup (quiescence detection handles BEL suppression)
    for (const workspace of state.workspaces) {
      for (const project of workspace.projects) {
        for (const terminal of project.terminals) {
          terminal.needsAttention = false;
        }
      }
    }

    // Show active terminal
    if (state.activeTerminalId) {
      terminalManager.show(state.activeTerminalId);
    } else if (state.workspaces.length > 0) {
      const ws = getActiveWorkspace();
      if (ws && ws.projects.length > 0 && ws.projects[0].terminals.length > 0) {
        const firstTerminal = ws.projects[0].terminals[0];
        state.activeProjectId = ws.projects[0].id;
        state.activeTerminalId = firstTerminal.id;
        terminalManager.show(firstTerminal.id);
      }
    }

    persist();
  }

  // --- Status polling listener ---
  window.api.onTerminalStatus(({ terminalId, status }) => {
    const found = findTerminalAcrossProjects(terminalId);
    if (found && found.terminal.status !== status) {
      found.terminal.status = status;
      persist();
    }
  });

  // --- Keyboard shortcut listeners ---
  window.api.onSwitchWorkspaceShortcut((index) => {
    if (index >= 0 && index < state.workspaces.length) {
      onSwitchWorkspace(state.workspaces[index].id);
    }
  });

  window.api.onQuickSwitchShortcut(() => {
    showQuickSwitchPalette();
  });

  window.api.onUndoDeleteTerminalShortcut(() => {
    onUndoDeleteTerminal();
  });

  init();
})();
