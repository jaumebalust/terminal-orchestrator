const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RENDERER_DIR = path.join(__dirname, '..', 'src', 'renderer');

// Node.js globals that must not be used directly in renderer code
// (they are unavailable when contextIsolation is enabled)
const FORBIDDEN_GLOBALS = [
  { pattern: /\bprocess\./g, name: 'process' },
  { pattern: /\brequire\s*\(/g, name: 'require()' },
  { pattern: /\b__dirname\b/g, name: '__dirname' },
  { pattern: /\b__filename\b/g, name: '__filename' },
  { pattern: /\bmodule\.exports\b/g, name: 'module.exports' },
];

const jsFiles = fs.readdirSync(RENDERER_DIR).filter(f => f.endsWith('.js'));

describe('renderer files must not use Node.js globals', () => {
  for (const file of jsFiles) {
    it(`${file} should not reference forbidden Node.js globals`, () => {
      const content = fs.readFileSync(path.join(RENDERER_DIR, file), 'utf8');
      const lines = content.split('\n');
      const violations = [];

      for (const { pattern, name } of FORBIDDEN_GLOBALS) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip comments
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

          if (pattern.test(line)) {
            violations.push(`  line ${i + 1}: found '${name}' — ${line.trim()}`);
          }
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `${file} uses Node.js globals that are unavailable in the renderer:\n${violations.join('\n')}`
      );
    });
  }
});
