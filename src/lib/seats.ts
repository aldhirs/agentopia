// Hot-desk seating: subagents get a desk when they show up and keep it (stable layout).
// When every desk is taken, the earliest finished subagent moves to the pantry to free one.
// If nobody can move, the office grows another row of desks.

export interface Seat { area: 'desk' | 'pantry'; index: number }
export interface SeatAgent { id: string; done: boolean }

export const DESK_COLS = 4;
export const DESK_CAPACITY = 12; // 3 rows fit the default floor

export function nextSeats(
  prev: Record<string, Seat>,
  agents: SeatAgent[],
  capacity = DESK_CAPACITY,
): Record<string, Seat> {
  const present = new Set(agents.map((a) => a.id));
  const seats: Record<string, Seat> = {};
  for (const [id, seat] of Object.entries(prev)) if (present.has(id)) seats[id] = { ...seat };

  const deskOwner = new Map<number, string>();
  let pantryCount = 0;
  for (const [id, s] of Object.entries(seats)) {
    if (s.area === 'desk') deskOwner.set(s.index, id);
    else pantryCount = Math.max(pantryCount, s.index + 1);
  }
  const doneIds = new Set(agents.filter((a) => a.done).map((a) => a.id));

  for (const a of agents) {
    if (seats[a.id]) continue;
    let desk = -1;
    for (let i = 0; i < capacity; i++) if (!deskOwner.has(i)) { desk = i; break; }
    if (desk < 0) {
      // Evict the earliest-arrived finished subagent that still sits at a desk.
      const evict = agents.find((x) => doneIds.has(x.id) && seats[x.id]?.area === 'desk');
      if (evict) {
        desk = seats[evict.id].index;
        seats[evict.id] = { area: 'pantry', index: pantryCount++ };
      } else {
        desk = Math.max(capacity - 1, ...deskOwner.keys()) + 1; // grow the office
      }
    }
    seats[a.id] = { area: 'desk', index: desk };
    deskOwner.set(desk, a.id);
  }
  return seats;
}

/** World (1440-wide floor) coordinates of a seat's center. */
export function seatPosition(seat: Seat): { x: number; y: number } {
  if (seat.area === 'desk') {
    const col = seat.index % DESK_COLS;
    const row = Math.floor(seat.index / DESK_COLS);
    return { x: 220 + col * 230, y: 380 + row * 180 };
  }
  const col = seat.index % 3;
  const row = Math.floor(seat.index / 3);
  return { x: 1110 + col * 100, y: 420 + row * 130 };
}

export function worldHeight(seats: Record<string, Seat>): number {
  const deskRows = Math.max(0, ...Object.values(seats).filter((s) => s.area === 'desk').map((s) => Math.floor(s.index / DESK_COLS) + 1));
  const pantryRows = Math.max(0, ...Object.values(seats).filter((s) => s.area === 'pantry').map((s) => Math.floor(s.index / 3) + 1));
  const deskBottom = 380 + (deskRows - 1) * 180 + 75; // desk unit reaches 75px below its center
  const pantryBottom = 420 + (pantryRows - 1) * 130 + 90;
  return Math.max(900, deskBottom + 85, pantryBottom + 85);
}
