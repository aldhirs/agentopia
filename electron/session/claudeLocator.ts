// Finds the `claude` binary and checks that the user is logged in.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ClaudeInfo } from '../../shared/types';
import { claudeEnv, loginShellPath } from './shellEnv';

function candidates(): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return [
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(process.env.APPDATA ?? '', 'npm', 'claude.cmd'),
    ];
  }
  return [
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(home, '.npm-global', 'bin', 'claude'),
  ];
}

async function findOnPath(): Promise<string | undefined> {
  const sep = process.platform === 'win32' ? ';' : ':';
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const dir of (await loginShellPath()).split(sep)) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (isExecutable(p)) return p;
    }
  }
  return undefined;
}

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function run(file: string, args: string[]): Promise<string> {
  return claudeEnv().then((env) => new Promise((resolve, reject) => {
    execFile(file, args, { env, timeout: 15000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  }));
}

let cached: ClaudeInfo | undefined;

let configuredPath = '';
/** Path chosen in the app settings; empty = automatic. */
export function setConfiguredClaudePath(p: string) {
  if (p !== configuredPath) { configuredPath = p; cached = undefined; }
}

export async function locateClaude(force = false): Promise<ClaudeInfo> {
  if (cached && !force) return cached;
  if (configuredPath && !isExecutable(configuredPath)) {
    return (cached = { found: false, error: `Lokasi claude di Pengaturan tidak valid: ${configuredPath}` });
  }
  const override = configuredPath || process.env.VO_CLAUDE_BIN;
  const bin = (override && isExecutable(override) ? override : undefined)
    ?? candidates().find(isExecutable)
    ?? (await findOnPath());
  if (!bin) {
    return (cached = { found: false, error: 'Claude Code tidak ditemukan. Pasang Claude Code lalu buka ulang app.' });
  }
  const info: ClaudeInfo = { found: true, path: bin };
  try {
    info.version = (await run(bin, ['--version'])).trim().split(/\s+/)[0];
  } catch (e) {
    info.error = `Gagal menjalankan claude --version: ${(e as Error).message}`;
  }
  try {
    const status = JSON.parse(await run(bin, ['auth', 'status'])) as Record<string, unknown>;
    info.loggedIn = Boolean(status.loggedIn);
    info.authMethod = typeof status.authMethod === 'string' ? status.authMethod : undefined;
    info.subscriptionType = typeof status.subscriptionType === 'string' ? status.subscriptionType : undefined;
  } catch {
    // Older versions may not support `auth status`; leave login state unknown.
  }
  return (cached = info);
}
