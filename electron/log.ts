// Small diagnostic log in <userData>/logs/main.log (rotated at 1 MB). Used to debug sessions on
// machines where the console isn't visible (e.g. Windows installs). Never log tokens or prompts.
import fs from 'node:fs';
import path from 'node:path';

let file: string | null = null;
const LIMIT = 1_000_000;

export function initLog(userDataDir: string) {
  const dir = path.join(userDataDir, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'main.log');
  try {
    if (fs.statSync(file).size > LIMIT) fs.renameSync(file, `${file}.1`);
  } catch { /* no log yet */ }
}

export function log(event: string, data: Record<string, unknown> = {}) {
  if (!file) return;
  try {
    fs.appendFileSync(file, `${new Date().toISOString()} ${event} ${JSON.stringify(data)}\n`, { mode: 0o600 });
  } catch { /* logging must never break the app */ }
}

export function logPath() { return file; }
