// Phase 0 spike: run interactive `claude` in a pty with HTTP hooks injected via --settings,
// record every hook payload and the raw terminal output.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pty from 'node-pty';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
const sandbox = path.join(here, 'sandbox');
fs.mkdirSync(outDir, { recursive: true });
const hooksLog = path.join(outDir, 'hooks.jsonl');
const ptyLog = path.join(outDir, 'pty.log');
fs.writeFileSync(hooksLog, '');
fs.writeFileSync(ptyLog, '');

const EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd',
];

const CLAUDE = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local', 'bin', 'claude');
const PROMPT = process.argv[2] || [
  'Spike test, follow exactly:',
  '1) In ONE message launch TWO Explore subagents in parallel: subagent A lists the files in ./a,',
  'subagent B reads ./b/note.txt. Each replies in one short sentence.',
  '2) After both finish, run the Bash command: touch permission-test.txt',
  '3) Then reply with the single word: done',
].join(' ');

const token = crypto.randomBytes(16).toString('hex');
const t0 = Date.now();
let child;
let mainStopped = false;
let exitTimer;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const ok = req.headers.authorization === `Bearer ${token}`;
    let json = null;
    try { json = JSON.parse(body); } catch { /* keep raw */ }
    fs.appendFileSync(hooksLog, JSON.stringify({ t_ms: Date.now() - t0, auth_ok: ok, body: json ?? body }) + '\n');
    res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
    res.end('{}');
    if (!ok || !json) return;
    const ev = json.hook_event_name;
    console.log(`[hook] +${Date.now() - t0}ms ${ev} ${json.agent_type || 'lead'}${json.agent_id ? '#' + json.agent_id.slice(0, 6) : ''} ${json.tool_name || json.notification_type || ''}`);
    // Answer the permission prompt in the TUI ("1. Yes" is preselected) to exercise the flow.
    if (ev === 'PermissionRequest') setTimeout(() => child?.write('\r'), 1500);
    const stillRunning = (json.background_tasks || []).some((b) => b.type === 'subagent' && b.status === 'running');
    clearTimeout(exitTimer);
    if (ev === 'Stop' && !json.agent_id && !stillRunning && !mainStopped) {
      exitTimer = setTimeout(() => {
        mainStopped = true;
        child?.write('/exit\r');
        setTimeout(() => child?.kill(), 6000);
      }, 5000);
    }
  });
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const handler = {
    type: 'http',
    url: `http://127.0.0.1:${port}/hook`,
    headers: { Authorization: 'Bearer $VO_TOKEN' },
    allowedEnvVars: ['VO_TOKEN'],
    timeout: 5,
  };
  const settings = { hooks: Object.fromEntries(EVENTS.map((e) => [e, [{ matcher: '*', hooks: [handler] }]])) };

  const env = { ...process.env, VO_TOKEN: token };
  delete env.ANTHROPIC_API_KEY;

  console.log(`hook server 127.0.0.1:${port} · claude=${CLAUDE}`);
  const modeArgs = process.env.SPIKE_MODE ? ['--permission-mode', process.env.SPIKE_MODE] : [];
  child = pty.spawn(CLAUDE, ['--model', 'sonnet', ...modeArgs, '--settings', JSON.stringify(settings), PROMPT], {
    name: 'xterm-256color', cols: 120, rows: 40, cwd: sandbox, env,
  });

  let trustAnswered = false;
  child.onData((d) => {
    fs.appendFileSync(ptyLog, d);
    if (!trustAnswered && /trust (this|the files)/i.test(d)) {
      trustAnswered = true;
      setTimeout(() => child.write('\r'), 500);
    }
  });
  child.onExit(({ exitCode }) => {
    console.log(`claude exited (${exitCode}) after ${Date.now() - t0}ms`);
    server.close();
    process.exit(0);
  });
  setTimeout(() => { console.log('timeout, killing'); child.kill(); }, 5 * 60 * 1000);
});
