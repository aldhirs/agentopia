// A `claude` that exits immediately (like a failed launch on Windows) must not crash the app
// when the UI keeps resizing/typing into its terminal, and must not leave the settings file behind.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HookReceiver } from '../electron/hooks/hookReceiver';
import { setConfiguredClaudePath } from '../electron/session/claudeLocator';
import { launchCommand, SessionManager } from '../electron/session/sessionManager';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-exit-'));
const fake = path.join(dir, 'claude');
// Prints its arguments, then exits with an error like a failed launch.
fs.writeFileSync(fake, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\nif [ "$1" = "auth" ]; then echo \'{"loggedIn":true}\'; exit 0; fi\necho "ARGS: $@"\nexit 3\n', { mode: 0o755 });
afterAll(() => { setConfiguredClaudePath(''); fs.rmSync(dir, { recursive: true, force: true }); });

describe.runIf(process.platform !== 'win32')('session whose claude exits right away', () => {
  it('ignores resize/write after exit and cleans up the hook settings file', async () => {
    setConfiguredClaudePath(fake);
    const hooks = new HookReceiver();
    const sm = new SessionManager(hooks);
    let out = '';
    sm.on('data', (_id, d) => { out += d; });
    const info = await sm.start({ cwd: dir, prompt: 'hello there' });
    for (let i = 0; i < 40 && sm.list()[0].status !== 'exited'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(sm.list()[0].status).toBe('exited');
    expect(sm.list()[0].exitCode).toBe(3);

    // These used to throw ("Cannot resize a pty that has already exited") on Windows.
    expect(() => sm.resize(info.id, 120, 40)).not.toThrow();
    expect(() => sm.write(info.id, 'x')).not.toThrow();
    await expect(sm.stop(info.id)).resolves.toBeUndefined();

    // --settings points to a file (no JSON on the command line), and the file is gone afterwards.
    const m = out.match(/--settings (\S+vo-hooks-[\w-]+\.json)/);
    expect(m).not.toBeNull();
    expect(out).not.toContain('"hooks"');
    expect(fs.existsSync(m![1])).toBe(false);
    hooks.stop();
  });
});

describe('launchCommand', () => {
  it('runs claude directly on macOS/Linux', () => {
    if (process.platform === 'win32') return;
    expect(launchCommand('/usr/local/bin/claude', ['-p'])).toEqual({ file: '/usr/local/bin/claude', argv: ['-p'] });
  });

  it('on Windows runs an npm shim through node + cli.js when available, else cmd.exe', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const npmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-npm-'));
      const shim = path.join(npmDir, 'claude.cmd');
      fs.writeFileSync(shim, '@echo off');
      expect(launchCommand(shim, ['--settings', 'f.json']).argv.slice(-3)).toEqual([shim, '--settings', 'f.json']);
      const cli = path.join(npmDir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
      fs.mkdirSync(path.dirname(cli), { recursive: true });
      fs.writeFileSync(cli, '');
      expect(launchCommand(shim, ['--settings', 'f.json'])).toEqual({ file: 'node.exe', argv: [cli, '--settings', 'f.json'] });
      expect(launchCommand('C:\\Users\\me\\.local\\bin\\claude.exe', ['-c'])).toEqual({ file: 'C:\\Users\\me\\.local\\bin\\claude.exe', argv: ['-c'] });
      fs.rmSync(npmDir, { recursive: true, force: true });
    } finally {
      Object.defineProperty(process, 'platform', orig);
    }
  });
});
