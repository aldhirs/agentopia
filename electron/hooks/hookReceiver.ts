// Local HTTP endpoint that receives Claude Code "http" hooks.
// Listens on 127.0.0.1 only; each session has its own bearer token.
import http from 'node:http';
import { EventEmitter } from 'node:events';
import type { HookPayload } from '../../shared/types';

const MAX_BODY = 2 * 1024 * 1024;

export class HookReceiver extends EventEmitter {
  private server?: http.Server;
  private tokens = new Map<string, string>(); // sessionId -> token
  port = 0;

  async start(): Promise<number> {
    if (this.server) return this.port;
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as { port: number }).port;
    return this.port;
  }

  register(sessionId: string, token: string) { this.tokens.set(sessionId, token); }
  unregister(sessionId: string) { this.tokens.delete(sessionId); }

  urlFor(sessionId: string) { return `http://127.0.0.1:${this.port}/hook/${sessionId}`; }

  stop() { this.server?.close(); this.server = undefined; }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const m = req.method === 'POST' && req.url?.match(/^\/hook\/([\w-]+)$/);
    const sessionId = m ? m[1] : undefined;
    const expected = sessionId ? this.tokens.get(sessionId) : undefined;
    if (!sessionId || !expected || req.headers.authorization !== `Bearer ${expected}`) {
      res.writeHead(401).end();
      req.resume();
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { res.writeHead(413).end(); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      // An empty JSON object means "no decision": Claude Code continues normally.
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as HookPayload;
        if (payload && typeof payload.hook_event_name === 'string') this.emit('hook', sessionId, payload);
      } catch {
        // ignore malformed bodies
      }
    });
  }
}

export const HOOK_EVENTS = [
  'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest',
  'PermissionDenied', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionStart', 'SessionEnd',
] as const;

export const TOKEN_ENV = 'VO_HOOK_TOKEN';

/** Settings JSON passed to `claude --settings` to route every hook to our receiver. */
export function hookSettings(url: string): string {
  const handler = {
    type: 'http',
    url,
    headers: { Authorization: `Bearer $${TOKEN_ENV}` },
    allowedEnvVars: [TOKEN_ENV],
    timeout: 5,
  };
  return JSON.stringify({
    hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, [{ matcher: '*', hooks: [handler] }]])),
  });
}
