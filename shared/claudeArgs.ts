// Single source of truth for the `claude` command line: used to spawn sessions
// and to show the command preview in the lobby.
import type { StartSessionOptions } from './types';

export function buildClaudeArgs(opts: StartSessionOptions): string[] {
  const args: string[] = [];
  if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode);
  if (opts.model) args.push('--model', opts.model);
  if (opts.worktree) args.push('--worktree');
  if (opts.name?.trim()) args.push('--name', opts.name.trim());
  if (opts.resumeId) args.push('--resume', opts.resumeId);
  // Resuming a specific conversation already says which one, so --continue/--resume from the extras would conflict.
  const extras = opts.resumeId ? withoutContinuation(opts.extraArgs ?? []) : (opts.extraArgs ?? []);
  args.push(...extras);
  if (opts.prompt?.trim()) args.push(opts.prompt.trim());
  return args;
}

/** Splits a typed argument string like a shell would (spaces, single and double quotes, backslash). */
export function splitArgs(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < input.length) cur += input[++i];
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (ch === '\\' && i + 1 < input.length) {
      cur += input[++i];
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
    }
  }
  if (quote) throw new Error('Tanda kutip belum ditutup di argumen tambahan');
  if (has || cur) out.push(cur);
  return out;
}

// Flags the app sets itself, or that would stop the interactive office from working.
const BLOCKED: Record<string, string> = {
  '--settings': 'dipakai app untuk memasang hooks',
  '-p': 'mode non-interaktif tidak bisa ditampilkan di kantor',
  '--print': 'mode non-interaktif tidak bisa ditampilkan di kantor',
  '--output-format': 'hanya untuk mode --print',
  '--input-format': 'hanya untuk mode --print',
  '--bg': 'sesi latar belakang tidak terhubung ke app',
  '--background': 'sesi latar belakang tidak terhubung ke app',
  '--bare': 'mematikan hooks yang dibutuhkan app',
  '--safe-mode': 'mematikan hooks yang dibutuhkan app',
  '--permission-mode': 'pilih lewat "Mode izin" di form',
  '--model': 'pilih lewat "Model" di form',
  '--worktree': 'pilih lewat opsi worktree di form',
  '-w': 'pilih lewat opsi worktree di form',
  '--name': 'isi lewat "Nama sesi" di form',
  '-n': 'isi lewat "Nama sesi" di form',
};

/** Parses and validates the "Argumen tambahan" field. Throws with a readable message on a problem. */
export function parseExtraArgs(input: string): string[] {
  const args = splitArgs(input.trim());
  for (const a of args) {
    const flag = a.split('=')[0];
    if (BLOCKED[flag]) throw new Error(`Argumen ${flag} tidak bisa dipakai: ${BLOCKED[flag]}`);
  }
  return args;
}

/** Drops --continue/-c and --resume/-r [value] (used when the app resumes a known conversation). */
export function withoutContinuation(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--continue' || a === '-c') continue;
    if (a === '--resume' || a === '-r') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) i++;
      continue;
    }
    if (a.startsWith('--resume=')) continue;
    out.push(a);
  }
  return out;
}

const SAFE = /^[\w@%+=:,./~-]+$/;
export function shellQuote(arg: string): string {
  return SAFE.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Human-readable command for the lobby preview (hook settings are added by the app and omitted here). */
export function previewCommand(opts: StartSessionOptions, maxPrompt = 70): string {
  const args = buildClaudeArgs({ ...opts, prompt: undefined });
  const prompt = opts.prompt?.trim();
  if (prompt) args.push(prompt.length > maxPrompt ? `${prompt.slice(0, maxPrompt - 1)}…` : prompt);
  const dir = opts.cwd ? `cd ${shellQuote(opts.cwd)} && ` : '';
  return `${dir}claude${args.length ? ' ' + args.map(shellQuote).join(' ') : ''}`;
}
