// npm may skip node-pty's own install scripts (allowScripts), leaving the prebuilt
// spawn-helper without the executable bit -> "posix_spawnp failed". Fix it here.
import fs from 'node:fs';
import path from 'node:path';

const prebuilds = path.join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds');
if (fs.existsSync(prebuilds)) {
  for (const dir of fs.readdirSync(prebuilds)) {
    const helper = path.join(prebuilds, dir, 'spawn-helper');
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  }
}
