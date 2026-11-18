// Idle CPU of the 3D office with 6 working subagents + lead and no interaction.
// Usage: npm run build && npx electron scripts/idle-office.cjs [seconds]
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.on('window-all-closed', () => {});
const seconds = Number(process.argv[2] || 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: true });
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'perf.html'), { query: { mode: 'visual' } });
  win.focus();
  await win.webContents.executeJavaScript(`__vis.set([['a0','tool_use'],['a1','thinking'],['a2','tool_use'],['a3','waiting'],['a4','done'],['a5','idle']])`);
  await sleep(4000);
  const samples = [];
  for (let i = 0; i < seconds; i++) {
    await sleep(1000);
    const m = app.getAppMetrics();
    const sum = (t) => m.filter((x) => x.type === t).reduce((s, x) => s + x.cpu.percentCPUUsage, 0);
    samples.push({ r: sum('Tab'), g: sum('GPU') });
  }
  const avg = (k) => Math.round((samples.reduce((s, x) => s + x[k], 0) / samples.length) * 10) / 10;
  console.log(JSON.stringify({ cpuRenderer: avg('r'), cpuGpu: avg('g') }));
  app.quit();
});
