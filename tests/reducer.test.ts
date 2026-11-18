import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMemo, createOfficeState, reduce, summarizeTool, isSyntheticPrompt } from '../electron/state/reducer';
import type { HookPayload, OfficeEffect, OfficeState } from '../shared/types';

function replay(file: string) {
  const lines = fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8').trim().split('\n');
  let state = createOfficeState('s1', 0);
  const memo = createMemo();
  const effects: OfficeEffect[] = [];
  const timeline: Array<{ ev: string; state: OfficeState }> = [];
  for (const line of lines) {
    const { t_ms, payload } = JSON.parse(line) as { t_ms: number; payload: HookPayload };
    const r = reduce(state, memo, payload, t_ms);
    state = r.state;
    effects.push(...r.effects);
    timeline.push({ ev: payload.hook_event_name, state });
  }
  return { state, effects, timeline };
}

describe('reducer on real spike recordings', () => {
  for (const file of ['hooks-auto.jsonl', 'hooks-manual.jsonl']) {
    it(`${file}: two parallel Explore subagents become two characters`, () => {
      const { state } = replay(file);
      const subs = state.order.filter((id) => id !== 'lead').map((id) => state.agents[id]);
      expect(subs).toHaveLength(2);
      expect(subs.map((a) => a.type)).toEqual(['Explore', 'Explore']);
      expect(subs.map((a) => a.label)).toEqual(['Explore', 'Explore #2']);
      expect(subs.every((a) => a.status === 'done')).toBe(true);
      expect(subs.every((a) => a.description && a.spawnToolUseId)).toBe(true);
      expect(state.ended).toBe(true);
    });

    it(`${file}: internal agents with empty agent_type are ignored`, () => {
      const { state } = replay(file);
      expect(Object.values(state.agents).some((a) => a.type === '')).toBe(false);
    });

    it(`${file}: emits one dispatch and one report per subagent`, () => {
      const { effects } = replay(file);
      expect(effects.filter((e) => e.type === 'dispatch')).toHaveLength(2);
      expect(effects.filter((e) => e.type === 'report')).toHaveLength(2);
    });

    it(`${file}: lead waits for subagents instead of finishing early`, () => {
      const { timeline } = replay(file);
      const firstStop = timeline.find((t) => t.ev === 'Stop')!;
      expect(firstStop.state.agents.lead.status).toBe('waiting_subagents');
    });

    it(`${file}: subagent tool calls are attributed to the right instance`, () => {
      const { state } = replay(file);
      const tools = state.order
        .filter((id) => id !== 'lead')
        .map((id) => state.agents[id].log.filter((l) => l.kind === 'tool').map((l) => l.tool));
      expect(tools.flat().sort()).toEqual(expect.arrayContaining(['Bash', 'Read']));
      expect(state.agents.lead.log.some((l) => l.tool === 'Read')).toBe(false);
    });

    it(`${file}: hand-back prompts are not shown as user messages`, () => {
      const { state } = replay(file);
      const userMsgs = state.agents.lead.log.filter((l) => l.kind === 'user');
      expect(userMsgs).toHaveLength(1);
      expect(userMsgs[0].text).toMatch(/^Spike test/);
    });
  }

  it('manual mode: permission request puts the lead in waiting, then work resumes', () => {
    const { timeline } = replay('hooks-manual.jsonl');
    const iReq = timeline.findIndex((t) => t.ev === 'PermissionRequest');
    expect(timeline[iReq].state.agents.lead.status).toBe('waiting');
    const after = timeline.slice(iReq + 1).find((t) => t.ev === 'PostToolUse')!;
    expect(after.state.agents.lead.status).toBe('thinking');
  });
});

describe('helpers', () => {
  it('summarizes tools', () => {
    expect(summarizeTool('Bash', { command: 'go test ./...' })).toBe('Bash · go test ./...');
    expect(summarizeTool('Edit', { file_path: '/a/b/service.go' })).toBe('Edit · service.go');
    expect(summarizeTool('Unknown')).toBe('Unknown');
  });
  it('detects synthetic prompts', () => {
    expect(isSyntheticPrompt('<agent-message from="x">')).toBe(true);
    expect(isSyntheticPrompt('\n<task-notification>')).toBe(true);
    expect(isSyntheticPrompt('Tambah fitur')).toBe(false);
  });
});
