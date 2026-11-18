// Tests the packaged app the way a user launches it (via `open`, i.e. Finder's minimal PATH):
// starts a real session through the lobby, waits for a subagent, saves a screenshot.
// Usage: node scripts/test-packaged.mjs [path/to/Virtual Office.app] [outDir]
// Uses a little Claude quota.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.resolve(process.argv[2] ?? path.join(root, 'release', 'mac-arm64', 'Virtual Office.app'));
const outDir = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), 'vo-packaged-test'));
const sandbox = path.join(root, 'spike', 'sandbox');
const port = 9339;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-packaged-data-'));
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execFileSync('open', ['-n', '-a', appPath, '--args', `--remote-debugging-port=${port}`, `--vo-user-data=${userData}`]);

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
}
if (!target) throw new Error('App did not expose a page target');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const cdp = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};

const report = {};
try {
  await sleep(2000);
  report.claude = await evaluate('window.office.claudeInfo()');
  await shot('p1-lobby');
  await evaluate(`(() => {
    const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('#f-dir', ${JSON.stringify(sandbox)});
    set('#f-prompt', 'Use ONE Explore subagent to read ./b/note.txt and report it in one sentence. Then reply: done');
    set('#f-name', 'uji-dmg');
  })()`);
  await sleep(500);
  await evaluate(`document.querySelector('button.primary').click()`);
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const labels = await evaluate(`[...document.querySelectorAll('button.desk')].map(b => b.getAttribute('aria-label'))`);
    report.labels = labels;
    if (labels?.length > 1 && labels.every((l) => /Selesai/.test(l))) break;
  }
  await shot('p2-office');
  report.ok = report.claude?.found && report.claude?.loggedIn && report.labels?.length > 1;
  // Security checks from inside the renderer (what an injected script could reach).
  report.security = await evaluate(`(async () => {
    const out = {};
    out.require = typeof require; out.process = typeof process; out.module = typeof module; out.Buffer = typeof Buffer;
    out.officeApi = Object.keys(window.office).sort().join(',');
    const rejects = async (fn) => { try { await fn(); return false; } catch { return true; } };
    out.rejectsRelativeCwd = await rejects(() => window.office.startSession({ cwd: 'relative/dir' }));
    out.rejectsMissingCwd = await rejects(() => window.office.startSession({ cwd: '/definitely/not/here' }));
    out.rejectsBlockedFlag = await rejects(() => window.office.startSession({ cwd: '/tmp', extraArgs: ['--settings', '{}'] }));
    out.rejectsBadMode = await rejects(() => window.office.startSession({ cwd: '/tmp', permissionMode: 'bypassPermissions' }));
    out.rejectsRelativeClaudePath = await rejects(() => window.office.setSettings({ claudePath: 'claude' }));
    out.rejectsBadId = await rejects(() => window.office.getState('../../x'));
    const before = location.href;
    try { location.href = 'https://example.com/'; } catch {}
    await new Promise((r) => setTimeout(r, 1500));
    out.navigationBlocked = location.href === before;
    const w = window.open('https://example.com/');
    out.windowOpenBlocked = w === null;
    out.csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null;
    return out;
  })()`);
  // Stop sessions from the app (as the quit dialog would), then quit and make sure nothing is left running.
  await evaluate(`window.office.listSessions().then(l => Promise.all(l.filter(s => s.status === 'running').map(s => window.office.stopSession(s.id))))`);
} finally {
  ws.close();
  spawnSync('osascript', ['-e', 'tell application "Virtual Office" to quit']);
  const appRunning = () => spawnSync('pgrep', ['-f', `${appPath}/Contents/MacOS/Virtual Office`]).stdout.toString().trim() !== '';
  for (let i = 0; i < 30 && appRunning(); i++) await sleep(500);
  const left = spawnSync('pgrep', ['-f', '127.0.0.1:[0-9]*/hook/']).stdout.toString().trim();
  report.orphanProcesses = left ? left.split('\n').length : 0;
  report.appStillRunning = appRunning();
  fs.rmSync(userData, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...report, claude: report.claude && { found: report.claude.found, version: report.claude.version, loggedIn: report.claude.loggedIn, path: report.claude.path } }, null, 2));
console.log('screenshots in', outDir);
const sec = report.security || {};
const secOk = sec.require === 'undefined' && sec.process === 'undefined' && sec.module === 'undefined'
  && sec.rejectsRelativeCwd && sec.rejectsMissingCwd && sec.rejectsBlockedFlag && sec.rejectsBadMode
  && sec.rejectsRelativeClaudePath && sec.rejectsBadId && sec.navigationBlocked && sec.windowOpenBlocked;
console.log(JSON.stringify({ security: sec }, null, 2));
process.exit(report.ok && secOk && report.orphanProcesses === 0 && !report.appStillRunning ? 0 : 1);
