import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import type { StartSessionOptions } from '../shared/types';
import { HookReceiver } from './hooks/hookReceiver';
import { locateClaude } from './session/claudeLocator';
import { SessionManager } from './session/sessionManager';

const hooks = new HookReceiver();
const sessions = new SessionManager(hooks);
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
