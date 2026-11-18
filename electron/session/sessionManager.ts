// Starts, tracks and stops `claude` processes (one pty per session) and feeds
// their hook events into the office state.
import crypto from 'node:crypto';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import * as pty from 'node-pty';
import type {
  HistoryEntry, HookPayload, HookRecord, OfficeEffect, OfficeState, SessionInfo, StartSessionOptions,
} from '../../shared/types';
import { buildClaudeArgs } from '../../shared/claudeArgs';
import type { HistoryStore } from '../state/history';
import { HookReceiver, hookSettings, TOKEN_ENV } from '../hooks/hookReceiver';
import { createMemo, createOfficeState, reduce, type ReducerMemo } from '../state/reducer';
import { claudeEnv } from './shellEnv';
import { locateClaude } from './claudeLocator';

interface Live {
  info: SessionInfo;
  proc?: pty.IPty;
  state: OfficeState;
  memo: ReducerMemo;
  /** Tail of the terminal output, replayed when a terminal view is (re)opened. */
  buffer: string;
  hooks: HookRecord[];
  /** Row in the persistent history this run belongs to (the same row across resumes). */
  historyId: string;
}

const BUFFER_LIMIT = 2_000_000;
const HOOK_LIMIT = 3000;

export interface SessionManagerEvents {
  data: [id: string, data: string];
  state: [state: OfficeState];
  effects: [sessionId: string, effects: OfficeEffect[]];
  hook: [record: HookRecord];
  sessions: [sessions: SessionInfo[]];
  history: [entries: HistoryEntry[]];
}

export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private sessions = new Map<string, Live>();

  constructor(private hooks: HookReceiver, private history?: HistoryStore) {
    super();
    hooks.on('hook', (sessionId: string, payload: HookPayload) => this.onHook(sessionId, payload));
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => s.info).sort((a, b) => b.startedAt - a.startedAt);
  }

  getState(id: string): OfficeState | null {
    return this.sessions.get(id)?.state ?? null;
  }

  getBuffer(id: string): string {
    return this.sessions.get(id)?.buffer ?? '';
  }

  getHooks(id: string): HookRecord[] {
    return this.sessions.get(id)?.hooks ?? [];
  }

  /** Continue a previous conversation (`claude --resume`) in its original folder. */
  async resume(historyId: string): Promise<SessionInfo> {
    const entry = this.history?.get(historyId);
    if (!entry) throw new Error('Sesi tidak ditemukan di riwayat');
    if (!entry.claudeSessionId) throw new Error('Sesi ini belum punya ID Claude Code, jadi tidak bisa dilanjutkan');
    const running = [...this.sessions.values()].find((l) => l.historyId === historyId && l.proc);
    if (running) return running.info;
    return this.start({
      cwd: entry.cwd,
      name: entry.name,
      permissionMode: entry.permissionMode === 'inherit' ? undefined : entry.permissionMode,
      model: entry.model,
      resumeId: entry.claudeSessionId,
    }, historyId);
  }

  async start(opts: StartSessionOptions, historyId?: string): Promise<SessionInfo> {
    const claude = await locateClaude();
    if (!claude.found || !claude.path) throw new Error(claude.error ?? 'Claude Code tidak ditemukan');
    if (!opts.cwd) throw new Error('Folder project wajib diisi');

    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    await this.hooks.start();
    this.hooks.register(id, token);

    const args = ['--settings', hookSettings(this.hooks.urlFor(id)), ...buildClaudeArgs(opts)];

    const now = Date.now();
    const info: SessionInfo = {
      id,
      name: opts.name?.trim() || path.basename(opts.cwd),
      cwd: opts.cwd,
      permissionMode: opts.permissionMode ?? 'inherit',
      model: opts.model,
      status: 'running',
      startedAt: now,
      claudeSessionId: opts.resumeId,
      historyId: historyId ?? id,
    };
    const live: Live = {
      info, state: createOfficeState(id, now), memo: createMemo(), buffer: '', hooks: [], historyId: historyId ?? id,
    };
    this.sessions.set(id, live);
    if (historyId) {
      this.history?.patch(historyId, { endedAt: undefined, lastActiveAt: now });
    } else {
      this.history?.upsert({
        id, name: info.name, cwd: opts.cwd, permissionMode: info.permissionMode, model: opts.model,
        worktree: opts.worktree, startedAt: now, lastActiveAt: now, subagentTypes: [],
      });
    }
    this.emitHistory();

    const proc = pty.spawn(claude.path, args, {
      name: 'xterm-256color',
      cols: opts.cols ?? 120,
      rows: opts.rows ?? 32,
      cwd: opts.cwd,
      env: await claudeEnv({ [TOKEN_ENV]: token }),
    });
    live.proc = proc;
    proc.onData((d) => {
      live.buffer += d;
      if (live.buffer.length > BUFFER_LIMIT) live.buffer = live.buffer.slice(-BUFFER_LIMIT / 2);
      this.emit('data', id, d);
    });
    proc.onExit(({ exitCode }) => {
      live.info = { ...live.info, status: 'exited', exitCode };
      live.proc = undefined;
      this.hooks.unregister(id);
      this.applyHook(live, { hook_event_name: 'SessionEnd' });
      this.history?.patch(live.historyId, { endedAt: Date.now() });
      this.emitHistory();
      this.emitSessions();
    });

    this.emitSessions();
    this.emit('state', live.state);
    return info;
  }

  write(id: string, data: string) { this.sessions.get(id)?.proc?.write(data); }

  resize(id: string, cols: number, rows: number) {
    const proc = this.sessions.get(id)?.proc;
    if (proc && cols > 0 && rows > 0) proc.resize(Math.floor(cols), Math.floor(rows));
  }

  async stop(id: string): Promise<void> {
    const live = this.sessions.get(id);
    if (!live?.proc) return;
    const proc = live.proc;
    proc.write('\x03'); // Ctrl-C interrupts a running turn
    await new Promise((r) => setTimeout(r, 300));
    proc.write('/exit\r');
    await new Promise((r) => setTimeout(r, 2000));
    if (live.proc) proc.kill();
  }

  stopAll() {
    for (const live of this.sessions.values()) live.proc?.kill();
  }

  private onHook(sessionId: string, payload: HookPayload) {
    const live = this.sessions.get(sessionId);
    if (!live) return;
    const record: HookRecord = { sessionId, at: Date.now(), payload };
    live.hooks.push(record);
    if (live.hooks.length > HOOK_LIMIT) live.hooks.splice(0, live.hooks.length - HOOK_LIMIT);
    this.emit('hook', record);
    if (payload.session_id && !live.info.claudeSessionId) {
      live.info = { ...live.info, claudeSessionId: payload.session_id };
      this.emitSessions();
    }
    this.applyHook(live, payload);
    this.recordHistory(live, payload);
  }

  private recordHistory(live: Live, p: HookPayload) {
    if (!this.history) return;
    const entry = this.history.get(live.historyId);
    if (!entry) return;
    const patch: Partial<HistoryEntry> = { lastActiveAt: Date.now() };
    if (p.session_id && entry.claudeSessionId !== p.session_id) patch.claudeSessionId = p.session_id;
    if (p.hook_event_name === 'SubagentStart' && p.agent_type) patch.subagentTypes = [...entry.subagentTypes, p.agent_type];
    if (p.hook_event_name === 'Stop' && !p.agent_id && p.last_assistant_message) {
      patch.lastActivity = p.last_assistant_message.replace(/\s+/g, ' ').slice(0, 160);
    }
    this.history.patch(live.historyId, patch);
    if (patch.claudeSessionId || patch.subagentTypes || patch.lastActivity) this.emitHistory();
  }

  private emitHistory() {
    if (this.history) this.emit('history', this.history.list());
  }

  private applyHook(live: Live, payload: HookPayload) {
    const { state, effects } = reduce(live.state, live.memo, payload, Date.now());
    if (state !== live.state) {
      live.state = state;
      this.emit('state', state);
    }
    if (effects.length) this.emit('effects', live.info.id, effects);
  }

  private emitSessions() { this.emit('sessions', this.list()); }
}
