#!/usr/bin/env node
'use strict';
// design-polish serve: a tiny local server for the report so the browser can hand
// decisions back to the agent and reload when the report is re-rendered.
//
//   design-polish serve start <run-dir> [--port N] [--open]    starts (detached) and prints the URL
//   design-polish serve stop <run-dir>                         stops the server started for that run
//   design-polish serve run <run-dir> [--port N]               runs in the foreground (used by start)
//
// Safety: binds 127.0.0.1 only; every path lives under a random token; POST bodies are JSON
// only, ≤ 2 MB, and must come from the page itself (Origin check); nothing outside the run
// directory is ever read; the process exits after 2 hours without a ping.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const MAX_BODY = 2 * 1024 * 1024;
const IDLE_MS = 2 * 60 * 60 * 1000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.md': 'text/plain; charset=utf-8' };

function stateFile(runDir) { return path.join(path.dirname(path.dirname(path.resolve(runDir))), 'serve.json'); }

function run(runDir, port) {
  runDir = path.resolve(runDir);
  const token = crypto.randomBytes(16).toString('hex');
  let version = 1;
  let lastPing = Date.now();
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const readBody = (req) => new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); }); req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject); });
  const server = http.createServer(async (req, res) => {
    lastPing = Date.now();
    const url = new URL(req.url, 'http://127.0.0.1');
    const prefix = `/r/${token}/`;
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end('not found'); return; }
    const rel = url.pathname.slice(prefix.length) || 'report.html';
    const origin = req.headers.origin;
    const hostOk = !origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
    if (rel === 'api/ping') return json(res, 200, { ok: true });
    if (rel === 'api/version') return json(res, 200, { version });
    if (rel === 'api/state') {
      const decisions = fs.existsSync(path.join(runDir, 'decisions.json')) ? JSON.parse(fs.readFileSync(path.join(runDir, 'decisions.json'), 'utf8')) : fs.existsSync(path.join(runDir, 'decisions.draft.json')) ? JSON.parse(fs.readFileSync(path.join(runDir, 'decisions.draft.json'), 'utf8')) : null;
      return json(res, 200, { version, decisions });
    }
    if (rel === 'api/reload') { if (req.method !== 'POST' || !hostOk) return json(res, 405, { error: 'POST only' }); version++; return json(res, 200, { version }); }
    if (rel === 'api/decisions') {
      if (req.method !== 'POST' || !hostOk) return json(res, 405, { error: 'POST only' });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) { return json(res, 400, { error: 'invalid JSON' }); }
      if (!body || body.schema !== 'design-polish.decisions/1' || !Array.isArray(body.entries)) return json(res, 400, { error: 'not a decisions document' });
      const file = path.join(runDir, body.draft ? 'decisions.draft.json' : 'decisions.json');
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(body, null, 2));
      fs.renameSync(tmp, file);
      return json(res, 200, { ok: true, file: path.basename(file), entries: body.entries.length });
    }
    // static files inside the run dir only
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(runDir, safe);
    if (!file.startsWith(runDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(port || 0, '127.0.0.1', () => {
    const actual = server.address().port;
    const url = `http://127.0.0.1:${actual}/r/${token}/`;
    const info = { port: actual, token, pid: process.pid, runDir, url, startedAt: new Date().toISOString() };
    try { fs.writeFileSync(stateFile(runDir), JSON.stringify(info, null, 2)); } catch (_) { /* read-only dir */ }
    process.stdout.write(url + '\n');
  });
  setInterval(() => { if (Date.now() - lastPing > IDLE_MS) process.exit(0); }, 60 * 1000).unref();
  return server;
}

function start(runDir, port, open) {
  const child = spawn(process.execPath, [__filename, 'run', runDir, ...(port ? ['--port', String(port)] : [])], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); if (out.includes('\n')) { const url = out.trim().split('\n')[0]; process.stdout.write(url + '\n'); if (open) openUrl(url); child.stdout.destroy(); child.unref(); } });
}

function openUrl(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch (_) { /* no opener */ }
}

function stop(runDir) {
  const f = stateFile(runDir);
  if (!fs.existsSync(f)) { console.log('no server recorded'); return; }
  const info = JSON.parse(fs.readFileSync(f, 'utf8'));
  try { process.kill(info.pid); console.log(`stopped pid ${info.pid}`); } catch (_) { console.log('server was not running'); }
  fs.unlinkSync(f);
}

if (require.main === module) {
  const [cmd, runDir, ...rest] = process.argv.slice(2);
  const pi = rest.indexOf('--port');
  const port = pi >= 0 ? Number(rest[pi + 1]) : 0;
  if (cmd === 'run' && runDir) run(runDir, port);
  else if (cmd === 'start' && runDir) start(runDir, port, rest.includes('--open'));
  else if (cmd === 'stop' && runDir) stop(runDir);
  else { console.error('usage: serve.js start|stop|run <run-dir> [--port N] [--open]'); process.exit(2); }
}
module.exports = { run, start, stop, openUrl, stateFile };
