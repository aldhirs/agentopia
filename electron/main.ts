import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import path from 'node:path';
import type { AppSettings, OfficeState, StartSessionOptions } from '../shared/types';
import { HookReceiver } from './hooks/hookReceiver';
import { locateClaude, setConfiguredClaudePath } from './session/claudeLocator';
import { SessionManager } from './session/sessionManager';
import { folderInfo } from './session/team';
import { attentionChanges, waitingCount } from './state/attention';
import { HistoryStore } from './state/history';
import { SettingsStore } from './state/settings';

// `--vo-user-data=<dir>` keeps test runs of the packaged app away from the real history.
const userDataArg = process.argv.find((a) => a.startsWith('--vo-user-data='));
if (userDataArg) app.setPath('userData', userDataArg.slice('--vo-user-data='.length));

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
    title: 'Virtual Office',
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
ipcMain.handle('session:start', (_e, opts: StartSessionOptions) => sessions.start(opts));
ipcMain.handle('session:stop', (_e, id: string) => sessions.stop(id));
ipcMain.handle('session:list', () => sessions.list());
ipcMain.handle('session:state', (_e, id: string) => sessions.getState(id));
ipcMain.handle('session:hooks', (_e, id: string) => sessions.getHooks(id));
ipcMain.handle('pty:buffer', (_e, id: string) => sessions.getBuffer(id));
ipcMain.handle('history:list', () => history.list());
ipcMain.handle('history:folders', () => history.recentFolders());
ipcMain.handle('history:remove', (_e, id: string) => { history.remove(id); send('history:changed', history.list()); });
ipcMain.handle('session:resume', (_e, historyId: string) => sessions.resume(historyId));
ipcMain.handle('folder:info', (_e, cwd: string | null) => folderInfo(cwd));
ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => {
  const next = settings.set(patch);
  setConfiguredClaudePath(next.claudePath);
  send('settings:changed', next);
  return next;
});
ipcMain.on('pty:write', (_e, id: string, data: string) => sessions.write(id, data));
ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => sessions.resize(id, cols, rows));

app.whenReady().then(async () => {
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
