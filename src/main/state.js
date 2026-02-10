const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const STATE_FILE = path.join(app.getPath('userData'), 'state.json');

function generateId() {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

function getDefaultState() {
  return {
    workspaces: [],
    activeWorkspaceId: null,
    activeProjectId: null,
    activeTerminalId: null,
    deletedTerminalStack: []
  };
}

function migrateState(state) {
  // Migrate old projects-based state to workspaces
  if (state.projects && !state.workspaces) {
    const wsId = generateId();
    state.workspaces = [{
      id: wsId,
      name: 'Default',
      projects: state.projects
    }];
    state.activeWorkspaceId = wsId;
    delete state.projects;
  }
  // Ensure deletedTerminalStack exists
  if (!state.deletedTerminalStack) {
    state.deletedTerminalStack = [];
  }
  // Ensure each workspace has a color
  const defaultColors = ['#4a6fa5', '#6b5b95', '#88b04b', '#d65076', '#f7786b', '#efc050', '#5b5ea6', '#45b8ac'];
  if (state.workspaces) {
    for (let i = 0; i < state.workspaces.length; i++) {
      if (!state.workspaces[i].color) {
        state.workspaces[i].color = defaultColors[i % defaultColors.length];
      }
    }
  }
  // Ensure activeWorkspaceId exists
  if (!state.activeWorkspaceId && state.workspaces && state.workspaces.length > 0) {
    state.activeWorkspaceId = state.workspaces[0].id;
  }
  return state;
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const state = JSON.parse(raw);
      migrateState(state);
      // Reset all terminal statuses to stopped on fresh load
      for (const workspace of state.workspaces || []) {
        for (const project of workspace.projects || []) {
          for (const terminal of project.terminals || []) {
            terminal.status = 'stopped';
          }
        }
      }
      return state;
    }
  } catch (err) {
    console.error('Failed to load state:', err);
  }
  return getDefaultState();
}

function saveState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

module.exports = { loadState, saveState };
