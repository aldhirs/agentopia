// Which agents a session in a given folder can call: built-ins, user agents
// (~/.claude/agents) and project agents (<folder>/.claude/agents).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FolderInfo, NewAgent, TeamMember } from '../../shared/types';

const BUILTIN: TeamMember[] = [
  { name: 'general-purpose', description: 'Agent serbaguna bawaan Claude Code', source: 'builtin' },
  { name: 'Explore', description: 'Menjelajah dan membaca kode (read-only)', source: 'builtin' },
  { name: 'Plan', description: 'Menyusun rencana implementasi', source: 'builtin' },
];

export function parseAgentFile(text: string, fallbackName: string): { name: string; description?: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const front = m ? m[1] : '';
  const field = (key: string) => {
    const line = front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    if (!line) return undefined;
    let v = line[1].trim();
    if (v.startsWith('"') && v.endsWith('"')) {
      try { v = JSON.parse(v) as string; } catch { v = v.slice(1, -1); }
    } else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    return v || undefined;
  };
  const description = field('description')?.replace(/\\n|\n/g, ' ');
  return { name: field('name') ?? fallbackName, description: description && description.length > 160 ? `${description.slice(0, 159)}…` : description };
}

function readAgentsDir(dir: string, source: TeamMember['source']): TeamMember[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return files.map((f) => {
    const parsed = parseAgentFile(fs.readFileSync(path.join(dir, f), 'utf8'), f.replace(/\.md$/, ''));
    return { ...parsed, source };
  });
}

export function folderInfo(cwd: string | null, home = os.homedir()): FolderInfo {
  const exists = !!cwd && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory();
  const isGit = exists && fs.existsSync(path.join(cwd!, '.git'));
  const user = readAgentsDir(path.join(home, '.claude', 'agents'), 'user');
  const project = exists ? readAgentsDir(path.join(cwd!, '.claude', 'agents'), 'project') : [];
  // Project agents override user agents with the same name.
  const byName = new Map<string, TeamMember>();
  for (const a of [...BUILTIN, ...user, ...project]) byName.set(a.name, a);
  return { path: cwd, exists, isGit, team: [...byName.values()] };
}

export class AgentExistsError extends Error {}

/** Folder that holds agents for a scope: <project>/.claude/agents or ~/.claude/agents. */
export function agentsDir(agent: Pick<NewAgent, 'scope' | 'cwd'>, home = os.homedir()): string {
  return agent.scope === 'user' ? path.join(home, '.claude', 'agents') : path.join(agent.cwd!, '.claude', 'agents');
}

/** Agent file in Claude Code's format: YAML front matter + the system prompt. */
export function agentMarkdown(agent: NewAgent): string {
  const lines = ['---', `name: ${agent.name}`, `description: ${JSON.stringify(agent.description)}`];
  if (agent.model) lines.push(`model: ${agent.model}`);
  lines.push('---', '', agent.prompt, '');
  return lines.join('\n');
}

/** Writes a new agent (never overwrites one) and returns the file path. Input must be validated. */
export function createAgent(agent: NewAgent, home = os.homedir()): string {
  const dir = agentsDir(agent, home);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${agent.name}.md`);
  const builtin = BUILTIN.some((b) => b.name.toLowerCase() === agent.name.toLowerCase());
  if (builtin || fs.existsSync(file)) throw new AgentExistsError(`Agent "${agent.name}" sudah ada, pakai nama lain`);
  fs.writeFileSync(file, agentMarkdown(agent), { flag: 'wx' });
  return file;
}
