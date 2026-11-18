// Drives the 3D office: renderer, camera, characters synced from OfficeState, effects, picking.
import * as THREE from 'three';
import type { OfficeEffect, OfficeState } from '../../shared/types';
import { appearanceFor } from './appearance';
import { CharacterRig, STATUS_3D } from './character';
import { buildEnvironment, type Environment, type SeatDevice } from './environment';
import { extraAnchor, LEAD_ANCHOR, nextSeats3d, personFromAnchor, seatPose, type SeatRef } from './layout';
import { disposeShared, disposeTree, sphere } from './kit';

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

interface Flight { mesh: THREE.Mesh; line: THREE.Line; from: THREE.Vector3; to: THREE.Vector3; start: number; dur: number }

const DEFAULT_ANGLE = -0.35;

export class OfficeEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private env: Environment;
  private chars = new Map<string, CharacterRig>();
  private seats: Record<string, SeatRef> = {};
  private extras = new Map<number, SeatDevice>();
  private flights: Flight[] = [];
  private raycaster = new THREE.Raycaster();
  private raf = 0;
  private running = false;
  private reduceMotion = false;
  private angle = DEFAULT_ANGLE;
  private distance = 21.5;
  private selectedId: string | null = null;
  private autoRotate = false;
  /** Frame cap: the scene is calm, so 60 FPS is plenty even on 120 Hz screens (saves GPU/battery/fans). */
  private maxFps = 60;
  private lastRender = 0;
  private focused = document.hasFocus();
  private onFocus = () => { this.focused = true; this.dirty = true; };
  private onBlur = () => { this.focused = false; };
  private dirty = true;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  private pixelRatio = this.maxPixelRatio;
  private slowFrames = 0;
  private onVisibility = () => (document.hidden ? this.stop() : this.start());

  constructor(private canvas: HTMLCanvasElement, opts: { reduceMotion?: boolean } = {}) {
    this.reduceMotion = !!opts.reduceMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color('#E7E1D8');
    this.scene.fog = new THREE.Fog('#E7E1D8', 28, 48);
    this.camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.1, 100);

    this.scene.add(new THREE.HemisphereLight('#FFF4E0', '#8A7A66', 1.1));
    const sun = new THREE.DirectionalLight('#FFF1D6', 2.2);
    sun.position.set(7, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13 });
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    this.env = buildEnvironment(this.scene);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('blur', this.onBlur);
  }

  // ---------- state sync ----------
  sync(state: OfficeState) {
    const subs = state.order.filter((id) => id !== 'lead').map((id) => state.agents[id]);
    this.seats = nextSeats3d(this.seats, subs.map((a) => ({ id: a.id, done: a.status === 'done' })));
    const now = performance.now();
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
      rig.setStatus(a.status);
      const pose = id === 'lead' ? { ...personFromAnchor(LEAD_ANCHOR), type: 'desk' as const } : seatPose(this.seats[id]);
      const at = rig.root.position;
      const moved = isNew || Math.abs(at.x - pose.x) > 0.01 || Math.abs(at.z - pose.z) > 0.01;
      if (moved) rig.placeAt(pose, now, isNew || this.reduceMotion ? 0 : 1600);
    }
    this.lightSeats(state);
    this.dirty = true;
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
  resetView() { this.angle = DEFAULT_ANGLE; this.distance = 21.5; this.dirty = true; }
  setReducedMotion(on: boolean) { this.reduceMotion = on; this.dirty = true; }
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
    const animating = !this.reduceMotion || this.flights.length > 0 || [...this.chars.values()].some((c) => c.isMoving);
    if (!animating && !this.dirty) { this.lastFrame = now; return; }
    // Cap the frame rate; when the app window is in the background, 15 FPS is enough.
    const cap = this.focused ? this.maxFps : Math.min(this.maxFps, 15);
    if (now - this.lastRender < 1000 / cap - 2) return;
    const dtSec = this.lastRender ? Math.min(0.1, (now - this.lastRender) / 1000) : 0;
    this.lastRender = now;
    if (this.autoRotate && !this.reduceMotion) this.angle += dtSec * 0.14;
    const el = 0.8;
    this.camera.position.set(Math.sin(this.angle) * this.distance * Math.cos(el), this.distance * Math.sin(el), Math.cos(this.angle) * this.distance * Math.cos(el));
    this.camera.lookAt(0.3, 0.2, -1.1);
    for (const c of this.chars.values()) c.update(now, !this.reduceMotion);
    this.flights = this.flights.filter((f) => {
      const k = (now - f.start) / f.dur;
      if (k >= 1.25) { this.scene.remove(f.mesh, f.line); f.line.geometry.dispose(); (f.line.material as THREE.Material).dispose(); (f.mesh.material as THREE.Material).dispose(); return false; }
      (f.mesh.userData.curve as THREE.QuadraticBezierCurve3).getPoint(Math.min(1, k), f.mesh.position);
      return true;
    });
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
    if (this.lastFrame) {
      const dt = now - this.lastFrame;
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
      this.adaptResolution(dt, cap);
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
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('blur', this.onBlur);
    disposeTree(this.scene);
    disposeShared();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
