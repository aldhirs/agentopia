// Stable character colors: known roles get the design colors, unknown types get a
// hashed color from the same pastel family so new agents still look consistent.
const KNOWN: Record<string, string> = {
  lead: '#EDBB4A',
  pm: '#F59A6E',
  'solution-architect': '#9FB0C8',
  'backend-engineer': '#7C95FF',
  'frontend-engineer': '#5CC0A5',
  'product-designer': '#F48FB1',
  'qa-engineer': '#BC8BEE',
  'security-engineer': '#D4A373',
  sre: '#69C0E8',
  Explore: '#8FC7A0',
  Plan: '#C8B6E2',
  'general-purpose': '#A9B4C2',
};

const PALETTE = ['#7C95FF', '#5CC0A5', '#F59A6E', '#BC8BEE', '#EDBB4A', '#69C0E8', '#F48FB1', '#D4A373', '#8FC7A0', '#9FB0C8'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Color for an agent type; `instanceId` shifts duplicates of the same type slightly apart. */
export function agentColor(type: string, _instanceId?: string): string {
  return KNOWN[type] ?? PALETTE[hash(type) % PALETTE.length];
}
