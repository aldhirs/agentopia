// Turns raw hook records into lines for the "Log terstruktur" tab.
import type { HookRecord } from './types';
import { isSyntheticPrompt, summarizeTool } from './toolText';

export type LogKind = 'info' | 'cmd' | 'out' | 'ok' | 'err' | 'warn';

export interface LogLine {
  at: number;
  agentId: string; // 'lead' or Claude Code agent_id
  kind: LogKind;
  text: string;
}

const oneLine = (s: string, max = 140) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
};

function firstOutputLine(resp: unknown): string {
  if (!resp || typeof resp !== 'object') return '';
  const r = resp as { stdout?: unknown; stderr?: unknown };
  const out = typeof r.stdout === 'string' ? r.stdout : typeof r.stderr === 'string' ? r.stderr : '';
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  return lines.length > 1 ? `${oneLine(lines[lines.length - 1], 100)} (${lines.length} baris)` : oneLine(lines[0], 100);
}

export function formatHook(rec: HookRecord): LogLine | null {
  const p = rec.payload;
  if (p.agent_id && !p.agent_type) return null; // internal Claude Code agents
  const agentId = p.agent_id ?? 'lead';
  const line = (kind: LogKind, text: string): LogLine => ({ at: rec.at, agentId, kind, text });
  const tool = p.tool_name ?? 'tool';

  switch (p.hook_event_name) {
    case 'UserPromptSubmit':
      return isSyntheticPrompt(p.prompt ?? '') ? null : line('info', `› ${oneLine(p.prompt ?? '')}`);
    case 'PreToolUse':
      if (tool === 'Agent') {
        const i = p.tool_input ?? {};
        return line('cmd', `Agent(${String(i.subagent_type ?? 'general-purpose')}) "${oneLine(String(i.description ?? ''), 80)}"`);
      }
      if (tool === 'SubagentHandback') return line('cmd', 'Menyerahkan laporan ke Lead');
      return line('cmd', tool === 'Bash' ? `$ ${oneLine(String(p.tool_input?.command ?? ''))}` : summarizeTool(tool, p.tool_input));
    case 'PostToolUse': {
      if (tool === 'Agent' || tool === 'SubagentHandback') return null;
      const out = tool === 'Bash' ? firstOutputLine(p.tool_response) : '';
      return out ? line('out', out) : null;
    }
    case 'PostToolUseFailure':
      return line('err', `✗ ${tool} gagal${p.error ? `: ${oneLine(String(p.error), 100)}` : ''}`);
    case 'PermissionRequest':
      return line('warn', `⏸ minta izin: ${summarizeTool(tool, p.tool_input)}`);
    case 'PermissionDenied':
      return line('err', `✗ izin ditolak: ${tool}`);
    case 'SubagentStart':
      return line('info', `mulai bekerja (${p.agent_type})`);
    case 'SubagentStop':
      return line('ok', '✓ laporan dikirim ke lead');
    case 'Stop': {
      if (p.agent_id) return null;
      const running = (p.background_tasks ?? []).filter((t) => t.type === 'subagent' && t.status === 'running').length;
      return running ? line('out', `menunggu ${running} subagent`) : line('ok', '✓ giliran selesai');
    }
    case 'Notification':
      return p.notification_type === 'idle_prompt' ? line('out', 'menunggu input kamu') : null;
    case 'SessionEnd':
      return line('out', 'sesi berakhir');
    default:
      return null;
  }
}
