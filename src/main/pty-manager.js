const pty = require('node-pty');
const os = require('os');
const { execSync, execFile } = require('child_process');

const ptys = new Map();

function spawn(terminalId, cwd, cols, rows, shell, shellArgs) {
  const isWin = process.platform === 'win32';
  const resolvedShell = shell || (isWin
    ? process.env.COMSPEC || 'cmd.exe'
    : process.env.SHELL || '/bin/zsh');
  const resolvedArgs = shellArgs || (isWin ? [] : ['--login']);
  const ptyProcess = pty.spawn(resolvedShell, resolvedArgs, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || os.homedir(),
    env: Object.assign({}, process.env, {
      TERM_PROGRAM: 'Terminal-Orchestrator'
    })
  });
  ptys.set(terminalId, ptyProcess);
  return ptyProcess;
}

function write(terminalId, data) {
  const p = ptys.get(terminalId);
  if (p) {
    p.write(data);
  }
}

function resize(terminalId, cols, rows) {
  const p = ptys.get(terminalId);
  if (p) {
    try {
      p.resize(cols, rows);
    } catch (err) {
      // PTY may already be dead
    }
  }
}

function kill(terminalId) {
  const p = ptys.get(terminalId);
  if (p) {
    try {
      p.kill();
    } catch (err) {
      // Already dead
    }
    ptys.delete(terminalId);
  }
}

function get(terminalId) {
  return ptys.get(terminalId);
}

function remove(terminalId) {
  ptys.delete(terminalId);
}

function getCwd(terminalId) {
  const p = ptys.get(terminalId);
  if (!p) return null;
  if (process.platform === 'win32') return null;
  try {
    const output = execSync(`lsof -a -p ${p.pid} -d cwd -F n`, { encoding: 'utf-8', timeout: 2000 });
    const match = output.match(/^n(.+)$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getAllIds() {
  return Array.from(ptys.keys());
}

// Single ps call to check which shells have running child processes
function getRunningSet(callback) {
  if (ptys.size === 0) return callback(new Set());
  if (process.platform === 'win32') return callback(new Set());
  const shellPids = new Map(); // "pid" -> terminalId
  for (const [terminalId, p] of ptys) {
    shellPids.set(String(p.pid), terminalId);
  }
  execFile('ps', ['-eo', 'ppid='], (err, stdout) => {
    if (err) return callback(new Set());
    const running = new Set();
    const lines = stdout.split('\n');
    for (const line of lines) {
      const ppid = line.trim();
      if (shellPids.has(ppid)) running.add(shellPids.get(ppid));
    }
    callback(running);
  });
}

module.exports = { spawn, write, resize, kill, get, remove, getCwd, getAllIds, getRunningSet };
