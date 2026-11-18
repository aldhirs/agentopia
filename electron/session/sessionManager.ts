// Starts, tracks and stops `claude` processes (one pty per session) and feeds
// their hook events into the office state.
import crypto from 'node:crypto';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import * as pty from 'node-pty';
import type {
  HookPayload, HookRecord, OfficeEffect, OfficeState, SessionInfo, StartSessionOptions,
} from '../../shared/types';
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
}

const BUFFER_LIMIT = 2_000_000;
const HOOK_LIMIT = 3000;

export interface SessionManagerEvents {
  data: [id: string, data: string];
  state: [state: OfficeState];
  effects: [sessionId: string, effects: OfficeEffect[]];
  hook: [record: HookRecord];
  sessions: [sessions: SessionInfo[]];
}

export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private sessions = new Map<string, Live>();

  constructor(private hooks: HookReceiver) {
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

  async start(opts: StartSessionOptions): Promise<SessionInfo> {
    const claude = await locateClaude();
    if (!claude.found || !claude.path) throw new Error(claude.error ?? 'Claude Code tidak ditemukan');
    if (!opts.cwd) throw new Error('Folder project wajib diisi');

    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    await this.hooks.start();
    this.hooks.register(id, token);

    const args: string[] = ['--settings', hookSettings(this.hooks.urlFor(id))];
    if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode);
    if (opts.model) args.push('--model', opts.model);
    if (opts.worktree) args.push('--worktree');
    if (opts.name?.trim()) args.push('--name', opts.name.trim());
    if (opts.resumeId) args.push('--resume', opts.resumeId);
    if (opts.prompt?.trim()) args.push(opts.prompt.trim());

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
    };
    const live: Live = { info, state: createOfficeState(id, now), memo: createMemo(), buffer: '', hooks: [] };
    this.sessions.set(id, live);

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
