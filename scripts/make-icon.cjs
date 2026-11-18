// Renders the app icon (the Lead character on an office tile) to build/icon.png.
// Usage: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="position:relative;width:1024px;height:1024px">
  <div style="position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:185px;
    background-color:#E9DCC4;background-image:repeating-linear-gradient(90deg,rgba(120,90,50,.09) 0 6px,transparent 6px 120px);
    box-shadow:inset 0 -18px 0 rgba(0,0,0,.08)"></div>
  <div style="position:absolute;left:190px;top:640px;width:644px;height:70px;border-radius:20px;background:#B89B6E"></div>
  <div style="position:absolute;left:560px;top:470px;width:220px;height:160px;border-radius:22px;background:#2A2833;padding:16px;box-sizing:border-box">
    <div style="width:100%;height:100%;border-radius:10px;background:#8FD3FF"></div>
  </div>
  <div style="position:absolute;left:250px;top:390px;width:270px;height:258px;border-radius:46% 46% 40% 40%;background:#EDBB4A">
    <div style="position:absolute;top:84px;left:0;right:0;display:flex;justify-content:center;gap:58px">
      <span style="display:block;width:34px;height:50px;border-radius:18px;background:#1C1B22"></span>
      <span style="display:block;width:34px;height:50px;border-radius:18px;background:#1C1B22"></span>
    </div>
  </div>
  <div style="position:absolute;left:300px;top:250px;width:120px;height:80px;display:flex;gap:16px;align-items:center;justify-content:center;
    border-radius:40px;background:#DBE6FF">
    <span style="width:22px;height:22px;border-radius:50%;background:#1E40AF"></span>
    <span style="width:22px;height:22px;border-radius:50%;background:#1E40AF;opacity:.6"></span>
    <span style="width:22px;height:22px;border-radius:50%;background:#1E40AF;opacity:.3"></span>
  </div>
</div></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const shot = img.resize({ width: 1024, height: 1024 }).toDataURL();
  // capturePage has no alpha: clip to the rounded tile in a canvas so the corners become transparent.
  await win.loadURL('data:text/html,<body style="margin:0"></body>');
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
      const g = c.getContext('2d');
      g.beginPath(); g.roundRect(100, 100, 824, 824, 185); g.clip();
      g.drawImage(im, 0, 0, 1024, 1024);
      resolve(c.toDataURL('image/png'));
    };
    im.src = ${JSON.stringify(shot)};
  })`);
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', out);
  app.quit();
});
