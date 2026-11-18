// UI smoke test: boots the built app, starts a real session through the lobby form,
// and saves screenshots of the office while subagents work. Usage:
//   npm run build && npx electron scripts/smoke.cjs <outDir> [projectFolder]
// Uses a little Claude quota (one small session with two Explore subagents).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const outDir = path.resolve(process.argv[2] || 'smoke-out');
const folder = path.resolve(process.argv[3] || path.join(__dirname, '..', 'spike', 'sandbox'));
fs.mkdirSync(outDir, { recursive: true });

require(path.join(__dirname, '..', 'out', 'main', 'main.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PERMISSION = process.env.SMOKE_PERMISSION === '1';
const PROMPT = PERMISSION
  ? 'Launch ONE Explore subagent to read ./b/note.txt. After it reports, run the Bash command: touch smoke-permission.txt . Then reply: done'
  : 'In ONE message launch TWO Explore subagents in parallel: A lists the files in ./a, B reads ./b/note.txt. '
  + 'Each replies in one sentence. After both report, reply: done';

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    const wc = win.webContents;
    const js = (code) => wc.executeJavaScript(code);
    const shot = async (name) => {
      const img = await wc.capturePage();
      fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
      console.log('shot', name);
    };
    const drag = async (headerSel, dx, dy) => {
      const h = await js(`(() => { const r = document.querySelector(${JSON.stringify(headerSel)}).getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
      const x0 = Math.round(h.x), y0 = Math.round(h.y);
      wc.sendInputEvent({ type: 'mouseDown', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 10; i++) {
        wc.sendInputEvent({ type: 'mouseMove', x: x0 + (dx * i) / 10, y: y0 + (dy * i) / 10, button: 'left', modifiers: ['leftButtonDown'] });
        await sleep(30);
      }
      wc.sendInputEvent({ type: 'mouseUp', x: x0 + dx, y: y0 + dy, button: 'left', clickCount: 1 });
      await sleep(300);
    };
    try {
      await sleep(1500);
      await shot('01-lobby');
      await js(`(() => {
        const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        set('#cwd', ${JSON.stringify(folder)});
        set('#prompt', ${JSON.stringify(PROMPT)});
        set('#mode', ${JSON.stringify(PERMISSION ? 'default' : 'auto')});
      })()`);
      await sleep(300);
      await js(`document.querySelector('button.primary').click()`);
      if (PERMISSION) {
        // Wait until some character asks for permission, capture it, then answer "1. Yes" in the terminal.
        let found = false;
        for (let i = 0; i < 90 && !found; i++) {
          await sleep(1000);
          found = await js(`[...document.querySelectorAll('button.desk')].some(b => /Minta izin/.test(b.getAttribute('aria-label')))`);
        }
        console.log('permission state seen:', found);
        await shot('08-permission-waiting');
        await js(`[...document.querySelectorAll('button.desk')].find(b => /Minta izin/.test(b.getAttribute('aria-label')))?.click()`);
        await sleep(600);
        await shot('09-permission-detail');
        await js(`window.office.listSessions().then(l => window.office.write(l[0].id, String.fromCharCode(13)))`);
        await sleep(8000);
        await shot('10-permission-answered');
        const labels = await js(`[...document.querySelectorAll('button.desk')].map(b => b.getAttribute('aria-label'))`);
        console.log('report', JSON.stringify({ labels }));
        return;
      }
      for (const t of [4, 7, 10, 16]) {
        await sleep(t === 4 ? 4000 : (t === 7 ? 3000 : (t === 10 ? 3000 : 6000)));
        await shot(`02-office-${String(t).padStart(2, '0')}s`);
      }
      await sleep(10000);
      await shot('03-office-done');

      // Open the detail card of the first subagent, then drag it.
      await js(`[...document.querySelectorAll('button.desk')].find(b => /Explore/.test(b.getAttribute('aria-label'))).click()`);
      await sleep(600);
      await shot('04-detail-subagent');
      await drag('.detail-win .win-header', -300, 120);
      await shot('05-detail-dragged');
      await js(`document.querySelector('[aria-label="Maximize Terminal"]').click()`);
      await sleep(500);
      await shot('06-terminal-max');
      await js(`document.querySelector('[aria-label="Kembalikan ukuran Terminal"]').click()`);
      await js(`document.querySelector('[aria-label="Minimize Terminal"]').click()`);
      await js(`[...document.querySelectorAll('button.desk')].find(b => /^Lead/.test(b.getAttribute('aria-label'))).click()`);
      await sleep(600);
      await shot('07-lead-detail-terminal-min');

      const report = await js(`({
        desks: document.querySelectorAll('button.desk').length,
        labels: [...document.querySelectorAll('button.desk')].map(b => b.getAttribute('aria-label')),
        board: [...document.querySelectorAll('.board li')].map(l => l.textContent),
        dock: [...document.querySelectorAll('.dock button')].map(b => b.textContent.trim()),
      })`);
      console.log('report', JSON.stringify(report));
    } catch (e) {
      console.error('smoke failed', e);
    } finally {
      app.quit();
    }
  });
});
