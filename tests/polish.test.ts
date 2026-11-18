import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { attentionChanges, waitingCount } from '../electron/state/attention';
import { SettingsStore, DEFAULT_SETTINGS } from '../electron/state/settings';
import { createMemo, createOfficeState, reduce } from '../electron/state/reducer';
import type { HookPayload, OfficeState } from '../shared/types';

function replay(file: string) {
  const lines = fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8').trim().split('\n');
  let state = createOfficeState('s1', 0);
  const memo = createMemo();
  const states: OfficeState[] = [state];
  for (const line of lines) {
    const { t_ms, payload } = JSON.parse(line) as { t_ms: number; payload: HookPayload };
    state = reduce(state, memo, payload, t_ms).state;
    states.push(state);
  }
  return states;
}

describe('attention (notifications + badge)', () => {
  it('fires a permission notice and a turn-done notice on the manual recording', () => {
    const states = replay('hooks-manual.jsonl');
    const events = states.slice(1).flatMap((s, i) => attentionChanges(states[i], s, 'sandbox'));
    const permission = events.filter((e) => e.kind === 'permission');
    expect(permission).toHaveLength(1);
    expect(permission[0].title).toBe('Lead minta izin');
    expect(permission[0].body).toContain('touch permission-test.txt');
    expect(events.some((e) => e.kind === 'turn_done')).toBe(true);
  });

  it('does not notify for a turn end while subagents still run', () => {
    const states = replay('hooks-auto.jsonl');
    const firstStop = states.findIndex((s) => s.agents.lead.status === 'waiting_subagents');
    expect(attentionChanges(states[firstStop - 1], states[firstStop], 'x')).toEqual([]);
  });

  it('counts waiting agents across sessions for the dock badge', () => {
    const states = replay('hooks-manual.jsonl');
    const waiting = states.find((s) => s.agents.lead.status === 'waiting')!;
    expect(waitingCount([waiting, waiting])).toBe(2);
    expect(waitingCount([states[states.length - 1]])).toBe(0);
  });
});

describe('SettingsStore', () => {
  it('uses defaults, clamps values and persists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-set-'));
    const s = new SettingsStore(dir);
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
    s.set({ terminalFontSize: 99, reduceMotion: true, claudePath: '  /x/claude ' });
    const again = new SettingsStore(dir).get();
    expect(again).toMatchObject({ terminalFontSize: 20, reduceMotion: true, claudePath: '/x/claude', notifications: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
