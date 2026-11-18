// End-to-end: runs a real `claude` session through SessionManager + HookReceiver.
// Uses a little of the user's Claude quota, so it only runs with VO_E2E=1.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HookReceiver } from '../electron/hooks/hookReceiver';
import { SessionManager } from '../electron/session/sessionManager';
import type { OfficeEffect, OfficeState } from '../shared/types';

const run = process.env.VO_E2E === '1' ? describe : describe.skip;

run('SessionManager e2e', () => {
  it('starts claude, tracks a subagent through hooks, and stops cleanly', async () => {
    const hooks = new HookReceiver();
    const sm = new SessionManager(hooks);
    let latest: OfficeState | undefined;
    const effects: OfficeEffect[] = [];
    let bytes = 0;
    sm.on('state', (s) => { latest = s; });
    sm.on('effects', (_id, e) => effects.push(...e));
    let screen = '';
    let trusted = false;
    sm.on('data', (id, d) => {
      bytes += d.length;
      screen = (screen + d).slice(-4000);
      // First run in a folder shows the workspace-trust screen ("No, exit" is preselected).
      if (!trusted && /trust\s*this\s*folder/i.test(screen.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ''))) {
        trusted = true;
        setTimeout(() => { sm.write(id, '\x1b[B'); setTimeout(() => sm.write(id, '\r'), 300); }, 500);
      }
    });

    const info = await sm.start({
      cwd: path.join(__dirname, '..', 'spike', 'sandbox'),
      model: 'sonnet',
      permissionMode: 'auto',
      prompt: 'Use ONE Explore subagent to read ./b/note.txt and report its content in one sentence. Then reply: done',
    });

    const deadline = Date.now() + 150_000;
    const subagentsDone = () => latest && latest.order.length > 1
      && latest.order.slice(1).every((id) => latest!.agents[id].status === 'done');
    while (Date.now() < deadline && !(subagentsDone() && latest!.agents.lead.status === 'done')) {
      await new Promise((r) => setTimeout(r, 500));
    }

    await sm.stop(info.id);
    await new Promise((r) => setTimeout(r, 1500));
    hooks.stop();

    expect(bytes).toBeGreaterThan(0);
    expect(latest?.claudeSessionId).toBeTruthy();
    const subs = latest!.order.slice(1).map((id) => latest!.agents[id]);
    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs[0].type).toBe('Explore');
    expect(effects.some((e) => e.type === 'dispatch')).toBe(true);
    expect(effects.some((e) => e.type === 'report')).toBe(true);
    expect(sm.list()[0].status).toBe('exited');
    expect(latest!.ended).toBe(true);
  }, 180_000);
});
