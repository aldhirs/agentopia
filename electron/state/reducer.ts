// Pure reducer: Claude Code hook payload -> office state + visual effects.
// Mapping is documented in docs/spike-notes.md ("Pemetaan event → status karakter").
import type { AgentState, HookPayload, LogEntry, OfficeEffect, OfficeState } from '../../shared/types';
import { isSyntheticPrompt, prettyType, summarizeTool } from '../../shared/toolText';

export { isSyntheticPrompt, prettyType, summarizeTool };

const LOG_LIMIT = 200;
const LEAD = 'lead';

export function createOfficeState(sessionId: string, now: number): OfficeState {
  return {
    sessionId,
    agents: {
      [LEAD]: {
        id: LEAD, kind: 'lead', type: 'lead', label: 'Lead', status: 'idle',
        startedAt: now, updatedAt: now, log: [],
      },
    },
    order: [LEAD],
    ended: false,
  };
}

interface PendingSpawn { toolUseId: string; subagentType: string; description?: string }

/** Mutable bookkeeping kept next to the state (not sent to the renderer). */
export interface ReducerMemo { pendingSpawns: PendingSpawn[] }
export const createMemo = (): ReducerMemo => ({ pendingSpawns: [] });

export interface ReduceResult { state: OfficeState; effects: OfficeEffect[] }

export function reduce(prev: OfficeState, memo: ReducerMemo, p: HookPayload, now: number): ReduceResult {
  const state: OfficeState = { ...prev, agents: { ...prev.agents }, order: [...prev.order] };
  const effects: OfficeEffect[] = [];
  if (p.session_id && !state.claudeSessionId) state.claudeSessionId = p.session_id;

  // Internal Claude Code agents (prompt suggestions etc.) carry an agent_id with an empty type.
  if (p.agent_id && !p.agent_type) return { state: prev, effects };

  const actorId = p.agent_id ? p.agent_id : LEAD;
  const ev = p.hook_event_name;

  const touch = (id: string, patch: Partial<AgentState>, entry?: Omit<LogEntry, 'at'>) => {
    const cur = state.agents[id] ?? ensureSubagent(state, id, p.agent_type ?? 'agent', now);
    const log = entry ? [...cur.log, { ...entry, at: now }].slice(-LOG_LIMIT) : cur.log;
    state.agents[id] = { ...cur, ...patch, updatedAt: now, log };
  };

  switch (ev) {
    case 'UserPromptSubmit': {
      const prompt = p.prompt ?? '';
      if (isSyntheticPrompt(prompt)) break; // subagent hand-back / task notification
      touch(LEAD, { status: 'thinking', activity: 'Berpikir…' }, { kind: 'user', text: prompt });
      break;
    }
    case 'PreToolUse': {
      const tool = p.tool_name ?? 'tool';
      if (tool === 'Agent' && actorId === LEAD) {
        const input = p.tool_input ?? {};
        const subagentType = String(input.subagent_type ?? 'general-purpose');
        memo.pendingSpawns.push({
          toolUseId: p.tool_use_id ?? '',
          subagentType,
          description: typeof input.description === 'string' ? input.description : undefined,
        });
        touch(LEAD, { status: 'tool_use', activity: `Agent · ${subagentType}` },
          { kind: 'tool', tool: 'Agent', text: `${subagentType} · ${input.description ?? ''}`.trim() });
        break;
      }
      if (tool === 'SubagentHandback') {
        touch(actorId, { status: 'tool_use', activity: 'Melapor ke Lead' });
        break;
      }
      const summary = summarizeTool(tool, p.tool_input);
      const detail = summary === tool ? '' : summary.slice(tool.length + 3);
      touch(actorId, { status: 'tool_use', activity: summary }, { kind: 'tool', tool, text: detail });
      break;
    }
    case 'SubagentStart': {
      const id = p.agent_id!;
      const type = p.agent_type!;
      const idx = memo.pendingSpawns.findIndex((s) => s.subagentType === type);
      const spawn = idx >= 0 ? memo.pendingSpawns.splice(idx, 1)[0] : undefined;
      ensureSubagent(state, id, type, now);
      touch(id, {
        status: 'thinking', activity: 'Berpikir…',
        description: spawn?.description ?? state.agents[id].description,
        spawnToolUseId: spawn?.toolUseId,
      });
      effects.push({ type: 'dispatch', from: LEAD, to: id, at: now });
      break;
    }
    case 'PostToolUse': {
      const tool = p.tool_name ?? 'tool';
      if (tool === 'Agent' && actorId === LEAD) {
        const resp = (p.tool_response ?? {}) as { agentId?: string; description?: string };
        if (resp.agentId && state.agents[resp.agentId] && !state.agents[resp.agentId].description) {
          touch(resp.agentId, { description: resp.description });
        }
        touch(LEAD, { status: 'thinking', activity: 'Berpikir…' });
        break;
      }
      if (tool === 'SubagentHandback') {
        touch(actorId, { status: 'thinking', activity: 'Melapor ke Lead' }, { kind: 'status', text: 'Menyerahkan laporan ke Lead' });
        break;
      }
      touch(actorId, { status: 'thinking', activity: 'Berpikir…' });
      break;
    }
    case 'PostToolUseFailure': {
      const tool = p.tool_name ?? 'tool';
      touch(actorId, { status: 'error', activity: `Gagal · ${tool}` }, { kind: 'status', text: `${tool} gagal` });
      break;
    }
    case 'PermissionRequest': {
      const tool = p.tool_name ?? 'tool';
      touch(actorId, { status: 'waiting', activity: `Izin · ${summarizeTool(tool, p.tool_input).replace(`${tool} · `, '')}` },
        { kind: 'status', text: `Minta izin: ${tool}` });
      break;
    }
    case 'Notification': {
      if (p.notification_type === 'idle_prompt') {
        touch(LEAD, { status: 'waiting_user', activity: 'Menunggu kamu' });
      } else if (p.notification_type === 'permission_prompt') {
        touch(actorId, { status: 'waiting', activity: 'Minta izin' });
      }
      break;
    }
    case 'SubagentStop': {
      const id = p.agent_id!;
      touch(id, {
        status: 'done', activity: 'Laporan dikirim ke Lead',
        transcriptPath: p.agent_transcript_path ?? state.agents[id]?.transcriptPath,
      }, { kind: 'status', text: 'Selesai' });
      effects.push({ type: 'report', from: id, to: LEAD, at: now });
      break;
    }
    case 'Stop': {
      if (actorId !== LEAD) break;
      const running = (p.background_tasks ?? []).filter((t) => t.type === 'subagent' && t.status === 'running');
      if (running.length > 0) {
        touch(LEAD, { status: 'waiting_subagents', activity: `Menunggu ${running.length} subagent` });
      } else {
        touch(LEAD, { status: 'done', activity: 'Giliran selesai' },
          p.last_assistant_message ? { kind: 'text', text: p.last_assistant_message } : undefined);
      }
      break;
    }
    case 'SessionEnd': {
      state.ended = true;
      for (const id of state.order) {
        const a = state.agents[id];
        if (a.status !== 'done') state.agents[id] = { ...a, status: 'idle', activity: 'Sesi selesai', updatedAt: now };
      }
      break;
    }
    default:
      return { state: prev, effects };
  }
  return { state, effects };
}

function ensureSubagent(state: OfficeState, id: string, type: string, now: number): AgentState {
  const existing = state.agents[id];
  if (existing) return existing;
  const sameType = state.order.filter((oid) => state.agents[oid].type === type).length;
  const agent: AgentState = {
    id, kind: 'subagent', type,
    label: sameType > 0 ? `${prettyType(type)} #${sameType + 1}` : prettyType(type),
    status: 'thinking', startedAt: now, updatedAt: now, log: [],
  };
  state.agents[id] = agent;
  state.order.push(id);
  return agent;
}
