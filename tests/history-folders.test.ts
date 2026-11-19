import { describe, expect, it } from 'vitest';
import { conversationKey, latestPerFolder } from '../shared/history';
import type { HistoryEntry } from '../shared/types';

const entry = (id: string, cwd: string, at: number): HistoryEntry =>
  ({ id, name: cwd.split('/').pop()!, cwd, permissionMode: 'inherit', startedAt: at, lastActiveAt: at, subagentTypes: [] }) as HistoryEntry;

describe('latestPerFolder', () => {
  const list = [
    entry('a1', '/p/alpha', 100),
    entry('b1', '/p/beta', 300),
    entry('a2', '/p/alpha', 500),
    entry('a3', '/p/alpha', 200),
  ];

  it('keeps only the newest conversation per folder, newest folder first', () => {
    expect(latestPerFolder(list, new Set()).map((h) => h.id)).toEqual(['a2', 'b1']);
  });

  it('leaves out folders that already have a running session', () => {
    expect(latestPerFolder(list, new Set([conversationKey({ cwd: '/p/alpha' })])).map((h) => h.id)).toEqual(['b1']);
  });

  it('respects the limit', () => {
    expect(latestPerFolder(list, new Set(), 1).map((h) => h.id)).toEqual(['a2']);
  });

  it('keeps a direct chat with an agent as its own row', () => {
    const chat = { ...entry('c1', '/p/alpha', 600), agent: 'copy-writer' };
    expect(latestPerFolder([...list, chat], new Set()).map((h) => h.id)).toEqual(['c1', 'a2', 'b1']);
    expect(latestPerFolder([...list, chat], new Set([conversationKey({ cwd: '/p/alpha' })])).map((h) => h.id)).toEqual(['c1', 'b1']);
  });
});
