// Renders build/logo.svg (from scripts/make-logo-svg.py) to the app icon build/icon.png:
// 1024², macOS icon grid (824 tile at 100,100) with a soft drop shadow, transparent corners.
// Usage: python3 scripts/make-logo-svg.py && npx electron scripts/make-icon.cjs [out.png]
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'logo.svg'), 'utf8');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 200, height: 200, show: false });
  await win.loadURL('data:text/html,<body></body>');
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
      const g = c.getContext('2d');
      g.save();
      g.shadowColor = 'rgba(10, 20, 60, 0.32)'; g.shadowBlur = 40; g.shadowOffsetY = 14;
      g.beginPath(); g.roundRect(100, 100, 824, 824, 185); g.fillStyle = '#8FBFFF'; g.fill();
      g.restore();
      g.drawImage(im, 100, 100, 824, 824);
      g.beginPath(); g.roundRect(101.5, 101.5, 821, 821, 183.5);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; g.stroke();
      resolve(c.toDataURL('image/png'));
    };
    im.onerror = reject;
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
  })`);
  const out = process.argv[2] || path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', out);
  app.quit();
});
