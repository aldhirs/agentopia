// Measures how hard the app works while it sits idle on the lobby (no session running).
// Usage: npm run build && npx electron scripts/idle-cpu.cjs [seconds]
const { app, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'vo-idle-')));
process.env.VO_NO_QUIT_CONFIRM = '1';
require(path.join(__dirname, '..', 'out', 'main', 'main.js'));

const seconds = Number(process.argv[2] || 15);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    // Real-world size: maximised on the built-in Retina display.
    win.setBounds(screen.getPrimaryDisplay().workArea);
    await sleep(5000); // let the lobby settle (fonts, 3D scene, shaders)
    const samples = [];
    for (let i = 0; i < seconds; i++) {
      await sleep(1000);
      const m = app.getAppMetrics();
      const sum = (type) => m.filter((x) => x.type === type).reduce((s, x) => s + x.cpu.percentCPUUsage, 0);
      samples.push({ main: sum('Browser'), renderer: sum('Tab'), gpu: sum('GPU') });
    }
    const avg = (k) => Math.round((samples.reduce((s, x) => s + x[k], 0) / samples.length) * 10) / 10;
    const fps = await win.webContents.executeJavaScript(`new Promise((resolve) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(n / 2); };
      requestAnimationFrame(tick);
    })`);
    console.log(JSON.stringify({ seconds, cpuMain: avg('main'), cpuRenderer: avg('renderer'), cpuGpu: avg('gpu'), rafPerSecond: fps }));
    app.quit();
  });
});
