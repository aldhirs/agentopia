// Where the Lead goes in its office, from what it is actually doing (pure logic, no three.js).
// Reading code -> bookshelf, running commands -> server rack, planning todos -> board,
// web lookups -> phone at the glass front, waiting for you -> waves at the glass front,
// editing / thinking / done -> desk. A little hysteresis keeps it from pacing back and forth.
import type { AgentStatus } from '../../shared/types';

export type LeadSpot = 'desk' | 'shelf' | 'rack' | 'board' | 'front' | 'phone';

const READ = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'LSP']);
const RUN = new Set(['Bash', 'BashOutput', 'KillShell', 'KillBash', 'Monitor', 'PowerShell']);
const WEB = new Set(['WebSearch', 'WebFetch']);
const PLAN = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'ExitPlanMode', 'EnterPlanMode']);

/** The spot a tool call belongs to; null = no preference (stay where you are or go to the desk). */
export function spotForTool(tool: string | undefined): LeadSpot | null {
  if (!tool) return null;
  if (READ.has(tool)) return 'shelf';
  if (RUN.has(tool)) return 'rack';
  if (WEB.has(tool) || /browser|chrome|fetch|search/i.test(tool)) return 'phone';
  if (PLAN.has(tool)) return 'board';
  return 'desk'; // Edit, Write, Agent, MCP tools…
}

/** How long the Lead lingers at a station after a tool finishes (more of the same usually follows). */
export const LINGER_MS = 7000;
/** Minimum time at a spot before walking somewhere else (avoids ping-pong on quick tool bursts). */
export const MIN_DWELL_MS = 2500;

export interface LeadPlanState { spot: LeadSpot; since: number; lastToolAt: number }
export const initialLeadPlan = (now = 0): LeadPlanState => ({ spot: 'desk', since: now, lastToolAt: 0 });

export interface LeadPlanResult {
  plan: LeadPlanState;
  /** When to evaluate again (a linger or dwell is pending), or null. */
  recheckAt: number | null;
}

/** Spot the Lead should be at right now, ignoring dwell time. */
export function wantedSpot(status: AgentStatus, tool: string | undefined, plan: LeadPlanState, now: number): LeadSpot {
  if (status === 'waiting_user') return 'front';
  if (status === 'tool_use') return spotForTool(tool) ?? plan.spot;
  // Permission prompts and errors are about the tool at hand: stay put.
  if (status === 'waiting' || status === 'error') return plan.spot;
  if (status === 'thinking' && plan.spot !== 'desk' && plan.spot !== 'front' && now - plan.lastToolAt < LINGER_MS) return plan.spot;
  return 'desk';
}

export function planLead(status: AgentStatus, tool: string | undefined, prev: LeadPlanState, now: number): LeadPlanResult {
  const plan = { ...prev };
  if (status === 'tool_use') plan.lastToolAt = now;
  const want = wantedSpot(status, tool, plan, now);
  let recheckAt: number | null = null;
  if (want !== plan.spot) {
    const readyAt = plan.since + MIN_DWELL_MS;
    // Waiting for the user is worth reacting to at once; everything else respects the dwell time.
    if (now >= readyAt || want === 'front') {
      plan.spot = want;
      plan.since = now;
    } else {
      recheckAt = readyAt;
    }
  }
  if (status === 'thinking' && plan.spot !== 'desk' && plan.spot !== 'front' && recheckAt === null) {
    recheckAt = plan.lastToolAt + LINGER_MS;
  }
  return { plan, recheckAt };
}
