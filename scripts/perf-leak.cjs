// Memory-leak check for the 3D office engine: 15 create/use/dispose cycles with 32 agents.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'perf.html'), { query: { mode: 'leak', cycles: '15', n: '32' } });
  let r = null;
  for (let i = 0; i < 90 && !r; i++) { await new Promise((x) => setTimeout(x, 1000)); r = await win.webContents.executeJavaScript('window.__perfResult || null'); }
  console.log(JSON.stringify(r));
  app.quit();
});
