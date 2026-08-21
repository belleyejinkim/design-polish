'use strict';
// Finds a TypeScript compiler to parse JSX with. We never install anything:
// the target project almost always has `typescript` (every Next/Vite TS template
// does), so we borrow it. The ladder below goes from "most faithful to the
// project" to "last resort"; the chosen source is recorded in inventory.meta so
// the report can say how the code was read.
const path = require('path');
const fs = require('fs');

function tryRequire(candidate) {
  try {
    const ts = require(candidate);
    if (ts && typeof ts.createSourceFile === 'function') {
      let version = ts.version;
      let from = candidate;
      try { from = require.resolve(candidate); } catch (_) { /* keep candidate */ }
      return { ts, version, from };
    }
  } catch (_) { /* fall through */ }
  return null;
}

function load(root) {
  const attempts = [];
  // 1. The project's own typescript, walking up for monorepos / hoisted installs.
  let dir = path.resolve(root);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'node_modules', 'typescript');
    if (fs.existsSync(candidate)) {
      const hit = tryRequire(candidate);
      if (hit) return { ...hit, source: i === 0 ? 'project' : 'ancestor' };
      attempts.push(candidate);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 2. Node's resolution from the project root (handles pnpm/yarn layouts).
  try {
    const resolved = require.resolve('typescript', { paths: [path.resolve(root)] });
    const hit = tryRequire(resolved);
    if (hit) return { ...hit, source: 'resolve' };
  } catch (_) { /* continue */ }
  // 3. Explicit override (CI, tests, unusual setups).
  if (process.env.DESIGN_POLISH_TS) {
    const hit = tryRequire(process.env.DESIGN_POLISH_TS);
    if (hit) return { ...hit, source: 'env' };
  }
  // 4. Global install.
  try {
    const { execSync } = require('child_process');
    const globalRoot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const hit = tryRequire(path.join(globalRoot, 'typescript'));
    if (hit) return { ...hit, source: 'global' };
  } catch (_) { /* continue */ }
  // 5. Our own devDependency (only present in a development checkout / tests).
  const hit = tryRequire('typescript');
  if (hit) return { ...hit, source: 'bundled-dev' };
  return null;
}

module.exports = { load };
