// Decides when the user should be told about something (notification + dock badge):
// an agent starts waiting for a permission answer, or the lead hands the turn back.
import type { AgentStatus, OfficeState } from '../../shared/types';

export interface Attention {
  sessionId: string;
  agentId: string;
  kind: 'permission' | 'turn_done';
  title: string;
  body: string;
}

const NEEDS_YOU: AgentStatus[] = ['waiting', 'waiting_user', 'done'];

/** Compares the previous and next state of one session and returns the events worth a notification. */
export function attentionChanges(prev: OfficeState | undefined, next: OfficeState, sessionName: string): Attention[] {
  const out: Attention[] = [];
  for (const id of next.order) {
    const a = next.agents[id];
    const before = prev?.agents[id]?.status;
    if (a.status === before) continue;
    if (a.status === 'waiting') {
      out.push({
        sessionId: next.sessionId, agentId: id, kind: 'permission',
        title: `${a.label} minta izin`,
        body: `${sessionName}: ${a.activity?.replace(/^Izin · /, '') ?? 'butuh persetujuanmu'}`,
      });
    } else if (id === 'lead' && !next.ended && (a.status === 'done' || a.status === 'waiting_user')
      && before !== undefined && !NEEDS_YOU.includes(before)) {
      const last = [...a.log].reverse().find((l) => l.kind === 'text')?.text;
      out.push({
        sessionId: next.sessionId, agentId: id, kind: 'turn_done',
        title: `${sessionName}: Lead selesai`,
        body: last ? last.replace(/\s+/g, ' ').slice(0, 140) : 'Menunggu instruksi berikutnya',
      });
    }
  }
  return out;
}

/** Number of agents (across sessions) currently waiting for a permission answer. */
export function waitingCount(states: Iterable<OfficeState>): number {
  let n = 0;
  for (const s of states) for (const id of s.order) if (s.agents[id].status === 'waiting') n++;
  return n;
}
