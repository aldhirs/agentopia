// One 3D agent: a seated person (or robot) built from primitives, posed by status.
import * as THREE from 'three';
import type { AgentStatus } from '../../shared/types';
import type { Appearance } from './appearance';
import type { SeatPose } from './layout';
import { box, capsule, cyl, labelSprite, mat, mesh, relabel, sphere } from './kit';

export type Pose = 'idle' | 'think' | 'tool' | 'wait' | 'error' | 'done';

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

export class CharacterRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private L: Arm;
  private R: Arm;
  private eyes: THREE.Mesh[] = [];
  private orb: THREE.Mesh;
  private orbMat: THREE.MeshStandardMaterial;
  private tag: THREE.Sprite;
  private ring: THREE.Mesh;
  private legs: THREE.Mesh;
  private baseY = 0;
  private baseRotX = 0;
  private pose: Pose = 'idle';
  private name: string;
  private statusLabel = '';
  private statusColor = '#9A96A6';
  private selected = false;
  private seed = Math.random() * 10;
  private move?: { from: THREE.Vector3; to: THREE.Vector3; fromRot: number; toRot: number; start: number; dur: number; type: SeatPose['type'] };
  /** Invisible capsule used for click picking. */
  readonly hit: THREE.Mesh;

  constructor(readonly agentId: string, name: string, look: Appearance) {
    this.name = name;
    const skin = look.robot ? mat('#C4CDD7', 0.4, 0.15) : mat(look.skin, 0.6);
    const shirt = look.robot ? mat('#D3DAE2', 0.4, 0.15) : mat(look.shirt, 0.8);
    this.root.add(this.body);

    this.legs = mesh(box(0.4, 0.16, 0.5), look.robot ? mat('#9AA6B2', 0.4, 0.4) : mat('#3D4152', 0.8));
    this.legs.position.set(0, 0.62, 0.2);
    this.body.add(this.legs);
    const torso = mesh(capsule(0.21, 0.32), shirt);
    torso.position.y = 0.98; torso.scale.set(1.12, 1, 0.8);
    this.body.add(torso);
    if (look.robot) {
      const chest = new THREE.Mesh(sphere(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: look.shirt, emissive: new THREE.Color(look.shirt), emissiveIntensity: 1.5 }));
      chest.position.set(0, 1.02, 0.17);
      this.body.add(chest);
    }

    this.head.position.y = 1.47;
    this.body.add(this.head);
    if (look.robot) this.buildRobotHead(look);
    else this.buildHumanHead(look, skin);

    const arm = (side: number): Arm => {
      const sh = new THREE.Group(); sh.position.set(side * 0.27, 1.17, 0); this.body.add(sh);
      const up = mesh(capsule(0.068, 0.2), look.robot ? mat('#C4CDD7', 0.4, 0.15) : shirt); up.position.y = -0.15; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
      const fore = mesh(capsule(0.058, 0.18), skin, false); fore.position.y = -0.13; el.add(fore);
      const hand = mesh(sphere(0.066, 14, 10), skin, false); hand.position.y = -0.27; el.add(hand);
      return { sh, el };
    };
    this.L = arm(-1);
    this.R = arm(1);

    this.orbMat = new THREE.MeshStandardMaterial({ color: '#9A96A6', emissive: new THREE.Color('#9A96A6'), emissiveIntensity: 2 });
    this.orb = new THREE.Mesh(sphere(0.06, 16, 12), this.orbMat);
    this.root.add(this.orb);
    this.tag = labelSprite(name, '#9A96A6');
    this.root.add(this.tag);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: '#1C1B22' }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.02; this.ring.visible = false;
    this.root.add(this.ring);

    this.hit = new THREE.Mesh(capsule(0.42, 1.1), new THREE.MeshBasicMaterial({ visible: false }));
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

  setStatus(status: AgentStatus) {
    const s = STATUS_3D[status];
    this.pose = s.pose;
    this.statusLabel = s.label;
    this.statusColor = s.color;
    this.orbMat.color.set(s.color);
    this.orbMat.emissive.set(s.color);
    relabel(this.tag, `${this.name} · ${s.label}`, s.color, this.selected);
  }

  setSelected(on: boolean) {
    if (on === this.selected) return;
    this.selected = on;
    this.ring.visible = on;
    relabel(this.tag, `${this.name} · ${this.statusLabel}`, this.statusColor, on);
  }

  private applySeatType(type: SeatPose['type']) {
    this.baseY = type === 'floor' ? -0.42 : type === 'bean' ? -0.2 : 0;
    this.baseRotX = type === 'bean' ? -0.38 : 0;
    this.legs.scale.set(type === 'floor' ? 1.65 : 1, 1, type === 'floor' ? 0.84 : 1);
    this.tag.position.y = 2.15 + this.baseY;
    this.ring.position.y = 0.02;
  }

  /** Puts the character on a seat immediately, or walks there over `durMs`. */
  placeAt(p: SeatPose, now: number, durMs = 0) {
    const to = new THREE.Vector3(p.x, 0, p.z);
    if (durMs <= 0) {
      this.root.position.copy(to);
      this.root.rotation.y = p.rotY;
      this.applySeatType(p.type);
      this.move = undefined;
      return;
    }
    this.move = { from: this.root.position.clone(), to, fromRot: this.root.rotation.y, toRot: p.rotY, start: now, dur: durMs, type: p.type };
  }

  get isMoving(): boolean {
    return !!this.move;
  }

  get worldTop(): THREE.Vector3 {
    return this.root.localToWorld(new THREE.Vector3(0, 1.9 + this.baseY, 0));
  }

  get worldBase(): THREE.Vector3 {
    return this.root.localToWorld(new THREE.Vector3(0, 0.6 + this.baseY, 0));
  }

  update(now: number, animate: boolean) {
    const t = now / 1000 + this.seed;
    // Walking between seats: glide with a small hop, seated pose kept simple.
    if (this.move) {
      const k = Math.min(1, (now - this.move.start) / this.move.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.root.position.lerpVectors(this.move.from, this.move.to, e);
      this.root.rotation.y = this.move.fromRot + (this.move.toRot - this.move.fromRot) * e;
      this.body.position.y = this.baseY + Math.abs(Math.sin(k * Math.PI * 6)) * 0.08;
      if (k >= 1) { this.applySeatType(this.move.type); this.move = undefined; }
      return;
    }
    const set = (a: Arm, shx: number, shz: number, elx: number) => { a.sh.rotation.set(shx, 0, shz); a.el.rotation.set(elx, 0, 0); };
    const wob = animate ? 1 : 0;
    this.body.position.set(0, this.baseY, 0);
    this.body.rotation.x = this.baseRotX;
    this.head.rotation.set(0, 0, 0);
    switch (this.pose) {
      case 'tool':
        set(this.L, -0.95, 0.15, -0.55 - wob * Math.max(0, Math.sin(t * 22)) * 0.18);
        set(this.R, -0.95, -0.15, -0.55 - wob * Math.max(0, Math.sin(t * 22 + 1.6)) * 0.18);
        this.head.rotation.x = 0.12;
        break;
      case 'think':
        set(this.L, -0.75, 0.1, -0.9);
        set(this.R, -0.35, -0.35, -2.35);
        this.head.rotation.z = wob * Math.sin(t * 1.6) * 0.12;
        this.head.rotation.y = -0.15;
        break;
      case 'wait':
        set(this.L, -0.75, 0.1, -0.9);
        set(this.R, 0, 2.75 + wob * Math.sin(t * 7) * 0.22, -0.2);
        this.body.position.y = this.baseY + wob * Math.max(0, Math.sin(t * 5)) * 0.04;
        break;
      case 'error':
        set(this.L, -2.5, 0.25, -1.7);
        set(this.R, -2.5, -0.25, -1.7);
        this.body.position.x = wob * Math.sin(t * 30) * (Math.sin(t * 1.3) > 0.6 ? 0.03 : 0);
        this.head.rotation.x = 0.2;
        break;
      case 'done':
        set(this.L, 0, -2.85, -0.15);
        set(this.R, 0, 2.85, -0.15);
        this.body.position.y = this.baseY + wob * Math.max(0, Math.sin(t * 6)) * 0.08;
        break;
      default:
        set(this.L, -0.6, 0.12, -0.95);
        set(this.R, -0.6, -0.12, -0.95);
        this.body.position.y = this.baseY + wob * Math.sin(t * 1.8) * 0.008;
    }
    this.orb.position.y = 1.86 + this.baseY + wob * Math.sin(t * 2.4) * 0.04;
    const blink = animate && (t % 4.3) < 0.12 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = blink;
  }
}
