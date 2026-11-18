// Walking paths in the 3D office never cross furniture, and every seat can be reached.
import { describe, expect, it } from 'vitest';
import { BEANBAGS, CAPACITY, seatPose, type SeatRef } from '../src/office3d/layout';
import { NavGrid, staticObstacles, type P2 } from '../src/office3d/nav';

const grid = new NavGrid(staticObstacles());
const seats: SeatRef[] = [
  ...Array.from({ length: CAPACITY.desk }, (_, i) => ({ kind: 'desk' as const, index: i })),
  ...Array.from({ length: CAPACITY.floor }, (_, i) => ({ kind: 'floor' as const, index: i })),
  ...Array.from({ length: CAPACITY.bean }, (_, i) => ({ kind: 'bean' as const, index: i })),
  ...Array.from({ length: 14 }, (_, i) => ({ kind: 'extra' as const, index: i })),
];

function walkable(path: P2[]) {
  for (let i = 1; i < path.length; i++) if (!grid.clear(path[i - 1], path[i])) return false;
  return true;
}

describe('office navigation', () => {
  it('finds an obstacle-free path between every pair of seats', () => {
    let checked = 0;
    for (const a of seats) {
      for (const b of seats) {
        if (a === b) continue;
        const from = grid.standPoint(seatPose(a)), to = grid.standPoint(seatPose(b));
        const path = grid.path(from, to);
        expect(walkable(path), `${a.kind}${a.index}→${b.kind}${b.index}`).toBe(true);
        expect(path.length).toBeGreaterThanOrEqual(2);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('has a free stand spot next to every seat', () => {
    for (const s of seats) expect(grid.isFree(grid.standPoint(seatPose(s))), `${s.kind}${s.index}`).toBe(true);
  });

  it('walks around a bean bag instead of through it', () => {
    const b = BEANBAGS[0];
    const path = grid.path({ x: b.x - 1.5, z: b.z }, { x: b.x + 1.5, z: b.z });
    expect(path.length).toBeGreaterThan(2);
    for (let i = 1; i < path.length; i++) {
      const p = path[i - 1], q = path[i];
      for (let t = 0; t <= 1; t += 0.05) {
        const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
        expect(Math.hypot(x - b.x, z - b.z)).toBeGreaterThan(0.75);
      }
    }
  });

  it('keeps extra laptops as obstacles only while they exist', () => {
    const g = new NavGrid(staticObstacles());
    const spot = { x: -9.4, z: 5.15 };
    expect(g.isFree(spot)).toBe(true);
    g.setExtras([0]);
    expect(g.isFree(spot)).toBe(false);
    g.setExtras([]);
    expect(g.isFree(spot)).toBe(true);
  });
});
