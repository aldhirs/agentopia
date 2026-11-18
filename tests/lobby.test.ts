import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildClaudeArgs, parseExtraArgs, previewCommand, shellQuote, splitArgs, withoutContinuation } from '../shared/claudeArgs';
import { HistoryStore } from '../electron/state/history';
import { folderInfo, parseAgentFile } from '../electron/session/team';

const tmpDirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-')); tmpDirs.push(d); return d; };
afterEach(() => { tmpDirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })); });

describe('claude args', () => {
  it('builds args in a fixed order and skips empty options', () => {
    expect(buildClaudeArgs({ cwd: '/x' })).toEqual([]);
    expect(buildClaudeArgs({ cwd: '/x', permissionMode: 'acceptEdits', model: 'opus', worktree: true, name: ' refund ', prompt: ' do it ' }))
      .toEqual(['--permission-mode', 'acceptEdits', '--model', 'opus', '--worktree', '--name', 'refund', 'do it']);
    expect(buildClaudeArgs({ cwd: '/x', resumeId: 'abc' })).toEqual(['--resume', 'abc']);
  });

  it('previews a copy-pasteable command', () => {
    expect(previewCommand({ cwd: '/Users/me/My Project', permissionMode: 'plan', prompt: "fix it's bug" }))
      .toBe(`cd '/Users/me/My Project' && claude --permission-mode plan 'fix it'\\''s bug'`);
    expect(previewCommand({ cwd: '' })).toBe('claude');
    expect(shellQuote('~/Projects/api')).toBe('~/Projects/api');
  });
});

describe('extra arguments', () => {
  it('splits like a shell', () => {
    expect(splitArgs('--chrome --continue')).toEqual(['--chrome', '--continue']);
    expect(splitArgs(`--append-system-prompt "be brief, please" --add-dir '/a b'`))
      .toEqual(['--append-system-prompt', 'be brief, please', '--add-dir', '/a b']);
    expect(splitArgs('  ')).toEqual([]);
    expect(() => splitArgs('"open')).toThrow(/kutip/);
  });

  it('accepts the usual flags and rejects ones that break the app', () => {
    expect(parseExtraArgs('--chrome --continue')).toEqual(['--chrome', '--continue']);
    expect(() => parseExtraArgs('--settings x.json')).toThrow(/--settings/);
    expect(() => parseExtraArgs('-p hi')).toThrow(/-p/);
    expect(() => parseExtraArgs('--output-format=json')).toThrow(/--output-format/);
    expect(() => parseExtraArgs('--model opus')).toThrow(/Model/);
  });

  it('places extras before the prompt and drops --continue when resuming a known conversation', () => {
    expect(buildClaudeArgs({ cwd: '/x', extraArgs: ['--chrome', '--continue'], prompt: 'hi' }))
      .toEqual(['--chrome', '--continue', 'hi']);
    expect(buildClaudeArgs({ cwd: '/x', resumeId: 'abc', extraArgs: ['--chrome', '--continue', '-r', 'old'] }))
      .toEqual(['--resume', 'abc', '--chrome']);
    expect(withoutContinuation(['-c', '--resume=x', '--add-dir', '/a'])).toEqual(['--add-dir', '/a']);
    expect(previewCommand({ cwd: '/p', extraArgs: ['--chrome', '--continue'] })).toBe('cd /p && claude --chrome --continue');
  });
});

describe('HistoryStore', () => {
  it('persists entries, sorts by activity and lists recent folders', () => {
    const dir = tmp();
    const h = new HistoryStore(dir);
    h.upsert({ id: 'a', name: 'a', cwd: '/p1', permissionMode: 'inherit', startedAt: 1, lastActiveAt: 1, subagentTypes: [] });
    h.upsert({ id: 'b', name: 'b', cwd: '/p2', permissionMode: 'inherit', startedAt: 2, lastActiveAt: 5, subagentTypes: [] });
    h.upsert({ id: 'c', name: 'c', cwd: '/p1', permissionMode: 'inherit', startedAt: 3, lastActiveAt: 3, endedAt: 4, subagentTypes: [] });
    h.flush();
    const again = new HistoryStore(dir);
    expect(again.list().map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(again.recentFolders()).toEqual(['/p2', '/p1']);
  });

  it('marks sessions left running by a previous app run as ended', () => {
    const dir = tmp();
    const h = new HistoryStore(dir);
    h.upsert({ id: 'a', name: 'a', cwd: '/p', permissionMode: 'inherit', startedAt: 1, lastActiveAt: 9, subagentTypes: [] });
    h.flush();
    expect(new HistoryStore(dir).get('a')?.endedAt).toBe(9);
  });

  it('survives a corrupt file', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'sessions.json'), '{not json');
    expect(new HistoryStore(dir).list()).toEqual([]);
  });
});

describe('team detection', () => {
  it('parses agent frontmatter', () => {
    expect(parseAgentFile('---\nname: qa-engineer\ndescription: "Tests things"\ntools: Read\n---\nbody', 'x'))
      .toEqual({ name: 'qa-engineer', description: 'Tests things' });
    expect(parseAgentFile('no frontmatter', 'fallback')).toEqual({ name: 'fallback', description: undefined });
  });

  it('merges builtin, user and project agents (project wins)', () => {
    const home = tmp();
    const proj = tmp();
    fs.mkdirSync(path.join(home, '.claude', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(proj, '.claude', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(proj, '.git'));
    fs.writeFileSync(path.join(home, '.claude', 'agents', 'pm.md'), '---\nname: pm\ndescription: user pm\n---');
    fs.writeFileSync(path.join(proj, '.claude', 'agents', 'pm.md'), '---\nname: pm\ndescription: project pm\n---');
    fs.writeFileSync(path.join(proj, '.claude', 'agents', 'sre.md'), '---\nname: sre\n---');
    const info = folderInfo(proj, home);
    expect(info.exists && info.isGit).toBe(true);
    const names = info.team.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['general-purpose', 'Explore', 'Plan', 'pm', 'sre']));
    expect(info.team.find((t) => t.name === 'pm')).toMatchObject({ source: 'project', description: 'project pm' });
  });

  it('handles a missing folder', () => {
    const info = folderInfo('/definitely/not/here', tmp());
    expect(info.exists).toBe(false);
    expect(info.team.length).toBe(3);
  });
});
