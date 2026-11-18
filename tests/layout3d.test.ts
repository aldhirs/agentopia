import { describe, expect, it } from 'vitest';
import { CAPACITY, nextSeats3d, personFromAnchor, seatPose } from '../src/office3d/layout';

const ag = (id: string, done = false) => ({ id, done });

describe('3D seating', () => {
  it('fills pod desks first, then lesehan, then extra cushions', () => {
    const n = CAPACITY.desk + CAPACITY.floor + 2;
    const s = nextSeats3d({}, Array.from({ length: n }, (_, i) => ag(`a${i}`)));
    expect(s.a0).toEqual({ kind: 'desk', index: 0 });
    expect(s[`a${CAPACITY.desk - 1}`]).toEqual({ kind: 'desk', index: CAPACITY.desk - 1 });
    expect(s[`a${CAPACITY.desk}`]).toEqual({ kind: 'floor', index: 0 });
    expect(s[`a${n - 1}`]).toEqual({ kind: 'extra', index: 1 });
  });

  it('moves a finished agent to a bean bag and frees its desk for the next one', () => {
    const s1 = nextSeats3d({}, [ag('a'), ag('b')]);
    const s2 = nextSeats3d(s1, [ag('a', true), ag('b'), ag('c')]);
    expect(s2.a).toEqual({ kind: 'bean', index: 0 });
    expect(s2.b).toEqual({ kind: 'desk', index: 1 });
    expect(s2.c).toEqual({ kind: 'desk', index: 0 });
  });

  it('keeps a finished agent at its desk when all bean bags are taken', () => {
    let s = nextSeats3d({}, ['a', 'b', 'c', 'd'].map((id) => ag(id)));
    s = nextSeats3d(s, ['a', 'b', 'c', 'd'].map((id) => ag(id, true)));
    expect(Object.values(s).filter((x) => x.kind === 'bean')).toHaveLength(CAPACITY.bean);
    expect(s.d.kind).toBe('desk');
  });

  it('sends an agent that starts working again back to a work seat', () => {
    let s = nextSeats3d({}, [ag('a', true)]);
    expect(s.a.kind).toBe('bean');
    s = nextSeats3d(s, [ag('a')]);
    expect(s.a.kind).toBe('desk');
  });

  it('is stable when nothing changes', () => {
    const s1 = nextSeats3d({}, [ag('a'), ag('b', true)]);
    expect(nextSeats3d(s1, [ag('a'), ag('b', true)])).toEqual(s1);
  });

  it('places people behind their desk, facing it', () => {
    expect(personFromAnchor({ x: 0, z: 0, rotY: 0 })).toEqual({ x: 0, z: -0.75, rotY: 0 });
    const back = personFromAnchor({ x: 0, z: 0, rotY: Math.PI });
    expect(back.z).toBeCloseTo(0.75);
    expect(seatPose({ kind: 'bean', index: 0 }).type).toBe('bean');
  });
});
