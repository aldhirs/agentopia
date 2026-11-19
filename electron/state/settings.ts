// User preferences persisted in userData/settings.json.
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../../shared/types';

export const DEFAULT_SETTINGS: AppSettings = {
  claudePath: '',
  reduceMotion: false,
  terminalFontSize: 13,
  notifications: true,
  officeView: '3d',
  music: true,
  musicVolume: 30,
};

export class SettingsStore {
  private file: string;
  private value: AppSettings;

  constructor(dir: string) {
    this.file = path.join(dir, 'settings.json');
    let raw: Partial<AppSettings> = {};
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* defaults */ }
    this.value = sanitize({ ...DEFAULT_SETTINGS, ...raw });
  }

  get(): AppSettings { return { ...this.value }; }

  set(patch: Partial<AppSettings>): AppSettings {
    this.value = sanitize({ ...this.value, ...patch });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.value, null, 2), { mode: 0o600 });
    fs.chmodSync(this.file, 0o600);
    return this.get();
  }
}

function sanitize(s: AppSettings): AppSettings {
  return {
    claudePath: typeof s.claudePath === 'string' ? s.claudePath.trim() : '',
    reduceMotion: Boolean(s.reduceMotion),
    terminalFontSize: Math.min(20, Math.max(10, Math.round(Number(s.terminalFontSize) || 13))),
    notifications: s.notifications !== false,
    officeView: s.officeView === '2d' ? '2d' : '3d',
    music: s.music !== false,
    musicVolume: Math.min(100, Math.max(0, Math.round(Number(s.musicVolume ?? 30)) || 0)),
  };
}
