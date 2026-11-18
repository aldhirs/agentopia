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
      // eslint-disable-next-line no-control-regex -- strips ANSI escapes from terminal output
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

run('SessionManager resume e2e', () => {
  it('resumes a finished conversation with claude --resume and keeps its memory', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const { HistoryStore } = await import('../electron/state/history');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-hist-'));
    const history = new HistoryStore(dir);
    const hooks = new HookReceiver();
    const sm = new SessionManager(hooks, history);
    const stops: Array<{ session: string; text: string }> = [];
    sm.on('hook', (r) => {
      if (r.payload.hook_event_name === 'Stop' && !r.payload.agent_id) {
        stops.push({ session: r.sessionId, text: String(r.payload.last_assistant_message ?? '') });
      }
    });
    const waitFor = async (cond: () => boolean, ms = 120_000) => {
      const end = Date.now() + ms;
      while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 500));
      return cond();
    };

    const first = await sm.start({
      cwd: path.join(__dirname, '..', 'spike', 'sandbox'), model: 'sonnet', permissionMode: 'auto',
      prompt: 'Remember the code word PELANGI for later. Reply with just: ok',
    });
    expect(await waitFor(() => stops.some((s) => s.session === first.id))).toBe(true);
    await sm.stop(first.id);
    await waitFor(() => sm.list().find((s) => s.id === first.id)?.status === 'exited', 15_000);

    const entry = history.get(first.id)!;
    expect(entry.claudeSessionId).toBeTruthy();
    expect(entry.endedAt).toBeTruthy();

    const second = await sm.resume(first.id);
    expect(second.id).not.toBe(first.id);
    await new Promise((r) => setTimeout(r, 6000)); // let the resumed TUI come up
    sm.write(second.id, 'What was the code word? Reply with just the word.');
    await new Promise((r) => setTimeout(r, 400));
    sm.write(second.id, '\r');
    expect(await waitFor(() => stops.some((s) => s.session === second.id))).toBe(true);
    const answer = stops.filter((s) => s.session === second.id).map((s) => s.text).join(' ');
    expect(answer.toUpperCase()).toContain('PELANGI');
    expect(history.list()).toHaveLength(1); // the resume continued the same history row
    expect(history.get(first.id)?.claudeSessionId).toBeTruthy();

    await sm.stop(second.id);
    await new Promise((r) => setTimeout(r, 1500));
    hooks.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }, 300_000);
});
