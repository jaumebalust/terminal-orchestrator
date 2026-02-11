/* Theme Editor — presets + custom color picker panel */

const THEME_PRESETS = {
  midnight: {
    name: 'Midnight',
    app: {
      bgPrimary: '#1a1a2e',
      bgSidebar: '#16162a',
      bgHover: '#232345',
      bgActive: '#2a2a50',
      textPrimary: '#e0e0e0',
      textSecondary: '#888888',
      textDim: '#555580',
      borderColor: '#2a2a4a',
      green: '#51cf66',
      red: '#ff6b6b',
      gray: '#666666',
      accent: '#748ffc'
    },
    terminal: {
      background: '#1a1a2e',
      foreground: '#e0e0e0',
      cursor: '#e0e0e0',
      cursorAccent: '#1a1a2e',
      selectionBackground: 'rgba(255,255,255,0.2)',
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
    }
  },
  charcoal: {
    name: 'Charcoal',
    app: {
      bgPrimary: '#1e1e1e',
      bgSidebar: '#181818',
      bgHover: '#2a2a2a',
      bgActive: '#333333',
      textPrimary: '#d4d4d4',
      textSecondary: '#808080',
      textDim: '#585858',
      borderColor: '#333333',
      green: '#6a9955',
      red: '#f44747',
      gray: '#666666',
      accent: '#569cd6'
    },
    terminal: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      cursorAccent: '#1e1e1e',
      selectionBackground: 'rgba(255,255,255,0.15)',
      black: '#1e1e1e',
      red: '#f44747',
      green: '#6a9955',
      yellow: '#dcdcaa',
      blue: '#569cd6',
      magenta: '#c586c0',
      cyan: '#4ec9b0',
      white: '#d4d4d4',
      brightBlack: '#808080',
      brightRed: '#f44747',
      brightGreen: '#6a9955',
      brightYellow: '#dcdcaa',
      brightBlue: '#9cdcfe',
      brightMagenta: '#c586c0',
      brightCyan: '#4ec9b0',
      brightWhite: '#ffffff'
    }
  },
  cloud: {
    name: 'Cloud',
    app: {
      bgPrimary: '#ffffff',
      bgSidebar: '#f5f5f5',
      bgHover: '#e8e8e8',
      bgActive: '#d0d0d0',
      textPrimary: '#1e1e1e',
      textSecondary: '#666666',
      textDim: '#999999',
      borderColor: '#d0d0d0',
      green: '#22863a',
      red: '#cb2431',
      gray: '#999999',
      accent: '#0366d6'
    },
    terminal: {
      background: '#ffffff',
      foreground: '#1e1e1e',
      cursor: '#1e1e1e',
      cursorAccent: '#ffffff',
      selectionBackground: 'rgba(0,0,0,0.1)',
      black: '#1e1e1e',
      red: '#cb2431',
      green: '#22863a',
      yellow: '#b08800',
      blue: '#0366d6',
      magenta: '#6f42c1',
      cyan: '#1b7c83',
      white: '#e1e4e8',
      brightBlack: '#959da5',
      brightRed: '#cb2431',
      brightGreen: '#22863a',
      brightYellow: '#b08800',
      brightBlue: '#0366d6',
      brightMagenta: '#6f42c1',
      brightCyan: '#1b7c83',
      brightWhite: '#ffffff'
    }
  },
  cream: {
    name: 'Cream',
    app: {
      bgPrimary: '#fdf6e3',
      bgSidebar: '#eee8d5',
      bgHover: '#e6dfc8',
      bgActive: '#d6ceb5',
      textPrimary: '#073642',
      textSecondary: '#586e75',
      textDim: '#93a1a1',
      borderColor: '#d6ceb5',
      green: '#859900',
      red: '#dc322f',
      gray: '#93a1a1',
      accent: '#268bd2'
    },
    terminal: {
      background: '#fdf6e3',
      foreground: '#073642',
      cursor: '#073642',
      cursorAccent: '#fdf6e3',
      selectionBackground: 'rgba(0,0,0,0.1)',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#859900',
      brightYellow: '#b58900',
      brightBlue: '#268bd2',
      brightMagenta: '#6c71c4',
      brightCyan: '#2aa198',
      brightWhite: '#fdf6e3'
    }
  }
};

const APP_COLOR_LABELS = {
  bgPrimary: 'Background',
  bgSidebar: 'Sidebar',
  bgHover: 'Hover',
  bgActive: 'Active',
  textPrimary: 'Text',
  textSecondary: 'Text Secondary',
  textDim: 'Text Dim',
  borderColor: 'Border',
  green: 'Green',
  red: 'Red',
  gray: 'Gray',
  accent: 'Accent'
};

const TERMINAL_COLOR_LABELS = {
  background: 'Background',
  foreground: 'Foreground',
  cursor: 'Cursor',
  black: 'Black',
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
  magenta: 'Magenta',
  cyan: 'Cyan',
  white: 'White',
  brightBlack: 'Bright Black',
  brightRed: 'Bright Red',
  brightGreen: 'Bright Green',
  brightYellow: 'Bright Yellow',
  brightBlue: 'Bright Blue',
  brightMagenta: 'Bright Magenta',
  brightCyan: 'Bright Cyan',
  brightWhite: 'Bright White'
};

// CSS var name mapping
const APP_CSS_VARS = {
  bgPrimary: '--bg-primary',
  bgSidebar: '--bg-sidebar',
  bgHover: '--bg-hover',
  bgActive: '--bg-active',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textDim: '--text-dim',
  borderColor: '--border-color',
  green: '--green',
  red: '--red',
  gray: '--gray',
  accent: '--accent'
};

const SHELL_PRESETS = (() => {
  const platform = navigator.userAgent.includes('Win') ? 'win32'
    : navigator.userAgent.includes('Mac') ? 'darwin' : 'linux';
  if (platform === 'win32') {
    return [
      { label: 'Command Prompt', path: 'cmd.exe', args: [], isDefault: true },
      { label: 'Windows PowerShell', path: 'powershell.exe', args: ['-NoLogo'] },
      { label: 'PowerShell 7', path: 'pwsh.exe', args: ['-NoLogo'] }
    ];
  }
  return [
    { label: 'System Default', path: null, args: ['--login'], isDefault: true },
    { label: 'zsh', path: '/bin/zsh', args: ['--login'] },
    { label: 'bash', path: '/bin/bash', args: ['--login'] }
  ];
})();

class ThemeEditor {
  constructor(onThemeChange, onShellChange) {
    this.onThemeChange = onThemeChange; // callback({app, terminal, presetName})
    this.onShellChange = onShellChange; // callback({path, args} | null)
    this.panel = null;
    this.currentTheme = null;
    this.currentShell = null; // null = system default
  }

  loadShellConfig(shellConfig) {
    this.currentShell = shellConfig;
  }

  // Load theme from persisted state, returns the theme object
  loadTheme(savedTheme) {
    if (savedTheme && savedTheme.app && savedTheme.terminal) {
      this.currentTheme = {
        presetName: savedTheme.presetName || 'custom',
        app: { ...savedTheme.app },
        terminal: { ...savedTheme.terminal }
      };
    } else {
      this.currentTheme = {
        presetName: 'midnight',
        app: { ...THEME_PRESETS.midnight.app },
        terminal: { ...THEME_PRESETS.midnight.terminal }
      };
    }
    return this.currentTheme;
  }

  applyTheme(theme) {
    // Sync app background with terminal background
    theme.app.bgPrimary = theme.terminal.background;

    // Apply CSS variables
    const root = document.documentElement;
    for (const [key, cssVar] of Object.entries(APP_CSS_VARS)) {
      if (theme.app[key]) {
        root.style.setProperty(cssVar, theme.app[key]);
      }
    }
    this.currentTheme = theme;
    this.onThemeChange(theme);
  }

  toggle() {
    if (this.panel) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this.panel) return;

    this.panel = document.createElement('div');
    this.panel.className = 'theme-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'theme-panel-header';

    const title = document.createElement('span');
    title.textContent = 'Settings';
    title.className = 'theme-panel-title';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'theme-panel-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    this.panel.appendChild(header);

    const scrollArea = document.createElement('div');
    scrollArea.className = 'theme-panel-scroll';

    // Shell
    const shellSection = this._createSection('Shell');
    const shellGrid = document.createElement('div');
    shellGrid.className = 'preset-grid';

    const isCurrentDefault = !this.currentShell;

    for (const preset of SHELL_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      const isActive = preset.isDefault
        ? isCurrentDefault
        : (this.currentShell && this.currentShell.path === preset.path);
      if (isActive) btn.classList.add('preset-active');
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        if (preset.isDefault) {
          this.currentShell = null;
          this.onShellChange(null);
        } else {
          this.currentShell = { path: preset.path, args: preset.args };
          this.onShellChange(this.currentShell);
        }
        this.close();
        this.open();
      });
      shellGrid.appendChild(btn);
    }

    // Custom shell button
    const customBtn = document.createElement('button');
    customBtn.className = 'preset-btn';
    const isCustom = this.currentShell && !SHELL_PRESETS.some(p => p.path === this.currentShell.path);
    if (isCustom) customBtn.classList.add('preset-active');
    customBtn.textContent = 'Custom';
    customBtn.addEventListener('click', () => {
      customInput.style.display = customInput.style.display === 'none' ? 'flex' : 'none';
      if (customInput.style.display === 'flex') customPathInput.focus();
    });
    shellGrid.appendChild(customBtn);
    shellSection.appendChild(shellGrid);

    // Custom shell path input
    const customInput = document.createElement('div');
    customInput.className = 'shell-custom-input';
    customInput.style.display = isCustom ? 'flex' : 'none';

    const customPathInput = document.createElement('input');
    customPathInput.type = 'text';
    customPathInput.className = 'theme-color-text';
    customPathInput.placeholder = '/path/to/shell';
    customPathInput.style.flex = '1';
    if (isCustom) customPathInput.value = this.currentShell.path;

    const customArgsInput = document.createElement('input');
    customArgsInput.type = 'text';
    customArgsInput.className = 'theme-color-text';
    customArgsInput.placeholder = 'args (space-separated)';
    customArgsInput.style.flex = '1';
    if (isCustom) customArgsInput.value = (this.currentShell.args || []).join(' ');

    const applyBtn = document.createElement('button');
    applyBtn.className = 'preset-btn preset-active';
    applyBtn.textContent = 'Apply';
    applyBtn.style.marginTop = '0';
    applyBtn.addEventListener('click', () => {
      const shellPath = customPathInput.value.trim();
      if (!shellPath) return;
      const args = customArgsInput.value.trim()
        ? customArgsInput.value.trim().split(/\s+/)
        : [];
      this.currentShell = { path: shellPath, args };
      this.onShellChange(this.currentShell);
      this.close();
      this.open();
    });

    customInput.appendChild(customPathInput);
    customInput.appendChild(customArgsInput);
    customInput.appendChild(applyBtn);
    shellSection.appendChild(customInput);

    const shellNote = document.createElement('div');
    shellNote.className = 'theme-section-note';
    shellNote.textContent = 'Applies to newly opened terminals only.';
    shellSection.appendChild(shellNote);

    scrollArea.appendChild(shellSection);

    // Theme Presets
    const presetsSection = this._createSection('Theme Presets');
    const presetGrid = document.createElement('div');
    presetGrid.className = 'preset-grid';

    for (const [key, preset] of Object.entries(THEME_PRESETS)) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      if (this.currentTheme.presetName === key) {
        btn.classList.add('preset-active');
      }
      btn.style.background = `linear-gradient(135deg, ${preset.app.bgSidebar} 50%, ${preset.app.bgPrimary} 50%)`;
      btn.style.color = preset.app.textPrimary;
      btn.style.borderColor = preset.app.borderColor;
      btn.textContent = preset.name;
      btn.addEventListener('click', () => {
        const theme = {
          presetName: key,
          app: { ...preset.app },
          terminal: { ...preset.terminal }
        };
        this.applyTheme(theme);
        this.close();
        this.open(); // re-render with updated values
      });
      presetGrid.appendChild(btn);
    }

    presetsSection.appendChild(presetGrid);
    scrollArea.appendChild(presetsSection);

    // App colors
    const appSection = this._createSection('App Colors');
    for (const [key, label] of Object.entries(APP_COLOR_LABELS)) {
      const row = this._createColorRow(label, this.currentTheme.app[key], (color) => {
        this.currentTheme.app[key] = color;
        this.currentTheme.presetName = 'custom';
        this.applyTheme(this.currentTheme);
      });
      appSection.appendChild(row);
    }
    scrollArea.appendChild(appSection);

    // Terminal colors
    const termSection = this._createSection('Terminal Colors');
    for (const [key, label] of Object.entries(TERMINAL_COLOR_LABELS)) {
      const row = this._createColorRow(label, this.currentTheme.terminal[key], (color) => {
        this.currentTheme.terminal[key] = color;
        this.currentTheme.presetName = 'custom';
        this.applyTheme(this.currentTheme);
      });
      termSection.appendChild(row);
    }
    scrollArea.appendChild(termSection);

    this.panel.appendChild(scrollArea);
    document.body.appendChild(this.panel);
  }

  close() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }

  _createSection(title) {
    const section = document.createElement('div');
    section.className = 'theme-section';

    const heading = document.createElement('div');
    heading.className = 'theme-section-title';
    heading.textContent = title;
    section.appendChild(heading);

    return section;
  }

  _createColorRow(label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'theme-color-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'theme-color-label';
    labelEl.textContent = label;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'theme-color-input-wrap';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'theme-color-picker';
    colorInput.value = this._toHex6(value);

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'theme-color-text';
    textInput.value = value;

    colorInput.addEventListener('input', () => {
      textInput.value = colorInput.value;
      onChange(colorInput.value);
    });

    textInput.addEventListener('change', () => {
      const v = textInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        colorInput.value = v;
        onChange(v);
      }
    });

    inputWrapper.appendChild(colorInput);
    inputWrapper.appendChild(textInput);
    row.appendChild(labelEl);
    row.appendChild(inputWrapper);
    return row;
  }

  _toHex6(color) {
    if (!color || color.startsWith('rgba')) return '#000000';
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    return color;
  }

  getSerializable() {
    return {
      presetName: this.currentTheme.presetName,
      app: { ...this.currentTheme.app },
      terminal: { ...this.currentTheme.terminal }
    };
  }
}

window.ThemeEditor = ThemeEditor;
window.THEME_PRESETS = THEME_PRESETS;
