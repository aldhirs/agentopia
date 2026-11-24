// One 3D agent: a person (or robot) built from primitives with jointed legs. Seated, it is posed by
// status; moving between seats it stands up, walks a path (legs stepping, arms swinging, turning
// towards where it goes), turns to the seat and sits down. The seated pose fits the seat type so
// nothing clips: on a desk chair, sunk into a bean bag against its backrest, cross-legged on a cushion.
import * as THREE from 'three';
import type { AgentStatus } from '../../shared/types';
import type { Appearance } from './appearance';
import type { SeatPose } from './layout';
import type { P2 } from './nav';
import { box, capsule, cyl, labelSprite, mat, mesh, relabel, sphere } from './kit';

export type Pose = 'idle' | 'think' | 'tool' | 'wait' | 'error' | 'done';
/** What a standing character does at a station in the lead office. */
/** What a standing character does at a spot: Lead stations, plus office staff (NPC) activities. */
export type StandActivity = 'read' | 'rack' | 'board' | 'phone' | 'wave' | 'sip' | 'water' | 'cue' | 'look' | 'chat' | 'cheer';

interface StandPose { L: number[]; R: number[]; head: number; dy: number; lean?: number; turn?: number }

export const STATUS_3D: Record<AgentStatus, { pose: Pose; color: string; label: string }> = {
  idle: { pose: 'idle', color: '#9A96A6', label: 'Idle' },
  thinking: { pose: 'think', color: '#5B8CFF', label: 'Berpikir' },
  waiting_subagents: { pose: 'think', color: '#5B8CFF', label: 'Menunggu subagent' },
  tool_use: { pose: 'tool', color: '#5FD0FF', label: 'Bekerja' },
  waiting: { pose: 'wait', color: '#FF8A3D', label: 'Minta izin' },
  waiting_user: { pose: 'wait', color: '#FF8A3D', label: 'Menunggu kamu' },
  error: { pose: 'error', color: '#FF4D4D', label: 'Error' },
  done: { pose: 'done', color: '#3DDC84', label: 'Selesai' },
};

interface Arm { sh: THREE.Group; el: THREE.Group }
interface Leg { hip: THREE.Group; knee: THREE.Group; side: number }

/** Hip height in body space (seated on a desk chair). Standing raises the body by STAND_LIFT. */
const HIP_Y = 0.62;
const THIGH = 0.42;
const SHIN = 0.48;
const STAND_LIFT = THIGH + SHIN + 0.06 - HIP_Y;
const WALK_SPEED = 1.5; // m/s
const STRIDE = 0.55; // m per step
const TURN_SPEED = 7; // rad/s

/** Seated pose per seat type: body offset, recline of the upper body, leg angles. */
interface SeatParams { y: number; z: number; recline: number; thigh: number; knee: number; splay: number; cross: number }
const SEATED: Record<SeatPose['type'], SeatParams> = {
  // Desk chair (seat top at 0.54): thighs level, shins down, feet on the floor.
  desk: { y: 0, z: 0, recline: 0, thigh: -Math.PI / 2, knee: Math.PI / 2, splay: 0.05, cross: 0 },
  // Bean bag: sunk slightly into the top, shifted forward so the back rests on the backrest, legs out.
  bean: { y: -0.06, z: 0.14, recline: -0.35, thigh: -Math.PI / 2 - 0.15, knee: 1.27, splay: 0.14, cross: 0 },
  // Floor cushion (top at 0.12): cross-legged.
  floor: { y: -0.42, z: 0, recline: 0, thigh: -Math.PI / 2 + 0.12, knee: 0, splay: 0.6, cross: Math.PI / 2 },
};

type Phase = 'up' | 'walk' | 'turn' | 'down';
interface Trip {
  phase: Phase;
  /** Waypoints still to walk to; the last one is the stand spot next to the seat. */
  pts: P2[];
  /** Slide while standing up / sitting down (out of / into the seat). */
  slideFrom: P2;
  slideTo: P2;
  target: SeatPose;
  /** false = stop and stand at the target (a station) instead of sitting down. */
  sit: boolean;
}

/**
 * Seconds to advance for a frame. Frames can be far apart on purpose (8 FPS while the window is in
 * the background), so the step must cover them; it is only capped to avoid a jump after a long pause.
 */
export const MAX_STEP_S = 0.5;
export function frameStep(prevMs: number, nowMs: number): number {
  return prevMs ? Math.min(MAX_STEP_S, Math.max(0, (nowMs - prevMs) / 1000)) : 0;
}

const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function angleTo(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class CharacterRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  /** Everything above the hips; pivots at the hips so reclining leans back instead of sliding. */
  private upper = new THREE.Group();
  private head = new THREE.Group();
  private L: Arm;
  private R: Arm;
  private legL: Leg;
  private legR: Leg;
  private eyes: THREE.Mesh[] = [];
  private orb: THREE.Mesh;
  private orbMat: THREE.MeshStandardMaterial;
  private tag: THREE.Sprite;
  private ring: THREE.Mesh;
  private pose: Pose = 'idle';
  private name: string;
  private statusLabel = '';
  private statusColor = '#9A96A6';
  private selected = false;
  private seed = Math.random() * 10;
  /** Seat the character is on or heading to. */
  seat: SeatPose | null = null;
  /** Seat type whose seated pose is blended in (the old seat while getting up, the new one while sitting). */
  private seatType: SeatPose['type'] = 'desk';
  /** 1 = seated, 0 = standing. */
  private sit = 1;
  private trip?: Trip;
  private gait = 0;
  private walkAmt = 0;
  private lastNow = 0;
  /** Activity while standing still at a station (arms, head, props). */
  activity: StandActivity | null = null;
  private book: THREE.Object3D;
  private phone: THREE.Object3D;
  /** Props of the office staff, built on first use: cup, watering can, billiard cue. */
  private cup?: THREE.Object3D;
  private can?: THREE.Object3D;
  private cue?: THREE.Object3D;
  /** Invisible capsule used for click picking. */
  readonly hit: THREE.Mesh;

  constructor(readonly agentId: string, name: string, look: Appearance) {
    this.name = name;
    const skin = look.robot ? mat('#C4CDD7', 0.4, 0.15) : mat(look.skin, 0.6);
    const shirt = look.robot ? mat('#D3DAE2', 0.4, 0.15) : mat(look.shirt, 0.8);
    this.root.add(this.body);
    this.upper.position.y = HIP_Y;
    this.body.add(this.upper);

    const pants = look.robot ? mat('#9AA6B2', 0.4, 0.4) : mat('#3D4152', 0.8);
    const shoe = look.robot ? mat('#7D8894', 0.4, 0.4) : mat('#2A2833', 0.6);
    const pelvis = mesh(box(0.38, 0.16, 0.26), pants);
    pelvis.position.y = HIP_Y + 0.02;
    this.body.add(pelvis);
    const leg = (side: number): Leg => {
      const hip = new THREE.Group(); hip.position.set(side * 0.11, HIP_Y, 0); hip.rotation.order = 'YXZ'; this.body.add(hip);
      const thigh = mesh(capsule(0.078, THIGH - 0.1), pants); thigh.position.y = -THIGH / 2; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
      const shin = mesh(capsule(0.066, SHIN - 0.1), pants); shin.position.y = -SHIN / 2; knee.add(shin);
      const foot = mesh(box(0.12, 0.07, 0.24), shoe); foot.position.set(0, -SHIN - 0.02, 0.05); knee.add(foot);
      return { hip, knee, side };
    };
    this.legL = leg(-1);
    this.legR = leg(1);

    const torso = mesh(capsule(0.21, 0.32), shirt);
    torso.position.y = 0.98 - HIP_Y; torso.scale.set(1.12, 1, 0.8);
    this.upper.add(torso);
    if (look.robot) {
      const chest = new THREE.Mesh(sphere(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: look.shirt, emissive: new THREE.Color(look.shirt), emissiveIntensity: 1.5 }));
      chest.position.set(0, 1.02 - HIP_Y, 0.17);
      this.upper.add(chest);
    }

    this.head.position.y = 1.47 - HIP_Y;
    this.upper.add(this.head);
    if (look.robot) this.buildRobotHead(look);
    else this.buildHumanHead(look, skin);

    const arm = (side: number): Arm => {
      const sh = new THREE.Group(); sh.position.set(side * 0.27, 1.17 - HIP_Y, 0); this.upper.add(sh);
      const up = mesh(capsule(0.068, 0.2), look.robot ? mat('#C4CDD7', 0.4, 0.15) : shirt); up.position.y = -0.15; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
      const fore = mesh(capsule(0.058, 0.18), skin, false); fore.position.y = -0.13; el.add(fore);
      const hand = mesh(sphere(0.066, 14, 10), skin, false); hand.position.y = -0.27; el.add(hand);
      return { sh, el };
    };
    this.L = arm(-1);
    this.R = arm(1);

    // Props for station activities: a book held in both hands, a phone in the right hand.
    this.book = new THREE.Group();
    const cover = mesh(box(0.3, 0.035, 0.22), mat('#F78154', 0.7), false);
    const pages = mesh(box(0.28, 0.03, 0.2), mat('#FBFAF7', 0.8), false); pages.position.y = 0.012;
    this.book.add(cover, pages);
    this.book.position.set(0, 1.0 - HIP_Y, 0.36); this.book.rotation.x = -0.75;
    this.book.visible = false;
    this.upper.add(this.book);
    this.phone = mesh(box(0.075, 0.14, 0.012), mat('#1C1B22', 0.3, 0.2), false);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.12), new THREE.MeshStandardMaterial({ color: '#111111', emissive: new THREE.Color('#9FD8FF'), emissiveIntensity: 1.2 }));
    glass.position.z = 0.007; this.phone.add(glass);
    this.phone.position.set(0, -0.31, 0.06); this.phone.rotation.x = -1.2;
    this.phone.visible = false;
    this.R.el.add(this.phone);

    this.orbMat = new THREE.MeshStandardMaterial({ color: '#9A96A6', emissive: new THREE.Color('#9A96A6'), emissiveIntensity: 2 });
    this.orb = new THREE.Mesh(sphere(0.06, 16, 12), this.orbMat);
    this.root.add(this.orb);
    this.tag = labelSprite(name, '#9A96A6');
    this.root.add(this.tag);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: '#1C1B22' }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.02; this.ring.visible = false;
    this.root.add(this.ring);

    this.hit = new THREE.Mesh(capsule(0.42, 1.3), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 1.0;
    this.hit.userData.agentId = agentId;
    this.root.add(this.hit);
  }

  private buildHumanHead(look: Appearance, skin: THREE.Material) {
    const h = this.head;
    const neck = mesh(cyl(0.07, 0.08, 0.12, 12), skin, false); neck.position.y = -0.2; h.add(neck);
    const skull = mesh(sphere(0.2, 32, 24), skin); skull.scale.set(1, 1.1, 1); h.add(skull);
    const nose = mesh(sphere(0.03, 12, 10), skin, false); nose.position.set(0, -0.02, 0.2); h.add(nose);
    for (const x of [-0.21, 0.21]) { const ear = mesh(sphere(0.045, 12, 10), skin, false); ear.position.set(x, 0, 0); ear.scale.set(0.6, 1, 0.8); h.add(ear); }
    const eyeMat = mat('#1C1B22', 0.2);
    this.eyes = [-0.075, 0.075].map((x) => { const e = new THREE.Mesh(sphere(0.026, 12, 10), eyeMat); e.position.set(x, 0.03, 0.18); h.add(e); return e; });
    const hairM = mat(look.hair, 0.9);
    const cap = mesh(new THREE.SphereGeometry(0.215, 32, 16, 0, Math.PI * 2, 0, look.style === 'buzz' ? Math.PI * 0.42 : Math.PI * 0.55), hairM);
    cap.position.set(0, 0.02, -0.012); cap.scale.set(1, 1.1, 1); cap.rotation.x = -0.25; h.add(cap);
    if (look.style === 'long' || look.style === 'bob') {
      const len = look.style === 'long' ? 0.42 : 0.2;
      const back = mesh(capsule(0.17, len), hairM); back.position.set(0, -0.05 - len / 3, -0.08); back.scale.set(1.25, 1, 0.7); h.add(back);
    }
    if (look.style === 'bun') { const bun = mesh(sphere(0.09, 16, 12), hairM, false); bun.position.set(0, 0.2, -0.14); h.add(bun); }
    if (look.style === 'curly') {
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const curl = mesh(sphere(0.075, 12, 10), hairM, false);
        curl.position.set(Math.cos(a) * 0.15, 0.15 + Math.sin(k * 1.7) * 0.02, Math.sin(a) * 0.12 - 0.03);
        h.add(curl);
      }
    }
    if (look.glasses) {
      const gm = mat('#2A2833', 0.3, 0.4);
      for (const x of [-0.075, 0.075]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.008, 8, 24), gm); r.position.set(x, 0.03, 0.195); h.add(r); }
    }
    if (look.headset) {
      const hm = mat('#2A2833', 0.4, 0.3);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.016, 8, 32, Math.PI), hm); band.position.y = 0.02; h.add(band);
      for (const x of [-0.23, 0.23]) { const cup = mesh(cyl(0.06, 0.06, 0.05, 16), hm, false); cup.rotation.z = Math.PI / 2; cup.position.set(x, 0, 0); h.add(cup); }
    }
  }

  private buildRobotHead(look: Appearance) {
    const h = this.head;
    const shell = mesh(box(0.38, 0.34, 0.34), mat('#E6EBF0', 0.35, 0.15)); h.add(shell);
    const visor = new THREE.Mesh(box(0.3, 0.11, 0.02), mat('#1C2733', 0.2)); visor.position.set(0, 0.01, 0.175); h.add(visor);
    const eyeM = new THREE.MeshStandardMaterial({ color: '#7FE6FF', emissive: new THREE.Color('#7FE6FF'), emissiveIntensity: 2 });
    this.eyes = [-0.07, 0.07].map((x) => { const e = new THREE.Mesh(box(0.05, 0.05, 0.01), eyeM); e.position.set(x, 0.01, 0.187); h.add(e); return e; });
    const ant = mesh(cyl(0.01, 0.01, 0.16, 8), mat('#8A96A3', 0.4), false); ant.position.y = 0.25; h.add(ant);
    const tip = new THREE.Mesh(sphere(0.035, 12, 10), new THREE.MeshStandardMaterial({ color: look.shirt, emissive: new THREE.Color(look.shirt), emissiveIntensity: 1.6 }));
    tip.position.y = 0.34; h.add(tip);
  }

  /** `label` replaces the status text on the name tag (e.g. "Membaca kode" at the bookshelf). */
  setStatus(status: AgentStatus, label?: string) {
    const s = STATUS_3D[status];
    this.pose = s.pose;
    this.statusLabel = label ?? s.label;
    this.statusColor = s.color;
    this.orbMat.color.set(s.color);
    this.orbMat.emissive.set(s.color);
    relabel(this.tag, `${this.name} · ${this.statusLabel}`, s.color, this.selected);
  }

  /** Office staff props, built the first time they are needed (agents never pay for them). */
  private showProp(name: 'cup' | 'can' | 'cue', on: boolean) {
    if (!on && !this[name]) return;
    let p = this[name];
    if (!p) {
      p = new THREE.Group();
      if (name === 'cup') {
        const c = mesh(cyl(0.045, 0.038, 0.1, 16), mat('#FFFFFF', 0.4), false); c.position.y = 0.05; p.add(c);
        const coffee = mesh(cyl(0.04, 0.04, 0.005, 16), mat('#5A3A22', 0.3), false); coffee.position.y = 0.098; p.add(coffee);
        p.position.set(0, -0.3, 0.04);
        this.R.el.add(p);
      } else if (name === 'can') {
        const green = mat('#4D9078', 0.5, 0.2);
        const body = mesh(cyl(0.08, 0.09, 0.16, 16), green, false); body.position.y = -0.06; p.add(body);
        const spout = mesh(cyl(0.012, 0.018, 0.24, 8), green, false); spout.rotation.x = Math.PI / 2 - 0.5; spout.position.set(0, -0.02, 0.17); p.add(spout);
        p.position.set(0, -0.32, 0);
        this.R.el.add(p);
      } else {
        const stick = mesh(cyl(0.012, 0.022, 1.45, 8), mat('#C79A5B', 0.5), false); stick.rotation.x = Math.PI / 2; p.add(stick);
        p.position.set(0.12, 0.92 - HIP_Y, 0.38);
        p.rotation.x = 0.1;
        this.upper.add(p);
      }
      this[name] = p;
    }
    p.visible = on;
  }

  /** Shows or hides the floating name tag (and status orb). */
  setTagVisible(on: boolean) {
    this.tag.visible = on;
    this.orb.visible = on;
  }

  setSelected(on: boolean) {
    if (on === this.selected) return;
    this.selected = on;
    this.ring.visible = on;
    relabel(this.tag, `${this.name} · ${this.statusLabel}`, this.statusColor, on);
  }

  /** Puts the character on a seat immediately. */
  placeAt(p: SeatPose) {
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.rotY;
    this.seat = p;
    this.seatType = p.type;
    this.sit = 1;
    this.trip = undefined;
  }

  /** True while the character is (mostly) seated, i.e. a new trip starts by standing up from `seat`. */
  get seated(): boolean {
    return this.sit > 0;
  }

  /**
   * Walks to `target`: stands up (sliding to route[0]), follows the route, turns and sits down.
   * The last route point is the stand spot next to the target seat.
   */
  walkTo(target: SeatPose, route: P2[], sit = true) {
    const here = { x: this.root.position.x, z: this.root.position.z };
    const seated = this.sit > 0;
    this.trip = {
      phase: seated ? 'up' : 'walk',
      pts: seated ? route.slice(1) : route,
      slideFrom: here,
      slideTo: seated ? route[0] : here,
      target,
      sit,
    };
    this.seat = target;
  }

  /** Stands at a spot immediately (reduced motion), facing rotY. */
  standAt(p: { x: number; z: number; rotY: number }) {
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.rotY;
    this.seat = { ...p, type: 'desk' };
    this.sit = 0;
    this.trip = undefined;
  }

  get isMoving(): boolean {
    return !!this.trip;
  }

  private get bodyY(): number {
    return this.body.position.y;
  }

  get worldTop(): THREE.Vector3 {
    return this.root.localToWorld(new THREE.Vector3(0, 1.9 + this.bodyY, 0));
  }

  get worldBase(): THREE.Vector3 {
    return this.root.localToWorld(new THREE.Vector3(0, 0.6 + this.bodyY, 0));
  }

  /** Advances the current trip by dt seconds. */
  private advance(dt: number) {
    const trip = this.trip;
    if (!trip) {
      // Keep easing the steps out after arriving, so the character settles into its standing pose.
      this.walkAmt += (0 - this.walkAmt) * Math.min(1, dt * 8);
      return;
    }
    const pos = this.root.position;
    let moving = false;
    if (trip.phase === 'up') {
      this.sit = Math.max(0, this.sit - dt / 0.55);
      const k = ease(1 - this.sit);
      pos.x = lerp(trip.slideFrom.x, trip.slideTo.x, k);
      pos.z = lerp(trip.slideFrom.z, trip.slideTo.z, k);
      if (this.sit === 0) trip.phase = trip.pts.length ? 'walk' : 'turn';
    } else if (trip.phase === 'walk') {
      const next = trip.pts[0];
      const dx = next.x - pos.x, dz = next.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.02) {
        trip.pts.shift();
        if (!trip.pts.length) trip.phase = 'turn';
      } else {
        // Turn towards the next waypoint; slow down for sharp turns instead of moonwalking.
        const d = angleTo(this.root.rotation.y, Math.atan2(dx, dz));
        this.root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * dt);
        const step = Math.min(dist, WALK_SPEED * dt * Math.max(0, Math.cos(d)) ** 2);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        this.gait += (Math.max(step, TURN_SPEED * dt * Math.abs(d) * 0.04) / STRIDE) * Math.PI;
        moving = true;
      }
    } else if (trip.phase === 'turn') {
      const d = angleTo(this.root.rotation.y, trip.target.rotY);
      this.root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * 0.7 * dt);
      this.gait += (TURN_SPEED * 0.7 * dt / 1.6) * Math.PI * Math.min(1, Math.abs(d) * 3);
      moving = Math.abs(d) > 0.05;
      if (Math.abs(d) < 0.01 && !trip.sit) {
        this.root.rotation.y = trip.target.rotY;
        this.trip = undefined;
      } else if (Math.abs(d) < 0.01) {
        trip.phase = 'down';
        trip.slideFrom = { x: pos.x, z: pos.z };
        trip.slideTo = { x: trip.target.x, z: trip.target.z };
        this.seatType = trip.target.type;
      }
    } else {
      this.sit = Math.min(1, this.sit + dt / (trip.target.type === 'bean' ? 0.75 : 0.6));
      const k = ease(this.sit);
      pos.x = lerp(trip.slideFrom.x, trip.slideTo.x, k);
      pos.z = lerp(trip.slideFrom.z, trip.slideTo.z, k);
      if (this.sit === 1) {
        this.root.rotation.y = trip.target.rotY;
        this.trip = undefined;
      }
    }
    // Ease the stepping in and out so starting and stopping look natural.
    this.walkAmt += ((moving ? 1 : 0) - this.walkAmt) * Math.min(1, dt * 8);
  }

  /** Arm angles [shoulder x, shoulder z, elbow x] and head tilt while standing at a station. */
  private standPose(t: number, wob: number): StandPose | null {
    // Status beats the station: a permission prompt or an error shows wherever the character stands.
    if (this.pose === 'wait') return { L: [-0.2, 0.1, -0.3], R: [0, 2.75 + wob * Math.sin(t * 7) * 0.22, -0.2], head: -0.05, dy: wob * Math.max(0, Math.sin(t * 5)) * 0.03 };
    if (this.pose === 'error') return { L: [-0.9, 0.35, -2.2], R: [-1.0, -0.2, -2.3], head: 0.3, dy: 0 };
    switch (this.activity) {
      case 'read': return { L: [-0.85, 0.28, -1.0], R: [-0.85, -0.28, -1.0], head: 0.38 + wob * Math.sin(t * 0.7) * 0.04, dy: 0 };
      case 'rack': return { L: [-0.25, 0.1, -0.35], R: [-1.25, -0.12, -0.35 - wob * Math.max(0, Math.sin(t * 9)) * 0.25], head: 0.08, dy: 0 };
      case 'board': return { L: [-0.15, 0.12, -0.3], R: [-2.15 + wob * Math.sin(t * 2.6) * 0.12, -0.25 + wob * Math.sin(t * 4.1) * 0.22, -0.45], head: -0.12, dy: 0 };
      case 'phone': return { L: [-0.2, 0.1, -0.3], R: [-0.75, -0.3, -1.95], head: 0.42, dy: 0 };
      case 'wave': return { L: [-0.2, 0.1, -0.3], R: [0, 2.75 + wob * Math.sin(t * 7) * 0.22, -0.2], head: -0.05, dy: wob * Math.max(0, Math.sin(t * 5)) * 0.03 };
      case 'sip': {
        // Holds the cup at the chest and takes a sip every few seconds.
        const s = wob * Math.max(0, Math.sin(t * 0.9)) ** 6;
        return { L: [-0.15, 0.1, -0.25], R: [-0.55 - 0.35 * s, -0.22, -1.75 - 0.5 * s], head: 0.05 - 0.25 * s, dy: 0 };
      }
      // Arm held out level so the can pours over the foliage instead of disappearing into it.
      case 'water': return { L: [-0.2, 0.1, -0.3], R: [-1.55, -0.1, -0.1], head: 0.3, dy: 0, lean: 0.05 };
      case 'cue': {
        const stroke = wob * Math.sin(t * 1.4) ** 9 * 0.35;
        return { L: [-1.25, 0.3, -0.15], R: [-0.25 + stroke, -0.2, -1.15 + stroke], head: 0.15, dy: 0, lean: 0.45 };
      }
      case 'look': return { L: [0.42, 0.12, -1.0], R: [0.42, -0.12, -1.0], head: -0.05, dy: 0, turn: wob * Math.sin(t * 0.35) * 0.35 };
      case 'chat': return {
        L: [-0.45 - wob * Math.max(0, Math.sin(t * 2.1)) * 0.3, 0.12, -1.2], R: [-0.3, -0.12, -0.8 - wob * Math.max(0, Math.sin(t * 1.7 + 1)) * 0.6],
        head: wob * Math.sin(t * 2.4) * 0.08, dy: 0, turn: wob * Math.sin(t * 0.5) * 0.2,
      };
      case 'cheer': return { L: [0, -2.85 - wob * Math.sin(t * 9) * 0.15, -0.15], R: [0, 2.85 + wob * Math.sin(t * 9) * 0.15, -0.15], head: -0.15, dy: wob * Math.max(0, Math.sin(t * 6)) * 0.06 };
      default: return null;
    }
  }

  update(now: number, animate: boolean) {
    const dt = frameStep(this.lastNow, now);
    this.lastNow = now;
    this.advance(dt);
    const t = now / 1000 + this.seed;
    const wob = animate ? 1 : 0;
    const k = ease(this.sit);
    const sp = SEATED[this.seatType];
    const w = this.walkAmt * (1 - k);
    const g = this.gait;

    // ----- legs: standing/walking blended with the seated pose -----
    for (const leg of [this.legL, this.legR]) {
      const ph = g + (leg.side < 0 ? 0 : Math.PI);
      const standThigh = -0.45 * Math.sin(ph) * w;
      const standKnee = w * (0.1 + 0.85 * Math.max(0, Math.cos(ph)));
      leg.hip.rotation.x = lerp(standThigh, sp.thigh, k);
      leg.hip.rotation.y = leg.side * sp.splay * k;
      leg.hip.rotation.z = 0;
      leg.knee.rotation.x = lerp(standKnee, sp.knee, k);
      leg.knee.rotation.z = -leg.side * sp.cross * k;
    }

    // ----- body: height, slide, recline -----
    const bob = 0.03 * Math.abs(Math.cos(g)) * w;
    this.body.position.set(0, lerp(STAND_LIFT + bob, sp.y, k), lerp(0, sp.z, k));
    this.body.rotation.set(0, 0, 0);
    this.upper.rotation.set(lerp(0.04 * w, sp.recline, k), 0.07 * Math.sin(g) * w, 0);
    this.head.rotation.set(0, 0, 0);

    // ----- arms: swing while walking, status pose while seated -----
    const arm = { L: [-0.6, 0.12, -0.95], R: [-0.6, -0.12, -0.95] };
    let dy = 0, dx = 0;
    switch (this.pose) {
      case 'tool':
        arm.L = [-0.95, 0.15, -0.55 - wob * Math.max(0, Math.sin(t * 22)) * 0.18];
        arm.R = [-0.95, -0.15, -0.55 - wob * Math.max(0, Math.sin(t * 22 + 1.6)) * 0.18];
        this.head.rotation.x = 0.12 * k;
        break;
      case 'think':
        arm.L = [-0.75, 0.1, -0.9];
        arm.R = [-0.35, -0.35, -2.35];
        this.head.rotation.z = wob * Math.sin(t * 1.6) * 0.12 * k;
        this.head.rotation.y = -0.15 * k;
        break;
      case 'wait':
        arm.L = [-0.75, 0.1, -0.9];
        arm.R = [0, 2.75 + wob * Math.sin(t * 7) * 0.22, -0.2];
        dy = wob * Math.max(0, Math.sin(t * 5)) * 0.04;
        break;
      case 'error':
        arm.L = [-2.5, 0.25, -1.7];
        arm.R = [-2.5, -0.25, -1.7];
        dx = wob * Math.sin(t * 30) * (Math.sin(t * 1.3) > 0.6 ? 0.03 : 0);
        this.head.rotation.x = 0.2 * k;
        break;
      case 'done':
        arm.L = [0, -2.85, -0.15];
        arm.R = [0, 2.85, -0.15];
        dy = wob * Math.max(0, Math.sin(t * 6)) * 0.03;
        break;
      default:
        dy = wob * Math.sin(t * 1.8) * 0.008;
    }
    this.body.position.x += dx * k;
    this.upper.position.y = HIP_Y + dy * k;
    const swing = 0.4 * Math.sin(g) * w;
    const walkArm = { L: [swing, 0.08, -0.25], R: [-swing, -0.08, -0.25] };
    // Standing still at a station: activity pose, blended in as the walk eases out.
    const still = (1 - this.walkAmt) * (1 - k);
    const act = this.trip ? null : this.standPose(t, wob);
    if (act) {
      for (const side of ['L', 'R'] as const) walkArm[side] = walkArm[side].map((v, i) => lerp(v, act[side][i], still));
      this.head.rotation.x += act.head * still;
      this.head.rotation.y += (act.turn ?? 0) * still;
      this.upper.rotation.x += (act.lean ?? 0) * still;
      this.upper.position.y += act.dy * still;
    }
    const holding = (a: StandActivity) => !!act && this.activity === a && still > 0.5;
    this.book.visible = holding('read');
    this.phone.visible = holding('phone');
    this.showProp('cup', holding('sip'));
    this.showProp('can', holding('water'));
    this.showProp('cue', holding('cue'));
    const setArm = (a: Arm, seatedA: number[], walkA: number[]) => {
      a.sh.rotation.set(lerp(walkA[0], seatedA[0], k), 0, lerp(walkA[1], seatedA[1], k));
      a.el.rotation.set(lerp(walkA[2], seatedA[2], k), 0, 0);
    };
    setArm(this.L, arm.L, walkArm.L);
    setArm(this.R, arm.R, walkArm.R);
    // Held props stay level in the hand whatever the forearm angle (the can tips over the plant).
    const forearm = this.R.sh.rotation.x + this.R.el.rotation.x + this.upper.rotation.x;
    if (this.cup?.visible) this.cup.rotation.x = -forearm;
    if (this.can?.visible) this.can.rotation.x = -forearm + 0.55 + wob * Math.sin(t * 1.3) * 0.12;

    const top = this.body.position.y;
    this.orb.position.y = 1.86 + top + wob * Math.sin(t * 2.4) * 0.04;
    this.tag.position.y = 2.15 + top;
    const blink = animate && (t % 4.3) < 0.12 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = blink;
  }
}
