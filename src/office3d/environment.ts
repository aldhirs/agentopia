// The startup office: brick wall + neon, pods with pendant lights, glass lead office,
// lesehan, bean bags, billiard, coffee bar. Returns per-seat "devices" (screens + glow)
// so the engine can light them in the colour of whoever sits there.
import * as THREE from 'three';
import type { TodoItem } from '../../shared/types';
import { BEAN_CIRCLE, BEANBAGS, DESK_ANCHORS, FLOOR_ANCHORS, LEAD_ANCHOR, LEAD_ROOM, LESEHAN, PODS, type Anchor } from './layout';
import { PLANTS } from './nav';
import { box, canvasTexture, cyl, labelSprite, mat, mesh, sphere } from './kit';

export interface SeatDevice {
  screens: THREE.MeshStandardMaterial[];
  /** Additive light-wash in front of the screen: looks like screen light, costs no real light. */
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  group: THREE.Object3D;
}

export interface Environment {
  desks: SeatDevice[];
  floors: SeatDevice[];
  lead: SeatDevice;
  makeLaptop(anchor: Anchor): SeatDevice;
  /** Status LEDs of the server rack in the lead office (blink while the Lead runs commands). */
  rackLeds: THREE.MeshStandardMaterial[];
  /** Redraws the todo board in the lead office. */
  drawBoard(todos: TodoItem[] | undefined): void;
}

const BOARD_COLS: Array<{ status: TodoItem['status']; title: string; note: string }> = [
  { status: 'pending', title: 'Belum', note: '#FFE58A' },
  { status: 'in_progress', title: 'Dikerjakan', note: '#A8D4FF' },
  { status: 'completed', title: 'Selesai', note: '#B6EBC7' },
];

/** Whiteboard with sticky notes per todo status, drawn into a canvas texture. */
function todoBoard(): { mesh: THREE.Mesh; draw(todos: TodoItem[] | undefined): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 1056; canvas.height = 600;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const g = canvas.getContext('2d')!;
  const wrap = (text: string, maxW: number, lines: number): string[] => {
    const words = text.split(/\s+/);
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (g.measureText(next).width <= maxW) { cur = next; continue; }
      if (cur) out.push(cur);
      cur = w;
      if (out.length === lines) break;
    }
    if (out.length < lines && cur) out.push(cur);
    if (out.length === lines && words.join(' ') !== out.join(' ')) {
      let last = out[lines - 1];
      while (last.length && g.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
      out[lines - 1] = `${last}…`;
    }
    return out.slice(0, lines);
  };
  const draw = (todos: TodoItem[] | undefined) => {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = '#FBFAF7'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2E2B36'; g.fillRect(0, H - 14, W, 14);
    const colW = W / 3;
    BOARD_COLS.forEach((col, ci) => {
      const items = (todos ?? []).filter((t) => t.status === col.status);
      const x0 = ci * colW;
      if (ci) { g.fillStyle = 'rgba(46,43,54,.12)'; g.fillRect(x0, 22, 3, H - 60); }
      g.fillStyle = '#2E2B36'; g.font = '600 34px Figtree, sans-serif'; g.textBaseline = 'alphabetic';
      g.fillText(col.title, x0 + 28, 58);
      g.fillStyle = 'rgba(46,43,54,.55)'; g.font = '600 28px Figtree, sans-serif';
      g.fillText(String(items.length), x0 + 28 + g.measureText(col.title).width * (34 / 28) + 14, 58);
      const shown = items.slice(0, 4);
      shown.forEach((t, i) => {
        const nx = x0 + 22 + (i % 2) * 6, ny = 82 + i * 116, nw = colW - 44, nh = 104;
        g.save();
        g.translate(nx + nw / 2, ny + nh / 2); g.rotate(((i * 7 + ci * 3) % 5 - 2) * 0.012); g.translate(-nw / 2, -nh / 2);
        g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(4, 6, nw, nh);
        g.fillStyle = col.note; g.fillRect(0, 0, nw, nh);
        g.fillStyle = '#2A2833'; g.font = '500 25px Figtree, sans-serif';
        const text = col.status === 'in_progress' && t.activeForm ? t.activeForm : t.content;
        wrap(text, nw - 28, 3).forEach((line, li) => g.fillText(line, 14, 34 + li * 29));
        g.restore();
      });
      if (items.length > shown.length) {
        g.fillStyle = 'rgba(46,43,54,.6)'; g.font = '600 26px Figtree, sans-serif';
        g.fillText(`+${items.length - shown.length} lagi`, x0 + 28, H - 32);
      }
    });
    if (!todos?.length) {
      g.fillStyle = 'rgba(46,43,54,.4)'; g.font = '500 30px Figtree, sans-serif'; g.textAlign = 'center';
      g.fillText('Daftar tugas Lead muncul di sini', W / 2, H / 2 + 20);
      g.textAlign = 'left';
    }
    tex.needsUpdate = true;
  };
  draw(undefined);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(LEAD_ROOM.board.w, LEAD_ROOM.board.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  return { mesh: m, draw };
}

function glowWash(w: number, h: number) {
  const m = new THREE.MeshBasicMaterial({ color: '#5FD0FF', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  g.visible = false;
  return g;
}

function screenMat() {
  return new THREE.MeshStandardMaterial({ color: '#111111', emissive: new THREE.Color('#2A2833'), emissiveIntensity: 1.1 });
}

export function buildEnvironment(scene: THREE.Scene): Environment {
  const add = <T extends THREE.Object3D>(o: T) => { scene.add(o); return o; };
  // Object3D.add() returns the parent; this returns the child so its position can be set inline.
  const at = <T extends THREE.Object3D>(parent: THREE.Object3D, o: T) => { parent.add(o); return o; };

  // Floor: polished concrete.
  const concrete = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#CFCAC2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,80,70'},${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    g.strokeStyle = 'rgba(80,70,60,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  }, [6, 4]);
  const floor = add(mesh(new THREE.PlaneGeometry(22.4, 11.6), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.55, metalness: 0.05 }), false));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -0.8;

  const rug = (x: number, z: number, w: number, d: number, m: THREE.Material) => {
    const r = add(mesh(new THREE.PlaneGeometry(w, d), m, false)); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.006, z);
  };
  const stripes = canvasTexture(256, 256, (g, w, h) => {
    const cs = ['#F2C14E', '#F78154', '#4D9078', '#5DA9E9'];
    for (let i = 0; i < 8; i++) { g.fillStyle = cs[i % 4]; g.fillRect(i * 32, 0, 32, h); }
    void w;
  });
  rug(-1.2, -2.7, 10.6, 3.9, mat('#9FB3C8', 0.98));
  rug(LEAD_ANCHOR.x + 0.15, LEAD_ANCHOR.z - 0.05, 5.3, 4.0, mat('#C9B48F', 0.98));
  rug(LESEHAN.x, LESEHAN.z, 3.6, 2.6, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.98 }));
  const bbRug = add(mesh(new THREE.CircleGeometry(2.0, 48), mat('#F2C14E', 0.98), false));
  bbRug.rotation.x = -Math.PI / 2; bbRug.position.set(BEAN_CIRCLE.x, 0.007, BEAN_CIRCLE.z);

  // Walls: exposed brick + neon + windows.
  const brick = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#C9C1B5'; g.fillRect(0, 0, w, h);
    const bw = 64, bh = 28;
    for (let row = 0; row * bh < h; row++) {
      for (let col = -1; col * bw < w; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const s = 150 + Math.floor(Math.random() * 30);
        g.fillStyle = `rgb(${s + 40},${s - 40},${s - 70})`;
        g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
  }, [5, 2]);
  add(mesh(new THREE.BoxGeometry(22.4, 3, 0.2), new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 }))).position.set(0, 1.5, -6.6);
  add(mesh(box(0.2, 3, 11.6), mat('#F1ECE3', 0.9))).position.set(-11.1, 1.5, -0.8);
  const neonTex = canvasTexture(1024, 256, (g, w, h) => {
    g.font = 'italic 700 150px "Fraunces Variable", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#FF4FA3'; g.shadowBlur = 40; g.fillStyle = '#FFD1EA';
    g.fillText('ship it ✦', w / 2, h / 2); g.shadowBlur = 18; g.fillText('ship it ✦', w / 2, h / 2);
  });
  const neon = add(new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, toneMapped: false })));
  neon.position.set(-3.6, 2.05, -6.48);
  add(new THREE.PointLight('#FF4FA3', 2.2, 5, 2)).position.set(-3.6, 2.0, -5.9);
  const sky = new THREE.MeshStandardMaterial({ color: '#CFE6FF', emissive: new THREE.Color('#DCEEFF'), emissiveIntensity: 0.55, roughness: 0.1 });
  const frameM = mat('#2E2B36', 0.5);
  for (const x of [1.6, 4.0]) {
    add(new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.6), sky)).position.set(x, 1.65, -6.49);
    for (const f of [[0, 0.82, 2.1, 0.06], [0, -0.82, 2.1, 0.06], [-1.02, 0, 0.06, 1.7], [1.02, 0, 0.06, 1.7], [0, 0, 0.05, 1.6]]) {
      add(mesh(box(f[2], f[3], 0.06), frameM, false)).position.set(x + f[0], 1.65 + f[1], -6.46);
    }
  }

  // Lead office: glass partitions.
  const glassM = new THREE.MeshStandardMaterial({ color: '#D8ECFF', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });
  const glassWall = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const gw = add(new THREE.Mesh(new THREE.BoxGeometry(len, 2.2, 0.03), glassM));
    gw.position.set((x1 + x2) / 2, 1.1, (z1 + z2) / 2); gw.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    const rail = add(mesh(box(len, 0.05, 0.06), frameM, false));
    rail.position.copy(gw.position).setY(2.2); rail.rotation.y = gw.rotation.y;
  };
  glassWall(5.1, -6.5, 5.1, -3.3);
  glassWall(5.1, -2.4, 10.4, -2.4);
  const leadSign = add(labelSprite('Ruang Lead', '#EDBB4A', 1.5)); leadSign.position.set(7.75, 2.55, -2.4);

  // Lead office furniture the Lead walks to: bookshelf (reading code), server rack (running
  // commands) and the todo board on the back wall.
  const { shelf, rack } = LEAD_ROOM;
  const shelfG = add(new THREE.Group()); shelfG.position.set(shelf.x, 0, shelf.z);
  const shelfWood = mat('#8A6240', 0.6);
  at(shelfG, mesh(box(shelf.w, 1.9, 0.05), shelfWood)).position.set(0, 0.95, -shelf.d / 2 + 0.025);
  for (const x of [-shelf.w / 2 + 0.025, shelf.w / 2 - 0.025]) at(shelfG, mesh(box(0.05, 1.9, shelf.d), shelfWood)).position.set(x, 0.95, 0);
  const bookColors = ['#F78154', '#5DA9E9', '#F2C14E', '#4D9078', '#BC8BEE', '#E6E2DA', '#C0392B'];
  for (let row = 0; row < 4; row++) {
    const y = 0.08 + row * 0.46;
    at(shelfG, mesh(box(shelf.w - 0.1, 0.04, shelf.d - 0.04), shelfWood, false)).position.set(0, y, 0.01);
    let x = -shelf.w / 2 + 0.09;
    for (let b = 0; x < shelf.w / 2 - 0.12; b++) {
      const bw = 0.05 + ((row * 5 + b * 3) % 4) * 0.012, bh = 0.26 + ((row + b * 7) % 5) * 0.025;
      const book = at(shelfG, mesh(box(bw, bh, 0.24), mat(bookColors[(row * 3 + b) % bookColors.length], 0.7), false));
      book.position.set(x + bw / 2, y + 0.02 + bh / 2, 0.02);
      if ((row + b) % 6 === 5) book.rotation.z = 0.18;
      x += bw + 0.012;
    }
  }
  const rackG = add(new THREE.Group()); rackG.position.set(rack.x, 0, rack.z);
  at(rackG, mesh(box(rack.w, 1.85, rack.d), mat('#23222A', 0.45, 0.3))).position.y = 0.925;
  const rackLeds: THREE.MeshStandardMaterial[] = [];
  for (let u = 0; u < 7; u++) {
    const y = 0.3 + u * 0.22;
    at(rackG, mesh(box(rack.w - 0.08, 0.16, 0.01), mat('#33313B', 0.4, 0.4), false)).position.set(0, y, rack.d / 2 + 0.006);
    for (let l = 0; l < 3; l++) {
      const led = new THREE.MeshStandardMaterial({ color: '#111111', emissive: new THREE.Color(['#3DDC84', '#5FD0FF', '#FFB547'][l]), emissiveIntensity: 0.5 });
      rackLeds.push(led);
      at(rackG, new THREE.Mesh(box(0.035, 0.025, 0.01), led)).position.set(-rack.w / 2 + 0.1 + l * 0.06, y + 0.03, rack.d / 2 + 0.012);
    }
  }
  const board = todoBoard();
  board.mesh.position.set(LEAD_ROOM.board.x, LEAD_ROOM.board.y, LEAD_ROOM.board.z);
  add(board.mesh);
  add(mesh(box(LEAD_ROOM.board.w + 0.08, 0.05, 0.08), mat('#2E2B36', 0.5), false)).position.set(LEAD_ROOM.board.x, LEAD_ROOM.board.y - LEAD_ROOM.board.h / 2 - 0.03, LEAD_ROOM.board.z + 0.03);

  // Desks with monitors, keyboards and chairs.
  const deskTop = mat('#F4F1EA', 0.45);
  const leg = mat('#3A3842', 0.5);
  const chairM = mat('#3A3842', 0.6);
  const desk = (a: Anchor, wide: boolean): SeatDevice => {
    const d = new THREE.Group();
    const w = wide ? 2.1 : 1.7;
    at(d, mesh(box(w, 0.06, 0.85), deskTop)).position.y = 0.76;
    at(d, mesh(box(w, 0.03, 0.86), mat('#B8916A', 0.55))).position.y = 0.72;
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) at(d, mesh(box(0.05, 0.72, 0.75), leg)).position.set(x, 0.36, 0);
    if (wide) {
      at(d, mesh(box(0.75, 0.06, 1.5), deskTop)).position.set(w / 2 + 0.375, 0.76, -0.3);
      at(d, mesh(sphere(0.16, 16, 12), mat('#6FA86B', 0.9))).position.set(w / 2 + 0.4, 0.95, -0.7);
    }
    const screens: THREE.MeshStandardMaterial[] = [];
    for (const x of wide ? [-0.36, 0.36] : [0]) {
      at(d, mesh(cyl(0.025, 0.025, 0.22, 8), leg)).position.set(x, 0.89, 0.22);
      at(d, mesh(box(0.64, 0.4, 0.03), mat('#2A2833', 0.35, 0.3))).position.set(x, 1.15, 0.24);
      const sm = screenMat();
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.34), sm);
      screen.position.set(x, 1.15, 0.222); screen.rotation.y = Math.PI; d.add(screen);
      at(d, mesh(box(0.42, 0.015, 0.13), mat('#E6E2DA', 0.5), false)).position.set(x, 0.8, -0.12);
      screens.push(sm);
    }
    at(d, mesh(box(0.62, 0.08, 0.56), chairM)).position.set(0, 0.5, -0.75);
    at(d, mesh(box(0.62, 0.7, 0.07), chairM)).position.set(0, 0.95, -1.05);
    at(d, mesh(cyl(0.04, 0.04, 0.42, 8), leg)).position.set(0, 0.25, -0.75);
    const glow = glowWash(wide ? 1.5 : 0.9, 0.75); glow.position.set(0, 1.15, -0.45); glow.rotation.y = Math.PI; d.add(glow);
    d.position.set(a.x, 0, a.z); d.rotation.y = a.rotY;
    add(d);
    return { screens, glow, group: d };
  };
  const desks = DESK_ANCHORS.map((a) => desk(a, false));
  const lead = desk(LEAD_ANCHOR, true);

  const frost = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, roughness: 0.6 });
  PODS.forEach((p, i) => {
    add(mesh(box(3.5, 0.42, 0.04), frost, false)).position.set(p.x, 1.0, p.z);
    add(labelSprite(i === 1 ? `${p.name} · hot desk` : p.name, i === 0 ? '#7C95FF' : '#8FC7A0', 1.3)).position.set(p.x, 1.5, p.z);
  });
  const shadeM = new THREE.MeshStandardMaterial({ color: '#2E2B36', side: THREE.DoubleSide, roughness: 0.5 });
  const bulbM = new THREE.MeshBasicMaterial({ color: '#FFE7B0' });
  for (const p of PODS) for (const dx of [-0.8, 0.8]) {
    const x = p.x + dx;
    add(mesh(cyl(0.008, 0.008, 1.0, 6), frameM, false)).position.set(x, 3.0, p.z);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 20, 1, true), shadeM)).position.set(x, 2.4, p.z);
    add(new THREE.Mesh(sphere(0.07, 12, 10), bulbM)).position.set(x, 2.3, p.z);
  }
  add(new THREE.PointLight('#FFD9A0', 1.6, 7, 2)).position.set(-1.2, 2.2, -2.7);

  // Lesehan: low table + cushions + one laptop per spot (shown when someone sits there).
  add(mesh(box(1.9, 0.07, 1.0), mat('#B8865A', 0.55))).position.set(LESEHAN.x, 0.36, LESEHAN.z);
  for (const [lx, lz] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]]) {
    add(mesh(box(0.08, 0.33, 0.08), mat('#8A6240', 0.6))).position.set(LESEHAN.x + lx, 0.165, LESEHAN.z + lz);
  }
  for (const [c, cx, cz] of [['#F78154', 0, -0.8], ['#5DA9E9', 0, 0.8], ['#F2C14E', -1.25, 0], ['#4D9078', 1.25, 0]] as Array<[string, number, number]>) {
    add(mesh(cyl(0.3, 0.32, 0.12, 24), mat(c, 0.95))).position.set(LESEHAN.x + cx, 0.06, LESEHAN.z + cz);
  }
  add(labelSprite('Lesehan', '#F78154', 1.1)).position.set(LESEHAN.x, 1.75, LESEHAN.z);

  const makeLaptop = (a: Anchor): SeatDevice => {
    const g = new THREE.Group();
    const y = a === FLOOR_ANCHORS[0] || FLOOR_ANCHORS.includes(a) ? 0.395 : 0.02;
    const alu = mat('#C9CED6', 0.3, 0.5);
    at(g, mesh(box(0.5, 0.022, 0.34), alu)).position.set(0, y + 0.011, -0.05);
    const lid = new THREE.Group(); lid.position.set(0, y + 0.02, 0.11); lid.rotation.x = -0.28; g.add(lid);
    at(lid, mesh(box(0.5, 0.32, 0.018), alu)).position.y = 0.16;
    const sm = screenMat();
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.27), sm); screen.position.set(0, 0.16, -0.011); screen.rotation.y = Math.PI; lid.add(screen);
    const glow = glowWash(0.7, 0.55); glow.position.set(0, y + 0.45, -0.45); glow.rotation.y = Math.PI; g.add(glow);
    // Extra cushions on the floor carry their own cushion.
    if (y < 0.1) at(g, mesh(cyl(0.3, 0.32, 0.12, 24), mat('#F2C14E', 0.95))).position.set(0, 0.06, -0.75);
    g.position.set(a.x, 0, a.z); g.rotation.y = a.rotY; g.visible = false;
    add(g);
    return { screens: [sm], glow, group: g };
  };
  const floors = FLOOR_ANCHORS.map(makeLaptop);

  // Bean bags.
  for (const b of BEANBAGS) {
    const m = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.95 });
    const bag = add(mesh(sphere(0.55, 28, 20), m)); bag.scale.set(1, 0.6, 1.05); bag.position.set(b.x, 0.3, b.z);
    const rest = add(mesh(sphere(0.42, 24, 16), m)); rest.scale.set(1, 0.85, 0.55);
    rest.position.set(b.x - Math.sin(b.rotY) * 0.38, 0.52, b.z - Math.cos(b.rotY) * 0.38); rest.rotation.y = b.rotY;
  }
  add(labelSprite('Bean bag', '#F2C14E', 1.1)).position.set(BEAN_CIRCLE.x, 1.6, BEAN_CIRCLE.z);

  // Billiard table.
  const BX = 5.9, BZ = 1.5;
  const wood = mat('#5A3A24', 0.45);
  add(mesh(box(2.8, 0.2, 1.6), wood)).position.set(BX, 0.82, BZ);
  add(mesh(box(2.5, 0.05, 1.3), mat('#1F7A4D', 0.9))).position.set(BX, 0.94, BZ);
  for (const [lx, lz] of [[-1.2, -0.65], [1.2, -0.65], [-1.2, 0.65], [1.2, 0.65]]) add(mesh(box(0.18, 0.72, 0.18), wood)).position.set(BX + lx, 0.36, BZ + lz);
  for (const [px, pz] of [[-1.22, -0.62], [0, -0.64], [1.22, -0.62], [-1.22, 0.62], [0, 0.64], [1.22, 0.62]]) {
    add(mesh(cyl(0.07, 0.07, 0.02, 16), mat('#111111', 0.9), false)).position.set(BX + px, 0.97, BZ + pz);
  }
  ['#FFFFFF', '#F2C14E', '#1E40AF', '#C0392B', '#6B21A8', '#F78154', '#15803D', '#111111', '#7A1F1F'].forEach((c, i) => {
    const px = i === 0 ? -0.75 : 0.35 + Math.floor((i - 1) / 3) * 0.09;
    const pz = i === 0 ? 0 : ((i - 1) % 3 - 1) * 0.095 + (Math.floor((i - 1) / 3) % 2) * 0.045;
    add(mesh(sphere(0.045, 16, 12), mat(c, 0.25), false)).position.set(BX + px, 1.01, BZ + pz);
  });
  const cue = add(mesh(cyl(0.012, 0.02, 1.5, 10), mat('#D9B98A', 0.5)));
  cue.rotation.set(0, 0.35, Math.PI / 2 - 0.06); cue.position.set(BX - 1.45, 1.05, BZ + 0.25);
  add(mesh(box(1.6, 0.1, 0.28), frameM, false)).position.set(BX, 2.25, BZ);
  for (const dx of [-0.7, 0.7]) add(mesh(cyl(0.008, 0.008, 1.0, 6), frameM, false)).position.set(BX + dx, 2.8, BZ);
  const lampGlow = add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.22), bulbM)); lampGlow.rotation.x = Math.PI / 2; lampGlow.position.set(BX, 2.195, BZ);
  add(new THREE.PointLight('#FFE7B0', 1.8, 4, 2)).position.set(BX, 2.0, BZ);
  add(labelSprite('Billiard', '#1F7A4D', 1.1)).position.set(BX, 1.55, BZ - 0.95);

  // Coffee bar.
  add(mesh(box(0.75, 1.0, 3.2), mat('#2E2B36', 0.6))).position.set(-10.55, 0.5, -3.9);
  add(mesh(box(0.85, 0.06, 3.3), mat('#B8865A', 0.4))).position.set(-10.55, 1.03, -3.9);
  add(mesh(box(0.4, 0.45, 0.4), mat('#C9CED6', 0.3, 0.6))).position.set(-10.6, 1.28, -4.9);
  ['#F78154', '#5DA9E9', '#FFFFFF'].forEach((c, i) => add(mesh(cyl(0.05, 0.045, 0.1, 16), mat(c, 0.4), false)).position.set(-10.5, 1.11, -3.6 + i * 0.3));
  for (const z of [-4.8, -3.9, -3.0]) {
    add(mesh(cyl(0.2, 0.2, 0.06, 20), mat('#F2C14E', 0.6))).position.set(-9.7, 0.75, z);
    add(mesh(cyl(0.03, 0.03, 0.72, 8), frameM)).position.set(-9.7, 0.37, z);
  }
  add(labelSprite('Coffee bar', '#8A6240', 1.2)).position.set(-10.3, 2.0, -3.9);

  // Sticky notes.
  const notes = canvasTexture(512, 320, (g, w, h) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
    const cs = ['#FFE066', '#FF9F80', '#9EE6C2', '#A8C8FF', '#F7A8E0'];
    for (let i = 0; i < 18; i++) { g.fillStyle = cs[i % 5]; g.fillRect(24 + (i % 6) * 80, 24 + Math.floor(i / 6) * 96, 62, 62); }
  });
  const nb = add(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ map: notes, roughness: 0.6 })));
  nb.rotation.y = Math.PI / 2; nb.position.set(-10.98, 1.6, 0.6);

  // Plants.
  PLANTS.forEach(([x, z], i) => {
    add(mesh(cyl(0.26, 0.2, 0.42, 20), mat(['#F2C14E', '#F78154', '#FFFFFF', '#4D9078'][i % 4], 0.8))).position.set(x, 0.21, z);
    const leaf = add(mesh(sphere(0.5, 24, 16), mat(i % 2 ? '#5E9E5A' : '#77B36E', 0.9))); leaf.position.set(x, 0.85, z); leaf.scale.set(1, 1.2, 1);
  });

  return { desks, floors, lead, makeLaptop, rackLeds, drawBoard: board.draw };
}
