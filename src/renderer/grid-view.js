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

    // Focus (master + thumbnails) mode
    this.viewMode = 'overview'; // 'overview' | 'focus'
    this.masterTerminalId = null;
    this.masterFraction = 0.72;
    this.MASTER_MIN = 0.40;
    this.MASTER_MAX = 0.85;
    this._focusRoot = null;
    this._masterArea = null;
    this._strip = null;
    this._divider = null;
    this._showAllBtn = null;
    this._onKeyDown = null;
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
      const remaining = this.cellOrder.filter(c => c.terminalId !== terminalId);
      // If we removed the focused terminal, shift focus
      if (this.focusedTerminalId === terminalId) {
        this.focusedTerminalId = remaining.length > 0 ? remaining[0].terminalId : null;
      }
      // If we removed the master in focus mode, promote another terminal
      if (this.masterTerminalId === terminalId) {
        this.masterTerminalId = remaining.length > 0 ? remaining[0].terminalId : null;
      }
      this.refresh();
    }
  }

  activate() {
    if (this.active) return;

    // Always open in Overview
    this.viewMode = 'overview';
    this.masterTerminalId = null;

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
      this._resizeDebounce = setTimeout(() => {
        if (this.viewMode === 'focus') this._fitFocusVisible();
        else this._fitAll();
      }, 50);
    });
    this._resizeObserver.observe(this.container);

    // Escape deselects (Focus -> Overview) without closing the grid.
    // Capture phase so it runs before xterm consumes the key.
    this._onKeyDown = (e) => {
      if (e.key === 'Escape' && this.viewMode === 'focus') {
        e.preventDefault();
        e.stopPropagation();
        this.enterOverview();
      }
    };
    document.addEventListener('keydown', this._onKeyDown, true);

    // Initial fit
    this.active = true;
    this.focusedTerminalId = this._savedActiveTerminalId;
    this._highlightFocused();

    requestAnimationFrame(() => this._fitAll());
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

    // Tear down Focus layout first so every wrapper is a direct child of the
    // container again before the wrapper-style reset loop below runs.
    if (this.viewMode === 'focus') this._teardownFocusDOM();
    this.viewMode = 'overview';
    this.masterTerminalId = null;
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown, true);
      this._onKeyDown = null;
    }

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

    // Focus mode: keep the master/thumbnail layout in sync with the new cellOrder.
    if (this.viewMode === 'focus') {
      // If the master is gone, promote the first remaining terminal.
      if (!this.cellOrder.find(c => c.terminalId === this.masterTerminalId)) {
        this.masterTerminalId = this.cellOrder[0].terminalId;
        this.focusedTerminalId = this.masterTerminalId;
      }
      this._removeLabels();
      this._removeFocusListeners();
      this._removeDragAndDrop();
      this._createLabels();
      this._setupFocusListeners();
      this._applyFocusLayout();
      this._highlightFocused();
      requestAnimationFrame(() => this._fitFocusVisible());
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
        if (e.target.closest('.grid-cell-close')) return;
        if (e.target.closest('.grid-cell-action')) return;

        const id = cell.terminalId;
        const isMaster = this.viewMode === 'focus' && id === this.masterTerminalId;

        // Clicking the master (in Focus) just types/scrolls — never deselect.
        if (isMaster) return;

        // In Overview, reserve the label bar for drag-to-reorder.
        if (this.viewMode === 'overview' && e.target.closest('.grid-cell-label')) return;

        // Promote this terminal to master. If the click landed in the terminal
        // body, suppress it so it doesn't start a selection / send input.
        if (e.target.closest('.xterm-viewport')) {
          e.preventDefault();
          e.stopPropagation();
        }

        if (this.viewMode === 'focus') {
          this.switchMaster(id);
        } else {
          this.enterFocus(id);
        }
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
    // Drag-to-reorder is an Overview-only affordance.
    if (this.viewMode === 'focus') return;
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

  // ---- Focus (master + thumbnails) mode ----

  /** Overview -> Focus, or no-op set master if already focus. Animates the master grow. */
  enterFocus(terminalId) {
    const fromOverview = this.viewMode !== 'focus';
    this.masterTerminalId = terminalId;
    this.focusedTerminalId = terminalId;
    this.viewMode = 'focus';

    if (fromOverview) {
      // Drop Overview-only chrome (row/col handles, grid template, reorder DnD).
      this._removeHandles();
      this._removeDragAndDrop();
      this.container.style.gridTemplateColumns = '';
      this.container.style.gridTemplateRows = '';
    }

    this._ensureFocusDOM();
    this.container.classList.add('focus-mode');
    this._applyFocusLayout();
    this._highlightFocused();

    const masterEntry = this.terminalManager.terminals.get(terminalId);

    if (fromOverview && this._strip.style.display !== 'none') {
      // Grow the master pane from a smaller start so the transition runs.
      // Disable the transition while we set the start point to avoid a jiggle.
      this._masterArea.style.transition = 'none';
      this._masterArea.style.flexBasis = '40%';
      void this._masterArea.offsetWidth; // force reflow to commit the start
      this._masterArea.style.transition = '';
      requestAnimationFrame(() => this._applyMasterFraction());
    }

    this._afterTransition(this._masterArea, () => {
      this._fitFocusVisible();
      if (masterEntry) masterEntry.xterm.focus();
    });

    this.callbacks.onFocusTerminal(terminalId);
  }

  /** Focus -> Focus: switch which terminal is the master (slot stays the same size). */
  switchMaster(terminalId) {
    if (terminalId === this.masterTerminalId) return;
    this.masterTerminalId = terminalId;
    this.focusedTerminalId = terminalId;
    this._applyFocusLayout();
    this._highlightFocused();
    const masterEntry = this.terminalManager.terminals.get(terminalId);
    requestAnimationFrame(() => {
      this._fitFocusVisible();
      if (masterEntry) masterEntry.xterm.focus();
    });
    this.callbacks.onFocusTerminal(terminalId);
  }

  /** Focus -> Overview: tear down the focus layout and rebuild the uniform grid. */
  enterOverview() {
    if (this.viewMode !== 'focus') return;
    this.viewMode = 'overview';
    this._teardownFocusDOM();

    const count = this.cellOrder.length;
    this.gridCols = Math.ceil(Math.sqrt(count));
    this.gridRows = Math.ceil(count / this.gridCols);
    this.colSizes = new Array(this.gridCols).fill(1);
    this.rowSizes = new Array(this.gridRows).fill(1);

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

    this._removeHandles();
    this._createHandles();
    this._applyGridTemplate();
    this._applyTints();
    this._setupDragAndDrop();
    // Keep the last master highlighted so it's easy to see where you were.
    this.focusedTerminalId = this.masterTerminalId || this.focusedTerminalId;
    this._highlightFocused();
    this.masterTerminalId = null;

    requestAnimationFrame(() => this._fitAll());
  }

  /** Lazily build the Focus DOM (master area, divider, scrollable strip, Show all button). */
  _ensureFocusDOM() {
    if (this._focusRoot) return;

    const root = document.createElement('div');
    root.className = 'grid-focus-root';

    const master = document.createElement('div');
    master.className = 'grid-master-area';

    const divider = document.createElement('div');
    divider.className = 'grid-focus-divider';

    const strip = document.createElement('div');
    strip.className = 'grid-strip';

    root.appendChild(master);
    root.appendChild(divider);
    root.appendChild(strip);

    this._focusRoot = root;
    this._masterArea = master;
    this._divider = divider;
    this._strip = strip;
    this._attachDividerDragHandler();

    const btn = document.createElement('button');
    btn.className = 'grid-show-all-btn';
    btn.title = 'Show all (Esc)';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="1.5" width="5" height="5" rx="1"/><rect x="9.5" y="1.5" width="5" height="5" rx="1"/><rect x="1.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/></svg><span>Show all</span>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.enterOverview();
    });
    this._showAllBtn = btn;

    this.container.appendChild(root);
    this.container.appendChild(btn);
  }

  /** Reparent the master wrapper into the master area and the rest into the strip. */
  _applyFocusLayout() {
    this._ensureFocusDOM();

    // Hide any terminal not in the current cellOrder and pull it out of the
    // focus subtree so stale thumbnails never linger.
    const ids = new Set(this.cellOrder.map(c => c.terminalId));
    for (const [tid, entry] of this.terminalManager.terminals) {
      if (!ids.has(tid)) {
        entry.wrapper.style.display = 'none';
        if (entry.wrapper.parentElement && entry.wrapper.parentElement !== this.container) {
          this.container.appendChild(entry.wrapper);
        }
      }
    }

    // Place master, then thumbnails in cellOrder order.
    for (const cell of this.cellOrder) {
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry) continue;
      const w = entry.wrapper;
      w.style.display = 'flex';
      w.style.position = 'relative';
      w.style.gridColumn = '';
      w.style.gridRow = '';
      const target = cell.terminalId === this.masterTerminalId ? this._masterArea : this._strip;
      if (w.parentElement !== target) target.appendChild(w);
      // Reorder-drag is Overview-only; don't let labels start a drag in Focus.
      const label = w.querySelector('.grid-cell-label');
      if (label) label.setAttribute('draggable', 'false');
    }

    const hasThumbs = this.cellOrder.length > 1;
    this._strip.style.display = hasThumbs ? 'flex' : 'none';
    this._divider.style.display = hasThumbs ? 'block' : 'none';
    if (hasThumbs) this._applyMasterFraction();
    else this._masterArea.style.flexBasis = '100%';
  }

  _applyMasterFraction() {
    if (this._masterArea) {
      this._masterArea.style.flexBasis = (this.masterFraction * 100).toFixed(2) + '%';
    }
  }

  _attachDividerDragHandler() {
    this._divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startFraction = this.masterFraction;
      const rootWidth = this._focusRoot.clientWidth || this.container.clientWidth;

      const savedCursor = document.body.style.cursor;
      const savedSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      this._masterArea.classList.add('dragging');

      const onMove = (ev) => {
        const deltaFrac = (ev.clientX - startX) / rootWidth;
        let f = startFraction + deltaFrac;
        f = Math.max(this.MASTER_MIN, Math.min(this.MASTER_MAX, f));
        this.masterFraction = f;
        this._applyMasterFraction();
        clearTimeout(this._dragFitDebounce);
        this._dragFitDebounce = setTimeout(() => this._fitFocusVisible(), 100);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = savedCursor;
        document.body.style.userSelect = savedSelect;
        this._masterArea.classList.remove('dragging');
        this._fitFocusVisible();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _fitFocusVisible() {
    if (this.masterTerminalId) this.terminalManager.fitTerminal(this.masterTerminalId);
    for (const cell of this.cellOrder) {
      if (cell.terminalId === this.masterTerminalId) continue;
      const entry = this.terminalManager.terminals.get(cell.terminalId);
      if (!entry || entry.wrapper.style.display === 'none') continue;
      this.terminalManager.fitTerminal(cell.terminalId);
    }
  }

  /** Move every wrapper back to being a direct child of the container, remove focus DOM. */
  _teardownFocusDOM() {
    if (this._focusRoot) {
      const moved = [
        ...(this._masterArea ? Array.from(this._masterArea.children) : []),
        ...(this._strip ? Array.from(this._strip.children) : [])
      ];
      for (const w of moved) {
        if (w.classList && w.classList.contains('terminal-wrapper')) {
          this.container.appendChild(w);
        }
      }
      this._focusRoot.remove();
    }
    if (this._showAllBtn) this._showAllBtn.remove();

    // Belt-and-suspenders: guarantee every wrapper is back under the container.
    for (const [, entry] of this.terminalManager.terminals) {
      if (entry.wrapper.parentElement !== this.container) {
        this.container.appendChild(entry.wrapper);
      }
    }

    this.container.classList.remove('focus-mode');
    this._focusRoot = null;
    this._masterArea = null;
    this._strip = null;
    this._divider = null;
    this._showAllBtn = null;
  }

  /** Run cb after el's flex-basis transition settles, with a timeout fallback. */
  _afterTransition(el, cb) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (el) el.removeEventListener('transitionend', onEnd);
      cb();
    };
    const onEnd = (ev) => {
      if (ev.propertyName === 'flex-basis' || ev.propertyName === 'flex') finish();
    };
    if (el) el.addEventListener('transitionend', onEnd);
    setTimeout(finish, 280);
  }
}

window.GridView = GridView;
