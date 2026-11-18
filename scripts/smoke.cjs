// UI smoke test: boots the built app, starts a real session through the lobby form,
// and saves screenshots of the session view. Usage:
//   npm run build && npx electron scripts/smoke.cjs <outDir> <projectFolder>
// Uses a little Claude quota (one tiny session).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const outDir = path.resolve(process.argv[2] || 'smoke-out');
const folder = path.resolve(process.argv[3] || path.join(__dirname, '..', 'spike', 'sandbox'));
fs.mkdirSync(outDir, { recursive: true });

require(path.join(__dirname, '..', 'out', 'main', 'main.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const shot = async (name) => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
      console.log('shot', name);
    };
    try {
      await sleep(1500);
      await shot('1-lobby');
      await js(`(() => {
        const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        set('#cwd', ${JSON.stringify(folder)});
        set('#prompt', 'Use ONE Explore subagent to read ./b/note.txt and report it in one sentence. Then reply: done');
        set('#mode', 'auto');
      })()`);
      await sleep(300);
      await js(`document.querySelector('button.primary').click()`);
      await sleep(30000);
      await shot('2-session-terminal');
      await js(`[...document.querySelectorAll('[role=tab]')].find(b => b.textContent.includes('Log terstruktur')).click()`);
      await sleep(800);
      await shot('3-session-log');
      await js(`document.querySelector('[aria-label="Maximize Terminal"]').click()`);
      await sleep(600);
      await shot('4-terminal-max');
      await js(`document.querySelector('[aria-label="Minimize Terminal"]').click()`);
      await sleep(600);
      await shot('5-terminal-min-dock');
      // Restore from the dock (back to normal size), then drag the window by its header with real mouse events.
      await js(`document.querySelector('.dock button').click()`);
      await sleep(400);
      const before = await js(`(() => { const r = document.querySelector('.win').getBoundingClientRect(); const h = document.querySelector('.win-header').getBoundingClientRect(); return { top: r.top, left: r.left, hx: h.left + h.width / 2, hy: h.top + h.height / 2 }; })()`);
      const wc = win.webContents;
      const x0 = Math.round(before.hx), y0 = Math.round(before.hy);
      wc.sendInputEvent({ type: 'mouseDown', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 10; i++) {
        wc.sendInputEvent({ type: 'mouseMove', x: x0 - i * 20, y: y0 - i * 30, button: 'left', modifiers: ['leftButtonDown'] });
        await sleep(30);
      }
      wc.sendInputEvent({ type: 'mouseUp', x: x0 - 200, y: y0 - 300, button: 'left', clickCount: 1 });
      await sleep(400);
      const after = await js(`(() => { const r = document.querySelector('.win').getBoundingClientRect(); return { top: r.top, left: r.left }; })()`);
      console.log('drag', JSON.stringify({ before: { top: before.top, left: before.left }, after }));
      await shot('6-terminal-dragged');
      const report = await js(`({
        rosterItems: document.querySelectorAll('.roster li').length,
        dock: !!document.querySelector('.dock'),
        logLines: document.querySelectorAll('.log .line').length,
      })`);
      console.log('report', JSON.stringify(report));
    } catch (e) {
      console.error('smoke failed', e);
    } finally {
      app.quit();
    }
  });
});
