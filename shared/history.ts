import type { HistoryEntry } from './types';

const lastActive = (h: HistoryEntry) => h.lastActiveAt ?? h.startedAt;

/** A conversation's place in the lobby list: its folder, and the agent when it is a direct chat. */
export const conversationKey = (h: { cwd: string; agent?: string }) => `${h.cwd}\n${h.agent ?? ''}`;

/**
 * One row per project folder for the lobby's "Project sebelumnya" (a direct chat with an agent gets
 * its own row): the most recent conversation of each. Rows with a session already running are left
 * out, since that session is listed above.
 */
export function latestPerFolder(entries: HistoryEntry[], runningKeys: Set<string>, limit = 20): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const h of [...entries].sort((a, b) => lastActive(b) - lastActive(a))) {
    const key = conversationKey(h);
    if (seen.has(key)) continue;
    seen.add(key);
    if (runningKeys.has(key)) continue;
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
