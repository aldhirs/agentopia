/**
 * Text pasted into the terminal when files are dropped on it, written the way a native terminal
 * does: macOS/Linux escape special characters with a backslash ("my\ file.png"), Windows quotes
 * paths that contain spaces. Claude Code reads these as file paths (images become attachments).
 */
export function dropText(paths: string[], platform: string): string {
  const one = (p: string) => {
    if (platform === 'win32') return /[\s&()^,;=!'%]/.test(p) ? `"${p}"` : p;
    return p.replace(/([^\w@%+=:,./-])/g, '\\$1');
  };
  const list = paths.filter(Boolean).map(one);
  return list.length ? `${list.join(' ')} ` : '';
}
