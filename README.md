# Terminal Orchestrator

A multi-project terminal workspace for macOS, Windows, and Linux. Organize terminals into projects, track commands, and re-run them with one click.

![Electron](https://img.shields.io/badge/Electron-28-blue) ![macOS](https://img.shields.io/badge/macOS-arm64%20%7C%20x64-black) ![Windows](https://img.shields.io/badge/Windows-x64-0078D6) ![Linux](https://img.shields.io/badge/Linux-x64-FCC624) ![License](https://img.shields.io/badge/license-MIT-green)

![Terminal Orchestrator](example.png)

## Features

- **Projects & Terminals** — Group terminals by project, each with its own working directory
- **Command Memory** — Last command is saved per terminal and pre-filled on restart
- **Play Button** — One-click re-run of the last command from the sidebar
- **Status Indicators** — See which terminals exited cleanly (gray) or crashed (red)
- **Full Persistence** — Projects, terminals, working directories, commands, and window layout survive restarts
- **Theme Editor** — 4 built-in themes (2 dark, 2 light) + full custom color control for app and terminal
- **Resizable Sidebar** — Drag to resize, width persists across sessions
- **Cross-platform** — Native experience on macOS (hidden title bar, traffic lights), Windows, and Linux

## Install

### Download

Grab the latest build from [Releases](https://github.com/jaumebalust/terminal-orchestrator/releases):

**macOS**
- **Apple Silicon** (M1/M2/M3/M4) — `Terminal Orchestrator-*-arm64.dmg`
- **Intel** — `Terminal Orchestrator-*-x64.dmg`
- Open the `.dmg` and drag to Applications

**Windows**
- **Installer** — `Terminal Orchestrator Setup *.exe`
- **Portable** — `Terminal Orchestrator-*-win.zip`

**Linux**
- **AppImage** — `Terminal Orchestrator-*.AppImage` (chmod +x and run)
- **Debian/Ubuntu** — `terminal-orchestrator_*_amd64.deb`

#### macOS security warning

The app is not code-signed, so macOS will block it on first launch. To fix this:

1. Open the app — you'll get an "unidentified developer" or "app is damaged" warning
2. Go to **System Settings > Privacy & Security**, scroll down, and click **Open Anyway**
3. If it still won't open, run this in Terminal to remove the quarantine attribute:
   ```bash
   xattr -cr "/Applications/Terminal Orchestrator.app"
   ```

#### Windows security warning

Windows SmartScreen may show an "Unknown publisher" warning on first launch. Click **More info** → **Run anyway**.

#### Linux permissions

AppImage requires execute permissions:

```bash
chmod +x "Terminal Orchestrator-*.AppImage"
```

### Build from source

```bash
git clone https://github.com/jaumebalust/terminal-orchestrator.git
cd terminal-orchestrator
npm install
npm start
```

To create distributable packages:

```bash
# macOS
npm run dist          # builds for your current arch
npm run dist:arm      # Apple Silicon
npm run dist:intel    # Intel
npm run dist:universal # both

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

Output goes to `dist/`.

## Usage

### Projects

- Click **+** in the sidebar header to create a project
- Set a name and optional working directory
- Each project gets its own group of terminals
- Double-click a project name to rename it
- Right-click for delete

### Terminals

- Click **+ terminal** under a project to add one
- Click a terminal in the sidebar to switch to it
- Click the pencil icon to rename
- Right-click for delete

### Commands

- Type a command and press Enter — it's automatically saved as the "last command"
- The last command appears in the sidebar under each terminal name
- On restart, the last command is pre-filled at the shell prompt — just press Enter to re-run
- Click the **play button** in the sidebar to re-run without switching manually

### Themes

- Click the **gear icon** in the title bar to open the theme editor
- Pick a preset: **Midnight**, **Charcoal**, **Cloud**, or **Cream**
- Or customize every color individually — app chrome and terminal ANSI colors
- Changes apply live and persist automatically

## Tech Stack

- [Electron 28](https://www.electronjs.org/) — app shell
- [xterm.js](https://xtermjs.org/) (`@xterm/xterm` v5) — terminal rendering
- [node-pty](https://github.com/nicehash/node-pty) — PTY process management
- CommonJS, no bundler

## Project Structure

```
src/
├── main/
│   ├── main.js              # Electron main process, IPC, window
│   ├── pty-manager.js       # PTY spawn/write/resize/kill
│   └── state.js             # Load/save state to disk
├── preload/
│   └── preload.js           # contextBridge API
└── renderer/
    ├── index.html           # HTML shell
    ├── styles.css           # Layout and theming
    ├── renderer.js          # Orchestrator: state, PTY wiring, commands
    ├── sidebar.js           # Sidebar DOM rendering
    ├── terminal-manager.js  # xterm.js lifecycle
    └── theme-editor.js      # Theme presets and editor panel
```

State is saved to the platform-specific app data directory:
- **macOS** — `~/Library/Application Support/terminal-orchestrator/state.json`
- **Windows** — `%APPDATA%/terminal-orchestrator/state.json`
- **Linux** — `~/.config/terminal-orchestrator/state.json`

## Contributing

Terminal Orchestrator is fully open source. You're free to use, modify, and distribute it. Contributions are welcome — fork the repo, make your changes, and open a pull request.

If you find a bug or have a feature request, [open an issue](https://github.com/jaumebalust/terminal-orchestrator/issues).

## Releases

Download the latest version: [https://github.com/jaumebalust/terminal-orchestrator/releases](https://github.com/jaumebalust/terminal-orchestrator/releases)

## License

MIT — see [LICENSE](LICENSE) for details.
