// Walkable map of the 3D office and A* paths between seats (pure logic, no three.js).
// Furniture footprints mirror environment.ts; they are inflated by the body radius so a
// walking character never clips through a desk, bean bag, table or plant.
import {
  BEANBAGS, DESK_ANCHORS, FLOOR_ANCHORS, LEAD_ANCHOR, LEAD_ROOM, LESEHAN, extraAnchor, personFromAnchor,
  type Anchor, type SeatPose,
} from './layout';

export interface P2 { x: number; z: number }

type Shape =
  | { kind: 'rect'; x: number; z: number; w: number; d: number; rotY: number } // w along local x, d along local z
  | { kind: 'circle'; x: number; z: number; r: number };

const BODY_R = 0.3;
const CELL = 0.2;
const BOUNDS = { x0: -10.9, x1: 10.9, z0: -6.4, z1: 9 };

/** Desk table + chair of a desk anchor, in world space. */
function deskShapes(a: Anchor, wide = false): Shape[] {
  const w = wide ? 2.1 : 1.7;
  const local = (lx: number, lz: number) => ({
    x: a.x + lx * Math.cos(a.rotY) + lz * Math.sin(a.rotY),
    z: a.z - lx * Math.sin(a.rotY) + lz * Math.cos(a.rotY),
  });
  const shapes: Shape[] = [
    { kind: 'rect', ...local(0, 0), w, d: 0.85, rotY: a.rotY },
    { kind: 'rect', ...local(0, -0.88), w: 0.62, d: 0.66, rotY: a.rotY }, // chair + backrest
  ];
  if (wide) shapes.push({ kind: 'rect', ...local(w / 2 + 0.375, -0.3), w: 0.75, d: 1.5, rotY: a.rotY });
  return shapes;
}

export function staticObstacles(): Shape[] {
  const s: Shape[] = [];
  for (const a of DESK_ANCHORS) s.push(...deskShapes(a));
  s.push(...deskShapes(LEAD_ANCHOR, true));
  // Glass walls of the lead office (no seats inside it besides the lead's own).
  s.push({ kind: 'rect', x: 5.1, z: -4.9, w: 0.1, d: 3.2, rotY: 0 });
  s.push({ kind: 'rect', x: 7.75, z: -2.4, w: 5.3, d: 0.1, rotY: 0 });
  // Bookshelf and server rack inside the lead office.
  for (const f of [LEAD_ROOM.shelf, LEAD_ROOM.rack]) s.push({ kind: 'rect', x: f.x, z: f.z, w: f.w, d: f.d, rotY: 0 });
  // Lesehan low table, and the cushions of its seats.
  s.push({ kind: 'rect', x: LESEHAN.x, z: LESEHAN.z, w: 1.9, d: 1.0, rotY: 0 });
  for (const a of FLOOR_ANCHORS) s.push({ kind: 'circle', ...personFromAnchor(a), r: 0.3 });
  for (const b of BEANBAGS) s.push({ kind: 'circle', x: b.x, z: b.z, r: 0.62 });
  // Billiard table, coffee bar + stools, plants.
  s.push({ kind: 'rect', x: 5.9, z: 1.5, w: 2.8, d: 1.6, rotY: 0 });
  s.push({ kind: 'rect', x: -10.55, z: -3.9, w: 0.85, d: 3.3, rotY: 0 });
  for (const z of [-4.8, -3.9, -3.0]) s.push({ kind: 'circle', x: -9.7, z, r: 0.22 });
  for (const [x, z] of PLANTS) s.push({ kind: 'circle', x, z, r: 0.45 });
  return s;
}

export const PLANTS: Array<[number, number]> = [[-10.3, -5.9], [4.4, -5.9], [10.2, -1.6], [-10.2, 3.6], [10.2, 3.6], [-7.6, -5.9], [3.2, 3.6], [-8.4, 3.4]];

/** Laptop + cushion of an extra floor spot (only present while someone uses it). */
export function extraShapes(index: number): Shape[] {
  const a = extraAnchor(index);
  return [{ kind: 'rect', x: a.x, z: a.z, w: 0.55, d: 0.45, rotY: a.rotY }, { kind: 'circle', ...personFromAnchor(a), r: 0.3 }];
}

function inside(shape: Shape, x: number, z: number, pad: number): boolean {
  if (shape.kind === 'circle') return Math.hypot(x - shape.x, z - shape.z) <= shape.r + pad;
  const dx = x - shape.x, dz = z - shape.z;
  const c = Math.cos(shape.rotY), s = Math.sin(shape.rotY);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= shape.w / 2 + pad && Math.abs(lz) <= shape.d / 2 + pad;
}

/**
 * Where a character stands before sitting down / after getting up, in order of preference:
 * beside a desk chair, in front of a bean bag (it has a backrest), behind a floor cushion.
 */
export function standCandidates(seat: Pick<SeatPose, 'x' | 'z' | 'rotY' | 'type'>): P2[] {
  const fx = Math.sin(seat.rotY), fz = Math.cos(seat.rotY); // forward
  const rx = Math.cos(seat.rotY), rz = -Math.sin(seat.rotY); // right
  const at = (lat: number, fwd: number) => ({ x: seat.x + rx * lat + fx * fwd, z: seat.z + rz * lat + fz * fwd });
  // Bean bags stand in a cluster facing each other, so also try a bit to either side of the front.
  if (seat.type === 'bean') return [0, 0.6, -0.6, 1.1, -1.1].map((a) => at(Math.sin(a) * 0.95, Math.cos(a) * 0.95));
  if (seat.type === 'floor') return [at(0, -0.62), at(0.62, 0), at(-0.62, 0)];
  return [at(0.68, -0.12), at(-0.68, -0.12), at(0, -0.75)];
}

export class NavGrid {
  readonly cols = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CELL);
  readonly rows = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CELL);
  private base: Uint8Array;
  private blocked: Uint8Array;
  private extras = new Set<number>();

  constructor(shapes: Shape[] = staticObstacles()) {
    this.base = new Uint8Array(this.cols * this.rows);
    this.stamp(this.base, shapes);
    this.blocked = this.base.slice();
  }

  /** Marks the extra floor spots that currently exist (their laptops become obstacles). */
  setExtras(indices: Iterable<number>) {
    const next = new Set(indices);
    if (next.size === this.extras.size && [...next].every((i) => this.extras.has(i))) return;
    this.extras = next;
    this.blocked = this.base.slice();
    this.stamp(this.blocked, [...next].flatMap(extraShapes));
  }

  private stamp(grid: Uint8Array, shapes: Shape[]) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, z } = this.center(c, r);
        if (shapes.some((sh) => inside(sh, x, z, BODY_R))) grid[r * this.cols + c] = 1;
      }
    }
  }

  center(c: number, r: number): P2 { return { x: BOUNDS.x0 + (c + 0.5) * CELL, z: BOUNDS.z0 + (r + 0.5) * CELL }; }
  cellOf(p: P2): [number, number] {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - BOUNDS.x0) / CELL)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - BOUNDS.z0) / CELL)));
    return [c, r];
  }
  /** First free stand spot of a seat. */
  standPoint(seat: Pick<SeatPose, 'x' | 'z' | 'rotY' | 'type'>): P2 {
    const c = standCandidates(seat);
    return c.find((p) => this.isFree(p)) ?? c[0];
  }

  isFree(p: P2): boolean {
    const [c, r] = this.cellOf(p);
    return !this.blocked[r * this.cols + c];
  }

  /** Nearest walkable cell to p (breadth-first). */
  private nearestFree(c0: number, r0: number): number {
    const start = r0 * this.cols + c0;
    if (!this.blocked[start]) return start;
    const seen = new Uint8Array(this.cols * this.rows);
    const queue = [start];
    seen[start] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi];
      if (!this.blocked[i]) return i;
      const c = i % this.cols, r = (i / this.cols) | 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (!seen[ni]) { seen[ni] = 1; queue.push(ni); }
      }
    }
    return start;
  }

  /** Straight line between two points stays on walkable cells. */
  clear(a: P2, b: P2): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      if (!this.isFree({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  /** Walkable path from a to b (A*, 8-connected, no corner cutting), smoothed to few waypoints. */
  path(a: P2, b: P2): P2[] {
    const [ac, ar] = this.cellOf(a);
    const [bc, br] = this.cellOf(b);
    const start = this.nearestFree(ac, ar);
    const goal = this.nearestFree(bc, br);
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gc = goal % this.cols, gr = (goal / this.cols) | 0;
    const h = (i: number) => {
      const dc = Math.abs((i % this.cols) - gc), dr = Math.abs(((i / this.cols) | 0) - gr);
      return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
    };
    const open = new MinHeap();
    g[start] = 0;
    open.push(start, h(start));
    while (open.size) {
      const i = open.pop();
      if (i === goal) break;
      if (closed[i]) continue;
      closed[i] = 1;
      const c = i % this.cols, r = (i / this.cols) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const ni = nr * this.cols + nc;
          if (this.blocked[ni] || closed[ni]) continue;
          if (dc && dr && (this.blocked[r * this.cols + nc] || this.blocked[nr * this.cols + c])) continue;
          const ng = g[i] + (dc && dr ? Math.SQRT2 : 1);
          if (ng < g[ni]) { g[ni] = ng; came[ni] = i; open.push(ni, ng + h(ni)); }
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return [a, b]; // unreachable: fall back to a straight walk
    const cells: P2[] = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(this.center(i % this.cols, (i / this.cols) | 0));
    cells.reverse();
    const raw = [a, ...cells.slice(1, -1), b];
    // String pulling: keep only the waypoints needed to go around obstacles.
    const out: P2[] = [raw[0]];
    let k = 0;
    while (k < raw.length - 1) {
      let j = raw.length - 1;
      while (j > k + 1 && !this.clear(raw[k], raw[j])) j--;
      out.push(raw[j]);
      k = j;
    }
    return out;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, key: number) {
    this.ids.push(id); this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!, lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId; this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
