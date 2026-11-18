// Screenshots of characters standing up, walking around furniture and sitting down (3D office).
// Usage: npm run build && npx electron scripts/visual-walk.cjs <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const outDir = process.argv[2] || path.join(__dirname, '..', 'out', 'visual');
fs.mkdirSync(outDir, { recursive: true });
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'perf.html'), { query: { mode: 'visual' } });
  const run = (js) => win.webContents.executeJavaScript(js);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => fs.writeFileSync(path.join(outDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());

  await run(`__vis.set([['a0','tool_use'],['a1','thinking'],['a2','tool_use'],['a3','tool_use'],['a4','tool_use'],['a5','thinking']])`);
  await run(`__vis.view(${process.env.ANGLE || 0.25}, -350)`);
  await sleep(1500);
  await shot('1-working');
  // Three finish: they get up and walk to the bean bags.
  await run(`__vis.set([['a0','done'],['a2','done'],['a5','done']])`);
  await sleep(450); await shot('2-standing-up');
  await sleep(1300); await shot('3-walking');
  await sleep(1600); await shot('4-walking-later');
  await sleep(5000); await shot('5-seated-beanbags');
  // One gets a new task: back to a desk.
  await run(`__vis.set([['a2','tool_use']])`);
  await sleep(1500); await shot('6-back-to-work');
  await sleep(6000); await shot('7-at-desk');
  app.quit();
});
