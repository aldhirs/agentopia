import { app, BrowserWindow, dialog, ipcMain, Notification, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { OfficeState } from '../shared/types';
import { HookReceiver } from './hooks/hookReceiver';
import { initLog, log } from './log';
import { locateClaude, setConfiguredClaudePath } from './session/claudeLocator';
import { SessionManager } from './session/sessionManager';
import { folderInfo } from './session/team';
import { attentionChanges, waitingCount } from './state/attention';
import { HistoryStore } from './state/history';
import { SettingsStore } from './state/settings';
import {
  validateFolderArg, validateId, validatePtyData, validateSettingsPatch, validateSize, validateStartOptions,
} from './ipc/validate';

// `--vo-user-data=<dir>` keeps test runs of the packaged app away from the real history.
const userDataArg = process.argv.find((a) => a.startsWith('--vo-user-data='));
if (userDataArg) app.setPath('userData', userDataArg.slice('--vo-user-data='.length));
else migrateFromOldName();

/** The app used to be called "Virtual Office": carry its history and settings over once. */
function migrateFromOldName() {
  const dir = app.getPath('userData');
  const old = path.join(app.getPath('appData'), 'Virtual Office');
  for (const file of ['sessions.json', 'settings.json']) {
    const from = path.join(old, file), to = path.join(dir, file);
    try {
      if (!fs.existsSync(to) && fs.existsSync(from)) {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(from, to);
        fs.chmodSync(to, 0o600);
      }
    } catch { /* start fresh if the old data can't be read */ }
  }
}

initLog(app.getPath('userData'));
log('app.start', { version: app.getVersion(), platform: process.platform, arch: process.arch, electron: process.versions.electron });
// Keep unexpected errors out of a modal dialog but never silent: they go to logs/main.log.
process.on('uncaughtException', (err) => log('uncaughtException', { message: err.message, stack: err.stack }));
process.on('unhandledRejection', (reason) => log('unhandledRejection', { reason: String(reason) }));

const hooks = new HookReceiver();
const history = new HistoryStore(app.getPath('userData'));
const settings = new SettingsStore(app.getPath('userData'));
const sessions = new SessionManager(hooks, history);
setConfiguredClaudePath(settings.get().claudePath);
let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Agentopia',
    backgroundColor: '#3A3644',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on('closed', () => { win = null; });

  // Open external links in the browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // The window only ever shows the bundled app: block navigation away from it and <webview>.
  win.webContents.on('will-navigate', (e, url) => {
    const appUrl = process.env.ELECTRON_RENDERER_URL;
    if (!(appUrl && url.startsWith(appUrl)) && !url.startsWith('file://')) e.preventDefault();
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function showWindow() {
  if (!win) createWindow();
  if (win!.isMinimized()) win!.restore();
  win!.show();
  win!.focus();
}

const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
};

// --- attention: notifications + dock badge ---
const lastStates = new Map<string, OfficeState>();
function onStateForAttention(state: OfficeState) {
  const prev = lastStates.get(state.sessionId);
  lastStates.set(state.sessionId, state);
  if (process.platform === 'darwin') {
    const n = waitingCount(lastStates.values());
    app.dock?.setBadge(n > 0 ? String(n) : '');
  }
  if (!prev || !settings.get().notifications || !Notification.isSupported()) return;
  const appFocused = !!win && !win.isDestroyed() && win.isFocused();
  if (appFocused) return; // the office already shows it
  const name = sessions.list().find((s) => s.id === state.sessionId)?.name ?? 'Sesi';
  for (const a of attentionChanges(prev, state, name)) {
    const n = new Notification({ title: a.title, body: a.body, silent: a.kind !== 'permission' });
    n.on('click', () => { showWindow(); send('ui:open-session', a.sessionId); });
    n.show();
  }
}

sessions.on('data', (id, data) => send('pty:data', id, data));
sessions.on('state', (state) => { send('office:state', state); onStateForAttention(state); });
sessions.on('effects', (id, effects) => send('office:effects', id, effects));
sessions.on('hook', (record) => send('office:hook', record));
sessions.on('sessions', (list) => send('sessions:changed', list));
sessions.on('history', (list) => send('history:changed', list));

ipcMain.handle('claude:info', () => locateClaude(true));
ipcMain.handle('dialog:pick-folder', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0] ?? null;
});
ipcMain.handle('dialog:pick-file', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openFile', 'showHiddenFiles'], message: 'Pilih binary claude' });
  return r.canceled ? null : r.filePaths[0] ?? null;
});
// Every IPC input is validated here: the main process does not trust the renderer.
ipcMain.handle('session:start', (_e, opts: unknown) => sessions.start(validateStartOptions(opts)));
ipcMain.handle('session:stop', (_e, id: unknown) => sessions.stop(validateId(id)));
ipcMain.handle('session:list', () => sessions.list());
ipcMain.handle('session:state', (_e, id: unknown) => sessions.getState(validateId(id)));
ipcMain.handle('session:hooks', (_e, id: unknown) => sessions.getHooks(validateId(id)));
ipcMain.handle('pty:buffer', (_e, id: unknown) => sessions.getBuffer(validateId(id)));
ipcMain.handle('history:list', () => history.list());
ipcMain.handle('history:folders', () => history.recentFolders());
ipcMain.handle('history:remove', (_e, id: unknown) => { history.remove(validateId(id)); send('history:changed', history.list()); });
ipcMain.handle('session:resume', (_e, historyId: unknown) => sessions.resume(validateId(historyId)));
ipcMain.handle('folder:info', (_e, cwd: unknown) => folderInfo(validateFolderArg(cwd)));
ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (_e, patch: unknown) => {
  const next = settings.set(validateSettingsPatch(patch));
  setConfiguredClaudePath(next.claudePath);
  send('settings:changed', next);
  return next;
});
ipcMain.on('pty:write', (_e, id: unknown, data: unknown) => {
  const d = validatePtyData(data);
  if (typeof id === 'string' && d !== null) sessions.write(id, d);
});
ipcMain.on('pty:resize', (_e, id: unknown, cols: unknown, rows: unknown) => {
  const size = validateSize(cols, rows);
  if (typeof id === 'string' && size) sessions.resize(id, size[0], size[1]);
});

// Windows shows notifications only for apps with an AppUserModelID (must match the installer's appId).
if (process.platform === 'win32') app.setAppUserModelId('app.agentopia.desktop');

app.whenReady().then(async () => {
  // The app needs no web permissions (camera, mic, geolocation, web notifications, …).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  await hooks.start();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Quitting with sessions still running: ask first, then stop them cleanly so no `claude` process is left behind.
let quitConfirmed = false;
app.on('before-quit', async (e) => {
  if (quitConfirmed) return;
  const running = sessions.list().filter((s) => s.status === 'running');
  if (running.length && !process.env.VO_NO_QUIT_CONFIRM) {
    e.preventDefault();
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Hentikan semua & keluar', 'Batal'],
      defaultId: 0,
      cancelId: 1,
      message: `${running.length} sesi Claude Code masih berjalan`,
      detail: 'Keluar akan menghentikan semua sesi. Percakapannya tetap tersimpan dan bisa dilanjutkan dari lobby.',
    });
    if (response !== 0) return;
    quitConfirmed = true;
    await Promise.all(running.map((s) => sessions.stop(s.id).catch(() => undefined)));
    app.quit();
    return;
  }
  quitConfirmed = true;
  sessions.stopAll();
  hooks.stop();
  history.flush();
});

app.on('will-quit', () => {
  sessions.stopAll();
  hooks.stop();
  history.flush();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
