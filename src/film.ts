// Scripted ~30 s promo film of Agentopia, rendered frame by frame on a virtual clock so motion is
// smooth and in sync with the voice-over (scripts/make-video.cjs drives window.__film).
// Seven scenes, one voice-over line each; every scene change is a coloured "bean bag" wipe.
// Not shipped in the app: loaded by perf.html?mode=film.
import '@fontsource-variable/fraunces/soft.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import type { AgentState, AgentStatus, OfficeState } from '../shared/types';
import logoUrl from './assets/logo.svg';
import { OfficeEngine } from './office3d/engine';

/** Scene boundaries in seconds (also used by the audio mix: whooshes and voice-over cues). */
export const SCENES = [0, 3.0, 8.2, 12.4, 17.5, 22.2, 26.9, 30.5];
export const FILM_SECONDS = SCENES[SCENES.length - 1];

// ---------- virtual clock ----------
let vnow = 1000;
let rafQueue: FrameRequestCallback[] = [];
performance.now = () => vnow;
window.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
window.cancelAnimationFrame = () => {};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (k: number) => k * k * (3 - 2 * k);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const backOut = (k: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

// [id, type, label] — seats fill in this order: desks 0-3 Pod A, 4-7 Pod B (2,3,6,7 = front rows).
const TEAM: Array<[string, string, string]> = [
  ['a0', 'backend-engineer', 'Backend'], ['a1', 'frontend-engineer', 'Frontend'], ['a2', 'qa-engineer', 'QA'],
  ['a3', 'product-designer', 'Designer'], ['a4', 'data-engineer', 'Data'], ['a5', 'security-engineer', 'Security'],
  ['a6', 'mobile-engineer', 'Mobile'], ['a7', 'devops-engineer', 'DevOps'],
];
const WORK: Record<string, AgentStatus> = {
  a0: 'tool_use', a1: 'thinking', a2: 'tool_use', a3: 'tool_use', a4: 'thinking', a5: 'tool_use', a6: 'tool_use', a7: 'thinking',
};
const WIPE_COLORS = ['#F0663A', '#4D9078', '#5DA9E9', '#F2C14E', '#F78154', '#7C6CF2'];
const CUTS: Array<[number, string, number]> = [[12.4, 'a0', -0.7], [13.35, 'a1', 0.75], [14.1, 'a2', 0.6], [14.9, 'a3', -0.6]];

type Cam = { angle: number; distance: number; elevation: number; target: [number, number, number] };

export function runFilm() {
  document.body.innerHTML = `
  <style>
    html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #F8EEE2; }
    #bg { position: absolute; inset: 0; background:
      radial-gradient(60% 70% at 15% 20%, #FFE3C7 0%, transparent 70%),
      radial-gradient(55% 60% at 85% 80%, #FFCDB5 0%, transparent 70%), #F8EEE2; }
    #win { position: absolute; inset: 0; transform-origin: 50% 50%; overflow: hidden; }
    #win canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    #vignette { position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(120% 90% at 50% 45%, transparent 60%, rgba(60, 30, 20, .28) 100%); }
    #flash { position: absolute; inset: 0; background: #FFFFFF; opacity: 0; }
    .card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
    .card img { width: 300px; height: 300px; filter: drop-shadow(0 30px 50px rgba(180, 80, 40, .35)); }
    .word { font-family: 'Fraunces Variable', serif; font-variation-settings: 'SOFT' 100; font-weight: 600;
      font-size: 124px; letter-spacing: -0.02em; color: #2B2230; }
    .word span { display: inline-block; }
    .wipe { position: absolute; top: -30%; height: 160%; width: 170%; border-radius: 48%; left: 0; display: none; }
    .term { position: absolute; left: 130px; top: 290px; width: 940px; height: 430px; border-radius: 22px; overflow: hidden;
      background: rgba(22, 21, 27, .94); box-shadow: 0 40px 90px rgba(20, 10, 30, .45); color: #E8E6F0;
      font: 400 27px/1.7 'IBM Plex Mono', monospace; }
    .term .hd { height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 20px; border-bottom: 1px solid #2E2C36;
      font: 600 20px Figtree, sans-serif; color: #C9C6D3; }
    .term .hd i { width: 14px; height: 14px; border-radius: 50%; display: block; }
    .term .bd { padding: 22px 28px; white-space: pre; }
    .term .dim { color: #8E8A9C; } .term .ok { color: #5EE2A0; } .term .ac { color: #FFB86B; } .term .bl { color: #8FB4FF; }
    .agent { position: absolute; right: 150px; top: 330px; width: 560px; border-radius: 26px; background: rgba(255,255,255,.92);
      box-shadow: 0 40px 90px rgba(20, 10, 30, .3); padding: 30px 34px; font-family: Figtree, sans-serif; color: #2B2230;
      border-top: 8px solid #F0663A; }
    .agent h3 { margin: 0; font: 600 44px 'Fraunces Variable', serif; font-variation-settings: 'SOFT' 100; }
    .chip { display: inline-flex; align-items: center; gap: 10px; margin-top: 16px; padding: 10px 20px; border-radius: 999px;
      font-weight: 700; font-size: 24px; }
    .bar { height: 14px; border-radius: 7px; background: #EEE9F3; margin-top: 22px; overflow: hidden; }
    .bar b { display: block; height: 100%; border-radius: 7px; background: linear-gradient(90deg, #F2C14E, #F0663A); }
    .conf { position: absolute; left: 0; top: 0; width: 16px; height: 26px; border-radius: 4px; }
  </style>
  <div id="bg"></div>
  <div id="win"><canvas id="cv"></canvas><div id="vignette"></div></div>
  <div id="ui" style="display:none"></div>
  <div id="confetti" style="display:none"></div>
  <div id="flash"></div>
  <div class="card" id="intro" style="background:#F8EEE2"><img src="${logoUrl}" alt=""><div class="word">${[...'Agentopia'].map((c) => `<span>${c}</span>`).join('')}</div></div>
  <div class="card" id="outro" style="display:none"><img src="${logoUrl}" alt=""><div class="word">${[...'Agentopia'].map((c) => `<span>${c}</span>`).join('')}</div></div>
  <div id="wipes">${WIPE_COLORS.map((c) => `<div class="wipe" style="background:${c}"></div>`).join('')}</div>`;

  const $ = (s: string) => document.querySelector(s) as HTMLElement;
  const win = $('#win'), flash = $('#flash'), intro = $('#intro'), outro = $('#outro'), ui = $('#ui');
  const introLogo = intro.querySelector('img')!, introLetters = [...intro.querySelectorAll<HTMLElement>('.word span')];
  const outroLogo = outro.querySelector('img')!, outroLetters = [...outro.querySelectorAll<HTMLElement>('.word span')];
  const wipes = [...document.querySelectorAll<HTMLElement>('.wipe')];

  // Scene 6: a real-looking terminal and an agent card.
  ui.innerHTML = `
    <div class="term"><div class="hd"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i><span style="margin-left:12px">Terminal · claude</span></div>
      <div class="bd" id="tty"></div></div>
    <div class="agent"><h3>QA Engineer</h3>
      <span class="chip" id="chip">● Working</span>
      <div class="bar"><b id="prog" style="width:0%"></b></div></div>`;
  const term = ui.querySelector('.term') as HTMLElement, agentCard = ui.querySelector('.agent') as HTMLElement;
  const tty = $('#tty'), chip = $('#chip'), prog = $('#prog');
  const PROMPT = '<span class="dim">~/projects/shop</span> <span class="ac">❯</span> ';
  const TTY = [
    { html: `${PROMPT}claude --continue`, typed: 'claude --continue' },
    { html: '<span class="bl">⏺</span> Splitting the work across the team' },
    { html: '  <span class="dim">⎿</span> backend · frontend · qa · design' },
    { html: '<span class="bl">⏺</span> Agent(qa-engineer) running tests…' },
    { html: '  <span class="dim">⎿</span> <span class="ok">✓ 128 passed</span>' },
  ];

  // Confetti for the bean bag celebration.
  const confetti = $('#confetti');
  const pieces = Array.from({ length: 80 }, (_, i) => {
    const el = document.createElement('div');
    el.className = 'conf';
    el.style.background = ['#F0663A', '#F2C14E', '#5DA9E9', '#4D9078', '#F78154', '#7C6CF2'][i % 6];
    confetti.appendChild(el);
    const a = -Math.PI / 2 + ((i / 80) - 0.5) * 2.6;
    const speed = 700 + ((i * 53) % 600);
    return { el, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, spin: ((i * 97) % 720) - 360 };
  });

  const engine = new OfficeEngine(document.getElementById('cv') as HTMLCanvasElement, { quality: true });
  engine.resize(1920, 1080);
  window.dispatchEvent(new Event('focus'));

  const status: Record<string, AgentStatus> = Object.fromEntries(TEAM.map(([id]) => [id, 'idle']));
  let leadStatus: AgentStatus = 'idle';
  const sync = () => {
    const agents: Record<string, AgentState> = {
      lead: { id: 'lead', kind: 'lead', type: 'lead', label: 'Lead', status: leadStatus, startedAt: 0, updatedAt: 0, log: [] },
    };
    for (const [id, type, label] of TEAM) agents[id] = { id, kind: 'subagent', type, label, status: status[id], startedAt: 0, updatedAt: 0, log: [] };
    const state: OfficeState = { sessionId: 'film', agents, order: ['lead', ...TEAM.map(([id]) => id)], ended: false };
    engine.sync(state);
  };
  sync();
  engine.start();
  // Everyone starts seated; remember the seats for the close-ups.
  const seat = Object.fromEntries(['lead', ...TEAM.map(([id]) => id)].map((id) => [id, engine.poseOf(id)!]));

  // ---------- story beats ----------
  const beats: Array<[number, () => void]> = [
    [8.4, () => { leadStatus = 'thinking'; sync(); }],
    ...TEAM.map(([id], i): [number, () => void] => [9.4 + i * 0.2, () => engine.effects([{ type: 'dispatch', from: 'lead', to: id, at: 0 }])]),
    ...TEAM.map(([id], i): [number, () => void] => [10.7 + i * 0.2, () => { status[id] = WORK[id]; leadStatus = 'waiting_subagents'; sync(); }]),
    [14.0, () => { status.a6 = 'done'; status.a7 = 'done'; sync(); }],
    [14.95, () => { status.a3 = 'waiting'; status.a2 = 'done'; sync(); }],
    [15.3, () => engine.effects([{ type: 'report', from: 'a6', to: 'lead', at: 0 }, { type: 'report', from: 'a7', to: 'lead', at: 0 }])],
    [22.4, () => { status.a3 = 'tool_use'; sync(); }],
  ];
  beats.sort((a, b) => a[0] - b[0]);
  let fired = 0;

  // ---------- cameras per scene ----------
  const closeUp = (id: string, k: number, side: number): Cam => {
    const p = seat[id];
    return { angle: p.rotY + side + k * 0.18 * Math.sign(side), distance: lerp(4.8, 4.0, ease(k)), elevation: 0.52, target: [p.x, 1.2, p.z] };
  };
  const camAt = (t: number): Cam => {
    if (t < SCENES[2]) { // 2: dive from the sky into the office, orbiting
      const k = easeInOut(span(t, SCENES[1] - 0.3, SCENES[2]));
      return { angle: lerp(-1.6, -0.45, k), distance: lerp(36, 17, k), elevation: lerp(1.45, 0.7, k), target: [lerp(0.3, -0.6, k), 0.3, lerp(-1.1, -2.0, k)] };
    }
    if (t < SCENES[3]) { // 3: lead close-up, then swing out to the whole team as tasks fly
      const lead = seat.lead;
      if (t < 9.35) {
        const k = span(t, SCENES[2], 9.35);
        return { angle: lead.rotY + 0.5 + k * 0.12, distance: lerp(5.4, 4.6, ease(k)), elevation: 0.4, target: [lead.x, 1.2, lead.z] };
      }
      const k = easeInOut(span(t, 9.35, 10.8));
      return { angle: lerp(lead.rotY + 0.62, -0.25, k), distance: lerp(4.6, 15, k), elevation: lerp(0.4, 0.62, k),
        target: [lerp(lead.x, -0.6, k), lerp(1.2, 0.5, k), lerp(lead.z, -2.6, k)] };
    }
    if (t < SCENES[4]) { // 4: quick close-up cuts — coding, thinking, testing, raising a hand
      let c = 0;
      while (c < CUTS.length - 1 && t >= CUTS[c + 1][0]) c++;
      const end = c < CUTS.length - 1 ? CUTS[c + 1][0] : SCENES[4];
      return closeUp(CUTS[c][1], span(t, CUTS[c][0], end), CUTS[c][2]);
    }
    if (t < SCENES[5]) { // 5: the bean bag corner, slow orbit while they arrive
      const k = ease(span(t, SCENES[4], SCENES[5]));
      return { angle: lerp(0.15, 0.75, k), distance: lerp(13, 9.5, k), elevation: 0.6, target: [-1.0, 0.5, lerp(0.8, 2.0, k)] };
    }
    // 6 and 7: wide, drifting office behind the UI and the logo.
    const k = span(t, SCENES[5], FILM_SECONDS);
    return { angle: lerp(-0.6, 0.1, k), distance: lerp(19, 23, k), elevation: 0.78, target: [0.3, 0.3, -1.1] };
  };

  const bounceLetters = (letters: HTMLElement[], start: number, t: number) => letters.forEach((el, i) => {
    const k = span(t, start + i * 0.045, start + 0.35 + i * 0.045);
    el.style.opacity = String(k);
    el.style.transform = `translateY(${(1 - backOut(k)) * 50}px)`;
  });

  (window as unknown as { __film: unknown }).__film = {
    seconds: FILM_SECONDS,
    scenes: SCENES,
    render(t: number) {
      while (fired < beats.length && beats[fired][0] <= t) beats[fired++][1]();
      const cam = camAt(t);
      // Zoom punch + white flash on every quick cut in scene 4.
      const inCuts = t >= SCENES[3] && t < SCENES[4];
      const cutT = inCuts ? CUTS.map((c) => c[0]).filter((c) => t >= c).pop()! : 0;
      if (inCuts) cam.distance *= 1 - 0.14 * (1 - ease(span(t, cutT, cutT + 0.35)));
      flash.style.opacity = inCuts && cutT > SCENES[3] ? String(0.6 * (1 - span(t, cutT, cutT + 0.2))) : '0';
      engine.setCamera(cam);
      // Close-ups only show the name of whoever is in focus.
      if (t >= SCENES[2] && t < 9.35) engine.showTags(['lead']);
      else if (inCuts) engine.showTags([CUTS.filter((c) => t >= c[0]).pop()![1]]);
      else engine.showTags(null);
      vnow = 1000 + t * 1000;
      const q = rafQueue; rafQueue = [];
      for (const cb of q) cb(vnow);

      // Scene 1: logo pops with a wiggle, letters bounce in.
      intro.style.display = t < SCENES[1] ? 'flex' : 'none';
      const pop = backOut(span(t, 0.05, 0.6));
      introLogo.style.transform = `scale(${0.15 + 0.85 * pop}) rotate(${(1 - pop) * -16 + Math.sin(t * 7) * 3 * span(t, 0.6, 1.1)}deg)`;
      bounceLetters(introLetters, 0.45, t);

      // Scene 5: confetti burst when they land on the bean bags.
      const ct = t - 20.35;
      const showConf = ct > 0 && ct < 2.6;
      confetti.style.display = showConf ? 'block' : 'none';
      if (showConf) {
        pieces.forEach((p, i) => {
          const x = 960 + p.vx * ct * 0.9, y = 760 + p.vy * ct + 1100 * ct * ct;
          p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(p.spin * ct + i * 20).toFixed(1)}deg)`;
          p.el.style.opacity = String(1 - span(ct, 1.8, 2.6));
        });
      }

      // Scene 6: office softens, terminal slides in from the left, agent card pops in on the right.
      const inUi = t >= SCENES[5] && t < SCENES[6];
      ui.style.display = inUi ? 'block' : 'none';
      const blurIn = ease(span(t, SCENES[5], SCENES[5] + 0.6)) * 6 + ease(span(t, SCENES[6], SCENES[6] + 0.6)) * 10;
      win.style.filter = t >= SCENES[5] ? `blur(${blurIn.toFixed(1)}px) saturate(${1 - 0.25 * Math.min(1, blurIn / 6)})` : '';
      if (inUi) {
        const ti = span(t, SCENES[5] + 0.1, SCENES[5] + 0.7);
        term.style.transform = `translateX(${((1 - backOut(ti)) * -1100).toFixed(1)}px) rotate(${((1 - ease(ti)) * -4).toFixed(2)}deg)`;
        const ai = span(t, SCENES[5] + 0.8, SCENES[5] + 1.3);
        agentCard.style.transform = `scale(${backOut(ai).toFixed(3)}) rotate(${((1 - ease(ai)) * 6).toFixed(2)}deg)`;
        const tt = t - (SCENES[5] + 0.55);
        tty.innerHTML = TTY.map((line, i) => {
          const start = i === 0 ? 0 : 0.6 + i * 0.55;
          if (tt < start) return '';
          if (!line.typed) return line.html;
          const n = Math.floor(clamp((tt - start) / 0.55) * line.typed.length);
          return PROMPT + line.typed.slice(0, n);
        }).filter(Boolean).join('\n');
        const finished = t > SCENES[5] + 3.4;
        chip.textContent = finished ? '✓ Done' : '● Working';
        chip.style.background = finished ? '#D7F2DF' : '#FCE9C2';
        chip.style.color = finished ? '#166534' : '#7A4B00';
        chip.style.transform = `scale(${finished ? backOut(span(t, SCENES[5] + 3.4, SCENES[5] + 3.7)) : 1})`;
        prog.style.width = `${Math.round(ease(span(t, SCENES[5] + 1.3, SCENES[5] + 3.4)) * 100)}%`;
      }

      // Scene 7: blur the office and bring the logo back with a bounce.
      const s7 = t >= SCENES[6];
      outro.style.display = s7 ? 'flex' : 'none';
      win.style.opacity = s7 ? String(1 - 0.5 * ease(span(t, SCENES[6], SCENES[6] + 0.5))) : '1';
      if (s7) {
        const op = backOut(span(t, SCENES[6] + 0.1, SCENES[6] + 0.65));
        const bob = Math.sin((t - SCENES[6]) * 5) * -6 * span(t, SCENES[6] + 0.7, SCENES[6] + 1.2);
        outroLogo.style.transform = `scale(${0.2 + 0.8 * op}) rotate(${(1 - op) * 14}deg) translateY(${bob}px)`;
        bounceLetters(outroLetters, SCENES[6] + 0.45, t);
      }

      // Bean bag wipes between scenes: a big rounded blob sweeps across; the cut happens under it.
      wipes.forEach((w, i) => {
        const at = SCENES[i + 1];
        const k = span(t, at - 0.3, at + 0.3);
        w.style.display = k > 0 && k < 1 ? 'block' : 'none';
        w.style.transform = `translateX(${lerp(-175, 105, easeInOut(k)).toFixed(1)}%) rotate(${i % 2 ? -8 : 8}deg)`;
      });
    },
  };
}
