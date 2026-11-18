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
  if (opts.prompt?.trim()) args.push(opts.prompt.trim());
  return args;
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
