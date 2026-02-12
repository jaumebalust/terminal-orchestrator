class Sidebar {
  constructor(containerEl, callbacks) {
    this.container = containerEl;
    this.callbacks = callbacks;
    this.state = { workspaces: [], activeWorkspaceId: null, activeProjectId: null, activeTerminalId: null };
  }

  setState(state) {
    this.state = state;
    this.render();
  }

  _getActiveWorkspace() {
    return this.state.workspaces.find((ws) => ws.id === this.state.activeWorkspaceId) || null;
  }

  // Returns relative luminance (0 = black, 1 = white)
  _luminance(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  _contrastText(bgHex) {
    return this._luminance(bgHex || '#4a6fa5') > 0.4 ? '#1a1a2e' : '#ffffff';
  }

  render() {
    const prevList = this.container.querySelector('.sidebar-list');
    const scrollTop = prevList ? prevList.scrollTop : 0;

    this.container.innerHTML = '';

    const activeWs = this._getActiveWorkspace();
    const wsColor = (activeWs && activeWs.color) || '#4a6fa5';
    const textColor = this._contrastText(wsColor);

    // Workspace switcher row
    const wsSwitcher = document.createElement('div');
    wsSwitcher.className = 'workspace-switcher';
    wsSwitcher.style.background = wsColor;

    const wsName = document.createElement('span');
    wsName.className = 'workspace-name';
    wsName.textContent = activeWs ? activeWs.name : 'No Workspace';
    wsName.style.color = textColor;

    const wsChevron = document.createElement('span');
    wsChevron.className = 'workspace-chevron';
    wsChevron.textContent = '\u25BE'; // ▾
    wsChevron.style.color = textColor;
    wsChevron.style.opacity = '0.7';

    wsSwitcher.appendChild(wsName);
    wsSwitcher.appendChild(wsChevron);
    wsSwitcher.addEventListener('click', (e) => this._showWorkspaceDropdown(e));
    this.container.appendChild(wsSwitcher);

    // Header — subtle tinted background
    const header = document.createElement('div');
    header.className = 'sidebar-header';

    const title = document.createElement('span');
    title.className = 'sidebar-title';
    title.textContent = 'PROJECTS';

    const addProjectBtn = document.createElement('button');
    addProjectBtn.className = 'sidebar-btn add-project-btn';
    addProjectBtn.textContent = '+';
    addProjectBtn.title = 'New Project';
    addProjectBtn.addEventListener('click', () => this.callbacks.onAddProject());

    header.appendChild(title);
    header.appendChild(addProjectBtn);
    this.container.appendChild(header);

    // Projects list (from active workspace)
    const list = document.createElement('div');
    list.className = 'sidebar-list';

    if (activeWs) {
      for (const project of activeWs.projects) {
        const projectEl = this._renderProject(project);
        list.appendChild(projectEl);
      }
    }

    this.container.appendChild(list);
    list.scrollTop = scrollTop;
  }

  _showWorkspaceDropdown(clickEvent) {
    this._removeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = clickEvent.clientX + 'px';
    menu.style.top = clickEvent.clientY + 'px';

    // List all workspaces with color dot and checkmark on active
    for (const ws of this.state.workspaces) {
      const item = document.createElement('div');
      item.className = 'context-menu-item ws-dropdown-item';
      if (ws.id === this.state.activeWorkspaceId) {
        item.classList.add('active');
      }

      const dot = document.createElement('span');
      dot.className = 'ws-color-dot';
      dot.style.background = ws.color || '#4a6fa5';
      item.appendChild(dot);

      const label = document.createElement('span');
      label.textContent = ws.name;
      item.appendChild(label);

      item.addEventListener('click', () => {
        this._removeContextMenu();
        this.callbacks.onSwitchWorkspace(ws.id);
      });
      menu.appendChild(item);
    }

    // Separator
    const sep1 = document.createElement('div');
    sep1.className = 'context-menu-separator';
    menu.appendChild(sep1);

    // New Workspace
    const newItem = document.createElement('div');
    newItem.className = 'context-menu-item';
    newItem.textContent = 'New Workspace...';
    newItem.addEventListener('click', () => {
      this._removeContextMenu();
      this.callbacks.onCreateWorkspace();
    });
    menu.appendChild(newItem);

    // Rename
    const activeWs = this._getActiveWorkspace();
    if (activeWs) {
      const renameItem = document.createElement('div');
      renameItem.className = 'context-menu-item';
      renameItem.textContent = 'Rename...';
      renameItem.addEventListener('click', () => {
        this._removeContextMenu();
        this.callbacks.onRenameWorkspace(activeWs.id);
      });
      menu.appendChild(renameItem);

      // Change Color
      const colorItem = document.createElement('div');
      colorItem.className = 'context-menu-item';
      colorItem.textContent = 'Change Color...';
      colorItem.addEventListener('click', () => {
        this._removeContextMenu();
        this._showColorPicker(activeWs.id, clickEvent);
      });
      menu.appendChild(colorItem);

      // Delete (disabled if has projects)
      const deleteItem = document.createElement('div');
      deleteItem.className = 'context-menu-item danger';
      if (activeWs.projects.length > 0) {
        deleteItem.classList.add('disabled');
      }
      deleteItem.textContent = 'Delete Workspace';
      deleteItem.addEventListener('click', () => {
        this._removeContextMenu();
        this.callbacks.onDeleteWorkspace(activeWs.id);
      });
      menu.appendChild(deleteItem);
    }

    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', () => this._removeContextMenu(), { once: true });
    }, 0);
  }

  _showColorPicker(wsId, posEvent) {
    this._removeColorPicker();

    const COLORS = [
      '#4a6fa5', '#5b5ea6', '#6b5b95', '#8b5cf6',
      '#d65076', '#f7786b', '#ef4444', '#e74694',
      '#efc050', '#f59e0b', '#88b04b', '#22c55e',
      '#45b8ac', '#06b6d4', '#3b82f6', '#6366f1',
    ];

    const picker = document.createElement('div');
    picker.className = 'ws-color-picker';
    picker.style.left = posEvent.clientX + 'px';
    picker.style.top = posEvent.clientY + 'px';

    const grid = document.createElement('div');
    grid.className = 'ws-color-grid';

    for (const color of COLORS) {
      const swatch = document.createElement('button');
      swatch.className = 'ws-color-swatch';
      swatch.style.background = color;

      const ws = this.state.workspaces.find((w) => w.id === wsId);
      if (ws && ws.color === color) {
        swatch.classList.add('active');
      }

      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeColorPicker();
        this.callbacks.onChangeWorkspaceColor(wsId, color);
      });
      grid.appendChild(swatch);
    }

    picker.appendChild(grid);
    document.body.appendChild(picker);

    setTimeout(() => {
      document.addEventListener('click', () => this._removeColorPicker(), { once: true });
    }, 0);
  }

  _removeColorPicker() {
    const existing = document.querySelector('.ws-color-picker');
    if (existing) existing.remove();
  }

  _renderProject(project) {
    const el = document.createElement('div');
    el.className = 'project-group';
    el.dataset.projectId = project.id;

    // Project header
    const projectHeader = document.createElement('div');
    projectHeader.className = 'project-header';
    projectHeader.draggable = true;

    projectHeader.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-project-id', project.id);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => el.classList.add('dragging'));
    });

    projectHeader.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      this._clearDragIndicators();
    });

    // Drop zone: project header accepts both project and terminal drags
    projectHeader.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this._clearDragIndicators();
      const rect = projectHeader.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.dataTransfer.types.includes('application/x-project-id')) {
        if (e.clientY < midY) {
          projectHeader.classList.add('drag-over-top');
        } else {
          projectHeader.classList.add('drag-over-bottom');
        }
      } else if (e.dataTransfer.types.includes('application/x-terminal-id')) {
        projectHeader.classList.add('drag-over-bottom');
      }
    });

    projectHeader.addEventListener('dragleave', (e) => {
      if (!projectHeader.contains(e.relatedTarget)) {
        projectHeader.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    projectHeader.addEventListener('drop', (e) => {
      e.preventDefault();
      this._clearDragIndicators();
      const droppedProjectId = e.dataTransfer.getData('application/x-project-id');
      const droppedTerminalId = e.dataTransfer.getData('application/x-terminal-id');

      const activeWs = this._getActiveWorkspace();
      if (!activeWs) return;

      if (droppedProjectId) {
        const rect = projectHeader.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const projIdx = activeWs.projects.findIndex((p) => p.id === project.id);
        const targetIndex = e.clientY < midY ? projIdx : projIdx + 1;
        this.callbacks.onReorderProject(droppedProjectId, targetIndex);
      } else if (droppedTerminalId) {
        const sourceProjectId = e.dataTransfer.getData('application/x-source-project-id');
        // Drop as last terminal in this project
        this.callbacks.onMoveTerminal(droppedTerminalId, sourceProjectId, project.id, project.terminals.length);
      }
    });

    const projectName = document.createElement('span');
    projectName.className = 'project-name';
    projectName.textContent = project.name;
    projectName.title = project.cwd || '';
    projectName.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this._startRenameProject(projectName, project);
    });

    // Context menu for project
    projectHeader.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._showProjectContextMenu(e, project, projectHeader);
    });

    const addTermBtn = document.createElement('button');
    addTermBtn.className = 'sidebar-btn add-terminal-btn';
    addTermBtn.textContent = '+';
    addTermBtn.title = 'New Terminal';
    addTermBtn.addEventListener('click', () => this.callbacks.onAddTerminal(project.id));

    projectHeader.appendChild(projectName);
    projectHeader.appendChild(addTermBtn);
    el.appendChild(projectHeader);

    // Terminals
    for (const terminal of project.terminals) {
      const termEl = this._renderTerminal(terminal, project);
      el.appendChild(termEl);
    }

    return el;
  }

  _renderTerminal(terminal, project) {
    const el = document.createElement('div');
    el.className = 'terminal-item';
    el.dataset.terminalId = terminal.id;
    el.dataset.projectId = project.id;
    el.draggable = true;
    if (terminal.id === this.state.activeTerminalId) {
      el.classList.add('active');
    }

    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-terminal-id', terminal.id);
      e.dataTransfer.setData('application/x-source-project-id', project.id);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => el.classList.add('dragging'));
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      this._clearDragIndicators();
    });

    el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-terminal-id')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this._clearDragIndicators();
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        el.classList.add('drag-over-top');
      } else {
        el.classList.add('drag-over-bottom');
      }
    });

    el.addEventListener('dragleave', (e) => {
      if (!el.contains(e.relatedTarget)) {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      this._clearDragIndicators();
      const droppedTerminalId = e.dataTransfer.getData('application/x-terminal-id');
      if (!droppedTerminalId) return;
      const sourceProjectId = e.dataTransfer.getData('application/x-source-project-id');
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const termIdx = project.terminals.findIndex((t) => t.id === terminal.id);
      const targetIndex = e.clientY < midY ? termIdx : termIdx + 1;
      this.callbacks.onMoveTerminal(droppedTerminalId, sourceProjectId, project.id, targetIndex);
    });

    // Action button — spans full height on the left
    const actionBtn = document.createElement('button');
    if (terminal.status === 'running') {
      actionBtn.className = 'action-btn action-stop';
      actionBtn.innerHTML = '&#9632;'; // ■
      actionBtn.title = 'Stop';
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onStopTerminal(terminal.id);
      });
    } else {
      actionBtn.className = 'action-btn action-play';
      actionBtn.innerHTML = '&#9654;'; // ▶
      actionBtn.title = terminal.lastCommand ? `Run: ${terminal.lastCommand}` : 'No command to run';
      actionBtn.disabled = !terminal.lastCommand;
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (terminal.lastCommand) {
          this.callbacks.onPlayCommand(terminal.id, terminal.lastCommand);
        }
      });
    }

    // Info section (right side)
    const info = document.createElement('div');
    info.className = 'terminal-info';

    // Top row: status dot + name + pencil
    const topRow = document.createElement('div');
    topRow.className = 'terminal-top-row';

    const statusDot = document.createElement('span');
    statusDot.className = terminal.needsAttention
      ? 'status-dot status-attention'
      : `status-dot status-${terminal.status || 'stopped'}`;

    const nameEl = document.createElement('span');
    nameEl.className = 'terminal-name';
    nameEl.textContent = terminal.name;

    const pencilBtn = document.createElement('button');
    pencilBtn.className = 'pencil-btn';
    pencilBtn.innerHTML = '&#9998;'; // ✎
    pencilBtn.title = 'Rename';
    pencilBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._startRenameTerminal(nameEl, terminal, project);
    });

    const editorBtn = document.createElement('button');
    editorBtn.className = 'terminal-action-icon';
    editorBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 3 1 6 4 9"/><polyline points="12 3 15 6 12 9"/><line x1="10" y1="2" x2="6" y2="10"/></svg>';
    editorBtn.title = 'Open in VS Code';
    editorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onOpenInEditor) {
        this.callbacks.onOpenInEditor(terminal.id, project.cwd);
      }
    });

    const fileManagerBtn = document.createElement('button');
    fileManagerBtn.className = 'terminal-action-icon';
    fileManagerBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h5l2 2h7v8H1V3z"/></svg>';
    fileManagerBtn.title = 'Open in File Manager';
    fileManagerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onOpenInFileManager) {
        this.callbacks.onOpenInFileManager(terminal.id, project.cwd);
      }
    });

    topRow.appendChild(statusDot);
    topRow.appendChild(nameEl);
    topRow.appendChild(editorBtn);
    topRow.appendChild(fileManagerBtn);
    topRow.appendChild(pencilBtn);

    // Last command text
    const cmdEl = document.createElement('div');
    cmdEl.className = 'terminal-last-cmd';
    cmdEl.textContent = terminal.lastCommand || '';

    info.appendChild(topRow);
    info.appendChild(cmdEl);

    el.appendChild(actionBtn);
    el.appendChild(info);

    info.addEventListener('click', () => {
      this.callbacks.onSelectTerminal(project.id, terminal.id);
    });

    // Path tooltip on hover
    let hoverTimer = null;
    el.addEventListener('mouseenter', (e) => {
      hoverTimer = setTimeout(async () => {
        if (this.callbacks.onResolvePath) {
          const cwd = await this.callbacks.onResolvePath(terminal.id, project.cwd);
          if (cwd) this._showPathTooltip(el, cwd);
        }
      }, 800);
    });
    el.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      this._hidePathTooltip();
    });

    // Context menu for terminal
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._showTerminalContextMenu(e, terminal, project);
    });

    return el;
  }

  _startRenameProject(el, project) {
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.value = project.name;
    el.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
      const newName = input.value.trim();
      if (newName && newName !== project.name) {
        this.callbacks.onRenameProject(project.id, newName);
      } else {
        this.render();
      }
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { input.value = project.name; input.blur(); }
    });
  }

  _startRenameTerminal(el, terminal, project) {
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.value = terminal.name;
    el.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
      const newName = input.value.trim();
      if (newName && newName !== terminal.name) {
        this.callbacks.onRenameTerminal(project.id, terminal.id, newName);
      } else {
        this.render();
      }
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { input.value = terminal.name; input.blur(); }
    });
  }

  _showProjectContextMenu(e, project, projectHeader) {
    this._removeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const renameItem = document.createElement('div');
    renameItem.className = 'context-menu-item';
    renameItem.textContent = 'Rename';
    renameItem.addEventListener('click', () => {
      this._removeContextMenu();
      const nameEl = projectHeader.querySelector('.project-name');
      if (nameEl) this._startRenameProject(nameEl, project);
    });

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item danger';
    if (project.terminals.length > 0) {
      deleteItem.classList.add('disabled');
    }
    deleteItem.textContent = 'Delete Project';
    deleteItem.addEventListener('click', () => {
      this._removeContextMenu();
      this.callbacks.onDeleteProject(project.id);
    });

    menu.appendChild(renameItem);
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', () => this._removeContextMenu(), { once: true });
    }, 0);
  }

  _showTerminalContextMenu(e, terminal, project) {
    this._removeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item danger';
    deleteItem.textContent = 'Delete Terminal';
    deleteItem.addEventListener('click', () => {
      this._removeContextMenu();
      this.callbacks.onDeleteTerminal(project.id, terminal.id);
    });

    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', () => this._removeContextMenu(), { once: true });
    }, 0);
  }

  _showPathTooltip(anchorEl, path) {
    this._hidePathTooltip();
    if (!anchorEl.isConnected) return;

    const tip = document.createElement('div');
    tip.className = 'path-tooltip';
    tip.textContent = path;

    document.body.appendChild(tip);

    const rect = anchorEl.getBoundingClientRect();
    tip.style.top = (rect.top + rect.height / 2 - tip.offsetHeight / 2) + 'px';
    tip.style.left = (rect.right + 8) + 'px';

    // Clamp to viewport
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.right > window.innerWidth - 8) {
      tip.style.left = (rect.left - tipRect.width - 8) + 'px';
    }
    if (tipRect.bottom > window.innerHeight - 8) {
      tip.style.top = (window.innerHeight - 8 - tipRect.height) + 'px';
    }
  }

  _hidePathTooltip() {
    const existing = document.querySelector('.path-tooltip');
    if (existing) existing.remove();
  }

  _clearDragIndicators() {
    this.container.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  }

  _removeContextMenu() {
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();
  }
}

window.Sidebar = Sidebar;
