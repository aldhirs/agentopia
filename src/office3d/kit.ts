// Shared three.js helpers: cached geometries/materials (one GPU buffer per shape/colour)
// and canvas-drawn textures for labels and surfaces.
import * as THREE from 'three';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g as T;
}

export function mat(color: string, roughness = 0.7, metalness = 0): THREE.MeshStandardMaterial {
  const k = `std:${color}:${roughness}:${metalness}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); matCache.set(k, m); }
  return m as THREE.MeshStandardMaterial;
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh {
  const x = new THREE.Mesh(g, m);
  x.castShadow = cast;
  x.receiveShadow = true;
  return x;
}

export function box(w: number, h: number, d: number) {
  return geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
}
export function sphere(r: number, ws = 24, hs = 16) {
  return geo(`sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}
export function capsule(r: number, len: number) {
  return geo(`cap:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 14));
}
export function cyl(rt: number, rb: number, h: number, seg = 20) {
  return geo(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}

/** Draws a pill label ("Backend · Bekerja") with a coloured dot into a canvas. */
export function drawLabel(cv: HTMLCanvasElement, text: string, dot: string, selected = false) {
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, cv.width, cv.height);
  g.font = '600 44px Figtree, system-ui, sans-serif';
  const w = Math.min(cv.width - 12, g.measureText(text).width + 84);
  const left = (cv.width - w) / 2;
  g.fillStyle = selected ? 'rgba(28,27,34,.92)' : 'rgba(255,255,255,.9)';
  g.beginPath(); g.roundRect(left, 24, w, 76, 38); g.fill();
  g.fillStyle = dot; g.beginPath(); g.arc(left + 38, 62, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = selected ? '#FFFFFF' : '#1C1B22'; g.textBaseline = 'middle';
  g.fillText(text, left + 62, 64);
}

export function labelSprite(text: string, dot: string, width = 1.7) {
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 128;
  drawLabel(cv, text, dot);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(width, width * 0.2, 1);
  s.userData.canvas = cv;
  return s;
}

export function relabel(s: THREE.Sprite, text: string, dot: string, selected = false) {
  const cv = s.userData.canvas as HTMLCanvasElement;
  drawLabel(cv, text, dot, selected);
  (s.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}

/** Frees every geometry/material/texture under an object that is not in the shared caches. */
export function disposeTree(root: THREE.Object3D) {
  const shared = new Set<unknown>([...geoCache.values(), ...matCache.values()]);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !shared.has(m.geometry)) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const x of mats) {
      if (shared.has(x)) continue;
      const anyMat = x as THREE.MeshStandardMaterial;
      anyMat.map?.dispose();
      x.dispose();
    }
  });
}

export function disposeShared() {
  geoCache.forEach((g) => g.dispose());
  matCache.forEach((m) => m.dispose());
  geoCache.clear();
  matCache.clear();
}
