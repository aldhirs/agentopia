// Runs the 3D office performance harness inside Electron for several team sizes.
// Usage: npm run build && npx electron scripts/perf.cjs [outJson]
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const out = process.argv[2] || path.join(__dirname, '..', 'docs', 'perf-results.json');
const SIZES = [0, 8, 16, 32, 64];
const SECONDS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Windows are opened and closed one after another; don't let Electron quit in between.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const results = [];
  for (const reduce of [false, true]) {
    for (const n of reduce ? [32] : SIZES) {
      // Always measure on the built-in (primary) display so refresh rate and pixel ratio are comparable.
      const area = screen.getPrimaryDisplay().workArea;
      const win = new BrowserWindow({ x: area.x + 20, y: area.y + 20, width: 1440, height: 900, show: true, useContentSize: true, webPreferences: { backgroundThrottling: false } });
      const file = path.join(__dirname, '..', 'out', 'renderer', 'perf.html');
      const query = { n: String(n), seconds: String(SECONDS), reduce: reduce ? '1' : '0' };
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await win.loadFile(file, { query }); break; } catch (e) { console.error('load retry', e.message); await sleep(1000); }
      }
      const cpu = [];
      const sampler = setInterval(() => {
        const m = app.getAppMetrics();
        const pick = (type) => m.filter((x) => x.type === type).reduce((s, x) => s + x.cpu.percentCPUUsage, 0);
        cpu.push({ renderer: pick('Tab'), gpu: pick('GPU') });
      }, 1000);
      let r = null;
      for (let i = 0; i < SECONDS + 15 && !r; i++) {
        await sleep(1000);
        r = await win.webContents.executeJavaScript('window.__perfResult || null');
      }
      clearInterval(sampler);
      const tail = cpu.slice(3);
      const avg = (k) => Math.round((tail.reduce((s, x) => s + x[k], 0) / Math.max(1, tail.length)) * 10) / 10;
      const mem = (await win.webContents.getProcessMemoryInfo?.()) || null;
      results.push({ ...r, cpuRendererPct: avg('renderer'), cpuGpuPct: avg('gpu'), rendererPrivateMB: mem ? Math.round(mem.private / 1024) : null });
      console.log(JSON.stringify(results[results.length - 1]));
      win.destroy();
      await sleep(1500);
    }
  }
  const d = screen.getPrimaryDisplay();
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), electron: process.versions.electron, chrome: process.versions.chrome, display: { scaleFactor: d.scaleFactor, refreshHz: d.displayFrequency, size: d.size }, results }, null, 2));
  app.quit();
});
