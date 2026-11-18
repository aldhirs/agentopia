// Persistent list of sessions started from the app (survives restarts), used by the
// lobby's "Sesi sebelumnya" list and for resume.
import fs from 'node:fs';
import path from 'node:path';
import type { HistoryEntry } from '../../shared/types';

const LIMIT = 100;

export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private file: string;
  private saveTimer?: NodeJS.Timeout;

  constructor(dir: string) {
    this.file = path.join(dir, 'sessions.json');
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { entries?: HistoryEntry[] };
      this.entries = Array.isArray(raw.entries) ? raw.entries : [];
    } catch {
      this.entries = [];
    }
    // Sessions still marked running belong to a previous app run that ended abruptly.
    let changed = false;
    for (const e of this.entries) if (!e.endedAt) { e.endedAt = e.lastActiveAt ?? e.startedAt; changed = true; }
    if (changed) this.flush();
  }

  list(): HistoryEntry[] {
    return [...this.entries].sort((a, b) => (b.lastActiveAt ?? b.startedAt) - (a.lastActiveAt ?? a.startedAt));
  }

  get(id: string): HistoryEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  upsert(entry: HistoryEntry) {
    const i = this.entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) this.entries[i] = { ...this.entries[i], ...entry };
    else this.entries.push(entry);
    if (this.entries.length > LIMIT) {
      this.entries = this.list().slice(0, LIMIT);
    }
    this.scheduleSave();
  }

  patch(id: string, patch: Partial<HistoryEntry>) {
    const e = this.get(id);
    if (!e) return;
    Object.assign(e, patch);
    this.scheduleSave();
  }

  remove(id: string) {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.scheduleSave();
  }

  /** Most recently used folders, newest first. */
  recentFolders(limit = 5): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of this.list()) {
      if (!seen.has(e.cwd)) { seen.add(e.cwd); out.push(e.cwd); }
      if (out.length >= limit) break;
    }
    return out;
  }

  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: this.entries }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 300);
  }
}
