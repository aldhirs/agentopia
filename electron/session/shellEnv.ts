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
  // When the app itself is started from inside a Claude Code session (e.g. `npm run dev` in
  // Claude's terminal), that session's markers leak in and make the child think it is a
  // sub-session (transcript saving off, wrong messaging socket). Drop them; keep user config
  // such as CLAUDE_CODE_USE_BEDROCK.
  for (const key of Object.keys(env)) {
    if (isSessionMarker(key)) delete env[key];
  }
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  if (!env.HOME) env.HOME = os.homedir();
  return { ...env, ...extra };
}

const SESSION_MARKERS = ['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH'];
const SESSION_MARKER_PREFIXES = ['CLAUDE_CODE_SESSION_', 'CLAUDE_CODE_CHILD_', 'CLAUDE_CODE_MESSAGING_'];

export function isSessionMarker(key: string): boolean {
  return SESSION_MARKERS.includes(key) || SESSION_MARKER_PREFIXES.some((p) => key.startsWith(p));
}

function mergePaths(...lists: string[]): string {
  const sep = process.platform === 'win32' ? ';' : ':';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) for (const p of list.split(sep)) if (p && !seen.has(p)) { seen.add(p); out.push(p); }
  return out.join(sep);
}
