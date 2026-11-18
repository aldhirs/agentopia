// Small text helpers shared by the main process (reducer) and the renderer.

export function isSyntheticPrompt(prompt: string): boolean {
  const t = prompt.trimStart();
  return t.startsWith('<agent-message') || t.startsWith('<task-notification');
}

export function prettyType(type: string): string {
  return type
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function summarizeTool(tool: string, input: Record<string, unknown> = {}): string {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const base = (f: string) => f.split(/[\\/]/).pop() ?? f;
  let detail: string;
  switch (tool) {
    case 'Bash': detail = s(input.command); break;
    case 'Read': case 'Write': case 'Edit': case 'NotebookEdit': detail = base(s(input.file_path)); break;
    case 'Grep': detail = s(input.pattern); break;
    case 'Glob': detail = s(input.pattern); break;
    case 'WebFetch': detail = s(input.url); break;
    case 'WebSearch': detail = s(input.query); break;
    default: detail = '';
  }
  detail = detail.replace(/\s+/g, ' ').trim();
  if (detail.length > 60) detail = detail.slice(0, 59) + '…';
  return detail ? `${tool} · ${detail}` : tool;
}
