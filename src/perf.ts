// Performance harness for the 3D office (not shipped in the app).
// Loads N synthetic subagents that keep changing status, then measures frame times.
// URL params: n (subagents, default 8), seconds (measure window, default 10), reduce=1.
import type { AgentState, AgentStatus, OfficeState } from '../shared/types';
import { OfficeEngine } from './office3d/engine';

const params = new URLSearchParams(location.search);
const n = Number(params.get('n') ?? 8);
const seconds = Number(params.get('seconds') ?? 10);
const reduce = params.get('reduce') === '1';

const TYPES = ['backend-engineer', 'frontend-engineer', 'qa-engineer', 'security-engineer', 'product-designer', 'Explore', 'Plan', 'general-purpose'];
const CYCLE: AgentStatus[] = ['thinking', 'tool_use', 'tool_use', 'waiting', 'tool_use', 'error', 'thinking', 'done'];

function agent(id: string, i: number, status: AgentStatus): AgentState {
  return { id, kind: id === 'lead' ? 'lead' : 'subagent', type: id === 'lead' ? 'lead' : TYPES[i % TYPES.length], label: id === 'lead' ? 'Lead' : `Agent ${i + 1}`, status, startedAt: 0, updatedAt: 0, log: [] };
}

function stateAt(tick: number): OfficeState {
  const agents: Record<string, AgentState> = { lead: agent('lead', 0, 'waiting_subagents') };
  const order = ['lead'];
  for (let i = 0; i < n; i++) {
    const id = `a${i}`;
    agents[id] = agent(id, i, CYCLE[(i + tick) % CYCLE.length]);
    order.push(id);
  }
  return { sessionId: 'perf', agents, order, ended: false };
}

const canvas = document.getElementById('c') as HTMLCanvasElement;

// Leak check: create, use and dispose the engine repeatedly (like entering/leaving an office).
if (params.get('mode') === 'leak') {
  const w = window as unknown as { __perfResult?: unknown; gc?: () => void };
  const cycles = Number(params.get('cycles') ?? 15);
  const heap = () => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576;
  const samples: Array<{ cycle: number; heapMB: number; geometries: number; textures: number }> = [];
  (async () => {
    for (let c = 0; c < cycles; c++) {
      const cv = document.createElement('canvas');
      cv.width = 1440; cv.height = 900;
      document.body.appendChild(cv);
      const e = new OfficeEngine(cv);
      e.resize(1440, 900);
      for (let t = 0; t < 4; t++) e.sync(stateAt(t));
      e.start();
      await new Promise((r) => setTimeout(r, 400));
      const st = e.stats();
      e.dispose();
      cv.remove();
      w.gc?.();
      await new Promise((r) => setTimeout(r, 100));
      samples.push({ cycle: c, heapMB: Math.round(heap() * 10) / 10, geometries: st.geometries, textures: st.textures });
    }
    w.__perfResult = { mode: 'leak', cycles, samples };
  })();
} else if (params.get('mode') === 'visual') {
  // Manual/visual check of walking and sitting: scripts/visual-walk.cjs drives window.__vis.
  const e = new OfficeEngine(canvas);
  e.resize(window.innerWidth, window.innerHeight);
  const statuses: Record<string, AgentStatus> = {};
  (window as unknown as { __vis: unknown }).__vis = {
    set(list: Array<[string, AgentStatus]>) {
      for (const [id, st] of list) statuses[id] = st;
      const agents: Record<string, AgentState> = { lead: agent('lead', 0, 'waiting_subagents') };
      const order = ['lead'];
      Object.entries(statuses).forEach(([id, st], i) => { agents[id] = agent(id, i, st); order.push(id); });
      e.sync({ sessionId: 'vis', agents, order, ended: false });
    },
    view(angle: number, zoomSteps: number) { e.resetView(); e.rotate(-angle / 0.006); e.zoom(zoomSteps); },
  };
  e.start();
} else {
  runFrameBenchmark();
}

function runFrameBenchmark() {
const engine = new OfficeEngine(canvas, { reduceMotion: reduce });
engine.resize(window.innerWidth, window.innerHeight);
let tick = 0;
engine.sync(stateAt(tick));
engine.start();

const status = setInterval(() => {
  tick++;
  engine.sync(stateAt(tick));
  // A couple of task/report flights per tick, like a busy lead.
  engine.effects([
    { type: 'dispatch', from: 'lead', to: `a${tick % n}`, at: 0 },
    { type: 'report', from: `a${(tick + 3) % n}`, to: 'lead', at: 0 },
  ]);
}, 2000);

const frames: number[] = [];
let last = 0;
let measuring = false;
const onFrame = (t: number) => {
  if (measuring && last) frames.push(t - last);
  last = t;
  requestAnimationFrame(onFrame);
};
requestAnimationFrame(onFrame);

const w = window as unknown as { __perfResult?: unknown };
setTimeout(() => { measuring = true; }, 3000); // warm-up: shader compile, textures
setTimeout(() => {
  measuring = false;
  clearInterval(status);
  const sorted = [...frames].sort((a, b) => a - b);
  const avg = frames.reduce((s, x) => s + x, 0) / Math.max(1, frames.length);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  w.__perfResult = {
    n, reduce, seconds, frames: frames.length,
    fps: Math.round((1000 / avg) * 10) / 10,
    avgMs: Math.round(avg * 100) / 100,
    p95Ms: Math.round(pct(0.95) * 100) / 100,
    p99Ms: Math.round(pct(0.99) * 100) / 100,
    longFrames: frames.filter((f) => f > 33.4).length,
    jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    engine: engine.stats(),
    dpr: window.devicePixelRatio,
    size: `${window.innerWidth}x${window.innerHeight}`,
  };
}, 3000 + seconds * 1000);
}
