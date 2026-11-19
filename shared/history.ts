import type { HistoryEntry } from './types';

const lastActive = (h: HistoryEntry) => h.lastActiveAt ?? h.startedAt;

/**
 * One row per project folder for the lobby's "Sesi sebelumnya": the most recent conversation in each
 * folder. Folders with a session already running are left out, since that session is listed above.
 */
export function latestPerFolder(entries: HistoryEntry[], runningCwds: Set<string>, limit = 20): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const h of [...entries].sort((a, b) => lastActive(b) - lastActive(a))) {
    if (seen.has(h.cwd)) continue;
    seen.add(h.cwd);
    if (runningCwds.has(h.cwd)) continue;
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
