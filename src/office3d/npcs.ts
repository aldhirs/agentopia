// Office staff (NPCs) who keep the office alive while the agents work: they get coffee, water the
// plants, shoot some billiard and look out of the window. They are decoration only: no name tag,
// not clickable, never on an agent seat. Pure logic, no three.js.
import type { Appearance } from './appearance';

/** What an NPC does once it stands at a spot. */
export type NpcActivity = 'sip' | 'water' | 'cue' | 'look' | 'chat';

export interface NpcSpot { id: string; x: number; z: number; rotY: number; activity: NpcActivity }

/** Spots away from the desks, lesehan and bean bags, so staff never stand where agents sit or walk to. */
export const NPC_SPOTS: NpcSpot[] = [
  { id: 'coffee-1', x: -9.05, z: -4.35, rotY: -Math.PI / 2, activity: 'sip' },
  { id: 'coffee-2', x: -9.05, z: -3.45, rotY: -Math.PI / 2, activity: 'sip' },
  { id: 'billiard-cue', x: 4.05, z: 1.6, rotY: Math.PI / 2, activity: 'cue' },
  { id: 'billiard-watch', x: 5.9, z: 2.75, rotY: Math.PI, activity: 'chat' },
  { id: 'plant-back', x: -7.6, z: -4.75, rotY: Math.PI, activity: 'water' },
  { id: 'plant-right', x: 9.05, z: -1.6, rotY: Math.PI / 2, activity: 'water' },
  { id: 'plant-front', x: 3.2, z: 2.45, rotY: 0, activity: 'water' },
  { id: 'window-1', x: 1.6, z: -5.75, rotY: Math.PI, activity: 'look' },
  { id: 'window-2', x: 3.4, z: -5.6, rotY: Math.PI, activity: 'look' },
  { id: 'notes', x: -10.2, z: 0.6, rotY: -Math.PI / 2, activity: 'look' },
];

export interface NpcDef { id: string; look: Appearance; start: string }

const person = (shirt: string, skin: string, hair: string, style: Appearance['style'], glasses = false): Appearance =>
  ({ robot: false, shirt, skin, hair, style, glasses, headset: false });

export const NPCS: NpcDef[] = [
  { id: 'npc:1', look: person('#E9C46A', '#C68A62', '#2B2420', 'bun'), start: 'coffee-1' },
  { id: 'npc:2', look: person('#7A9E7E', '#8D5A3B', '#1C1714', 'short', true), start: 'billiard-cue' },
  { id: 'npc:3', look: person('#D98E73', '#F1C7A5', '#4A2E1E', 'long'), start: 'window-1' },
];

/** How long an NPC stays at a spot (ms). */
export const NPC_DWELL: [number, number] = [14_000, 32_000];

export function dwellFor(rand: () => number): number {
  return NPC_DWELL[0] + rand() * (NPC_DWELL[1] - NPC_DWELL[0]);
}

/** Next spot for an NPC: any spot nobody else is at or heading to, and not the one it is leaving. */
export function nextSpot(current: string | null, taken: Set<string>, rand: () => number): NpcSpot {
  const open = NPC_SPOTS.filter((s) => s.id !== current && !taken.has(s.id));
  const pool = open.length ? open : NPC_SPOTS.filter((s) => s.id !== current);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

export const spotById = (id: string): NpcSpot => NPC_SPOTS.find((s) => s.id === id) ?? NPC_SPOTS[0];
