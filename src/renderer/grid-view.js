/* eslint-disable no-unused-vars */

class GridView {
  /**
   * @param {HTMLElement} containerEl - #terminal-container
   * @param {TerminalManager} terminalManager
   * @param {{ getState: () => object, onFocusTerminal: (terminalId: string) => void }} callbacks
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
              projectName: project.name,
              terminalName: terminal.name
            });
          }
        }
      }
    }

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

    // Create resize handles and labels
    this._createHandles();
    this._createLabels();
    this._applyGridTemplate();

    // Set up focus listeners
    this._setupFocusListeners();

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

    // Reset each wrapper
    for (const [, entry] of this.terminalManager.terminals) {
      entry.wrapper.style.position = '';
      entry.wrapper.style.gridColumn = '';
      entry.wrapper.style.gridRow = '';
      entry.wrapper.style.display = 'none';
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
              projectName: project.name,
              terminalName: terminal.name
            });
          }
        }
      }
    }

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
      this._createHandles();
      this._createLabels();
      this._setupFocusListeners();
    } else {
      this._removeLabels();
      this._removeFocusListeners();
      this._createLabels();
      this._setupFocusListeners();
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

    // Fix focus if the focused terminal was removed
    if (this.focusedTerminalId && !this.cellOrder.find(c => c.terminalId === this.focusedTerminalId)) {
      this.focusedTerminalId = this.cellOrder[0].terminalId;
    }
    this._highlightFocused();

    requestAnimationFrame(() => this._fitAll());
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

      const label = document.createElement('div');
      label.className = 'grid-cell-label';

      const labelText = document.createElement('span');
      labelText.className = 'grid-cell-label-text';
      labelText.textContent = `${cell.workspaceName} > ${cell.projectName} > ${cell.terminalName}`;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'grid-cell-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Remove from grid';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.removeFromGrid(cell.terminalId);
      });

      label.appendChild(labelText);
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

  _highlightFocused() {
    for (const [id, entry] of this.terminalManager.terminals) {
      if (id === this.focusedTerminalId) {
        entry.wrapper.classList.add('grid-focused');
      } else {
        entry.wrapper.classList.remove('grid-focused');
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
}

window.GridView = GridView;
