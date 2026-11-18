// What each agent looks like: known roles get a fixed look, built-in Claude Code agents are
// robots, and unknown custom agents get a stable look derived from their type name.
import { agentColor } from '../lib/agentColor';

export type HairStyle = 'short' | 'curly' | 'long' | 'bun' | 'bob' | 'buzz';

export interface Appearance {
  robot: boolean;
  shirt: string;
  skin: string;
  hair: string;
  style: HairStyle;
  glasses: boolean;
  headset: boolean;
}

const BUILTIN = new Set(['Explore', 'Plan', 'general-purpose', 'statusline-setup', 'claude-code-guide', 'output-style-setup']);

const PRESETS: Record<string, Partial<Appearance>> = {
  lead: { skin: '#E0A97E', hair: '#2B2420', style: 'short', headset: true },
  'backend-engineer': { skin: '#8D5A3B', hair: '#1C1714', style: 'curly' },
  'frontend-engineer': { skin: '#F1C7A5', hair: '#B8732E', style: 'long' },
  'qa-engineer': { skin: '#C68A62', hair: '#2B2420', style: 'bun', glasses: true },
  'product-designer': { skin: '#F1C7A5', hair: '#6B3E2E', style: 'bob' },
  'security-engineer': { skin: '#5C3A24', hair: '#1C1714', style: 'buzz', headset: true },
  pm: { skin: '#E0A97E', hair: '#4A2E1E', style: 'bob', glasses: true },
  'solution-architect': { skin: '#C68A62', hair: '#9A9A9A', style: 'short', glasses: true },
  sre: { skin: '#8D5A3B', hair: '#1C1714', style: 'buzz', headset: true },
};

const SKINS = ['#F1C7A5', '#E0A97E', '#C68A62', '#8D5A3B', '#5C3A24'];
const HAIRS = ['#1C1714', '#2B2420', '#4A2E1E', '#6B3E2E', '#B8732E', '#9A9A9A'];
const STYLES: HairStyle[] = ['short', 'curly', 'long', 'bun', 'bob', 'buzz'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function isBuiltinAgent(type: string): boolean {
  return BUILTIN.has(type);
}

export function appearanceFor(type: string): Appearance {
  const shirt = agentColor(type);
  if (isBuiltinAgent(type)) {
    return { robot: true, shirt, skin: '#C4CDD7', hair: '#000000', style: 'short', glasses: false, headset: false };
  }
  const h = hash(type);
  const base: Appearance = {
    robot: false,
    shirt,
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >>> 3) % HAIRS.length],
    style: STYLES[(h >>> 6) % STYLES.length],
    glasses: ((h >>> 9) % 4) === 0,
    headset: ((h >>> 11) % 5) === 0,
  };
  return { ...base, ...PRESETS[type] };
}
