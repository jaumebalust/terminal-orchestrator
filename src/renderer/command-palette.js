class CommandPalette {
  constructor() {
    this._overlay = null;
    this._selectedIndex = 0;
    this._filtered = [];
    this._onSelect = null;
    this._onKeyDown = this._handleKeyDown.bind(this);
  }

  show(workspaces, activeWorkspaceId, terminalStats, onSelect) {
    if (this._overlay) this.hide();
    this._onSelect = onSelect;
    this._allWorkspaces = workspaces;
    this._activeWorkspaceId = activeWorkspaceId;
    this._terminalStats = terminalStats || new Map();
    this._selectedIndex = 0;

    this._overlay = document.createElement('div');
    this._overlay.className = 'command-palette';

    const dialog = document.createElement('div');
    dialog.className = 'command-palette-dialog';

    this._input = document.createElement('input');
    this._input.className = 'command-palette-input';
    this._input.placeholder = 'Switch workspace...';
    this._input.addEventListener('input', () => this._updateList());

    this._list = document.createElement('div');
    this._list.className = 'command-palette-list';

    dialog.appendChild(this._input);
    dialog.appendChild(this._list);
    this._overlay.appendChild(dialog);

    this._overlay.addEventListener('mousedown', (e) => {
      if (e.target === this._overlay) this.hide();
    });

    document.body.appendChild(this._overlay);
    document.addEventListener('keydown', this._onKeyDown);
    this._input.focus();
    this._updateList();
  }

  hide() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._selectedIndex = Math.min(this._selectedIndex + 1, this._filtered.length - 1);
      this._renderItems();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
      this._renderItems();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this._filtered.length > 0) {
        const ws = this._filtered[this._selectedIndex];
        this.hide();
        if (this._onSelect) this._onSelect(ws.id);
      }
    }
  }

  _updateList() {
    const query = this._input.value.toLowerCase().trim();
    this._filtered = this._allWorkspaces.filter((ws) =>
      !query || ws.name.toLowerCase().includes(query)
    );
    this._selectedIndex = this._bestDefaultIndex();
    this._renderItems();
  }

  _bestDefaultIndex() {
    if (this._filtered.length === 0) return 0;
    let bestIdx = 0;
    let bestRunning = -1;
    for (let i = 0; i < this._filtered.length; i++) {
      const ws = this._filtered[i];
      if (ws.id === this._activeWorkspaceId) continue;
      const stats = this._terminalStats.get(ws.id);
      const running = stats ? stats.running : 0;
      if (running > bestRunning) {
        bestRunning = running;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  _renderItems() {
    this._list.innerHTML = '';
    if (this._filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'command-palette-empty';
      empty.textContent = 'No workspaces found';
      this._list.appendChild(empty);
      return;
    }
    this._filtered.forEach((ws, i) => {
      const item = document.createElement('div');
      item.className = 'command-palette-item';
      if (i === this._selectedIndex) item.classList.add('selected');

      const dot = document.createElement('span');
      dot.className = 'ws-color-dot';
      dot.style.background = ws.color || '#4a6fa5';
      item.appendChild(dot);

      const name = document.createElement('span');
      name.textContent = ws.name;
      item.appendChild(name);

      const stats = this._terminalStats.get(ws.id);
      if (stats && (stats.running > 0 || stats.attention > 0)) {
        const statsContainer = document.createElement('span');
        statsContainer.className = 'command-palette-stats';
        if (stats.running > 0) {
          const rBadge = document.createElement('span');
          rBadge.className = 'command-palette-stat running';
          rBadge.textContent = `${stats.running} running`;
          statsContainer.appendChild(rBadge);
        }
        if (stats.attention > 0) {
          const aBadge = document.createElement('span');
          aBadge.className = 'command-palette-stat attention';
          aBadge.textContent = `${stats.attention} attention`;
          statsContainer.appendChild(aBadge);
        }
        item.appendChild(statsContainer);
      }

      if (ws.id === this._activeWorkspaceId) {
        const badge = document.createElement('span');
        badge.className = 'command-palette-badge';
        badge.textContent = 'active';
        item.appendChild(badge);
      }

      item.addEventListener('click', () => {
        this.hide();
        if (this._onSelect) this._onSelect(ws.id);
      });

      this._list.appendChild(item);
    });
  }
}

window.CommandPalette = CommandPalette;
