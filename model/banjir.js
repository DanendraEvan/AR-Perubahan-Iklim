import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ==================== UTIL ====================
export const TAU = Math.PI * 2;
export const col = (h) => new THREE.Color(h);
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a.clone().lerp(b, clamp01(t));
export function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash3(i, j, 17.3), b = hash3(i + 1, j, 17.3), c = hash3(i, j + 1, 17.3), d = hash3(i + 1, j + 1, 17.3);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, z) => noise(x, z) * 0.65 + noise(x * 2.1 + 7.7, z * 2.1 + 3.3) * 0.35;

// non-indexed, flat normal, per-face vertex color, tanpa uv
export function prep(g, fn, jit = 0.05) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  const p = g.attributes.position, arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const c = fn.isColor ? fn : fn(cx, cy, cz);
    const k = 1 + (hash3(cx * 3.1, cy * 3.1, cz * 3.1) - 0.5) * 2 * jit;
    for (let v = 0; v < 3; v++) {
      arr[(i + v) * 3] = Math.min(1, c.r * k);
      arr[(i + v) * 3 + 1] = Math.min(1, c.g * k);
      arr[(i + v) * 3 + 2] = Math.min(1, c.b * k);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function T(g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}, fn, jit) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s)
  );
  g.applyMatrix4(m);
  return prep(g, fn, jit);
}

export class Soup {
  constructor() { this.v = []; }
  tri(a, b, c, out) {
    if (out) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { const t = b; b = c; c = t; }
    }
    this.v.push(...a, ...b, ...c);
  }
  quad(a, b, c, d, out) { this.tri(a, b, c, out); this.tri(a, c, d, out); }
  geo(fn, jit) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.v, 3));
    return prep(g, fn, jit);
  }
}

export const merge = (list) => mergeGeometries(list, false);
export const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// ==================== WORLD ====================
export const PLAIN = 2.7;
export const LEVELS = { 1: 0.7, 2: 1.4, 3: 2.35, 4: 3.6 };
export const riverX = (z) => Math.sin(z * 0.16 + 0.5) * 6 + Math.sin(z * 0.07) * 3;

// SATU fungsi tinggi-tanah untuk semua tahap
export function terrainH(x, z) {
  const dx = x - riverX(z), ad = Math.abs(dx);
  const back = smooth((-z - 4) / 16);
  const rid = 1 - Math.abs(noise(x * 0.09 + 1.3, z * 0.09) * 2 - 1);
  let h = PLAIN + (fbm(x * 0.35, z * 0.35) - 0.5) * 0.3;
  h += back * (7 + 6 * fbm(x * 0.12 + 3, z * 0.12) + 4 * rid * rid) * (0.5 + 0.5 * smooth(ad / 9));
  h += back * back * 2 * noise(x * 0.3, z * 0.3);
  h += 4.5 * smooth((Math.abs(x) - 19) / 6);
  h -= PLAIN * Math.exp(-((dx / 2.6) ** 2)) * (1 - 0.85 * back);
  h += 0.45 * Math.exp(-(((ad - 4.2) / 1.0) ** 2)) * (1 - back);
  return h;
}

const G1 = col('#6b8f3c'), G2 = col('#4f7a2d'), B1 = col('#7a5a38'), B2 = col('#5a4630');
const WET = col('#4a3a28'), M1 = col('#4f6b3a'), M2 = col('#8a9a7a'), MIST = col('#8f969b');
const ROCK1 = col('#7d7668'), ROCK2 = col('#9a9384'), FIELD = col('#86a042');
const S0 = col('#3d2f22'), S1 = col('#4a3a28'), S2 = col('#6a4f32'), S3 = col('#7a5a38');

function landColor(mist) {
  return (x, y, z) => {
    const ad = Math.abs(x - riverX(z));
    let c = mix(G1, G2, noise(x * 0.5 + 9, z * 0.5));
    if (y < 3.4 && ad > 5.5 && z > -6 && hash3(Math.floor(x / 5), Math.floor(z / 4), 3.3) > 0.62) c = mix(c, FIELD, 0.7);
    if (y > 3.2) {
      const s = Math.hypot(terrainH(x + 0.6, z) - terrainH(x - 0.6, z), terrainH(x, z + 0.6) - terrainH(x, z - 0.6)) / 1.2;
      c = mix(c, mix(M1, M2, (y - 4) / 14), smooth((y - 3.2) / 3));
      c = mix(c, mix(ROCK1, ROCK2, noise(x * 0.7, z * 0.7)), smooth((s - 0.6) / 0.9) * smooth((y - 3.5) / 3) * 0.85);
    }
    const bank = smooth(1 - (ad - 2.2) / 2.6);
    if (bank > 0 && z > -14) c = mix(c, mix(B1, B2, noise(x * 0.8, z * 0.8)), bank);
    if (y < 1.5 && ad < 4) c = mix(c, WET, smooth((1.6 - y) / 0.9));
    if (mist) c = mix(c, MIST, mist * (0.35 + 0.65 * smooth((y - 4) / 12)));
    return c;
  };
}
const sideFn = (x, y) => (y < -1.8 ? S0 : y < -0.6 ? S1 : mix(S2, S3, (y + 0.6) / 6));

export function buildTerrain(mist, nx = 64, nz = 42) {
  const X0 = -30, Z0 = -20, dx = 60 / nx, dz = 40 / nz, UP = [0, 1, 0];
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = terrainH(X0 + i * dx, Z0 + j * dz);
  const P = (i, j) => [X0 + i * dx, H[j * (nx + 1) + i], Z0 + j * dz];
  const top = new Soup(), side = new Soup();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1), d = P(i + 1, j + 1);
    if ((i + j) & 1) { top.tri(a, c, b, UP); top.tri(b, c, d, UP); }
    else { top.tri(a, c, d, UP); top.tri(a, d, b, UP); }
  }
  const LV = [-3, -1.8, -0.6];
  const strip = (p0, p1, out) => {
    for (let k = 0; k < 3; k++) {
      const y0 = LV[k], t0 = k < 2 ? LV[k + 1] : p0[1], t1 = k < 2 ? LV[k + 1] : p1[1];
      side.quad([p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], t1, p1[2]], [p0[0], t0, p0[2]], out);
    }
  };
  for (let i = 0; i < nx; i++) { strip(P(i, 0), P(i + 1, 0), [0, 0, -1]); strip(P(i, nz), P(i + 1, nz), [0, 0, 1]); }
  for (let j = 0; j < nz; j++) { strip(P(0, j), P(0, j + 1), [-1, 0, 0]); strip(P(nx, j), P(nx, j + 1), [1, 0, 0]); }
  side.quad([-30, -3, -20], [30, -3, -20], [30, -3, 20], [-30, -3, 20], [0, -1, 0]);
  return merge([top.geo(landColor(mist), 0.05), side.geo(sideFn, 0.04)]);
}

export const waterY = (x, z, amp) => (noise(x * 0.5, z * 0.5) * 0.6 + noise(x * 1.3 + 5, z * 1.3 + 2) * 0.4 - 0.5) * amp;

// Air = blok volume: permukaan facet kecil (titik dijitter + noise) + dinding samping, 2 morph target relatif
export function buildWater(cfg, level) {
  const nx = 50, nz = 34, X0 = -30, Z0 = -20, dx = 60 / nx, dz = 40 / nz, UP = [0, 1, 0], amp = cfg.amp;
  const pts = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const edge = i === 0 || i === nx || j === 0 || j === nz;
    const x = X0 + i * dx + (edge ? 0 : (hash3(i, j, 1.7) - 0.5) * dx * 0.7);
    const z = Z0 + j * dz + (edge ? 0 : (hash3(i, j, 9.1) - 0.5) * dz * 0.7);
    pts.push([x, waterY(x, z, amp), z]);
  }
  const Q = (i, j) => pts[j * (nx + 1) + i];
  const so = new Soup();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = Q(i, j), b = Q(i + 1, j), c = Q(i, j + 1), d = Q(i + 1, j + 1);
    if ((i + j) & 1) { so.tri(a, c, b, UP); so.tri(b, c, d, UP); } else { so.tri(a, c, d, UP); so.tri(a, d, b, UP); }
  }
  const lim = -(amp / 2 + 0.1);
  const skirt = (p0, p1, out) => {
    const h0 = terrainH(p0[0], p0[2]) - level, h1 = terrainH(p1[0], p1[2]) - level;
    if (h0 >= -0.02 && h1 >= -0.02) return;
    const o = [out[0] * 0.01, 0, out[2] * 0.01];
    so.quad([p0[0] + o[0], p0[1], p0[2] + o[2]], [p1[0] + o[0], p1[1], p1[2] + o[2]],
      [p1[0] + o[0], Math.min(h1, lim), p1[2] + o[2]], [p0[0] + o[0], Math.min(h0, lim), p0[2] + o[2]], out);
  };
  for (let i = 0; i < nx; i++) { skirt(Q(i, 0), Q(i + 1, 0), [0, 0, -1]); skirt(Q(i, nz), Q(i + 1, nz), [0, 0, 1]); }
  for (let j = 0; j < nz; j++) { skirt(Q(0, j), Q(0, j + 1), [-1, 0, 0]); skirt(Q(nx, j), Q(nx, j + 1), [1, 0, 0]); }
  const c0 = col(cfg.c0), c1 = col(cfg.c1), dark = c0.clone().multiplyScalar(0.55), foam = cfg.foam ? col(cfg.foam) : null;
  const g = so.geo((x, y) => {
    if (y < lim + 0.08) return mix(c0, dark, -y / 3.5);
    return foam && y > amp * 0.15 ? foam : mix(c0, c1, y / amp + 0.5);
  }, 0.03);
  const p = g.attributes.position, dA = new Float32Array(p.count * 3), dB = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < lim + 0.08) continue; // dasar dinding tidak ikut bergerak
    const x = p.getX(i), z = p.getZ(i);
    dA[i * 3 + 1] = Math.sin(x * 0.5 + z * 0.3) * cfg.mamp;
    dB[i * 3 + 1] = Math.cos(x * 0.4 - z * 0.5) * cfg.mamp;
  }
  g.morphAttributes.position = [new THREE.BufferAttribute(dA, 3), new THREE.BufferAttribute(dB, 3)];
  g.morphTargetsRelative = true;
  return g;
}

// ---------- daftar posisi & geometri bersama (seed sama untuk semua tahap) ----------
const C_WALL = col('#e8dcc8'), C_WALL2 = col('#d9ccb4'), C_R1 = col('#b5503a'), C_R2 = col('#c46a45');
const C_DOOR = col('#6a4a30'), C_WIN = col('#4b5a68'), C_CHIM = col('#8a6a58'), C_RIDGE = col('#9c4030');
function houseGeo(o) {
  const { w, d, hh } = o, rh = 0.9 + o.v * 0.4;
  const parts = [T(new THREE.BoxGeometry(w, hh + 0.3, d), { p: [0, (hh + 0.3) / 2 - 0.3, 0] }, mix(C_WALL, C_WALL2, o.v), 0.04)];
  const W = w / 2 + 0.25, D = d / 2 + 0.3, y = hh, r = new Soup();
  const A = [-W, y, -D], B = [W, y, -D], C = [W, y, D], Dd = [-W, y, D], E = [-W, y + rh, 0], F = [W, y + rh, 0];
  r.quad(Dd, C, F, E, [0, 1, 1]); r.quad(A, E, F, B, [0, 1, -1]);
  r.tri(A, Dd, E, [-1, 0, 0]); r.tri(B, F, C, [1, 0, 0]); r.quad(A, B, C, Dd, [0, -1, 0]);
  parts.push(r.geo((x, yy) => mix(mix(C_R1, C_R2, o.v), C_R2, ((yy - y) / rh) * 0.35), 0.07));
  parts.push(T(new THREE.BoxGeometry(0.5, 1, 0.1), { p: [0, 0.5, d / 2 + 0.02] }, C_DOOR, 0.03));
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) =>
    parts.push(T(new THREE.BoxGeometry(0.45, 0.45, 0.1), { p: [sx * w * 0.28, hh * 0.55, sz * (d / 2 + 0.02)] }, C_WIN, 0.03)));
  parts.push(T(new THREE.BoxGeometry(w + 0.6, 0.1, 0.18), { p: [0, y + rh + 0.03, 0] }, C_RIDGE, 0.03));
  if (o.v > 0.5) parts.push(T(new THREE.BoxGeometry(0.35, 0.9, 0.35), { p: [w * 0.25, y + rh * 0.6, 0] }, C_CHIM, 0.04));
  return merge(parts);
}

const TR1 = col('#3f7f2a'), TR2 = col('#6fa83a'), TK1 = col('#5a4630'), TK2 = col('#7a5a38');
const PN1 = col('#2f5d28'), PN2 = col('#4f8a34');
function treeGeo(v) {
  const R = rng(500 + v);
  const parts = [T(new THREE.CylinderGeometry(0.13, 0.2, 1.3, 5, 1, true), { p: [0, 0.65, 0] }, mix(TK1, TK2, R()), 0.06)];
  const fn = (x, y) => mix(TR1, TR2, (y - 1) / 2.1);
  [[0, 2.0, 0, 1.05, 1], [0.55, 1.55, 0.25, 0.75, 0], [-0.5, 1.6, -0.3, 0.8, 0]].forEach(([x, y, z, r, d]) => {
    const j = 0.85 + R() * 0.3;
    parts.push(T(new THREE.IcosahedronGeometry(1, d), { p: [x + (R() - 0.5) * 0.2, y, z + (R() - 0.5) * 0.2], s: [r * j, r * (1.05 + R() * 0.2), r * (0.9 + R() * 0.2)] }, fn, 0.07));
  });
  return merge(parts);
}
function pineGeo() {
  const R = rng(777), fn = (x, y) => mix(PN1, PN2, (y - 0.8) / 3);
  const parts = [T(new THREE.CylinderGeometry(0.1, 0.16, 1.0, 5, 1, true), { p: [0, 0.5, 0] }, TK1, 0.05)];
  [[1.0, 1.25, 1.5], [1.8, 1.0, 1.25], [2.55, 0.75, 1.0]].forEach(([y, r, h]) =>
    parts.push(T(new THREE.ConeGeometry(r, h, 6), { p: [0, y + h / 2 - 0.3, 0], r: [0, R() * 3, 0] }, fn, 0.07)));
  return merge(parts);
}

function palmGeo(v) {
  const parts = [], lean = 0.12 + v * 0.05, H = 0.95, segs = 4, trunk = col('#8a6a42');
  for (let k = 0; k < segs; k++)
    parts.push(T(new THREE.CylinderGeometry(0.14 - 0.015 * k, 0.16 - 0.015 * k, H, 6, 1, true), { p: [lean * k * 0.9, H * (k + 0.5), 0], r: [0, 0, -lean * 0.3] }, trunk, 0.05));
  const tx = lean * segs * 0.9, ty = H * segs;
  for (let f = 0; f < 7; f++) {
    const cone = new THREE.ConeGeometry(0.22, 2.3, 3);
    cone.translate(0, 1.15, 0); cone.rotateZ(-1.2 - 0.12 * (f % 2)); cone.rotateY((f / 7) * TAU); cone.translate(tx, ty, 0);
    parts.push(prep(cone, mix(TR1, TR2, (f % 3) / 2), 0.06));
  }
  return merge(parts);
}

function poleGeo() {
  const c = col('#6b5a45');
  return merge([
    T(new THREE.CylinderGeometry(0.07, 0.1, 5, 6, 1, true), { p: [0, 2.5, 0] }, c, 0.04),
    T(new THREE.BoxGeometry(1.6, 0.1, 0.1), { p: [0, 4.7, 0] }, c, 0.04),
    T(new THREE.BoxGeometry(0.1, 0.1, 0.5), { p: [0, 4.4, 0] }, c, 0.04),
  ]);
}

function bridgeGeo(bz, cx) {
  const p = [], C = col('#8c8a84'), RL = col('#6a5a48'), PI = col('#7d7a72');
  p.push(T(new THREE.BoxGeometry(16, 0.3, 3), { p: [cx, 3.15, bz] }, C, 0.04));
  [-1, 1].forEach((s) => p.push(T(new THREE.BoxGeometry(1.6, 0.8, 3), { p: [cx + s * 8.2, 2.6, bz] }, PI, 0.05)));
  [-2.6, 0, 2.6].forEach((dx) => {
    const px = cx + dx, yf = terrainH(px, bz) - 0.2, hg = 3.0 - yf;
    p.push(T(new THREE.CylinderGeometry(0.28, 0.34, hg, 6, 1, true), { p: [px, yf + hg / 2, bz] }, PI, 0.05));
  });
  [-1, 1].forEach((s) => {
    const z = bz + s * 1.4;
    p.push(T(new THREE.BoxGeometry(16, 0.1, 0.1), { p: [cx, 4.15, z] }, RL, 0.03));
    for (let k = -4; k <= 4; k++) p.push(T(new THREE.BoxGeometry(0.12, 0.9, 0.12), { p: [cx + k * 2, 3.75, z] }, RL, 0.03));
  });
  return merge(p);
}

function roadGeo(bz, cx) {
  const p = [], c = col('#6d655a');
  for (let x = -17; x <= 17; x += 2) {
    if (Math.abs(x - cx) < 8.8) continue;
    p.push(T(new THREE.BoxGeometry(2.05, 0.2, 2.6), { p: [x, terrainH(x, bz) + 0.12, bz] }, c, 0.06));
  }
  return merge(p);
}

const SH1 = col('#3f7f2a'), SH2 = col('#5f9a35'), RK1 = col('#7d7668'), RK2 = col('#a39d8e');
const shrubGeo = (list) => merge(list.map((o, i) =>
  T(new THREE.IcosahedronGeometry(1, 0), { p: [o.x, o.y + 0.2 * o.s, o.z], r: [0, i, 0], s: [o.s, o.s * 0.7, o.s] }, mix(SH1, SH2, (i % 4) / 3), 0.08)));
const rockGeo = (list) => merge(list.map((o, i) =>
  T(new THREE.IcosahedronGeometry(1, 0), { p: [o.x, o.y + 0.1 * o.s, o.z], r: [0.2, i, 0], s: [o.s * 0.9, o.s * 0.6, o.s * 0.8] }, mix(RK1, RK2, (i % 3) / 2), 0.1)));

let LAYOUT = null;
export function getLayout() { return LAYOUT || (LAYOUT = makeLayout()); }

function makeLayout() {
  const R = rng(20240611), bz = 3, cx = riverX(bz);
  const houses = [];
  for (let t = 0; t < 1500 && houses.length < 16; t++) {
    const x = -17 + R() * 34, z = -6 + R() * 18, h = terrainH(x, z);
    if (Math.abs(z - bz) < 3.2 || Math.abs(x - riverX(z)) < 6.5 || h < PLAIN - 0.3 || h > PLAIN + 0.5) continue;
    if (houses.some((o) => Math.hypot(o.x - x, o.z - z) < 4.8)) continue;
    houses.push({ x, z, y: h - 0.25, rot: (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.25, w: 2.4 + R(), d: 2.2 + R() * 0.8, hh: 1.7 + R() * 0.5, v: R() });
  }
  const near = (x, z, d) => houses.some((o) => Math.hypot(o.x - x, o.z - z) < d);
  const trees = [];
  for (let t = 0; t < 3000 && trees.length < 52; t++) {
    const x = -27 + R() * 54, z = -19 + R() * 32, h = terrainH(x, z), ad = Math.abs(x - riverX(z));
    const keep = R(), s = 0.8 + R() * 0.7, pr = R(), rot = R() * TAU;
    let v = (R() * 3) | 0;
    if (z < -6 && h > 4.5 && pr > 0.35) v = 3;
    if (ad < 4.8 || h < PLAIN - 0.4 || h > 14 || Math.abs(z - bz) < 2 || near(x, z, 3.2)) continue;
    if (z > -5 && keep > 0.55) continue;
    if (trees.some((o) => Math.hypot(o.x - x, o.z - z) < 1.8)) continue;
    trees.push({ x, z, y: h - 0.1, s, v, rot });
  }
  const palms = [];
  for (let t = 0; t < 2000 && palms.length < 6; t++) {
    const x = -17 + R() * 34, z = -5 + R() * 17, h = terrainH(x, z), v = (R() * 2) | 0, rot = R() * TAU;
    if (Math.abs(x - riverX(z)) < 6.5 || Math.abs(z - bz) < 3 || h < PLAIN - 0.3 || h > PLAIN + 0.5 || near(x, z, 3.2)) continue;
    if (palms.some((o) => Math.hypot(o.x - x, o.z - z) < 4)) continue;
    palms.push({ x, z, y: h - 0.05, v, rot, s: 0.9 + R() * 0.4 });
  }
  const poles = [-16, -11, -6, 16].map((x) => ({ x, z: bz + 2.3, y: terrainH(x, bz + 2.3) - 0.1 }));
  const shrubs = [], rocks = [];
  for (let t = 0; t < 600 && shrubs.length + rocks.length < 40; t++) {
    const z = -3 + R() * 22, side = R() < 0.5 ? -1 : 1, x = riverX(z) + side * (4.8 + R() * 1.8);
    const h = terrainH(x, z), s = 0.5 + R() * 0.5, rr = R();
    if (Math.abs(z - bz) < 3.5 || h < PLAIN - 0.3 || Math.abs(x) > 24) continue;
    (rr < 0.65 ? shrubs : rocks).push({ x, y: h, z, s });
  }
  return {
    bz, cx, houses, trees, palms, poles,
    houseGeos: houses.map(houseGeo),
    treeGeos: [0, 1, 2].map(treeGeo).concat([pineGeo()]),
    palmGeos: [0, 1].map(palmGeo),
    poleGeo: poleGeo(),
    bridge: bridgeGeo(bz, cx),
    road: roadGeo(bz, cx),
    shrubs: shrubGeo(shrubs),
    rocks: rockGeo(rocks),
  };
}

// ==================== COMMON ====================
export const STAGE_NAMES = { 1: 'Stage1_AwanBerkumpul', 2: 'Stage2_HujanDeras', 3: 'Stage3_SungaiMeluap', 4: 'Stage4_Banjir' };
export const MOOD = {
  1: { bg: '#7fb8f0', hemiSky: '#d4e8ff', hemiGround: '#6b7a4a', hemi: 1.2, sun: '#fff4e0', sunI: 2.6 },
  2: { bg: '#3f4856', hemiSky: '#8d9bb0', hemiGround: '#3c4438', hemi: 0.6, sun: '#9fb0c8', sunI: 0.9 },
  3: { bg: '#3a424e', hemiSky: '#838fa3', hemiGround: '#3c4438', hemi: 0.55, sun: '#9aa9bf', sunI: 0.8 },
  4: { bg: '#3c434d', hemiSky: '#868fa0', hemiGround: '#4a4438', hemi: 0.55, sun: '#9aa7ba', sunI: 0.8 },
  all: { bg: '#9db0c0', hemiSky: '#dfe8f0', hemiGround: '#6b6a55', hemi: 1.0, sun: '#fff0dc', sunI: 1.8 },
};

export class Budget {
  constructor(max = 32000) { this.max = max; this.used = 0; }
  add(n) { this.used += n; }
  can(n) { return this.used + n <= this.max * 0.96; }
}
export const vc = (name, o = {}) => new THREE.MeshStandardMaterial({ name, vertexColors: true, color: 0xffffff, roughness: 0.9, metalness: 0, ...o });
export const pad = (i) => String(i).padStart(2, '0');

export function cloudGeo(R, scale, puffs, base, top) {
  const parts = [], hmax = 3.4 * scale;
  const fn = (x, y) => mix(base, top, (y + 0.4 * scale) / hmax);
  for (let k = 0; k < puffs; k++) {
    const px = (R() - 0.5) * 7 * scale, pz = (R() - 0.5) * 4.5 * scale;
    const py = Math.max(0, 1 - Math.abs(px) / (4 * scale)) * R() * 2 * scale;
    const r = (1.5 + R() * 1.5) * scale;
    parts.push(T(new THREE.IcosahedronGeometry(1, R() < 0.3 ? 1 : 0), { p: [px, py, pz], s: [r * (1.1 + R() * 0.5), r * (0.7 + R() * 0.3), r * (0.9 + R() * 0.3)] }, fn, 0.05));
  }
  return merge(parts);
}

export function rainSheet(R, lines) {
  const so = new Soup(), r = 0.03;
  for (let i = 0; i < lines; i++) {
    const x = (R() - 0.5) * 13, z = (R() - 0.5) * 13, y0 = -R() * 12, len = 2.6 + R() * 1.6, sh = 0.12 * len;
    const ring = (y, dx) => [0, 1, 2].map((k) => { const a = (k * TAU) / 3 + 0.5; return [x + dx + Math.cos(a) * r, y, z + Math.sin(a) * r]; });
    const b = ring(y0, 0), t = ring(y0 + len, sh);
    for (let k = 0; k < 3; k++) {
      const k2 = (k + 1) % 3, am = ((k + 0.5) * TAU) / 3 + 0.5;
      so.quad(b[k], b[k2], t[k2], t[k], [Math.cos(am), 0, Math.sin(am)]);
    }
  }
  return so.geo(col('#aebccd'), 0.04);
}

export function arrowGeo(color, s) {
  return merge([
    T(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 3 * s, 6, 1, true), { p: [0, 1.5 * s, 0] }, color, 0.02),
    T(new THREE.ConeGeometry(0.65 * s, 1.4 * s, 6), { p: [0, 3.7 * s, 0] }, color, 0.02),
  ]);
}

// tebaran buih / puing mengapung (lensa pipih facet) di permukaan air
export function scatterFoam(R, L, level, count, rmin, rmax, mode) {
  const out = [];
  for (let t = 0; t < count * 40 && out.length < count; t++) {
    let x, z;
    if (mode === 'river') { z = -8 + R() * 27; x = riverX(z) + (R() - 0.5) * 4.6; }
    else { x = -19 + R() * 38; z = -6 + R() * 24; }
    const r = rmin + R() * R() * (rmax - rmin);
    if (terrainH(x, z) > level - (mode === 'river' ? 0.05 : 0.5)) continue;
    if (L.houses.some((o) => Math.hypot(o.x - x, o.z - z) < 2.8)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 0.15)) continue;
    out.push({ x, z, r });
  }
  return out;
}
export function foamGeo(R, items, amp, ctop, cbot) {
  return merge(items.map(({ x, z, r }) => {
    const y = waterY(x, z, amp) + 0.06, ry = r * 0.16;
    return T(new THREE.IcosahedronGeometry(1, R() < 0.5 ? 1 : 0), { p: [x, y, z], r: [0, R() * TAU, 0], s: [r * (1 + R() * 0.5), ry, r * (0.8 + R() * 0.4)] },
      (px, py) => mix(cbot, ctop, (py - (y - ry)) / (2 * ry)), 0.05);
  }));
}

export function createStage(n, cfg) {
  const B = new Budget(32000), g = new THREE.Group(), L = getLayout();
  g.name = STAGE_NAMES[n];
  const P = `S${n}_`, R = rng(n * 1000 + 7);
  const refs = { clouds: [], arrows: [], red: [], rain: [], water: null, foam: null, sway: [] };
  const add = (name, geo, mat, pos = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = P + name; m.position.set(pos[0], pos[1], pos[2]);
    g.add(m); B.add(tris(geo)); return m;
  };
  const place = (name, geo, mat, o, s = 1) => {
    const m = add(name, geo, mat, [o.x, o.y, o.z]);
    m.rotation.y = o.rot || 0; m.scale.setScalar(s); return m;
  };
  const mats = {
    land: vc(P + 'Land', { roughness: 0.95 }), build: vc(P + 'Build', { roughness: 0.85 }),
    fol: vc(P + 'Foliage', { roughness: 0.9 }), cloud: vc(P + 'Cloud', { roughness: 0.95 }),
    water: vc(P + 'Water', { roughness: 0.2, transparent: true, opacity: cfg.water.op }),
    foam: vc(P + 'Foam', { roughness: 0.7 }),
  };
  const ctx = {
    n, cfg, B, g, L, R, P, refs, add, place, mats,
    core() {
      let terr;
      for (const [nx, nz] of [[64, 42], [52, 34], [42, 28]]) { terr = buildTerrain(cfg.mist, nx, nz); if (tris(terr) <= B.max * 0.4) break; }
      add('Terrain', terr, mats.land);
      const water = add('Water', buildWater(cfg.water, LEVELS[n]), mats.water, [0, LEVELS[n], 0]);
      refs.water = { mesh: water, base: LEVELS[n] };
      add('Bridge', L.bridge, mats.build);
      add('Road', L.road, mats.land);
      const c = cfg.cloud;
      for (let k = 0; k < c.n; k++) {
        const mass = n === 1 && k < 4;
        const x = mass ? (R() - 0.5) * 30 : (R() - 0.5) * 52;
        const z = mass ? -4 - R() * 12 : n === 2 ? -16 + R() * 28 : -14 + R() * 24;
        const y = c.y0 + R() * c.yr, sc = c.sc * (0.8 + R() * 0.5);
        const m = add(`Cloud_${pad(k + 1)}`, cloudGeo(R, sc, c.puffs, col(c.base), col(c.top)), mats.cloud, [x, y, z]);
        refs.clouds.push({ mesh: m, ph: R() * TAU });
      }
    },
    foam(items, ctop, cbot) {
      if (!items.length) return;
      const m = add('Foam', foamGeo(R, items, cfg.water.amp, col(ctop), col(cbot)), mats.foam, [0, LEVELS[n], 0]);
      refs.foam = { mesh: m, base: LEVELS[n] };
    },
    rain() {
      const mRain = vc(P + 'Rain', { roughness: 0.4, transparent: true, opacity: 0.55 });
      let k = 0;
      for (let r = 0; r < 2; r++) for (let cc = 0; cc < 4; cc++) {
        if (!B.can(150 * 6)) break;
        const m = add(`RainSheet_${pad(++k)}`, rainSheet(R, 150), mRain, [(cc - 1.5) * 13, 19, (r - 0.5) * 14]);
        refs.rain.push({ mesh: m, ph: (k - 1) / 8 });
      }
    },
    decor() {
      const sway = (m, amp) => { refs.sway.push({ mesh: m, amp }); };
      L.houses.forEach((o, i) => { if (i < 8 || B.can(tris(L.houseGeos[i]))) place(`House_${pad(i + 1)}`, L.houseGeos[i], mats.build, o); });
      L.palms.forEach((o, i) => { if (B.can(tris(L.palmGeos[o.v]))) sway(place(`Palm_${pad(i + 1)}`, L.palmGeos[o.v], mats.fol, o, o.s), 0.05); });
      L.poles.forEach((o, i) => { if (B.can(tris(L.poleGeo))) place(`Pole_${pad(i + 1)}`, L.poleGeo, mats.build, o); });
      if (B.can(tris(L.shrubs))) add('Shrubs', L.shrubs, mats.fol);
      if (B.can(tris(L.rocks))) add('Rocks', L.rocks, mats.land);
      L.trees.forEach((o, i) => { if (B.can(tris(L.treeGeos[o.v]))) sway(place(`Tree_${pad(i + 1)}`, L.treeGeos[o.v], mats.fol, o, o.s), 0.03); });
    },
    finish() {
      let t = 0; g.traverse((o) => { if (o.isMesh) t += tris(o.geometry); });
      if (t > 32500) console.warn(`Tahap ${n}: ${t} segitiga melebihi anggaran`);
      return { n, group: g, tris: t, refs };
    },
  };
  return ctx;
}

// ==================== STAGES (1 - 4) ====================
// Tahap 1: awan berkumpul, sungai tenang jernih
const CFG1 = {
  mist: 0,
  water: { c0: '#5a8a7a', c1: '#7a8f6a', op: 0.85, amp: 0.12, mamp: 0.08 },
  cloud: { n: 7, puffs: 9, sc: 1.1, y0: 21, yr: 4, base: '#b9c6d6', top: '#f2f6fa' },
};

export function buildStage1() {
  const c = createStage(1, CFG1);
  c.core();
  c.decor();
  return c.finish();
}

// Tahap 2: awan gelap rendah, hujan deras, sungai mulai naik dan keruh
const CFG2 = {
  mist: 0.28,
  water: { c0: '#5f6a55', c1: '#7a7a5a', op: 0.88, amp: 0.18, mamp: 0.12 },
  cloud: { n: 12, puffs: 8, sc: 1.7, y0: 15.5, yr: 3.5, base: '#3f4652', top: '#7b8594' },
};

export function buildStage2() {
  const c = createStage(2, CFG2);
  c.core();
  c.foam(scatterFoam(c.R, c.L, LEVELS[2], 6, 0.3, 0.7, 'river'), '#cfc8b4', '#a9a28c');
  c.rain();
  c.decor();
  return c.finish();
}

// Tahap 3: sungai cokelat meluap, buih putih, hujan terus, langit gelap
const CFG3 = {
  mist: 0.2,
  water: { c0: '#8c6a46', c1: '#a3784f', op: 0.9, amp: 0.34, mamp: 0.2, foam: '#e8e0d0' },
  cloud: { n: 11, puffs: 8, sc: 1.7, y0: 15.5, yr: 3.5, base: '#3f4652', top: '#7b8594' },
};

export function buildStage3() {
  const c = createStage(3, CFG3);
  c.core();
  const items = scatterFoam(c.R, c.L, LEVELS[3], 30, 0.45, 1.6, 'river').concat(scatterFoam(c.R, c.L, LEVELS[3], 14, 0.18, 0.4, 'river'));
  c.foam(items, '#efe8d8', '#cfc3a8');
  c.rain();
  c.decor();
  return c.finish();
}

// Tahap 4: air cokelat menggenangi pemukiman, hujan terus, langit gelap
const CFG4 = {
  mist: 0.25,
  water: { c0: '#8c6a46', c1: '#a3784f', op: 0.9, amp: 0.14, mamp: 0.1 },
  cloud: { n: 10, puffs: 8, sc: 1.7, y0: 15.5, yr: 3.5, base: '#3f4652', top: '#7b8594' },
};

export function buildStage4() {
  const c = createStage(4, CFG4);
  c.core();
  c.foam(scatterFoam(c.R, c.L, LEVELS[4], 16, 0.4, 1.1, 'flood'), '#e3dccb', '#c4b79c');
  c.rain();
  c.decor();
  return c.finish();
}

export function buildStage(n) {
  return [null, buildStage1, buildStage2, buildStage3, buildStage4][n]();
}

// ==================== ANIM ====================
const { VectorKeyframeTrack: V, NumberKeyframeTrack: N, QuaternionKeyframeTrack: Q, AnimationClip } = THREE;

// keyframe terakhir = pertama (dipaksa dengan evaluasi f(0))
function track(Cls, name, D, n, f) {
  const t = [], v = [];
  for (let i = 0; i <= n; i++) { t.push((D * i) / n); v.push(...f(i === n ? 0 : i / n)); }
  return new Cls(name, t, v);
}
const fade = (p, w = 0.12) => (p < w ? 0.01 + (0.99 * p) / w : p > 1 - w ? 0.01 + (0.99 * (1 - p)) / w : 1);
const wrap = (p) => p - Math.floor(p);

export function buildClips(stages) {
  const C = {};
  const push = (clip, D, tr) => { (C[clip] || (C[clip] = { D, tracks: [] })).tracks.push(tr); };
  for (const st of stages) {
    const r = st.refs, nm = (m) => m.name;
    r.clouds.forEach(({ mesh, ph }) => {
      const b = mesh.position.clone();
      push('CloudDrift', 16, track(V, `${nm(mesh)}.position`, 16, 16, (p) => [
        b.x + 1.6 * Math.sin(TAU * p + ph), b.y + 0.15 * Math.sin(2 * TAU * p + ph), b.z + 0.6 * Math.sin(TAU * p + 2 * ph)]));
    });
    r.arrows.forEach(({ mesh, ph }) => {
      const b = mesh.position.clone();
      push('VaporArrows', 5, track(V, `${nm(mesh)}.position`, 5, 40, (p) => [b.x, b.y + 6 * wrap(p + ph), b.z]));
      push('VaporArrows', 5, track(V, `${nm(mesh)}.scale`, 5, 40, (p) => { const s = fade(wrap(p + ph)); return [s, s, s]; }));
    });
    r.red.forEach(({ mesh, ph }) => {
      const b = mesh.position.clone();
      push('FlowSurge', 4, track(V, `${nm(mesh)}.position`, 4, 40, (p) => [b.x, b.y + 4.5 * wrap(p + ph), b.z]));
      push('FlowSurge', 4, track(V, `${nm(mesh)}.scale`, 4, 40, (p) => { const s = fade(wrap(p + ph)); return [s, s, s]; }));
    });
    r.rain.forEach(({ mesh, ph }) => {
      const b = mesh.position.clone();
      push('RainFall', 2.4, track(V, `${nm(mesh)}.position`, 2.4, 48, (p) => [b.x, b.y - 10 * wrap(p + ph), b.z]));
      push('RainFall', 2.4, track(V, `${nm(mesh)}.scale`, 2.4, 48, (p) => { const s = fade(wrap(p + ph), 0.1); return [s, s, s]; }));
    });
    if (r.water) {
      const { mesh, base } = r.water, amp = { 2: 0.1, 3: 0.04, 4: 0.08 }[st.n];
      if (amp) push('FloodRise', 10, track(V, `${nm(mesh)}.position`, 10, 20, (p) => [0, base + amp * Math.sin(TAU * p), 0]));
      if (amp && r.foam) push('FloodRise', 10, track(V, `${nm(r.foam.mesh)}.position`, 10, 20, (p) => [0, base + amp * Math.sin(TAU * p), 0]));
      push('WaterRipple', 6, track(N, `${nm(mesh)}.morphTargetInfluences`, 6, 12, (p) => [0.5 + 0.5 * Math.sin(TAU * p), 0.5 + 0.5 * Math.sin(TAU * p + 2.1)]));
    }
    r.sway.forEach(({ mesh, amp }, i) => {
      const qb = mesh.quaternion.clone(), ph = i * 1.7;
      push('TreeSway', 6, track(Q, `${nm(mesh)}.quaternion`, 6, 12, (p) => {
        const qs = new THREE.Quaternion().setFromEuler(new THREE.Euler(amp * Math.sin(TAU * p + ph), 0, amp * Math.cos(TAU * p + ph)));
        const q = qb.clone().multiply(qs); return [q.x, q.y, q.z, q.w];
      }));
    });
  }
  return Object.entries(C).map(([name, { D, tracks }]) => new AnimationClip(name, D, tracks));
}

export function filterClips(clips, n) {
  const pre = `S${n}_`;
  return clips.map((c) => {
    const tr = c.tracks.filter((t) => t.name.startsWith(pre));
    return tr.length ? new AnimationClip(c.name, c.duration, tr) : null;
  }).filter(Boolean);
}

// ==================== EXPORTER ====================
export function download(buf, filename) {
  const url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportGLB(root, clips, filename) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(root, (buf) => { download(buf, filename); resolve(); }, reject,
      { binary: true, animations: clips, onlyVisible: false });
  });
}

// ==================== MAIN ====================
const $ = (id) => document.getElementById(id);
const logErr = (m, e) => { console.error(m, e); $('errors').textContent += `${m}: ${(e && e.message) || e}\n`; };
const fmt = (x) => x.toLocaleString('id-ID');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$('app').appendChild(renderer.domElement);
const labelR = new CSS2DRenderer();
Object.assign(labelR.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
$('app').appendChild(labelR.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const hemi = new THREE.HemisphereLight(0xffffff, 0x556644, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(40, 60, 30);
scene.add(hemi, sun);

const world = new THREE.Group();
world.name = 'Banjir';
scene.add(world);

const stages = [], labels = [];
for (let n = 1; n <= 4; n++) {
  const div = document.createElement('div');
  div.className = 'lbl';
  const lbl = new CSS2DObject(div);
  scene.add(lbl);
  labels[n] = lbl;
  try {
    const st = buildStage(n);
    stages[n] = st;
    world.add(st.group);
    // div.textContent = `Tahap ${n}: ${fmt(st.tris)} segitiga`;
  } catch (e) {
    stages[n] = { error: e };
    div.textContent = `Tahap ${n}: GAGAL`;
    logErr(`Tahap ${n} gagal`, e);
  }
}

let clips = [];
try { clips = buildClips(stages.filter((s) => s && !s.error)); } catch (e) { logErr('Animasi gagal', e); }
const mixer = new THREE.AnimationMixer(world);
clips.forEach((c) => { try { mixer.clipAction(c).play(); } catch (e) { logErr(`Clip ${c.name}`, e); } });

let current = 1, showAll = false;
const GAP = 76;

function layout(all) {
  for (let n = 1; n <= 4; n++) {
    const g = stages[n] && stages[n].group;
    if (!g) { labels[n].visible = false; continue; }
    g.position.set(all ? (n - 2.5) * GAP : 0, 0, 0);
    g.visible = all || n === current;
    labels[n].position.set(g.position.x, -4.5, 23);
    labels[n].visible = g.visible;
  }
}
function applyMood() {
  const m = showAll ? MOOD.all : MOOD[current];
  scene.background = new THREE.Color(m.bg);
  hemi.color.set(m.hemiSky); hemi.groundColor.set(m.hemiGround); hemi.intensity = m.hemi;
  sun.color.set(m.sun); sun.intensity = m.sunI;
}
function focus() {
  if (showAll) camera.position.set(0, 95, 235); else camera.position.set(0, 30, 62);
  controls.target.set(0, 5, 0); controls.update();
}
function refresh() {
  layout(showAll); applyMood();
  for (let n = 1; n <= 4; n++) $('b' + n).classList.toggle('on', !showAll && n === current);
}
function select(n) { current = n; showAll = false; $('all').checked = false; refresh(); focus(); }

let total = 0;
for (let n = 1; n <= 4; n++) {
  const li = document.createElement('li');
  const st = stages[n];
  li.textContent = st.error ? `Tahap ${n}: GAGAL` : `${STAGE_NAMES[n]} - ${fmt(st.tris)} segitiga`;
  if (!st.error) total += st.tris;
  $('list').appendChild(li);
  $('b' + n).onclick = () => select(n);
}
// $('total').textContent = `Total: ${fmt(total)} segitiga`;
$('all').onchange = (e) => { showAll = e.target.checked; refresh(); focus(); };
addEventListener('keydown', (e) => { if (e.key >= '1' && e.key <= '4') select(+e.key); });

async function exportStage(n) {
  const g = stages[n] && stages[n].group;
  if (!g) return;
  const sc = new THREE.Scene();
  sc.name = STAGE_NAMES[n];
  g.position.set(0, 0, 0); g.visible = true;
  sc.add(g);
  try { await exportGLB(sc, filterClips(clips, n), `banjir_tahap${n}.glb`); } catch (e) { logErr(`Export tahap ${n} gagal`, e); }
  world.add(g);
  refresh();
}
for (let n = 1; n <= 4; n++) $('e' + n).onclick = () => exportStage(n);
$('exEach').onclick = async () => {
  for (let n = 1; n <= 4; n++) { await exportStage(n); await new Promise((r) => setTimeout(r, 400)); }
};

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); labelR.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize(); refresh(); focus();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  mixer.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
  labelR.render(scene, camera);
});