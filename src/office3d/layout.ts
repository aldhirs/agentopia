// Seating plan of the 3D startup office (pure logic, no three.js).
// Working subagents take a pod desk, then a lesehan spot, then an extra floor cushion.
// Finished subagents move to a free bean bag. Seats are stable between updates.

export type SeatKind = 'desk' | 'floor' | 'bean' | 'extra';
export interface SeatRef { kind: SeatKind; index: number }
export interface SeatAgent { id: string; done: boolean }

/** World transform of a seat: the character sits at (x, z) facing rotY (0 = towards +z). */
export interface SeatPose { x: number; z: number; rotY: number; type: 'desk' | 'floor' | 'bean' }

/** Desk anchors are the desk centre; the person sits 0.75 behind it (see personFromAnchor). */
export interface Anchor { x: number; z: number; rotY: number }

export const LEAD_ANCHOR: Anchor = { x: 7.6, z: -4.4, rotY: 0 };
export const LESEHAN = { x: -6.3, z: 1.9 };
/** Bean bags stand in a conversation circle, facing its centre, with room to walk between them. */
export const BEAN_CIRCLE = { x: -1.0, z: 2.2, r: 1.45 };
export const BEANBAGS: Array<{ x: number; z: number; rotY: number; color: string }> = (
  [[Math.PI, '#F78154'], [Math.PI / 3, '#5DA9E9'], [-Math.PI / 3, '#4D9078']] as Array<[number, string]>
).map(([a, color]) => ({
  x: BEAN_CIRCLE.x + Math.sin(a) * BEAN_CIRCLE.r,
  z: BEAN_CIRCLE.z + Math.cos(a) * BEAN_CIRCLE.r,
  rotY: a + Math.PI,
  color,
}));

function pod(cx: number, cz: number): Anchor[] {
  return [
    { x: cx - 0.86, z: cz - 0.43, rotY: 0 },
    { x: cx + 0.86, z: cz - 0.43, rotY: 0 },
    { x: cx - 0.86, z: cz + 0.43, rotY: Math.PI },
    { x: cx + 0.86, z: cz + 0.43, rotY: Math.PI },
  ];
}
export const PODS = [{ x: -3.6, z: -2.7, name: 'Pod A' }, { x: 1.2, z: -2.7, name: 'Pod B' }];
export const DESK_ANCHORS: Anchor[] = PODS.flatMap((p) => pod(p.x, p.z));

/** Lesehan spots around the low table (two long sides, two short ends). */
export const FLOOR_ANCHORS: Anchor[] = [
  { x: LESEHAN.x, z: LESEHAN.z, rotY: 0 },
  { x: LESEHAN.x, z: LESEHAN.z, rotY: Math.PI },
  { x: LESEHAN.x - 0.45, z: LESEHAN.z, rotY: Math.PI / 2 },
  { x: LESEHAN.x + 0.45, z: LESEHAN.z, rotY: -Math.PI / 2 },
];

/** Extra floor cushions along the front of the office, used when every desk and lesehan spot is taken. */
export function extraAnchor(index: number): Anchor {
  const perRow = 12;
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  return { x: -9.4 + col * 1.5, z: 4.4 + 0.75 + row * 1.3, rotY: 0 };
}

export const CAPACITY = { desk: DESK_ANCHORS.length, floor: FLOOR_ANCHORS.length, bean: BEANBAGS.length };

/** Where the person sits for a given anchor (0.75 behind the anchor, facing it). */
export function personFromAnchor(a: Anchor): { x: number; z: number; rotY: number } {
  return { x: a.x - 0.75 * Math.sin(a.rotY), z: a.z - 0.75 * Math.cos(a.rotY), rotY: a.rotY };
}

export function seatPose(ref: SeatRef): SeatPose {
  if (ref.kind === 'bean') {
    const b = BEANBAGS[ref.index];
    return { x: b.x, z: b.z, rotY: b.rotY, type: 'bean' };
  }
  const anchor = ref.kind === 'desk' ? DESK_ANCHORS[ref.index] : ref.kind === 'floor' ? FLOOR_ANCHORS[ref.index] : extraAnchor(ref.index);
  const p = personFromAnchor(anchor);
  return { ...p, type: ref.kind === 'desk' ? 'desk' : 'floor' };
}

const key = (r: SeatRef) => `${r.kind}:${r.index}`;
const isWork = (r: SeatRef) => r.kind !== 'bean';

export function nextSeats3d(prev: Record<string, SeatRef>, agents: SeatAgent[]): Record<string, SeatRef> {
  const present = new Set(agents.map((a) => a.id));
  const seats: Record<string, SeatRef> = {};
  for (const [id, s] of Object.entries(prev)) if (present.has(id)) seats[id] = s;
  const used = new Set(Object.values(seats).map(key));

  const free = (kind: SeatKind, cap: number) => {
    for (let i = 0; i < cap; i++) if (!used.has(key({ kind, index: i }))) return { kind, index: i } as SeatRef;
    return null;
  };
  const freeWork = (): SeatRef => {
    const s = free('desk', CAPACITY.desk) ?? free('floor', CAPACITY.floor);
    if (s) return s;
    for (let i = 0; ; i++) if (!used.has(key({ kind: 'extra', index: i }))) return { kind: 'extra', index: i };
  };
  const take = (id: string, s: SeatRef) => {
    const old = seats[id];
    if (old) used.delete(key(old));
    seats[id] = s;
    used.add(key(s));
  };

  for (const a of agents) {
    const cur = seats[a.id];
    if (!cur) {
      take(a.id, a.done ? (free('bean', CAPACITY.bean) ?? freeWork()) : freeWork());
    } else if (a.done && isWork(cur)) {
      const bean = free('bean', CAPACITY.bean);
      if (bean) take(a.id, bean);
    } else if (!a.done && !isWork(cur)) {
      take(a.id, freeWork());
    }
  }
  return seats;
}
