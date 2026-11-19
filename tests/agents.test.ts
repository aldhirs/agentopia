import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildClaudeArgs, parseExtraArgs } from '../shared/claudeArgs';
import { agentMarkdown, createAgent, folderInfo, parseAgentFile } from '../electron/session/team';
import { validateAgentName, validateAgentQuestion, validateNewAgent, validateStartOptions } from '../electron/ipc/validate';

const dirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-agents-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const base = { name: 'copy-writer', description: 'Writes UI copy', prompt: 'You write short UI text.' };

describe('new agent validation', () => {
  it('accepts a project agent and a user agent', () => {
    const cwd = tmp();
    expect(validateNewAgent({ ...base, scope: 'project', cwd, model: 'haiku' })).toEqual({ ...base, scope: 'project', cwd, model: 'haiku' });
    expect(validateNewAgent({ ...base, scope: 'user', model: '' })).toEqual({ ...base, scope: 'user' });
  });

  it('rejects bad names, empty fields, unknown models and missing folders', () => {
    for (const name of ['Copy Writer', '../x', 'a', '-x', 'x_y', 'copy--writer']) {
      expect(() => validateNewAgent({ ...base, name, scope: 'user' })).toThrow(/Nama agent/);
    }
    expect(() => validateNewAgent({ ...base, description: '  ', scope: 'user' })).toThrow(/Kapan dipakai/);
    expect(() => validateNewAgent({ ...base, prompt: '', scope: 'user' })).toThrow(/Instruksi/);
    expect(() => validateNewAgent({ ...base, scope: 'user', model: 'gpt' })).toThrow(/Model/);
    expect(() => validateNewAgent({ ...base, scope: 'project', cwd: '/no/such/folder' })).toThrow(/tidak ditemukan/);
    expect(() => validateNewAgent({ ...base, scope: 'project', cwd: 'relative' })).toThrow(/absolut/);
    expect(() => validateNewAgent({ ...base, scope: 'everywhere' })).toThrow(/Pilih/);
  });

  it('flattens the description to one line', () => {
    expect(validateNewAgent({ ...base, description: 'one\ntwo   three', scope: 'user' }).description).toBe('one two three');
  });
});

describe('createAgent', () => {
  it('writes a Claude Code agent file the team list reads back', () => {
    const cwd = tmp();
    const agent = validateNewAgent({ ...base, description: 'Says "hi": always', scope: 'project', cwd, model: 'sonnet' });
    const file = createAgent(agent);
    expect(file).toBe(path.join(cwd, '.claude', 'agents', 'copy-writer.md'));
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toBe(agentMarkdown(agent));
    expect(parseAgentFile(text, 'x')).toEqual({ name: 'copy-writer', description: 'Says "hi": always' });
    const team = folderInfo(cwd, tmp()).team;
    expect(team.find((m) => m.name === 'copy-writer')).toMatchObject({ source: 'project', description: 'Says "hi": always' });
  });

  it('saves user agents under the home folder', () => {
    const home = tmp();
    const file = createAgent(validateNewAgent({ ...base, scope: 'user' }), home);
    expect(file).toBe(path.join(home, '.claude', 'agents', 'copy-writer.md'));
  });

  it('never overwrites an existing agent or shadows a built-in one', () => {
    const cwd = tmp();
    const agent = validateNewAgent({ ...base, scope: 'project', cwd });
    createAgent(agent);
    expect(() => createAgent(agent)).toThrow(/sudah ada/);
    expect(() => createAgent({ ...agent, name: 'explore' })).toThrow(/sudah ada/);
  });
});

describe('talking to an agent', () => {
  it('starts claude with --agent and keeps it out of the free-form arguments', () => {
    expect(buildClaudeArgs({ cwd: '/x', agent: 'copy-writer', model: 'haiku' })).toEqual(['--agent', 'copy-writer', '--model', 'haiku']);
    expect(() => parseExtraArgs('--agent other')).toThrow(/--agent/);
    expect(validateStartOptions({ cwd: tmp(), agent: 'plugin:reviewer' }).agent).toBe('plugin:reviewer');
    expect(() => validateStartOptions({ cwd: tmp(), agent: '--settings' })).toThrow(/agent/);
  });

  it('validates agent names and questions', () => {
    expect(validateAgentName('Explore')).toBe('Explore');
    expect(() => validateAgentName('a b')).toThrow();
    expect(() => validateAgentName('$(rm)')).toThrow();
    // Control characters (escape sequences) could end the bracketed paste early: they are stripped.
    expect(validateAgentQuestion('hi\x1b[201~\rthere\r\n')).toBe('hi[201~\nthere');
    expect(() => validateAgentQuestion('   ')).toThrow(/kosong/);
  });
});
