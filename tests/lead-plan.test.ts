import { describe, expect, it } from 'vitest';
import { initialLeadPlan, LINGER_MS, MIN_DWELL_MS, planLead, spotForTool, type LeadPlanState } from '../src/office3d/leadPlan';
import { LEAD_ANCHOR, LEAD_STATIONS, personFromAnchor } from '../src/office3d/layout';
import { NavGrid } from '../src/office3d/nav';
import { createMemo, createOfficeState, parseTodos, reduce } from '../electron/state/reducer';
import type { AgentStatus } from '../shared/types';

describe('spotForTool', () => {
  it('maps tools to places in the lead office', () => {
    expect(spotForTool('Read')).toBe('shelf');
    expect(spotForTool('Grep')).toBe('shelf');
    expect(spotForTool('Bash')).toBe('rack');
    expect(spotForTool('WebSearch')).toBe('phone');
    expect(spotForTool('mcp__claude-in-chrome__navigate')).toBe('phone');
    expect(spotForTool('TodoWrite')).toBe('board');
    expect(spotForTool('Edit')).toBe('desk');
    expect(spotForTool(undefined)).toBeNull();
  });
});

describe('planLead', () => {
  const step = (plan: LeadPlanState, status: AgentStatus, tool: string | undefined, now: number) => planLead(status, tool, plan, now);

  it('walks to the station of the tool and lingers there between calls of a burst', () => {
    let r = step(initialLeadPlan(0), 'tool_use', 'Read', 10_000);
    expect(r.plan.spot).toBe('shelf');
    r = step(r.plan, 'thinking', undefined, 10_500);
    expect(r.plan.spot).toBe('shelf');
    expect(r.recheckAt).toBe(10_000 + LINGER_MS);
    r = step(r.plan, 'tool_use', 'Grep', 11_000);
    expect(r.plan.spot).toBe('shelf');
    // Long silence after the last tool: back to the desk.
    r = step(r.plan, 'thinking', undefined, 11_000 + LINGER_MS + 1);
    expect(r.plan.spot).toBe('desk');
  });

  it('does not ping-pong on quick tool switches', () => {
    let r = step(initialLeadPlan(0), 'tool_use', 'Read', 10_000);
    r = step(r.plan, 'tool_use', 'Bash', 10_800);
    expect(r.plan.spot).toBe('shelf');
    expect(r.recheckAt).toBe(10_000 + MIN_DWELL_MS);
    r = step(r.plan, 'tool_use', 'Bash', 10_000 + MIN_DWELL_MS);
    expect(r.plan.spot).toBe('rack');
  });

  it('comes to the glass front at once when it waits for you, and stays put on permission prompts', () => {
    let r = step(initialLeadPlan(0), 'tool_use', 'Bash', 10_000);
    r = step(r.plan, 'waiting', 'Bash', 10_200);
    expect(r.plan.spot).toBe('rack');
    r = step(r.plan, 'waiting_user', undefined, 10_400);
    expect(r.plan.spot).toBe('front');
    r = step(r.plan, 'thinking', undefined, 20_000);
    expect(r.plan.spot).toBe('desk');
  });

  it('edits and finishes at the desk', () => {
    let r = step(initialLeadPlan(0), 'tool_use', 'Edit', 10_000);
    expect(r.plan.spot).toBe('desk');
    r = step(r.plan, 'done', undefined, 20_000);
    expect(r.plan.spot).toBe('desk');
  });
});

describe('lead office stations', () => {
  it('are free floor and reachable from the lead desk without clipping', () => {
    const nav = new NavGrid();
    const desk = nav.standPoint({ ...personFromAnchor(LEAD_ANCHOR), type: 'desk' });
    for (const [name, s] of Object.entries(LEAD_STATIONS)) {
      expect(nav.isFree(s), name).toBe(true);
      const route = nav.path(desk, s);
      expect(route.length, name).toBeGreaterThan(0);
      expect(route.at(-1), name).toMatchObject({ x: s.x, z: s.z });
    }
  });
});

describe('reducer: tool and todos', () => {
  it('remembers the running tool and the Lead todo list', () => {
    const memo = createMemo();
    let s = createOfficeState('s', 0);
    s = reduce(s, memo, { hook_event_name: 'PreToolUse', tool_name: 'TodoWrite', tool_input: { todos: [
      { content: 'Baca kode', status: 'completed', activeForm: 'Membaca kode' },
      { content: 'Perbaiki bug', status: 'in_progress', activeForm: 'Memperbaiki bug' },
      { content: 'Tulis test', status: 'weird' },
      { nope: true },
    ] } }, 1).state;
    expect(s.agents.lead.tool).toBe('TodoWrite');
    expect(s.todos).toEqual([
      { content: 'Baca kode', status: 'completed', activeForm: 'Membaca kode' },
      { content: 'Perbaiki bug', status: 'in_progress', activeForm: 'Memperbaiki bug' },
      { content: 'Tulis test', status: 'pending' },
    ]);
    s = reduce(s, memo, { hook_event_name: 'PostToolUse', tool_name: 'TodoWrite' }, 2).state;
    expect(s.agents.lead.tool).toBeUndefined();
  });

  it('ignores todo lists of subagents and bad input', () => {
    expect(parseTodos('x')).toBeNull();
    expect(parseTodos(Array.from({ length: 50 }, (_, i) => ({ content: `t${i}`, status: 'pending' })))).toHaveLength(30);
    const memo = createMemo();
    let s = createOfficeState('s', 0);
    s = reduce(s, memo, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' }, 1).state;
    s = reduce(s, memo, { hook_event_name: 'PreToolUse', agent_id: 'a1', agent_type: 'Explore', tool_name: 'TodoWrite', tool_input: { todos: [{ content: 'x', status: 'pending' }] } }, 2).state;
    expect(s.todos).toBeUndefined();
  });
});

describe('reducer: Task tools (newer Claude Code)', () => {
  it('builds the board from TaskCreate and TaskUpdate', () => {
    const memo = createMemo();
    let s = createOfficeState('s', 0);
    const create = (subject: string, id: string, at: number) => {
      const input = { subject, description: 'x', activeForm: `${subject}…` };
      s = reduce(s, memo, { hook_event_name: 'PreToolUse', tool_name: 'TaskCreate', tool_input: input }, at).state;
      s = reduce(s, memo, { hook_event_name: 'PostToolUse', tool_name: 'TaskCreate', tool_input: input, tool_response: { task: { id, subject } } }, at + 1).state;
    };
    create('Baca README', '1', 1);
    create('Jalankan ls', '2', 3);
    create('Tulis ringkasan', '3', 5);
    expect(s.agents.lead.tool).toBeUndefined();
    expect(s.todos?.map((t) => [t.id, t.status])).toEqual([['1', 'pending'], ['2', 'pending'], ['3', 'pending']]);
    s = reduce(s, memo, { hook_event_name: 'PreToolUse', tool_name: 'TaskUpdate', tool_input: { taskId: '1', status: 'in_progress' } }, 7).state;
    expect(s.agents.lead.tool).toBe('TaskUpdate');
    s = reduce(s, memo, { hook_event_name: 'PreToolUse', tool_name: 'TaskUpdate', tool_input: { taskId: '1', status: 'completed' } }, 8).state;
    s = reduce(s, memo, { hook_event_name: 'PreToolUse', tool_name: 'TaskUpdate', tool_input: { taskId: '3', status: 'deleted' } }, 9).state;
    s = reduce(s, memo, { hook_event_name: 'PreToolUse', tool_name: 'TaskUpdate', tool_input: { taskId: '99', status: 'completed' } }, 10).state;
    expect(s.todos).toEqual([
      { id: '1', content: 'Baca README', status: 'completed', activeForm: 'Baca README…' },
      { id: '2', content: 'Jalankan ls', status: 'pending', activeForm: 'Jalankan ls…' },
    ]);
  });
});
