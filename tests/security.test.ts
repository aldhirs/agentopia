import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HookReceiver, hookSettings } from '../electron/hooks/hookReceiver';
import { IpcError, validateFolderArg, validateId, validatePtyData, validateSettingsPatch, validateSize, validateStartOptions } from '../electron/ipc/validate';
import { HistoryStore } from '../electron/state/history';
import { SettingsStore } from '../electron/state/settings';

function post(port: number, p: string, body: string, headers: Record<string, string> = {}, method = 'POST'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('HookReceiver (local HTTP endpoint)', () => {
  const hooks = new HookReceiver();
  const received: unknown[] = [];
  const TOKEN = 'a'.repeat(48);
  const body = JSON.stringify({ hook_event_name: 'Stop' });
  beforeAll(async () => {
    await hooks.start();
    hooks.register('s1', TOKEN);
    hooks.register('s2', 'b'.repeat(48));
    hooks.on('hook', (id, p) => received.push([id, p]));
  });
  afterAll(() => hooks.stop());

  it('listens on loopback only', () => {
    const addr = (hooks as unknown as { server: http.Server }).server.address() as { address: string };
    expect(addr.address).toBe('127.0.0.1');
  });

  it('accepts the correct token for the session', async () => {
    expect(await post(hooks.port, '/hook/s1', body, { authorization: `Bearer ${TOKEN}` })).toBe(200);
    expect(received).toHaveLength(1);
  });

  it('rejects a missing, wrong or other-session token', async () => {
    expect(await post(hooks.port, '/hook/s1', body)).toBe(401);
    expect(await post(hooks.port, '/hook/s1', body, { authorization: 'Bearer nope' })).toBe(401);
    expect(await post(hooks.port, '/hook/s1', body, { authorization: `Bearer ${'b'.repeat(48)}` })).toBe(401);
    expect(await post(hooks.port, '/hook/unknown', body, { authorization: `Bearer ${TOKEN}` })).toBe(401);
    expect(received).toHaveLength(1);
  });

  it('rejects browser requests (Origin header) even with the right token', async () => {
    expect(await post(hooks.port, '/hook/s1', body, { authorization: `Bearer ${TOKEN}`, origin: 'https://evil.example' })).toBe(401);
  });

  it('rejects a foreign Host header (DNS rebinding)', async () => {
    expect(await post(hooks.port, '/hook/s1', body, { authorization: `Bearer ${TOKEN}`, host: `evil.example:${hooks.port}` })).toBe(401);
  });

  it('rejects other methods and paths', async () => {
    expect(await post(hooks.port, '/hook/s1', '', { authorization: `Bearer ${TOKEN}` }, 'GET')).toBe(401);
    expect(await post(hooks.port, '/hook/../s1', body, { authorization: `Bearer ${TOKEN}` })).toBe(401);
    expect(await post(hooks.port, '/other', body, { authorization: `Bearer ${TOKEN}` })).toBe(401);
  });

  it('caps the body size and ignores malformed JSON', async () => {
    const before = received.length;
    const big = JSON.stringify({ hook_event_name: 'Stop', pad: 'x'.repeat(3 * 1024 * 1024) });
    const code = await post(hooks.port, '/hook/s1', big, { authorization: `Bearer ${TOKEN}` }).catch(() => 413);
    expect(code).toBe(413);
    expect(await post(hooks.port, '/hook/s1', '{not json', { authorization: `Bearer ${TOKEN}` })).toBe(200);
    expect(received.length).toBe(before);
  });

  it('never puts the token itself into the settings passed on the command line', () => {
    const s = hookSettings('http://127.0.0.1:1/hook/s1');
    expect(s).not.toContain(TOKEN);
    expect(s).toContain('$VO_HOOK_TOKEN');
  });
});

describe('IPC validation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-sec-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('accepts a normal start request', () => {
    expect(validateStartOptions({ cwd: dir, prompt: 'hi', permissionMode: 'plan', extraArgs: ['--chrome'] }))
      .toEqual({ cwd: dir, prompt: 'hi', permissionMode: 'plan', extraArgs: ['--chrome'] });
  });

  it('rejects bad folders, modes, models and blocked flags', () => {
    expect(() => validateStartOptions(null)).toThrow(IpcError);
    expect(() => validateStartOptions({ cwd: 'relative/path' })).toThrow(/absolut/);
    expect(() => validateStartOptions({ cwd: path.join(dir, 'missing') })).toThrow(/tidak ditemukan/);
    expect(() => validateStartOptions({ cwd: dir, permissionMode: 'bypassPermissions' })).toThrow(/Mode izin/);
    expect(() => validateStartOptions({ cwd: dir, model: 'opus; rm -rf ~' })).toThrow(/model/);
    expect(() => validateStartOptions({ cwd: dir, extraArgs: ['--settings', '{}'] })).toThrow(/--settings/);
    expect(() => validateStartOptions({ cwd: dir, extraArgs: ['--dangerously-skip-permissions', '-p'] })).toThrow(/-p/);
    expect(() => validateStartOptions({ cwd: dir, resumeId: '../../etc' })).toThrow(/ID sesi/);
  });

  it('validates ids, pty data, sizes, settings and folder args', () => {
    expect(validateId('3f2a-11')).toBe('3f2a-11');
    expect(() => validateId('a/b')).toThrow(IpcError);
    expect(validatePtyData('ls\r')).toBe('ls\r');
    expect(validatePtyData({})).toBeNull();
    expect(validatePtyData('x'.repeat(2_000_000))).toBeNull();
    expect(validateSize(120, 40)).toEqual([120, 40]);
    expect(validateSize(-1, 40)).toBeNull();
    expect(validateSize(1e9, 1)).toBeNull();
    expect(() => validateSettingsPatch({ claudePath: 'claude' })).toThrow(/absolut/);
    expect(validateSettingsPatch({ officeView: 'weird', reduceMotion: 'yes' })).toEqual({ officeView: '3d', reduceMotion: false });
    expect(validateFolderArg('rel')).toBeNull();
    expect(validateFolderArg(dir)).toBe(dir);
  });
});

describe('files at rest', () => {
  // POSIX permission bits; Windows has no such mode (always reports 0666) and protects the
  // per-user %APPDATA% folder with ACLs instead.
  it.skipIf(process.platform === 'win32')('history and settings are readable by the owner only (0600)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-perm-'));
    const h = new HistoryStore(dir);
    h.upsert({ id: 'a', name: 'a', cwd: '/p', permissionMode: 'inherit', startedAt: 1, subagentTypes: [] });
    h.flush();
    new SettingsStore(dir).set({ reduceMotion: true });
    const mode = (f: string) => fs.statSync(path.join(dir, f)).mode & 0o777;
    expect(mode('sessions.json')).toBe(0o600);
    expect(mode('settings.json')).toBe(0o600);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
