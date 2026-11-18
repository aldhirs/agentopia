import { describe, expect, it } from 'vitest';
import { nextSeats, worldHeight } from '../src/lib/seats';

const ag = (id: string, done = false) => ({ id, done });

describe('nextSeats', () => {
  it('gives new subagents the next free desk in arrival order', () => {
    const s = nextSeats({}, [ag('a'), ag('b'), ag('c')]);
    expect(s).toEqual({ a: { area: 'desk', index: 0 }, b: { area: 'desk', index: 1 }, c: { area: 'desk', index: 2 } });
  });

  it('keeps existing seats stable when others finish or arrive', () => {
    const s1 = nextSeats({}, [ag('a'), ag('b')]);
    const s2 = nextSeats(s1, [ag('a', true), ag('b'), ag('c')]);
    expect(s2.a).toEqual({ area: 'desk', index: 0 });
    expect(s2.b).toEqual({ area: 'desk', index: 1 });
    expect(s2.c).toEqual({ area: 'desk', index: 2 });
  });

  it('moves the earliest finished subagent to the pantry when desks are full', () => {
    const s1 = nextSeats({}, [ag('a'), ag('b')], 2);
    const s2 = nextSeats(s1, [ag('a', true), ag('b', true), ag('c')], 2);
    expect(s2.a).toEqual({ area: 'pantry', index: 0 });
    expect(s2.b).toEqual({ area: 'desk', index: 1 });
    expect(s2.c).toEqual({ area: 'desk', index: 0 });
  });

  it('grows the office when every desk holds a working subagent', () => {
    const s1 = nextSeats({}, [ag('a'), ag('b')], 2);
    const s2 = nextSeats(s1, [ag('a'), ag('b'), ag('c')], 2);
    expect(s2.c).toEqual({ area: 'desk', index: 2 });
  });

  it('two instances of the same type are just two agents', () => {
    const s = nextSeats({}, [ag('explore-1'), ag('explore-2')]);
    expect(new Set(Object.values(s).map((x) => x.index)).size).toBe(2);
  });
});

describe('worldHeight', () => {
  it('stays at 900 for up to three rows and grows after', () => {
    expect(worldHeight(nextSeats({}, Array.from({ length: 12 }, (_, i) => ag(`a${i}`))))).toBe(900);
    expect(worldHeight(nextSeats({}, Array.from({ length: 13 }, (_, i) => ag(`a${i}`))))).toBeGreaterThan(900);
  });
});
