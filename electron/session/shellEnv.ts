// Apps opened from Finder get a minimal PATH. Claude Code (and the tools it runs:
// git, node, go, ...) need the user's login-shell PATH, so we read it once at startup.
import { execFile } from 'node:child_process';
import os from 'node:os';

const MARK = '__VO_PATH__';
let cached: string | undefined;

export async function loginShellPath(): Promise<string> {
  if (cached !== undefined) return cached;
  const fallback = process.env.PATH ?? '';
  if (process.platform === 'win32') return (cached = fallback);
  const shell = process.env.SHELL || '/bin/zsh';
  cached = await new Promise<string>((resolve) => {
    execFile(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], { timeout: 5000, env: process.env }, (err, stdout) => {
      const m = !err && stdout.match(new RegExp(`${MARK}(.*)${MARK}`));
      resolve(m ? m[1] : fallback);
    });
  });
  return cached;
}

/** Env for spawned `claude`: login PATH, no API key (forces the user's subscription login). */
export async function claudeEnv(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  env.PATH = mergePaths(await loginShellPath(), env.PATH ?? '');
  delete env.ANTHROPIC_API_KEY;
  delete env.ELECTRON_RUN_AS_NODE;
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  if (!env.HOME) env.HOME = os.homedir();
  return { ...env, ...extra };
}

function mergePaths(...lists: string[]): string {
  const sep = process.platform === 'win32' ? ';' : ':';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) for (const p of list.split(sep)) if (p && !seen.has(p)) { seen.add(p); out.push(p); }
  return out.join(sep);
}
