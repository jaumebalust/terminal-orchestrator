/* global Terminal, FitAddon, WebglAddon, WebLinksAddon */

class TerminalManager {
  constructor(containerEl) {
    this.container = containerEl;
    this.terminals = new Map(); // terminalId -> { xterm, fitAddon, cleanup[] }
    this.activeTerminalId = null;
    this._resizeObserver = new ResizeObserver(() => this.fitActive());
    this._resizeObserver.observe(this.container);
  }

  create(terminalId) {
    const defaultTheme = {
      background: '#1a1a2e',
      foreground: '#e0e0e0',
      cursor: '#e0e0e0',
      cursorAccent: '#1a1a2e',
      selectionBackground: 'rgba(255, 255, 255, 0.2)',
      black: '#1a1a2e',
      red: '#ff6b6b',
      green: '#51cf66',
      yellow: '#ffd43b',
      blue: '#748ffc',
      magenta: '#da77f2',
      cyan: '#66d9e8',
      white: '#e0e0e0',
      brightBlack: '#555580',
      brightRed: '#ff8787',
      brightGreen: '#69db7c',
      brightYellow: '#ffe066',
      brightBlue: '#91a7ff',
      brightMagenta: '#e599f7',
      brightCyan: '#99e9f2',
      brightWhite: '#ffffff'
    };

    const xterm = new Terminal({
      fontSize: 14,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      theme: this._terminalTheme || defaultTheme,
      allowProposedApi: true,
      cursorBlink: true,
      scrollback: 10000
    });

    const fitAddon = new FitAddon.FitAddon();
    xterm.loadAddon(fitAddon);

    try {
      const webLinksAddon = new WebLinksAddon.WebLinksAddon();
      xterm.loadAddon(webLinksAddon);
    } catch (err) {
      console.warn('WebLinksAddon failed to load:', err);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper';
    wrapper.style.display = 'none';
    this.container.appendChild(wrapper);
    xterm.open(wrapper);

    // Try WebGL addon
    try {
      const webglAddon = new WebglAddon.WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      xterm.loadAddon(webglAddon);
    } catch (err) {
      console.warn('WebGL addon failed, using canvas renderer:', err);
    }

    const cleanup = [];

    // Wire input to PTY
    const disposeOnData = xterm.onData((data) => {
      window.api.writePty(terminalId, data);
    });
    cleanup.push(() => disposeOnData.dispose());

    // Wire PTY output to terminal
    const removePtyData = window.api.onPtyData(terminalId, (data) => {
      xterm.write(data);
    });
    cleanup.push(removePtyData);

    this.terminals.set(terminalId, { xterm, fitAddon, wrapper, cleanup });
    return xterm;
  }

  show(terminalId) {
    // Hide current
    if (this.activeTerminalId) {
      const current = this.terminals.get(this.activeTerminalId);
      if (current) {
        current.wrapper.style.display = 'none';
      }
    }

    // Show target
    const target = this.terminals.get(terminalId);
    if (target) {
      target.wrapper.style.display = 'flex';
      this.activeTerminalId = terminalId;
      // Defer fit so DOM has updated
      requestAnimationFrame(() => {
        try {
          target.fitAddon.fit();
          const dims = target.fitAddon.proposeDimensions();
          if (dims) {
            window.api.resizePty(terminalId, dims.cols, dims.rows);
          }
        } catch (err) {
          // ignore
        }
        target.xterm.scrollToBottom();
        target.xterm.focus();
      });
    }
  }

  fitActive() {
    if (!this.activeTerminalId) return;
    const entry = this.terminals.get(this.activeTerminalId);
    if (entry && entry.wrapper.style.display !== 'none') {
      try {
        entry.fitAddon.fit();
        const dims = entry.fitAddon.proposeDimensions();
        if (dims) {
          window.api.resizePty(this.activeTerminalId, dims.cols, dims.rows);
        }
      } catch (err) {
        // ignore
      }
    }
  }

  getDimensions(terminalId) {
    const entry = this.terminals.get(terminalId);
    if (entry) {
      try {
        return entry.fitAddon.proposeDimensions();
      } catch {
        return null;
      }
    }
    return null;
  }

  writeToTerminal(terminalId, text) {
    const entry = this.terminals.get(terminalId);
    if (entry) {
      entry.xterm.write(text);
    }
  }

  setTheme(terminalTheme) {
    this._terminalTheme = terminalTheme;
    for (const [, entry] of this.terminals) {
      entry.xterm.options.theme = terminalTheme;
    }
  }

  destroy(terminalId) {
    const entry = this.terminals.get(terminalId);
    if (entry) {
      entry.cleanup.forEach((fn) => fn());
      entry.xterm.dispose();
      entry.wrapper.remove();
      this.terminals.delete(terminalId);
      if (this.activeTerminalId === terminalId) {
        this.activeTerminalId = null;
      }
    }
  }
}

window.TerminalManager = TerminalManager;
