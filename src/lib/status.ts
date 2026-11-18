import type { AgentStatus } from '../../shared/types';

export const STATUS_META: Record<AgentStatus, { label: string; fg: string; bg: string }> = {
  idle: { label: 'Idle', fg: '#4A4853', bg: '#E7E4DE' },
  thinking: { label: 'Berpikir', fg: '#1E40AF', bg: '#DBE6FF' },
  tool_use: { label: 'Bekerja', fg: '#7A4B00', bg: '#FCE9C2' },
  waiting: { label: 'Minta izin', fg: '#9A3412', bg: '#FFE1CC' },
  error: { label: 'Error', fg: '#B42318', bg: '#FDE2DF' },
  done: { label: 'Selesai', fg: '#166534', bg: '#D7F2DF' },
  waiting_subagents: { label: 'Menunggu subagent', fg: '#1E40AF', bg: '#DBE6FF' },
  waiting_user: { label: 'Menunggu kamu', fg: '#9A3412', bg: '#FFE1CC' },
};
