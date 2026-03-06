/* eslint-disable no-unused-vars */

class GridView {
  /**
   * @param {HTMLElement} containerEl - #terminal-container
   * @param {TerminalManager} terminalManager
   * @param {{ getState: () => object, onFocusTerminal: (terminalId: string) => void, onOpenInFileManager: (terminalId: string, fallbackCwd: string|null) => void }} callbacks
   * @param {{ sidebarEl: HTMLElement, resizeHandleEl: HTMLElement }} uiRefs
   */
  constructor(containerEl, terminalManager, callbacks, uiRefs) {
    this.container = containerEl;
    this.terminalManager = terminalManager;
    this.callbacks = callbacks;
    this.sidebarEl = uiRefs.sidebarEl;
    this.resizeHandleEl = uiRefs.resizeHandleEl;

    this.active = false;
    this.focusedTerminalId = null;
    this._savedActiveTerminalId = null;

    this.handleElements = [];
    this.labelElements = [];
    this.cellOrder = [];
    this.gridCols = 0;
    this.gridRows = 0;
    this.colSizes = [];
    this.rowSizes = [];

    // Terminals the user has removed from the grid (persists across toggles)
    this.hiddenTerminals = new Set();

    this._resizeObserver = null;
    this._resizeDebounce = null;
    this._dragFitDebounce = null;
    this._focusListeners = [];
    this._userOrder = [];
    this._dragListeners = [];
    this._dragSourceId = null;
  }

  toggle() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  /** Check if a terminal is hidden from the grid */
  isHidden(terminalId) {
    return this.hiddenTerminals.has(terminalId);
  }

  /** Add a terminal back to the grid (for use from sidebar) */
  showInGrid(terminalId) {
    this.hiddenTerminals.delete(terminalId);
  }

  /** Hide a terminal from the grid (for use from sidebar) */
  hideFromGrid(terminalId) {
    this.hiddenTerminals.add(terminalId);
  }

  /** Remove a terminal from the active grid view */
  removeFromGrid(terminalId) {
    this.hiddenTerminals.add(terminalId);
    if (this.active) {
      // If we removed the focused terminal, shift focus
      if (this.focusedTerminalId === terminalId) {
        const remaining = this.cellOrder.filter(c => c.terminalId !== terminalId);
        this.focusedTerminalId = remaining.length > 0 ? remaining[0].terminalId : null;
      }
      this.refresh();
    }
  }

  activate() {
    if (this.active) return;

    const state = this.callbacks.getState();
    this._savedActiveTerminalId = this.terminalManager.activeTerminalId;

    // Collect all non-hidden terminals across all workspaces
    this.cellOrder = [];
    for (const ws of state.workspaces) {
      for (const project of ws.projects) {
        for (const terminal of project.terminals) {
          if (this.terminalManager.terminals.has(terminal.id) && !this.hiddenTerminals.has(terminal.id)) {
            this.cellOrder.push({
              terminalId: terminal.id,
              workspaceName: ws.name,
              workspaceColor: ws.color || '#4a6fa5',
              projectName: project.name,
              projectCwd: project.cwd || null,
              terminalName: terminal.name
            });
          }
        }
      }
    }

    // Include phantom (scratch) terminals
    if (this.callbacks.getPhantoms) {
      for (const [, phantom] of this.callbacks.getPhantoms()) {
        if (this.terminalManager.terminals.has(phantom.id) && !this.hiddenTerminals.has(phantom.id)) {
          this.cellOrder.push({
            terminalId: phantom.id,
            workspaceName: phantom.workspaceName,
            workspaceColor: phantom.workspaceColor,
            projectName: 'Scratch',
            projectCwd: phantom.cwd,
            terminalName: phantom.name,
            isPhantom: true
          });
        }
      }
    }

    this._applyUserOrder();

    if (this.cellOrder.length === 0) return;

    // Compute grid dimensions
    const count = this.cellOrder.length;
    this.gridCols = Math.ceil(Math.sqrt(count));
    this.gridRows = Math.ceil(count / this.gridCols);

    // Initialize equal sizes
    this.colSizes = new Array(this.gridCols).fill(1);
    this.rowSizes = new Array(this.gridRows).fill(1);

    // Hide sidebar and resize handle
    this.sidebarEl.style.display = 'none';
    this.resizeHandleEl.style.display = 'none';

    // Add grid-mode class
    this.container.classList.add('grid-mode');

    // Pause TerminalManager's ResizeObserver
    this.terminalManager.pauseResizeObserver();

    // Position each terminal wrapper in the grid
    for (let i = 0; i < this.cellOrder.length; i++) {
      const cell = this.cellOrder[i];
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;

      const col = i % this.gridCols;
      const row = Math.floor(i / this.gridCols);

      const wrapper = entry.wrapper;
      wrapper.style.display = 'flex';
      wrapper.style.position = 'relative';
      wrapper.style.gridColumn = String(col * 2 + 1);
      wrapper.style.gridRow = String(row * 2 + 1);
    }

    // Apply workspace color tint to cell backgrounds
    this._applyTints();

    // Create resize handles and labels
    this._createHandles();
    this._createLabels();
    this._applyGridTemplate();

    // Set up focus listeners and drag-and-drop
    this._setupFocusListeners();
    this._setupDragAndDrop();

    // Start own ResizeObserver
    this._resizeObserver = new ResizeObserver(() => {
      clearTimeout(this._resizeDebounce);
      this._resizeDebounce = setTimeout(() => this._fitAll(), 50);
    });
    this._resizeObserver.observe(this.container);

    // Initial fit
    this.active = true;
    this.focusedTerminalId = this._savedActiveTerminalId;
    this._highlightFocused();

    requestAnimationFrame(() => this._fitAll());
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

    // Disconnect our resize observer
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    // Remove grid-mode class
    this.container.classList.remove('grid-mode');

    // Remove handles and labels
    this._removeHandles();
    this._removeLabels();
    this._removeFocusListeners();
    this._removeDragAndDrop();

    // Reset each wrapper
    for (const [, entry] of this.terminalManager.terminals) {
      entry.wrapper.style.position = '';
      entry.wrapper.style.gridColumn = '';
      entry.wrapper.style.gridRow = '';
      entry.wrapper.style.display = 'none';
      entry.wrapper.style.borderColor = '';
      entry.wrapper.style.boxShadow = '';
      entry.wrapper.style.background = '';
      delete entry.wrapper.dataset.wsColor;
      entry.wrapper.classList.remove('grid-focused');
    }

    // Clear container grid template
    this.container.style.gridTemplateColumns = '';
    this.container.style.gridTemplateRows = '';

    // Show sidebar and resize handle
    this.sidebarEl.style.display = '';
    this.resizeHandleEl.style.display = '';

    // Resume TerminalManager's ResizeObserver
    this.terminalManager.resumeResizeObserver();

    // Restore single terminal view
    const restoreId = this.focusedTerminalId || this._savedActiveTerminalId;
    if (restoreId && this.terminalManager.terminals.has(restoreId)) {
      this.terminalManager.show(restoreId);
    }

    // Notify renderer to update state
    if (restoreId) {
      this.callbacks.onFocusTerminal(restoreId);
    }

    this.cellOrder = [];
    this.handleElements = [];
    this.labelElements = [];
  }

  refresh() {
    if (!this.active) return;

    const state = this.callbacks.getState();

    // Rebuild cell order (respecting hidden set)
    this.cellOrder = [];
    for (const ws of state.workspaces) {
      for (const project of ws.projects) {
        for (const terminal of project.terminals) {
          if (this.terminalManager.terminals.has(terminal.id) && !this.hiddenTerminals.has(terminal.id)) {
            this.cellOrder.push({
              terminalId: terminal.id,
              workspaceName: ws.name,
              workspaceColor: ws.color || '#4a6fa5',
              projectName: project.name,
              projectCwd: project.cwd || null,
              terminalName: terminal.name
            });
          }
        }
      }
    }

    // Include phantom (scratch) terminals
    if (this.callbacks.getPhantoms) {
      for (const [, phantom] of this.callbacks.getPhantoms()) {
        if (this.terminalManager.terminals.has(phantom.id) && !this.hiddenTerminals.has(phantom.id)) {
          this.cellOrder.push({
            terminalId: phantom.id,
            workspaceName: phantom.workspaceName,
            workspaceColor: phantom.workspaceColor,
            projectName: 'Scratch',
            projectCwd: phantom.cwd,
            terminalName: phantom.name,
            isPhantom: true
          });
        }
      }
    }

    this._applyUserOrder();

    if (this.cellOrder.length === 0) {
      this.deactivate();
      return;
    }

    const count = this.cellOrder.length;
    const newCols = Math.ceil(Math.sqrt(count));
    const newRows = Math.ceil(count / newCols);

    // If dimensions changed, rebuild fully
    if (newCols !== this.gridCols || newRows !== this.gridRows) {
      this.gridCols = newCols;
      this.gridRows = newRows;
      this.colSizes = new Array(this.gridCols).fill(1);
      this.rowSizes = new Array(this.gridRows).fill(1);

      this._removeHandles();
      this._removeLabels();
      this._removeFocusListeners();
      this._removeDragAndDrop();
      this._createHandles();
      this._createLabels();
      this._setupFocusListeners();
      this._setupDragAndDrop();
    } else {
      this._removeLabels();
      this._removeFocusListeners();
      this._removeDragAndDrop();
      this._createLabels();
      this._setupFocusListeners();
      this._setupDragAndDrop();
    }

    // Reposition all wrappers — first hide all
    for (const [, entry] of this.terminalManager.terminals) {
      entry.wrapper.style.display = 'none';
      entry.wrapper.style.gridColumn = '';
      entry.wrapper.style.gridRow = '';
    }

    for (let i = 0; i < this.cellOrder.length; i++) {
      const cell = this.cellOrder[i];
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;

      const col = i % this.gridCols;
      const row = Math.floor(i / this.gridCols);
      entry.wrapper.style.display = 'flex';
      entry.wrapper.style.position = 'relative';
      entry.wrapper.style.gridColumn = String(col * 2 + 1);
      entry.wrapper.style.gridRow = String(row * 2 + 1);
    }

    this._applyGridTemplate();
    this._applyTints();

    // Fix focus if the focused terminal was removed
    if (this.focusedTerminalId && !this.cellOrder.find(c => c.terminalId === this.focusedTerminalId)) {
      this.focusedTerminalId = this.cellOrder[0].terminalId;
    }
    this._highlightFocused();

    requestAnimationFrame(() => this._fitAll());
  }

  _luminance(hex) {
    const h = (hex || '#4a6fa5').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  _contrastText(bgHex) {
    return this._luminance(bgHex) > 0.4 ? '#1a1a2e' : '#ffffff';
  }

  _hexToRgb(hex) {
    const h = (hex || '#4a6fa5').replace('#', '');
    return `${parseInt(h.substring(0, 2), 16)}, ${parseInt(h.substring(2, 4), 16)}, ${parseInt(h.substring(4, 6), 16)}`;
  }

  _fitAll() {
    for (const cell of this.cellOrder) {
      this.terminalManager.fitTerminal(cell.terminalId);
    }
  }

  _applyGridTemplate() {
    const colParts = [];
    for (let c = 0; c < this.gridCols; c++) {
      colParts.push(`${this.colSizes[c]}fr`);
      if (c < this.gridCols - 1) colParts.push('4px');
    }

    const rowParts = [];
    for (let r = 0; r < this.gridRows; r++) {
      rowParts.push(`${this.rowSizes[r]}fr`);
      if (r < this.gridRows - 1) rowParts.push('4px');
    }

    this.container.style.gridTemplateColumns = colParts.join(' ');
    this.container.style.gridTemplateRows = rowParts.join(' ');
  }

  _createHandles() {
    for (let c = 0; c < this.gridCols - 1; c++) {
      const handle = document.createElement('div');
      handle.className = 'grid-handle-col';
      handle.style.gridColumn = String(c * 2 + 2);
      handle.style.gridRow = '1 / -1';
      this._attachColDragHandler(handle, c);
      this.container.appendChild(handle);
      this.handleElements.push(handle);
    }

    for (let r = 0; r < this.gridRows - 1; r++) {
      const handle = document.createElement('div');
      handle.className = 'grid-handle-row';
      handle.style.gridRow = String(r * 2 + 2);
      handle.style.gridColumn = '1 / -1';
      this._attachRowDragHandler(handle, r);
      this.container.appendChild(handle);
      this.handleElements.push(handle);
    }
  }

  _removeHandles() {
    for (const el of this.handleElements) {
      el.remove();
    }
    this.handleElements = [];
  }

  _createLabels() {
    for (const cell of this.cellOrder) {
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;

      const wsColor = cell.workspaceColor;
      const textColor = this._contrastText(wsColor);

      const label = document.createElement('div');
      label.className = 'grid-cell-label';
      label.style.background = wsColor;
      label.style.color = textColor;

      const labelText = document.createElement('span');
      labelText.className = 'grid-cell-label-text';
      labelText.textContent = `${cell.workspaceName} > ${cell.projectName} > ${cell.terminalName}`;

      const folderBtn = document.createElement('button');
      folderBtn.className = 'grid-cell-action';
      folderBtn.style.color = textColor;
      folderBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h5l2 2h7v8H1V3z"/></svg>';
      folderBtn.title = 'Open in Finder';
      folderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.callbacks.onOpenInFileManager) {
          this.callbacks.onOpenInFileManager(cell.terminalId, cell.projectCwd);
        }
      });

      const closeBtn = document.createElement('button');
      closeBtn.className = 'grid-cell-close';
      closeBtn.style.color = textColor;
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Remove from grid';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.removeFromGrid(cell.terminalId);
      });

      label.appendChild(labelText);
      label.appendChild(folderBtn);
      label.appendChild(closeBtn);
      entry.wrapper.appendChild(label);
      this.labelElements.push(label);
    }
  }

  _removeLabels() {
    for (const el of this.labelElements) {
      el.remove();
    }
    this.labelElements = [];
  }

  _setupFocusListeners() {
    for (const cell of this.cellOrder) {
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;

      const handler = (e) => {
        if (e.target.closest('.xterm-viewport')) return;
        if (e.target.closest('.grid-cell-close')) return;
        if (e.target.closest('.grid-cell-action')) return;
        this.focusedTerminalId = cell.terminalId;
        this._highlightFocused();
        entry.xterm.focus();
        this.callbacks.onFocusTerminal(cell.terminalId);
      };

      entry.wrapper.addEventListener('mousedown', handler, true);
      this._focusListeners.push({ wrapper: entry.wrapper, handler });
    }
  }

  _removeFocusListeners() {
    for (const { wrapper, handler } of this._focusListeners) {
      wrapper.removeEventListener('mousedown', handler, true);
    }
    this._focusListeners = [];
  }

  _applyTints() {
    for (const cell of this.cellOrder) {
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;
      const rgb = this._hexToRgb(cell.workspaceColor);
      entry.wrapper.style.background = `rgba(${rgb}, 0.08)`;
      entry.wrapper.dataset.wsColor = cell.workspaceColor;
    }
  }

  _highlightFocused() {
    for (const cell of this.cellOrder) {
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;
      const rgb = this._hexToRgb(cell.workspaceColor);
      if (cell.terminalId === this.focusedTerminalId) {
        entry.wrapper.classList.add('grid-focused');
        entry.wrapper.style.borderColor = cell.workspaceColor;
        entry.wrapper.style.boxShadow = `0 0 0 2px ${cell.workspaceColor}, inset 0 0 0 1px rgba(${rgb}, 0.3)`;
        entry.wrapper.style.background = `rgba(${rgb}, 0.15)`;
      } else {
        entry.wrapper.classList.remove('grid-focused');
        entry.wrapper.style.borderColor = '';
        entry.wrapper.style.boxShadow = '';
        entry.wrapper.style.background = `rgba(${rgb}, 0.08)`;
      }
    }
  }

  _attachColDragHandler(handle, colIndex) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const leftSize = this.colSizes[colIndex];
      const rightSize = this.colSizes[colIndex + 1];
      const totalFr = this.colSizes.reduce((a, b) => a + b, 0);
      const containerWidth = this.container.clientWidth;
      const totalHandleWidth = (this.gridCols - 1) * 4;
      const contentWidth = containerWidth - totalHandleWidth;
      const pixelsPerFr = contentWidth / totalFr;

      const savedCursor = document.body.style.cursor;
      const savedSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (ev) => {
        const delta = ev.clientX - startX;
        const deltaFr = delta / pixelsPerFr;
        let newLeft = leftSize + deltaFr;
        let newRight = rightSize - deltaFr;

        if (newLeft < 0.2) { newRight -= (0.2 - newLeft); newLeft = 0.2; }
        if (newRight < 0.2) { newLeft -= (0.2 - newRight); newRight = 0.2; }

        this.colSizes[colIndex] = newLeft;
        this.colSizes[colIndex + 1] = newRight;
        this._applyGridTemplate();

        clearTimeout(this._dragFitDebounce);
        this._dragFitDebounce = setTimeout(() => this._fitAll(), 100);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = savedCursor;
        document.body.style.userSelect = savedSelect;
        this._fitAll();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _attachRowDragHandler(handle, rowIndex) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const topSize = this.rowSizes[rowIndex];
      const bottomSize = this.rowSizes[rowIndex + 1];
      const totalFr = this.rowSizes.reduce((a, b) => a + b, 0);
      const containerHeight = this.container.clientHeight;
      const totalHandleHeight = (this.gridRows - 1) * 4;
      const contentHeight = containerHeight - totalHandleHeight;
      const pixelsPerFr = contentHeight / totalFr;

      const savedCursor = document.body.style.cursor;
      const savedSelect = document.body.style.userSelect;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (ev) => {
        const delta = ev.clientY - startY;
        const deltaFr = delta / pixelsPerFr;
        let newTop = topSize + deltaFr;
        let newBottom = bottomSize - deltaFr;

        if (newTop < 0.2) { newBottom -= (0.2 - newTop); newTop = 0.2; }
        if (newBottom < 0.2) { newTop -= (0.2 - newBottom); newBottom = 0.2; }

        this.rowSizes[rowIndex] = newTop;
        this.rowSizes[rowIndex + 1] = newBottom;
        this._applyGridTemplate();

        clearTimeout(this._dragFitDebounce);
        this._dragFitDebounce = setTimeout(() => this._fitAll(), 100);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = savedCursor;
        document.body.style.userSelect = savedSelect;
        this._fitAll();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _applyUserOrder() {
    if (this._userOrder.length === 0) return;
    const orderMap = new Map();
    this._userOrder.forEach((id, idx) => orderMap.set(id, idx));
    const inOrder = [];
    const notInOrder = [];
    for (const cell of this.cellOrder) {
      if (orderMap.has(cell.terminalId)) {
        inOrder.push(cell);
      } else {
        notInOrder.push(cell);
      }
    }
    inOrder.sort((a, b) => orderMap.get(a.terminalId) - orderMap.get(b.terminalId));
    this.cellOrder = [...inOrder, ...notInOrder];
  }

  _setupDragAndDrop() {
    this._dragListeners = [];
    for (const cell of this.cellOrder) {
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;
      const wrapper = entry.wrapper;
      const label = wrapper.querySelector('.grid-cell-label');
      if (!label) continue;

      label.setAttribute('draggable', 'true');
      const terminalId = cell.terminalId;

      const onDragStart = (e) => {
        if (e.target.closest('.grid-cell-close') || e.target.closest('.grid-cell-action')) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', terminalId);
        this._dragSourceId = terminalId;
        setTimeout(() => wrapper.classList.add('grid-dragging'), 0);
      };

      const onDragEnd = () => {
        wrapper.classList.remove('grid-dragging');
        this._clearDropIndicators();
        this._dragSourceId = null;
      };

      const onDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this._clearDropIndicators();
        if (this._dragSourceId && this._dragSourceId !== terminalId) {
          wrapper.classList.add('grid-drop-target');
        }
      };

      const onDragLeave = () => {
        wrapper.classList.remove('grid-drop-target');
      };

      const onDrop = (e) => {
        e.preventDefault();
        wrapper.classList.remove('grid-drop-target');
        const sourceId = e.dataTransfer.getData('text/plain');
        if (!sourceId || sourceId === terminalId) return;
        const fromIndex = this.cellOrder.findIndex(c => c.terminalId === sourceId);
        const toIndex = this.cellOrder.findIndex(c => c.terminalId === terminalId);
        if (fromIndex === -1 || toIndex === -1) return;
        this._reorderCell(fromIndex, toIndex);
      };

      label.addEventListener('dragstart', onDragStart);
      label.addEventListener('dragend', onDragEnd);
      wrapper.addEventListener('dragover', onDragOver);
      wrapper.addEventListener('dragleave', onDragLeave);
      wrapper.addEventListener('drop', onDrop);

      this._dragListeners.push(
        { el: label, event: 'dragstart', handler: onDragStart },
        { el: label, event: 'dragend', handler: onDragEnd },
        { el: wrapper, event: 'dragover', handler: onDragOver },
        { el: wrapper, event: 'dragleave', handler: onDragLeave },
        { el: wrapper, event: 'drop', handler: onDrop }
      );
    }
  }

  _removeDragAndDrop() {
    for (const { el, event, handler } of this._dragListeners) {
      el.removeEventListener(event, handler);
    }
    this._dragListeners = [];
    this._dragSourceId = null;
  }

  _clearDropIndicators() {
    for (const cell of this.cellOrder) {
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (entry) entry.wrapper.classList.remove('grid-drop-target');
    }
  }

  _reorderCell(fromIndex, toIndex) {
    const [moved] = this.cellOrder.splice(fromIndex, 1);
    this.cellOrder.splice(toIndex, 0, moved);
    this._userOrder = this.cellOrder.map(c => c.terminalId);

    for (let i = 0; i < this.cellOrder.length; i++) {
      const cell = this.cellOrder[i];
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;
      const col = i % this.gridCols;
      const row = Math.floor(i / this.gridCols);
      entry.wrapper.style.gridColumn = String(col * 2 + 1);
      entry.wrapper.style.gridRow = String(row * 2 + 1);
    }

    requestAnimationFrame(() => this._fitAll());
  }
}

window.GridView = GridView;
