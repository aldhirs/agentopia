// Drives the 3D office: renderer, camera, characters synced from OfficeState, effects, picking.
import * as THREE from 'three';
import type { OfficeEffect, OfficeState } from '../../shared/types';
import { appearanceFor } from './appearance';
import { CharacterRig, frameStep, STATUS_3D, type StandActivity } from './character';
import { initialLeadPlan, planLead, type LeadPlanState, type LeadSpot } from './leadPlan';
import { buildEnvironment, type Environment, type SeatDevice } from './environment';
import { extraAnchor, LEAD_ANCHOR, LEAD_STATIONS, nextSeats3d, personFromAnchor, seatPose, type SeatRef } from './layout';
import { disposeShared, disposeTree, sphere } from './kit';
import { NavGrid } from './nav';
import { dwellFor, nextSpot, NPCS, spotById, type NpcDef, type NpcSpot } from './npcs';

export interface EngineStats {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  lights: number;
  characters: number;
  pixelRatio: number;
}

interface Npc { def: NpcDef; rig: CharacterRig; spot: NpcSpot; until: number; arrived: boolean }
interface Flight { mesh: THREE.Mesh; line: THREE.Line; from: THREE.Vector3; to: THREE.Vector3; start: number; dur: number }

const DEFAULT_ANGLE = -0.35;
/** Frame rate while only idle animations play (typing, breathing, blinking). */
const IDLE_FPS = 24;
/** Frame rate while the app window is not focused. */
const BACKGROUND_FPS = 8;
/** Idle poses barely move shadows; refresh them this often instead of every frame. */
const IDLE_SHADOW_MS = 600;
/** Frame rate while only office staff stroll around (decoration, so a bit lighter than agent walks). */
const NPC_WALK_FPS = 30;
/** How long the staff cheer when the Lead finishes. */
const CHEER_MS = 4000;

/** What the Lead does at each spot, and the text on its name tag while it works there. */
const SPOT_ACTIVITY: Record<Exclude<LeadSpot, 'desk'>, { activity: StandActivity; label: string }> = {
  shelf: { activity: 'read', label: 'Membaca kode' },
  rack: { activity: 'rack', label: 'Menjalankan perintah' },
  board: { activity: 'board', label: 'Menyusun tugas' },
  phone: { activity: 'phone', label: 'Mencari di web' },
  front: { activity: 'wave', label: 'Menunggu kamu' },
};

export class OfficeEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private env: Environment;
  private chars = new Map<string, CharacterRig>();
  private seats: Record<string, SeatRef> = {};
  private extras = new Map<number, SeatDevice>();
  /** Walkable floor; built once (furniture is static), extra floor laptops are added as they appear. */
  private nav = new NavGrid();
  private flights: Flight[] = [];
  private raycaster = new THREE.Raycaster();
  private raf = 0;
  private running = false;
  private reduceMotion = false;
  private angle = DEFAULT_ANGLE;
  private distance = 21.5;
  private elevation = 0.8;
  private target = new THREE.Vector3(0.3, 0.2, -1.1);
  private selectedId: string | null = null;
  private autoRotate = false;
  /** Frame cap: the scene is calm, so 60 FPS is plenty even on 120 Hz screens (saves GPU/battery/fans). */
  private maxFps = 60;
  private lastRender = 0;
  private focused = document.hasFocus();
  private onFocus = () => { this.focused = true; this.dirty = true; };
  private onBlur = () => { this.focused = false; };
  private dirty = true;
  private shadowDirty = true;
  private lastShadow = 0;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  private pixelRatio = this.maxPixelRatio;
  private slowFrames = 0;
  private onVisibility = () => (document.hidden ? this.stop() : this.start());

  private adaptive = true;
  /** Where the Lead is (or is heading) in its office, and when to look again (lingering, dwell time). */
  private leadPlan: LeadPlanState = initialLeadPlan();
  private leadAt: LeadSpot | null = null;
  private leadTimer: ReturnType<typeof setTimeout> | undefined;
  private lastState: OfficeState | null = null;
  private lastTodos: unknown = null;
  /** Office staff strolling between the coffee bar, plants, billiard and windows (decoration only). */
  private npcs: Npc[] = [];
  private cheerUntil = 0;
  private leadDone = false;

  /**
   * `quality` is for offline rendering (the promo video): full device resolution, MSAA always on,
   * no dynamic resolution. The app itself uses the defaults.
   */
  constructor(private canvas: HTMLCanvasElement, opts: { reduceMotion?: boolean; quality?: boolean; npcs?: boolean } = {}) {
    if (opts.quality) {
      this.maxPixelRatio = this.pixelRatio = window.devicePixelRatio || 1;
      this.adaptive = false;
    }
    this.reduceMotion = !!opts.reduceMotion;
    // MSAA is barely visible on HiDPI screens but costly; integrated GPU is plenty for this scene.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !!opts.quality || (window.devicePixelRatio || 1) < 1.5, powerPreference: 'default' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Furniture and light never move: shadows are re-rendered only when characters change (see frame()).
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color('#E7E1D8');
    this.scene.fog = new THREE.Fog('#E7E1D8', 28, 48);
    this.camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.1, 100);

    this.scene.add(new THREE.HemisphereLight('#FFF4E0', '#8A7A66', 1.1));
    const sun = new THREE.DirectionalLight('#FFF1D6', 2.2);
    sun.position.set(7, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(opts.quality ? 4096 : 1024, opts.quality ? 4096 : 1024);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13 });
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    this.env = buildEnvironment(this.scene);
    this.setNpcs(opts.npcs !== false);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('blur', this.onBlur);
  }

  // ---------- state sync ----------
  sync(state: OfficeState) {
    // The staff cheer when the Lead finishes a turn (not when opening an office that is already done).
    const done = state.agents.lead?.status === 'done';
    if (done && !this.leadDone && this.lastState) this.cheerUntil = performance.now() + CHEER_MS;
    this.leadDone = done;
    this.lastState = state;
    if (state.todos !== this.lastTodos) { this.lastTodos = state.todos; this.env.drawBoard(state.todos); }
    const subs = state.order.filter((id) => id !== 'lead').map((id) => state.agents[id]);
    this.seats = nextSeats3d(this.seats, subs.map((a) => ({ id: a.id, done: a.status === 'done' })));
    // Light seats (and register extra floor laptops as obstacles) before planning walks.
    this.lightSeats(state);
    this.shadowDirty = true;
    const present = new Set(state.order);

    for (const [id, rig] of this.chars) {
      if (!present.has(id)) { this.scene.remove(rig.root); disposeTree(rig.root); this.chars.delete(id); }
    }
    for (const id of state.order) {
      const a = state.agents[id];
      let rig = this.chars.get(id);
      const isNew = !rig;
      if (!rig) {
        rig = new CharacterRig(id, a.label, appearanceFor(a.kind === 'lead' ? 'lead' : a.type));
        this.chars.set(id, rig);
        this.scene.add(rig.root);
      }
      if (id === 'lead') { this.syncLead(rig, a.status, a.tool, isNew); continue; }
      rig.setStatus(a.status);
      const pose = id === 'lead' ? { ...personFromAnchor(LEAD_ANCHOR), type: 'desk' as const } : seatPose(this.seats[id]);
      const cur = rig.seat;
      const moved = isNew || !cur || Math.abs(cur.x - pose.x) > 0.01 || Math.abs(cur.z - pose.z) > 0.01;
      if (!moved) continue;
      if (isNew || this.reduceMotion || !cur) { rig.placeAt(pose); continue; }
      // Stand up next to the current seat (or keep walking from here), walk around the furniture,
      // and sit down from the stand spot of the new seat.
      const start = rig.seated ? this.nav.standPoint(cur) : { x: rig.root.position.x, z: rig.root.position.z };
      const end = this.nav.standPoint(pose);
      rig.walkTo(pose, this.nav.path(start, end));
    }

    this.dirty = true;
  }

  /** Moves the Lead between its desk and the stations of its office, following what it does. */
  private syncLead(rig: CharacterRig, status: OfficeState['agents'][string]['status'], tool: string | undefined, isNew: boolean) {
    const now = performance.now();
    const { plan, recheckAt } = planLead(status, tool, this.leadPlan, now);
    this.leadPlan = plan;
    clearTimeout(this.leadTimer);
    if (recheckAt !== null) {
      this.leadTimer = setTimeout(() => { if (this.lastState) this.sync(this.lastState); }, Math.max(50, recheckAt - now + 20));
    }
    const spot = plan.spot;
    const station = spot === 'desk' ? null : SPOT_ACTIVITY[spot];
    // Permission prompts and errors keep their own label; working at a station says what it does.
    const keepStatusLabel = status === 'waiting' || status === 'error' || status === 'done' || status === 'idle';
    rig.setStatus(status, station && !keepStatusLabel ? station.label : undefined);
    rig.activity = station?.activity ?? null;
    if (spot === this.leadAt && !isNew) return;
    this.leadAt = spot;
    const desk = { ...personFromAnchor(LEAD_ANCHOR), type: 'desk' as const };
    const target = spot === 'desk' ? desk : { ...LEAD_STATIONS[spot], type: 'desk' as const };
    if (isNew || this.reduceMotion || !rig.seat) {
      if (spot === 'desk') rig.placeAt(desk); else rig.standAt(target);
      return;
    }
    const start = rig.seated ? this.nav.standPoint(rig.seat) : { x: rig.root.position.x, z: rig.root.position.z };
    const end = spot === 'desk' ? this.nav.standPoint(desk) : target;
    rig.walkTo(target, this.nav.path(start, end), spot === 'desk');
    this.shadowDirty = true;
  }

  private lightSeats(state: OfficeState) {
    const occupant = new Map<string, string>(); // seat key -> agent id
    for (const [id, s] of Object.entries(this.seats)) occupant.set(`${s.kind}:${s.index}`, id);
    const paint = (dev: SeatDevice, agentId: string | undefined) => {
      const a = agentId ? state.agents[agentId] : undefined;
      const color = a ? STATUS_3D[a.status].color : '#2A2833';
      for (const m of dev.screens) m.emissive.set(color);
      dev.glow.material.color.set(color);
      dev.glow.visible = !!a && a.status !== 'done' && a.status !== 'idle';
      return !!a;
    };
    this.env.desks.forEach((d, i) => paint(d, occupant.get(`desk:${i}`)));
    this.env.floors.forEach((d, i) => { d.group.visible = paint(d, occupant.get(`floor:${i}`)); });
    paint(this.env.lead, 'lead');
    // Extra floor spots get a laptop + cushion on demand.
    for (const [key, id] of occupant) {
      if (!key.startsWith('extra:')) continue;
      const idx = Number(key.slice(6));
      if (!this.extras.has(idx)) this.extras.set(idx, this.env.makeLaptop(extraAnchor(idx)));
      void id;
    }
    for (const [idx, dev] of this.extras) dev.group.visible = paint(dev, occupant.get(`extra:${idx}`));
    this.nav.setExtras([...this.extras].filter(([, dev]) => dev.group.visible).map(([idx]) => idx));
  }

  effects(list: OfficeEffect[]) {
    if (this.reduceMotion) return;
    const lead = this.chars.get('lead');
    for (const e of list) {
      const other = this.chars.get(e.type === 'dispatch' ? e.to : e.from);
      if (!lead || !other) continue;
      const a = lead.worldTop, b = other.worldTop;
      const [from, to] = e.type === 'dispatch' ? [a, b] : [b, a];
      const color = e.type === 'dispatch' ? '#3B4BD8' : '#15803D';
      const meshP = new THREE.Mesh(sphere(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: new THREE.Color(color), emissiveIntensity: 1.6 }));
      const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 1.6), to);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineDashedMaterial({ color, dashSize: 0.15, gapSize: 0.1 }));
      line.computeLineDistances();
      this.scene.add(meshP, line);
      this.flights.push({ mesh: meshP, line, from, to, start: performance.now(), dur: 1600 });
      meshP.userData.curve = curve;
    }
    this.dirty = true;
  }

  /** Adds or removes the office staff. */
  setNpcs(on: boolean) {
    if (on === this.npcs.length > 0) return;
    if (!on) {
      for (const n of this.npcs) { this.scene.remove(n.rig.root); disposeTree(n.rig.root); }
      this.npcs = [];
    } else {
      const now = performance.now();
      this.npcs = NPCS.map((def, i) => {
        const spot = spotById(def.start);
        const rig = new CharacterRig(def.id, '', def.look);
        rig.setTagVisible(false);
        rig.activity = spot.activity;
        rig.standAt(spot);
        this.scene.add(rig.root);
        // Stagger the first walks so they do not all set off together.
        return { def, rig, spot, until: now + 4000 + i * 7000 + Math.random() * 4000, arrived: true };
      });
    }
    this.shadowDirty = true;
    this.dirty = true;
  }

  /** Sends one staff member to a spot now (visual checks); `stay` keeps them there for a minute. */
  sendNpc(index: number, spotId: string, stay = 60_000) {
    const n = this.npcs[index];
    if (!n) return;
    n.until = performance.now() + stay;
    const next = spotById(spotId);
    n.spot = next;
    n.rig.activity = next.activity;
    if (this.reduceMotion) { n.rig.standAt(next); return; }
    n.arrived = false;
    n.rig.walkTo({ ...next, type: 'desk' }, this.nav.path({ x: n.rig.root.position.x, z: n.rig.root.position.z }, next), false);
  }

  /** Sends idle staff to their next spot and sets what they do there. */
  private stepNpcs(now: number) {
    if (this.reduceMotion) return;
    const cheer = now < this.cheerUntil;
    for (const n of this.npcs) {
      if (n.rig.isMoving) continue;
      if (!n.arrived) { n.arrived = true; n.until = Math.max(n.until, now + dwellFor(Math.random)); }
      n.rig.activity = cheer ? 'cheer' : n.spot.activity;
      if (now < n.until || cheer) continue;
      const taken = new Set(this.npcs.filter((o) => o !== n).map((o) => o.spot.id));
      const next = nextSpot(n.spot.id, taken, Math.random);
      const route = this.nav.path({ x: n.rig.root.position.x, z: n.rig.root.position.z }, next);
      if (!route.length) { n.until = now + 5000; continue; }
      n.spot = next;
      n.arrived = false;
      n.rig.activity = next.activity;
      n.rig.walkTo({ ...next, type: 'desk' }, route, false);
    }
  }

  // ---------- interaction ----------
  pick(clientX: number, clientY: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.chars.values()].map((c) => c.hit), false);
    return hits.length ? (hits[0].object.userData.agentId as string) : null;
  }

  select(id: string | null) {
    if (this.selectedId === id) return;
    if (this.selectedId) this.chars.get(this.selectedId)?.setSelected(false);
    this.selectedId = id;
    if (id) this.chars.get(id)?.setSelected(true);
    this.dirty = true;
  }

  /** World position and facing of a character (for scripted cameras). */
  poseOf(id: string): { x: number; y: number; z: number; rotY: number } | null {
    const c = this.chars.get(id);
    if (!c) return null;
    const p = c.root.position;
    return { x: p.x, y: p.y, z: p.z, rotY: c.root.rotation.y };
  }

  /** Shows name tags only for these characters (null = everyone). Used by close-up shots. */
  showTags(ids: string[] | null) {
    for (const [id, c] of this.chars) c.setTagVisible(!ids || ids.includes(id));
    this.dirty = true;
  }

  /** Screen point (canvas CSS px) of a world position, e.g. to anchor overlay effects. */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height };
  }

  /** Screen rectangle (canvas CSS px) around a character, for anchoring the detail card. */
  rectOf(id: string): { x: number; y: number; w: number; h: number } | null {
    const c = this.chars.get(id);
    if (!c) return null;
    const r = this.canvas.getBoundingClientRect();
    const proj = (v: THREE.Vector3) => { const p = v.clone().project(this.camera); return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height }; };
    const top = proj(c.worldTop), base = proj(c.worldBase);
    const h = Math.max(40, base.y - top.y);
    return { x: top.x - h * 0.45, y: top.y, w: h * 0.9, h };
  }

  rotate(deltaPx: number) { this.angle -= deltaPx * 0.006; this.dirty = true; }
  zoom(deltaY: number) { this.distance = Math.min(30, Math.max(11, this.distance * (1 + deltaY * 0.001))); this.dirty = true; }
  resetView() { this.angle = DEFAULT_ANGLE; this.distance = 21.5; this.elevation = 0.8; this.target.set(0.3, 0.2, -1.1); this.dirty = true; }
  /** Scripted camera (orbit angle, distance, elevation in radians, look-at point); used for demo videos. */
  setCamera(c: { angle?: number; distance?: number; elevation?: number; target?: [number, number, number] }) {
    if (c.angle !== undefined) this.angle = c.angle;
    if (c.distance !== undefined) this.distance = c.distance;
    if (c.elevation !== undefined) this.elevation = c.elevation;
    if (c.target) this.target.set(...c.target);
    this.dirty = true;
  }
  setReducedMotion(on: boolean) {
    this.reduceMotion = on;
    // Staff halfway through a walk step straight onto their spot.
    if (on) for (const n of this.npcs) if (n.rig.isMoving) { n.rig.standAt(n.spot); n.arrived = true; n.rig.activity = n.spot.activity; }
    this.shadowDirty = true;
    this.dirty = true;
  }
  /** Slow camera orbit (used as the lobby backdrop). */
  setAutoRotate(on: boolean) { this.autoRotate = on; this.dirty = true; }
  setMaxFps(fps: number) { this.maxFps = Math.max(5, Math.min(120, fps)); }

  resize(w: number, h: number) {
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ---------- loop ----------
  start() {
    if (this.running || document.hidden) return;
    this.running = true;
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(now: number) {
    // Render on demand: full rate only while something travels (walks, flights, orbit, user input),
    // a low rate for idle animations, nothing at all when nothing changes (reduced motion).
    this.stepNpcs(now);
    const agentsWalking = [...this.chars.values()].some((c) => c.isMoving);
    const npcsWalking = this.npcs.some((n) => n.rig.isMoving);
    const walking = agentsWalking || npcsWalking;
    const moving = agentsWalking || this.flights.length > 0 || (this.autoRotate && !this.reduceMotion);
    if (!moving && !npcsWalking && this.reduceMotion && !this.dirty) { this.lastFrame = now; return; }
    let cap = moving || this.dirty ? this.maxFps : Math.min(this.maxFps, npcsWalking ? NPC_WALK_FPS : IDLE_FPS);
    if (!this.focused) cap = Math.min(cap, BACKGROUND_FPS);
    if (now - this.lastRender < 1000 / cap - 2) return;
    const dtSec = frameStep(this.lastRender, now);
    this.lastRender = now;
    if (this.autoRotate && !this.reduceMotion) this.angle += dtSec * 0.14;
    const el = this.elevation;
    this.camera.position.set(
      this.target.x + Math.sin(this.angle) * this.distance * Math.cos(el),
      this.target.y + this.distance * Math.sin(el),
      this.target.z + Math.cos(this.angle) * this.distance * Math.cos(el),
    );
    this.camera.lookAt(this.target);
    for (const c of this.chars.values()) c.update(now, !this.reduceMotion);
    for (const n of this.npcs) n.rig.update(now, !this.reduceMotion);
    // Server rack LEDs flicker while the Lead runs commands there.
    const busyRack = this.leadPlan.spot === 'rack' && !this.reduceMotion;
    const tick = Math.floor(now / 110);
    this.env.rackLeds.forEach((m, i) => {
      m.emissiveIntensity = busyRack ? (((i * 7919 + tick * (i % 3 + 1) * 104729) % 10) > 4 ? 2.6 : 0.25) : 0.55;
    });
    this.flights = this.flights.filter((f) => {
      const k = (now - f.start) / f.dur;
      if (k >= 1.25) { this.scene.remove(f.mesh, f.line); f.line.geometry.dispose(); (f.line.material as THREE.Material).dispose(); (f.mesh.material as THREE.Material).dispose(); return false; }
      (f.mesh.userData.curve as THREE.QuadraticBezierCurve3).getPoint(Math.min(1, k), f.mesh.position);
      return true;
    });
    if (this.shadowDirty || walking || (!this.reduceMotion && now - this.lastShadow > IDLE_SHADOW_MS)) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
      this.lastShadow = now;
    }
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
    if (this.lastFrame) {
      const dt = now - this.lastFrame;
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
      if (this.adaptive) this.adaptResolution(dt, cap);
    }
    this.lastFrame = now;
  }

  /** Dynamic resolution: drop the render scale while frames are slow (>22 ms for ~1 s). */
  private adaptResolution(dt: number, cap: number) {
    const budget = 1000 / cap + 6;
    this.slowFrames = dt > budget ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 45 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.slowFrames = 0;
    }
  }

  stats(): EngineStats {
    const ft = this.frameTimes.length ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length : 0;
    const info = this.renderer.info;
    let lights = 0;
    this.scene.traverseVisible((o) => { if ((o as THREE.Light).isLight) lights++; });
    return {
      fps: ft ? 1000 / ft : 0, frameMs: ft, calls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures, lights, characters: this.chars.size, pixelRatio: this.pixelRatio,
    };
  }

  dispose() {
    this.stop();
    clearTimeout(this.leadTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('blur', this.onBlur);
    disposeTree(this.scene);
    disposeShared();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
