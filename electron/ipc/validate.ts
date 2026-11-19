// Validation for data coming from the renderer over IPC. The renderer is our own code, but
// the main process treats it as untrusted: a compromised renderer must not be able to make
// the main process do more than the UI could.
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, StartSessionOptions } from '../../shared/types';
import { parseExtraArgs, shellQuote } from '../../shared/claudeArgs';

export class IpcError extends Error {}

const MODES = new Set(['default', 'acceptEdits', 'plan', 'auto']);
const MODEL = /^[\w.\-[\]]{1,64}$/;
const ID = /^[\w-]{1,64}$/;

const str = (v: unknown, name: string, max: number) => {
  if (typeof v !== 'string') throw new IpcError(`${name} harus berupa teks`);
  if (v.length > max) throw new IpcError(`${name} terlalu panjang`);
  return v;
};

export function validateStartOptions(raw: unknown): StartSessionOptions {
  if (!raw || typeof raw !== 'object') throw new IpcError('Opsi sesi tidak valid');
  const o = raw as Record<string, unknown>;
  const cwd = str(o.cwd, 'Folder', 4096);
  if (!path.isAbsolute(cwd)) throw new IpcError('Folder harus berupa path absolut');
  let isDir = false;
  try { isDir = fs.statSync(cwd).isDirectory(); } catch { /* missing */ }
  if (!isDir) throw new IpcError('Folder tidak ditemukan');

  const out: StartSessionOptions = { cwd };
  if (o.name !== undefined) out.name = str(o.name, 'Nama sesi', 200);
  if (o.prompt !== undefined) out.prompt = str(o.prompt, 'Tugas awal', 100_000);
  if (o.permissionMode !== undefined) {
    if (!MODES.has(o.permissionMode as string)) throw new IpcError('Mode izin tidak dikenal');
    out.permissionMode = o.permissionMode as StartSessionOptions['permissionMode'];
  }
  if (o.model !== undefined) {
    const m = str(o.model, 'Model', 64);
    if (!MODEL.test(m)) throw new IpcError('Nama model tidak valid');
    out.model = m;
  }
  if (o.worktree !== undefined) out.worktree = o.worktree === true;
  if (o.resumeId !== undefined) {
    const r = str(o.resumeId, 'ID sesi', 64);
    if (!ID.test(r)) throw new IpcError('ID sesi tidak valid');
    out.resumeId = r;
  }
  if (o.extraArgs !== undefined) {
    if (!Array.isArray(o.extraArgs) || o.extraArgs.length > 40) throw new IpcError('Argumen tambahan tidak valid');
    const args = o.extraArgs.map((a, i) => str(a, `Argumen ${i + 1}`, 2000));
    parseExtraArgs(args.map(shellQuote).join(' ')); // throws on blocked flags
    out.extraArgs = args;
  }
  for (const k of ['cols', 'rows'] as const) {
    if (o[k] !== undefined) {
      const n = Number(o[k]);
      if (!Number.isInteger(n) || n < 10 || n > 1000) throw new IpcError(`${k} tidak valid`);
      out[k] = n;
    }
  }
  return out;
}

export function validateId(v: unknown, name = 'ID'): string {
  const s = str(v, name, 64);
  if (!ID.test(s)) throw new IpcError(`${name} tidak valid`);
  return s;
}

/** pty input: plain text, bounded (pastes up to 1 MB). */
export function validatePtyData(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 1_000_000 ? v : null;
}

export function validateSize(cols: unknown, rows: unknown): [number, number] | null {
  const c = Number(cols), r = Number(rows);
  return Number.isInteger(c) && Number.isInteger(r) && c > 0 && r > 0 && c <= 1000 && r <= 1000 ? [c, r] : null;
}

export function validateSettingsPatch(raw: unknown): Partial<AppSettings> {
  if (!raw || typeof raw !== 'object') throw new IpcError('Pengaturan tidak valid');
  const o = raw as Record<string, unknown>;
  const out: Partial<AppSettings> = {};
  if (o.claudePath !== undefined) {
    const p = str(o.claudePath, 'Lokasi claude', 4096).trim();
    if (p && !path.isAbsolute(p)) throw new IpcError('Lokasi claude harus berupa path absolut');
    out.claudePath = p;
  }
  if (o.reduceMotion !== undefined) out.reduceMotion = o.reduceMotion === true;
  if (o.notifications !== undefined) out.notifications = o.notifications === true;
  if (o.terminalFontSize !== undefined) out.terminalFontSize = Number(o.terminalFontSize);
  if (o.officeView !== undefined) out.officeView = o.officeView === '2d' ? '2d' : '3d';
  if (o.music !== undefined) out.music = o.music === true;
  if (o.musicVolume !== undefined) out.musicVolume = Number(o.musicVolume);
  return out;
}

export function validateFolderArg(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = str(v, 'Folder', 4096);
  return path.isAbsolute(s) ? s : null;
}
