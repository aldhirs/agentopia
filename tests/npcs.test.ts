import { describe, expect, it } from 'vitest';
import { NPC_SPOTS, NPCS, dwellFor, nextSpot, NPC_DWELL } from '../src/office3d/npcs';
import { BEANBAGS, DESK_ANCHORS, FLOOR_ANCHORS, personFromAnchor, seatPose } from '../src/office3d/layout';
import { NavGrid } from '../src/office3d/nav';

describe('office staff spots', () => {
  const nav = new NavGrid();

  it('are free floor and every spot can be reached from every other one', () => {
    for (const s of NPC_SPOTS) expect(nav.isFree(s), s.id).toBe(true);
    for (const a of NPC_SPOTS) {
      for (const b of NPC_SPOTS) {
        if (a === b) continue;
        const route = nav.path(a, b);
        expect(route.at(-1), `${a.id} -> ${b.id}`).toMatchObject({ x: b.x, z: b.z });
      }
    }
  });

  it('keep clear of every agent seat and its stand spot', () => {
    const seats = [
      ...DESK_ANCHORS.map((_, i) => seatPose({ kind: 'desk', index: i })),
      ...FLOOR_ANCHORS.map((a) => ({ ...personFromAnchor(a), type: 'floor' as const })),
      ...BEANBAGS.map((_, i) => seatPose({ kind: 'bean', index: i })),
    ];
    for (const s of NPC_SPOTS) {
      for (const seat of seats) {
        expect(Math.hypot(s.x - seat.x, s.z - seat.z), s.id).toBeGreaterThan(1);
        const stand = nav.standPoint(seat);
        expect(Math.hypot(s.x - stand.x, s.z - stand.z), s.id).toBeGreaterThan(0.7);
      }
    }
  });

  it('start the staff on different spots', () => {
    expect(new Set(NPCS.map((n) => n.start)).size).toBe(NPCS.length);
    for (const n of NPCS) expect(NPC_SPOTS.some((s) => s.id === n.start)).toBe(true);
  });
});

describe('nextSpot', () => {
  it('never picks the current spot or one another staff member holds', () => {
    const taken = new Set(['coffee-2', 'window-1']);
    for (let i = 0; i < 50; i++) {
      const r = i / 50;
      const s = nextSpot('coffee-1', taken, () => r);
      expect(['coffee-1', 'coffee-2', 'window-1']).not.toContain(s.id);
    }
  });

  it('dwells within the configured range', () => {
    expect(dwellFor(() => 0)).toBe(NPC_DWELL[0]);
    expect(dwellFor(() => 0.999)).toBeLessThan(NPC_DWELL[1]);
  });
});
