import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { OfficeApi } from '../shared/types';

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: OfficeApi = {
  claudeInfo: () => ipcRenderer.invoke('claude:info'),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  startSession: (opts) => ipcRenderer.invoke('session:start', opts),
  stopSession: (id) => ipcRenderer.invoke('session:stop', id),
  listSessions: () => ipcRenderer.invoke('session:list'),
  getState: (id) => ipcRenderer.invoke('session:state', id),
  getHooks: (id) => ipcRenderer.invoke('session:hooks', id),
  getBuffer: (id) => ipcRenderer.invoke('pty:buffer', id),
  listHistory: () => ipcRenderer.invoke('history:list'),
  recentFolders: () => ipcRenderer.invoke('history:folders'),
  resumeSession: (historyId) => ipcRenderer.invoke('session:resume', historyId),
  removeHistory: (historyId) => ipcRenderer.invoke('history:remove', historyId),
  folderInfo: (cwd) => ipcRenderer.invoke('folder:info', cwd),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  pickFile: () => ipcRenderer.invoke('dialog:pick-file'),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  onPtyData: (cb) => listen('pty:data', cb),
  onState: (cb) => listen('office:state', cb),
  onEffects: (cb) => listen('office:effects', cb),
  onHook: (cb) => listen('office:hook', cb),
  onSessions: (cb) => listen('sessions:changed', cb),
  onHistory: (cb) => listen('history:changed', cb),
  onSettings: (cb) => listen('settings:changed', cb),
  onOpenSession: (cb) => listen('ui:open-session', cb),
};

contextBridge.exposeInMainWorld('office', api);
