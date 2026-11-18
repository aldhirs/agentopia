import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatHook } from '../shared/logFormat';
import type { HookPayload } from '../shared/types';

const records = (file: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8').trim().split('\n').map((l) => {
    const { t_ms, payload } = JSON.parse(l) as { t_ms: number; payload: HookPayload };
    return { sessionId: 's', at: t_ms, payload };
  });

describe('formatHook', () => {
  it('formats the manual-mode recording into readable lines', () => {
    const lines = records('hooks-manual.jsonl').map(formatHook).filter(Boolean);
    const texts = lines.map((l) => `${l!.kind}:${l!.text}`);
    expect(texts[0]).toMatch(/^info:› Spike test/);
    expect(texts.filter((t) => t.startsWith('cmd:Agent(Explore)'))).toHaveLength(2);
    expect(texts).toContain('warn:⏸ minta izin: Bash · touch permission-test.txt');
    expect(texts).toContain('cmd:$ touch permission-test.txt');
    expect(texts.filter((t) => t === 'ok:✓ laporan dikirim ke lead')).toHaveLength(2);
    expect(texts.some((t) => t.includes('<task-notification'))).toBe(false);
  });

  it('drops internal agents and attributes subagent lines', () => {
    const lines = records('hooks-auto.jsonl').map(formatHook).filter(Boolean);
    const agents = new Set(lines.map((l) => l!.agentId));
    expect(agents.size).toBe(3); // lead + 2 Explore
  });

  it('summarizes Bash output', () => {
    const l = formatHook({
      sessionId: 's', at: 0,
      payload: { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'a\nb\nok  done\n' } },
    });
    expect(l?.text).toBe('ok done (3 baris)');
  });
});
