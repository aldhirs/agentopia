// Background music: an original looping waltz (scripts/make-bgm.py), played through Web Audio so
// the loop has no gap. Follows the music settings and pauses while the window is hidden.
import { watch } from 'vue';
import bgmUrl from '../assets/bgm.ogg';
import { office } from '../stores/office';

const FADE_S = 1.2;
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let loading: Promise<void> | null = null;

/** Perceived loudness follows a curve; 30 (the default) is a quiet background level. */
export function musicGain(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return v ** 1.6;
}

function wanted(): boolean {
  return !!office.settings?.music && document.visibilityState === 'visible';
}

async function load() {
  ctx = new AudioContext();
  gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const data = await (await fetch(bgmUrl)).arrayBuffer();
  const buffer = await ctx.decodeAudioData(data);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(gain);
  src.start();
  document.documentElement.dataset.bgm = `loaded ${buffer.duration.toFixed(1)}s`;
}

async function apply() {
  if (!wanted()) {
    if (!ctx || !gain) return;
    gain.gain.setTargetAtTime(0, ctx.currentTime, FADE_S / 4);
    const c = ctx;
    setTimeout(() => { if (!wanted() && c.state === 'running') c.suspend(); }, FADE_S * 1000);
    return;
  }
  loading ??= load().catch((err) => { console.warn('[bgm] could not load music', err); document.documentElement.dataset.bgm = 'error'; loading = null; ctx = null; });
  await loading;
  if (!ctx || !gain || !wanted()) return;
  if (ctx.state !== 'running') await ctx.resume();
  gain.gain.setTargetAtTime(musicGain(office.settings?.musicVolume ?? 30), ctx.currentTime, FADE_S / 4);
}

export function startBgm() {
  watch(() => [office.settings?.music, office.settings?.musicVolume], () => { void apply(); }, { immediate: true });
  document.addEventListener('visibilitychange', () => { void apply(); });
  // If the context was created before any interaction and the platform held it back, resume on the first click.
  window.addEventListener('pointerdown', () => { if (ctx?.state === 'suspended' && wanted()) void apply(); });
}
