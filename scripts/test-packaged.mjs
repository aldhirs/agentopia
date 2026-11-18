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
} finally {
  ws.close();
  spawnSync('osascript', ['-e', 'tell application "Virtual Office" to quit']);
  await sleep(2000);
  fs.rmSync(userData, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...report, claude: report.claude && { found: report.claude.found, version: report.claude.version, loggedIn: report.claude.loggedIn, path: report.claude.path } }, null, 2));
console.log('screenshots in', outDir);
process.exit(report.ok ? 0 : 1);
