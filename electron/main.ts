import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import type { StartSessionOptions } from '../shared/types';
import { HookReceiver } from './hooks/hookReceiver';
import { locateClaude } from './session/claudeLocator';
import { SessionManager } from './session/sessionManager';
import { folderInfo } from './session/team';
import { HistoryStore } from './state/history';

// `--vo-user-data=<dir>` keeps test runs of the packaged app away from the real history.
const userDataArg = process.argv.find((a) => a.startsWith('--vo-user-data='));
if (userDataArg) app.setPath('userData', userDataArg.slice('--vo-user-data='.length));

const hooks = new HookReceiver();
const history = new HistoryStore(app.getPath('userData'));
const sessions = new SessionManager(hooks, history);
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

const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
};

sessions.on('data', (id, data) => send('pty:data', id, data));
sessions.on('state', (state) => send('office:state', state));
sessions.on('effects', (id, effects) => send('office:effects', id, effects));
sessions.on('hook', (record) => send('office:hook', record));
sessions.on('sessions', (list) => send('sessions:changed', list));
sessions.on('history', (list) => send('history:changed', list));

ipcMain.handle('claude:info', () => locateClaude(true));
ipcMain.handle('dialog:pick-folder', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] });
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
ipcMain.on('pty:write', (_e, id: string, data: string) => sessions.write(id, data));
ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => sessions.resize(id, cols, rows));

app.whenReady().then(async () => {
  await hooks.start();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  sessions.stopAll();
  hooks.stop();
  history.flush();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
