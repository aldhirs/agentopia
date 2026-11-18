// Renderer-side store: mirrors sessions, office state and hook history from the main process.
import { reactive } from 'vue';
import type { ClaudeInfo, HookRecord, OfficeEffect, OfficeState, SessionInfo } from '../../shared/types';

const api = window.office;
const HOOK_LIMIT = 3000;

type EffectListener = (sessionId: string, effects: OfficeEffect[]) => void;

export const office = reactive({
  claude: null as ClaudeInfo | null,
  sessions: [] as SessionInfo[],
  states: {} as Record<string, OfficeState>,
  hooks: {} as Record<string, HookRecord[]>,
  currentId: null as string | null,
});

const effectListeners = new Set<EffectListener>();
export function onEffects(cb: EffectListener) {
  effectListeners.add(cb);
  return () => effectListeners.delete(cb);
}

let started = false;
export async function initOffice() {
  if (started) return;
  started = true;
  api.onSessions((list) => { office.sessions = list; });
  api.onState((s) => { office.states[s.sessionId] = s; });
  api.onHook((r) => {
    const list = (office.hooks[r.sessionId] ??= []);
    list.push(r);
    if (list.length > HOOK_LIMIT) list.splice(0, list.length - HOOK_LIMIT);
  });
  api.onEffects((id, effects) => effectListeners.forEach((cb) => cb(id, effects)));
  const [claude, sessions] = await Promise.all([api.claudeInfo(), api.listSessions()]);
  office.claude = claude;
  office.sessions = sessions;
}

/** Enter a session's office: load its state and hook history if we don't have them yet. */
export async function openSession(id: string) {
  const [state, hooks] = await Promise.all([api.getState(id), api.getHooks(id)]);
  if (state) office.states[id] = state;
  office.hooks[id] = hooks;
  office.currentId = id;
}

export function leaveSession() {
  office.currentId = null;
}
