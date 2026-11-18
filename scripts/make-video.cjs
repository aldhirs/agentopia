// Renders the promo film frame by frame (perf.html?mode=film) at 2x (3840x2160), then encodes a
// 4K master and a supersampled 1080p version, with an optional audio track.
// Usage: npm run build && npx electron scripts/make-video.cjs <outDir> [audio.wav]
//        PREVIEW=1.0,5.5 ... renders only those moments as stills, to check the look quickly.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCALE = 2;
app.on('window-all-closed', () => {});
const outDir = path.resolve(process.argv[2] || 'out/film');
const audio = process.argv[3];
const FPS = 30;

function encode(frames, out, scale, crf) {
  const args = ['-y', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.jpg')];
  if (audio) args.push('-i', audio);
  args.push('-vf', `scale=${scale}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation',
    '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high');
  if (audio) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  args.push('-movflags', '+faststart', out);
  const r = spawnSync('ffmpeg', ['-v', 'error', ...args], { stdio: 'inherit' });
  console.log(r.status === 0 ? `wrote ${out}` : `ffmpeg failed for ${out}`);
}

app.whenReady().then(async () => {
  const frames = path.join(outDir, 'frames');
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({ width: 1920 * SCALE, height: 1080 * SCALE, show: false, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'perf.html'), { query: { mode: 'film' } });
  const run = (js) => win.webContents.executeJavaScript(js);
  // Render at SCALE x: the page keeps its 1920x1080 CSS layout, with devicePixelRatio = SCALE.
  win.webContents.setZoomFactor(SCALE);
  await new Promise((r) => setTimeout(r, 300));
  await run('window.__startFilm()');
  for (let i = 0; i < 100 && !(await run('!!window.__film')); i++) await new Promise((r) => setTimeout(r, 50));
  await run('document.fonts.ready.then(() => true)');
  const seconds = await run('window.__film.seconds');
  const total = Math.round(seconds * FPS);
  const want = process.env.PREVIEW ? process.env.PREVIEW.split(',').map(Number) : null;
  if (!want) { fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true }); }
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    await run(`window.__film.render(${t})`);
    if (want && !want.some((w) => Math.abs(w - t) < 0.5 / FPS)) continue;
    await new Promise((r) => setTimeout(r, 60)); // let the compositor present the frame
    const img = await win.webContents.capturePage();
    if (want) fs.writeFileSync(path.join(outDir, `preview-${t.toFixed(1)}.png`), img.toPNG());
    else fs.writeFileSync(path.join(frames, `f${String(f).padStart(4, '0')}.jpg`), img.toJPEG(97));
    if (!want && f % 90 === 0) console.log(`frame ${f}/${total} ${img.getSize().width}x${img.getSize().height}`);
  }
  if (!want) {
    encode(frames, path.join(outDir, 'agentopia-4k.mp4'), '3840:2160', 16);
    encode(frames, path.join(outDir, 'agentopia-1080p.mp4'), '1920:1080', 14);
  }
  app.quit();
});
