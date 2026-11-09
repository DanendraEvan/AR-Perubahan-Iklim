import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ============================================================================
// 1. COMMON UTILITIES & GEOMETRY HELPERS
// ============================================================================
export const C = (h) => new THREE.Color(h);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const pad = (n, w = 2) => String(n).padStart(w, '0');

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash2 = (x, y, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
export const hash3 = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 191.9) * 43758.5453; return v - Math.floor(v); };
const r2 = (v) => Math.round(v * 100) / 100;

export function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y, s = 0) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 3) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 7) * 0.15;

export function flat(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n.attributes.uv) n.deleteAttribute('uv');
  n.computeVertexNormals();
  return n;
}
export function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export function paintFaces(g, fn) {
  const p = g.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const c = fn(cx, cy, cz);
    for (let k = 0; k < 3; k++) c.toArray(a, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export function makeGeo(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
export const merge = (parts) => mergeGeometries(parts, false);

export function limb(p0, p1, r0, r1, sides = 5, open = false) {
  const d = new THREE.Vector3().subVectors(p1, p0), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, open);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(p0.x, p0.y, p0.z);
  return g;
}

export function countTris(root) {
  let n = 0;
  root.traverse((o) => { if (o.isMesh) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return Math.round(n);
}

// ============================================================================
// 2. WORLD CONSTANTS & HEIGHT FUNCTIONS
// ============================================================================
export const W = 40, D = 26, BOTTOM = -4;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Profil pantai ke laut: x = -20..2 (daratan tinggi -> pesisir), x = 2..20 (dasar laut & rak gletser)
export function baseHeight(x, z, erosion = 0) {
  let h = 1.6 * smoothstep(5, -15, x) - 2.2 * smoothstep(-2, 11, x);
  h += (fbm(x * 0.14, z * 0.14, 2) - 0.5) * 0.55;
  // Bukit es kutub di sudut kanan belakang
  const glacierShelf = smoothstep(5, 14, x) * smoothstep(2, -10, z);
  h += glacierShelf * 2.8;
  // Bukit belakang kota di kiri belakang
  const cityHill = smoothstep(0, -14, x) * smoothstep(-3, -12, z);
  h += cityHill * 1.6;
  // Erosi tanah berlumpur di Tahap 3
  if (erosion > 0) {
    const coastMask = smoothstep(-10, 0, x) * smoothstep(8, -2, x);
    const channels = Math.sin(x * 1.4 + z * 0.9) * 0.5 + 0.5;
    h -= erosion * coastMask * (0.45 + 0.45 * channels);
  }
  return h;
}

export const BUILDINGS = [
  { x: -17.0, z: -9.5, w: 2.5, d: 2.3, h: 7.2, c: '#7a8b99' },
  { x: -13.6, z: -10.2, w: 2.2, d: 2.2, h: 9.4, c: '#8fa3b0' },
  { x: -10.4, z: -9.6, w: 2.4, d: 2.0, h: 6.4, c: '#6c7d8c' },
  { x: -7.2, z: -10.4, w: 2.0, d: 2.0, h: 8.2, c: '#9ab0bf' },
  { x: -15.2, z: -6.5, w: 2.1, d: 2.0, h: 5.2, c: '#8596a6' },
  { x: -11.8, z: -6.8, w: 1.9, d: 1.9, h: 5.8, c: '#738594' },
];

export const HOUSES = [
  { x: -9.8, z: 0.8, w: 2.4, d: 2.1, h: 1.6, ry: 0.15, wall: '#e8dccb', roof: '#b84a32' },
  { x: -5.4, z: -1.8, w: 2.6, d: 2.2, h: 1.7, ry: -0.1, wall: '#dfd3c3', roof: '#a83e28' },
  { x: -6.8, z: 3.6, w: 2.3, d: 2.0, h: 1.5, ry: 0.28, wall: '#d9c8b4', roof: '#9c4230' },
  { x: -2.8, z: 1.6, w: 2.2, d: 1.9, h: 1.5, ry: -0.22, wall: '#e3d5c5', roof: '#b0462e' },
  { x: -3.5, z: 6.2, w: 2.3, d: 2.0, h: 1.5, ry: 0.08, wall: '#d6c6b2', roof: '#8f3b27' },
];

export const PALMS = [
  { x: -11.5, z: 4.5, s: 1.0, seed: 11 },
  { x: -8.2, z: -2.5, s: 0.95, seed: 22 },
  { x: -4.2, z: -4.2, s: 0.9, seed: 33 },
  { x: -1.6, z: 4.4, s: 0.92, seed: 44 },
  { x: -5.6, z: 8.2, s: 0.88, seed: 55 },
  { x: -9.4, z: 7.5, s: 0.95, seed: 66 },
];

export const MANGROVES = [
  { x: -1.5, z: -1.2, s: 1.0, seed: 101 },
  { x: 0.2, z: 2.5, s: 1.1, seed: 102 },
  { x: -0.8, z: 6.8, s: 0.95, seed: 103 },
  { x: 1.0, z: 9.0, s: 0.9, seed: 104 },
  { x: -2.2, z: 9.6, s: 0.85, seed: 105 },
  { x: 0.6, z: -4.2, s: 0.92, seed: 106 },
];

export const POLES = [
  { x: -7.8, z: 1.2 },
  { x: -4.2, z: 0.2 },
  { x: -1.2, z: -0.6 },
];

export const CORALS = [
  { x: 3.5, z: 4.2, s: 1.0, seed: 201 },
  { x: 5.5, z: 7.5, s: 0.9, seed: 202 },
  { x: 2.8, z: 8.8, s: 1.1, seed: 203 },
  { x: 6.8, z: 3.0, s: 0.85, seed: 204 },
];

// ============================================================================
// 3. ANIMATIONS
// ============================================================================
export const DUR = {
  SunPulse: 3,
  WaterRise: 5,
  WaveRipple: 4,
  RiseArrows: 2.5,
  IcebergBob: 4,
  TreeSway: 4
};

export function sunPulseTracks(node, base = 1) {
  const s = base, p = base * 1.12;
  return [new THREE.VectorKeyframeTrack(`${node}.scale`, [0, 1.5, 3], [s, s, s, p, p, p, s, s, s])];
}

export function waterRiseTracks(node, x, y0, y1, z) {
  const T = [0, 2.5, 5];
  return [new THREE.VectorKeyframeTrack(`${node}.position`, T, [x, y0, z, x, y1, z, x, y0, z])];
}

export function rippleTrack(node) {
  return new THREE.NumberKeyframeTrack(`${node}.morphTargetInfluences`, [0, 1, 2, 3, 4], [1, 0, 0.5, 0.5, 0, 1, 0.5, 0.5, 1, 0]);
}

export function arrowUpTracks(node, x, y, z, idx) {
  const s = 0.15 * idx;
  const T = [0, s, s + 0.8, s + 1.6, s + 1.65, 2.5];
  const dy = [0, 0, 0.7, 1.4, 0, 0], sc = [0.01, 0.01, 1, 0.01, 0.01, 0.01];
  return [
    new THREE.VectorKeyframeTrack(`${node}.position`, T, dy.flatMap((d) => [x, y + d, z])),
    new THREE.VectorKeyframeTrack(`${node}.scale`, T, sc.flatMap((v) => [v, v, v])),
  ];
}

export function waveSurgeTracks(node, x, y, z, idx) {
  const s = 0.2 * idx;
  const T = [0, s, s + 0.9, s + 1.8, s + 1.85, 2.5];
  const dx = [0, 0, -1.6, -3.2, 0, 0], sc = [0.01, 0.01, 1, 0.01, 0.01, 0.01];
  return [
    new THREE.VectorKeyframeTrack(`${node}.position`, T, dx.flatMap((d) => [x + d, y, z])),
    new THREE.VectorKeyframeTrack(`${node}.scale`, T, sc.flatMap((v) => [v, v, v])),
  ];
}

export function icebergBobTracks(node, x, y, z) {
  return [
    new THREE.VectorKeyframeTrack(`${node}.position`, [0, 2, 4], [x, y, z, x, y - 0.22, z, x, y, z]),
  ];
}

export function treeSwayTrack(node, q0, rng) {
  const axis = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize(), a = 0.04 + rng() * 0.04, vals = [];
  [0, 1, 0, -1, 0].forEach((s) => { const q = q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, a * s)); vals.push(q.x, q.y, q.z, q.w); });
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, [0, 1, 2, 3, 4], vals);
}

export function buildClips(infos) {
  const by = {};
  infos.forEach((i) => { if (i) for (const [k, t] of Object.entries(i.tracks)) (by[k] ??= []).push(...t); });
  return Object.entries(by).filter(([, t]) => t.length).map(([n, t]) => new THREE.AnimationClip(n, DUR[n], t));
}

// ============================================================================
// 4. MATERIALS
// ============================================================================
const S = (o) => new THREE.MeshStandardMaterial(o);

export function createMaterials() {
  return {
    vc: S({ name: 'Mat_VertexColor', vertexColors: true, roughness: 0.92, metalness: 0 }),
    sun: S({ name: 'Mat_Sun', color: 0xffc824, emissive: 0xffb700, emissiveIntensity: 1, roughness: 0.5, metalness: 0 }),
    sunRay: S({ name: 'Mat_SunRay', color: 0xffdb58, emissive: 0xffa000, emissiveIntensity: 0.8, roughness: 0.5, metalness: 0 }),
    water: S({ name: 'Mat_Water', vertexColors: true, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82 }),
    ice: S({ name: 'Mat_Ice', vertexColors: true, roughness: 0.25, metalness: 0.05 }),
    dashNormal: S({ name: 'Mat_DashBlue', color: 0x38b6ff, emissive: 0x1068a8, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0 }),
    dashRise: S({ name: 'Mat_DashRed', color: 0xff4747, emissive: 0x991414, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0 }),
    redArrow: S({ name: 'Mat_RedArrow', color: 0xf03224, emissive: 0x8a1108, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0 }),
    cyanArrow: S({ name: 'Mat_CyanArrow', color: 0x38d0ff, emissive: 0x0b668a, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0 }),
  };
}

// ============================================================================
// 5. TERRAIN & WATER GEOMETRY
// ============================================================================
export const NX = 96, NZ = 64;
const X = (i) => -W / 2 + (W * i) / NX, Z = (j) => -D / 2 + (D * j) / NZ;

export function buildTerrain(o = {}) {
  const { erosion = 0, floodX = 1.5, seed = 7, pal = {} } = o;
  const n = (NX + 1) * (NZ + 1), hs = new Float32Array(n), cs = new Float32Array(n * 3);
  const cLandA = C(pal.landA || '#5c9638'), cLandB = C(pal.landB || '#427325');
  const cSand = C(pal.sand || '#d9c38e'), cMud = C(pal.mud || '#5c4631');
  const cSea = C(pal.sea || '#254c66'), cIce = C(pal.ice || '#d8f0ff');
  const t = new THREE.Color();

  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const k = j * (NX + 1) + i, x = X(i), z = Z(j);
    const h = baseHeight(x, z, erosion);
    hs[k] = h;

    const noiseVal = fbm(x * 0.25 + 2, z * 0.25, seed);
    t.copy(cLandA).lerp(cLandB, clamp(noiseVal * 1.4, 0, 1));

    // Zona pantai / lumpur
    const beachT = smoothstep(-6.5, floodX, x) * (1 - smoothstep(floodX + 1.5, floodX + 6, x));
    t.lerp(erosion > 0 ? cMud : cSand, beachT * 0.9);

    if (erosion > 0) {
      const mudSpread = smoothstep(-11, 2, x) * (1 - smoothstep(4, 10, x));
      t.lerp(cMud, mudSpread * (0.55 + 0.35 * noiseVal));
    }

    // Dasar laut
    const seaT = smoothstep(floodX, floodX + 6, x);
    t.lerp(cSea, seaT * 0.85);

    // Gletser es di kanan belakang
    const iceT = smoothstep(5.5, 11.5, x) * smoothstep(1.5, -6.5, z);
    t.lerp(cIce, iceT);

    t.toArray(cs, k * 3);
  }

  const pos = [], col = [];
  const v = (i, j) => { const k = j * (NX + 1) + i; pos.push(X(i), hs[k], Z(j)); col.push(cs[k * 3], cs[k * 3 + 1], cs[k * 3 + 2]); };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if ((i + j) & 1) { v(i, j); v(i, j + 1); v(i + 1, j + 1); v(i, j); v(i + 1, j + 1); v(i + 1, j); }
    else { v(i, j); v(i, j + 1); v(i + 1, j); v(i + 1, j); v(i, j + 1); v(i + 1, j + 1); }
  }
  return { top: makeGeo(pos, col), sides: buildSides(hs, seed), hs };
}

function buildSides(hs, seed) {
  const pos = [], col = [];
  const levels = [-1, -2, -3, BOTTOM], layer = ['#8f7958', '#735c3f', '#57432c', '#382a1c'];
  const tmp = new THREE.Color();
  const quad = (a, b, c, d, out, color) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), Cc = new THREE.Vector3(...c);
    const nrm = B.sub(A).cross(Cc.sub(A));
    const tris = nrm.dot(new THREE.Vector3(...out)) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tris) { pos.push(...p); col.push(color.r, color.g, color.b); }
  };
  const row = (len, f) => Array.from({ length: len + 1 }, (_, q) => f(q));
  const edges = [
    { p: row(NX, (i) => [X(i), hs[NZ * (NX + 1) + i], Z(NZ)]), out: [0, 0, 1] },
    { p: row(NX, (i) => [X(i), hs[i], Z(0)]), out: [0, 0, -1] },
    { p: row(NZ, (j) => [X(0), hs[j * (NX + 1)], Z(j)]), out: [-1, 0, 0] },
    { p: row(NZ, (j) => [X(NX), hs[j * (NX + 1) + NX], Z(j)]), out: [1, 0, 0] },
  ];
  edges.forEach((e, ei) => {
    for (let k = 0; k < e.p.length - 1; k++) {
      const p = e.p[k], q = e.p[k + 1];
      for (let L = 0; L < 4; L++) {
        const yp = L === 0 ? p[1] : levels[L - 1], yq = L === 0 ? q[1] : levels[L - 1], yb = levels[L];
        tmp.set(layer[L]).offsetHSL(0, 0, (hash2(k, L + ei * 5, seed) - 0.5) * 0.06);
        quad([p[0], yp, p[2]], [q[0], yq, q[2]], [q[0], yb, q[2]], [p[0], yb, p[2]], e.out, tmp);
      }
    }
  });
  tmp.set('#261c13');
  quad([-W / 2, BOTTOM, -D / 2], [W / 2, BOTTOM, -D / 2], [W / 2, BOTTOM, D / 2], [-W / 2, BOTTOM, D / 2], [0, -1, 0], tmp);
  return makeGeo(pos, col);
}

export function oceanGeometry(xMin, xMax, zMin, zMax, sx, sz, seed, waveAmp = 0.12, muddy = false) {
  const w = xMax - xMin, d = zMax - zMin;
  const pg = new THREE.PlaneGeometry(w, d, sx, sz).rotateX(-Math.PI / 2);
  pg.translate((xMin + xMax) / 2, 0, (zMin + zMax) / 2);
  const g = flat(pg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const crest = Math.sin(x * 0.9 + z * 0.25) * waveAmp * 0.6;
    p.setY(i, (vnoise(x * 0.6, z * 0.6, seed) - 0.5) * waveAmp + crest);
  }
  g.computeVertexNormals();
  const deepC = C(muddy ? '#2b5b6c' : '#145a9e');
  const shallowC = C(muddy ? '#5e7356' : '#3298c9');
  const foamC = C('#e8f7ff');
  paintFaces(g, (cx, cy, cz) => {
    const shoreFactor = smoothstep(xMax, xMin, cx);
    const c = deepC.clone().lerp(shallowC, shoreFactor);
    const waveBand = Math.sin(cx * 1.6 + vnoise(cx, cz, seed) * 2.5);
    if (waveBand > 0.78 && cx < xMin + 8) c.lerp(foamC, 0.55);
    return c.offsetHSL(0, 0, (hash3(cx * 3, cy, cz * 3) - 0.5) * 0.05);
  });

  const mk = (ph, name) => {
    const a = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      a.push(0, Math.sin(x * 1.1 + ph) * Math.cos(z * 0.9 + ph * 0.6) * waveAmp, 0);
    }
    const at = new THREE.Float32BufferAttribute(a, 3); at.name = name; return at;
  };
  g.morphAttributes.position = [mk(0, 'waveA'), mk(2.1, 'waveB')];
  g.morphTargetsRelative = true;
  return g;
}

// ============================================================================
// 6. SCENE PROPS (BUILDINGS, GLACIERS, HOUSES, PALMS, MANGROVES, CORALS)
// ============================================================================
export function cityGeometry(b) {
  const parts = [];
  const body = flat(new THREE.BoxGeometry(b.w, b.h, b.d));
  body.translate(0, b.h / 2, 0);
  const baseC = C(b.c), topC = baseC.clone().offsetHSL(0, 0, 0.12);
  parts.push(paintFaces(body, (cx, cy) => baseC.clone().lerp(topC, cy / b.h)));

  const roof = flat(new THREE.BoxGeometry(b.w * 0.82, 0.35, b.d * 0.82));
  roof.translate(0, b.h + 0.17, 0);
  parts.push(paint(roof, '#4c5b66'));

  // Pita jendela low-poly
  const floors = Math.floor(b.h / 1.15);
  const winC = C('#b8e2f2');
  for (let f = 1; f < floors; f++) {
    const wy = f * 1.1;
    const band = flat(new THREE.BoxGeometry(b.w + 0.06, 0.28, b.d * 0.84));
    band.translate(0, wy, 0);
    parts.push(paint(band, winC));
  }
  const m = merge(parts);
  m.translate(b.x, baseHeight(b.x, b.z) - 0.2, b.z);
  return m;
}

export function houseGeometry(h, damaged = false) {
  const parts = [];
  const wallG = flat(new THREE.BoxGeometry(h.w, h.h, h.d));
  wallG.translate(0, h.h / 2, 0);
  const wCol = C(damaged ? '#8c7e6d' : h.wall);
  const stainCol = C('#4d4234');
  parts.push(paintFaces(wallG, (cx, cy) => cy < 0.65 && damaged ? wCol.clone().lerp(stainCol, 0.6) : wCol));

  const roofG = new THREE.ConeGeometry(Math.hypot(h.w, h.d) * 0.62, h.h * 0.78, 4);
  roofG.rotateY(Math.PI / 4);
  roofG.translate(0, h.h + h.h * 0.38, 0);
  const rCol = C(damaged ? '#6b3426' : h.roof);
  parts.push(paint(flat(roofG), rCol));

  const door = flat(new THREE.BoxGeometry(0.45, 0.85, 0.08));
  door.translate(0, 0.42, h.d / 2 + 0.02);
  parts.push(paint(door, '#4a3222'));

  return merge(parts);
}

export function glacierMountainGeometry(r, h, seed) {
  let g = new THREE.ConeGeometry(r, h, 8, 4, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = r2(p.getX(i)), y = p.getY(i), z = r2(p.getZ(i)), k = y / h;
    const h1 = hash3(x * 30 + seed, r2(y) * 30, z * 30);
    const f = 1 + (h1 - 0.5) * 0.4 * (1 - k * 0.4);
    p.setXYZ(i, p.getX(i) * f, y, p.getZ(i) * f);
  }
  g = flat(g);
  const rockC = C('#5d6e7e'), iceC = C('#a8d8f0'), snowC = C('#ffffff');
  return paintFaces(g, (cx, cy, cz) => {
    const k = clamp(cy / h + (hash3(cx * 12, cy * 12, cz * 12) - 0.5) * 0.25, 0, 1);
    return k > 0.55 ? iceC.clone().lerp(snowC, (k - 0.55) * 2.2) : rockC.clone().lerp(iceC, k * 1.8);
  });
}

export function icebergGeometry(w, h, d, seed) {
  const g = flat(new THREE.BoxGeometry(w, h, d, 3, 2, 3));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = r2(p.getX(i)), y = r2(p.getY(i)), z = r2(p.getZ(i));
    const n = hash3(x * 11 + seed, y * 11, z * 11);
    const topTap = y > 0 ? 0.75 + 0.3 * n : 1.0;
    p.setXYZ(i, p.getX(i) * topTap, p.getY(i) + (y > 0 ? (n - 0.3) * 0.45 : 0), p.getZ(i) * topTap);
  }
  g.computeVertexNormals();
  const cBot = C('#6ec5e9'), cTop = C('#f2fbff');
  return paintFaces(g, (cx, cy) => cBot.clone().lerp(cTop, clamp((cy + h / 2) / h, 0, 1)));
}

export function palmGeometry(seed, state = 0) {
  // state: 0 = sehat, 1 = terendam angin kencang, 2 = rusak/meranggas
  const r = mulberry32(seed), parts = [];
  const h = 3.2 + r() * 0.8;
  const curveX = (r() - 0.3) * (state === 2 ? 1.4 : 0.8);
  const curveZ = (r() - 0.5) * 0.6;
  const p0 = V(0, -0.2, 0), p1 = V(curveX * 0.45, h * 0.5, curveZ * 0.45), p2 = V(curveX, h, curveZ);
  const barkA = C('#6e5239'), barkB = C('#8c6d4e');
  parts.push(paint(flat(limb(p0, p1, 0.18, 0.14, 5)), barkA));
  parts.push(paint(flat(limb(p1, p2, 0.14, 0.10, 5)), barkB));

  const frondCount = state === 2 ? 3 : 6;
  const leafA = state === 2 ? C('#8c7338') : state === 1 ? C('#5c8f32') : C('#3d8529');
  const leafB = state === 2 ? C('#6b5322') : C('#7ab83d');
  for (let i = 0; i < frondCount; i++) {
    const a = (i / frondCount) * Math.PI * 2 + r() * 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const drop = state === 2 ? -0.55 : -0.15;
    const f1 = p2.clone().add(V(dx * 0.85, 0.28 + drop * 0.3, dz * 0.85));
    const f2 = f1.clone().add(V(dx * 0.95, -0.35 + drop, dz * 0.95));
    const col = leafA.clone().lerp(leafB, r());
    parts.push(paint(flat(limb(p2, f1, 0.14, 0.1, 3, true)), col));
    parts.push(paint(flat(limb(f1, f2, 0.1, 0.01, 3, true)), col));
  }
  return merge(parts);
}

// Pohon bakau (mangrove) dengan akar tunjang mencuat (prop roots)
export function mangroveGeometry(seed, dead = false) {
  const r = mulberry32(seed), parts = [];
  const rootCol = C(dead ? '#4a3625' : '#634832');
  const trunkCol = C(dead ? '#594230' : '#73563d');

  const topBase = V(0, 1.05, 0);
  // 6 akar tunjang melengkung ke lumpur
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.35;
    const rad = 0.65 + r() * 0.35;
    const mid = V(Math.cos(a) * rad * 0.55, 0.65, Math.sin(a) * rad * 0.55);
    const foot = V(Math.cos(a) * rad, -0.35, Math.sin(a) * rad);
    parts.push(paint(flat(limb(topBase, mid, 0.09, 0.07, 4)), rootCol));
    parts.push(paint(flat(limb(mid, foot, 0.07, 0.05, 4)), rootCol));
  }

  // Batang utama & cabang
  const crownCenter = V((r() - 0.5) * 0.2, 2.1, (r() - 0.5) * 0.2);
  parts.push(paint(flat(limb(topBase, crownCenter, 0.18, 0.12, 5)), trunkCol));

  for (let b = 0; b < 4; b++) {
    const a = (b / 4) * Math.PI * 2 + r() * 0.5;
    const tip = crownCenter.clone().add(V(Math.cos(a) * 0.85, 0.65 + r() * 0.35, Math.sin(a) * 0.85));
    parts.push(paint(flat(limb(crownCenter, tip, 0.1, 0.04, 4)), trunkCol));
    if (!dead) {
      const canopy = flat(new THREE.IcosahedronGeometry(0.62 + r() * 0.2, 0));
      canopy.scale(1.1, 0.75, 1.1);
      canopy.translate(tip.x, tip.y + 0.15, tip.z);
      const c0 = C('#2e7329'), c1 = C('#589e38');
      parts.push(paintFaces(canopy, () => c0.clone().lerp(c1, r())));
    } else {
      // Ranting kering mencuat tanpa daun
      const twig = tip.clone().add(V((r() - 0.5) * 0.5, 0.45, (r() - 0.5) * 0.5));
      parts.push(paint(flat(limb(tip, twig, 0.04, 0.015, 4)), rootCol));
    }
  }
  return merge(parts);
}

export function powerPoleGeometry() {
  const parts = [];
  const pole = flat(limb(V(0, -0.3, 0), V(0, 2.7, 0), 0.08, 0.06, 5));
  parts.push(paint(pole, '#4f3b2a'));
  const bar = flat(new THREE.BoxGeometry(0.9, 0.07, 0.07));
  bar.translate(0, 2.45, 0);
  parts.push(paint(bar, '#3b2b1e'));
  return merge(parts);
}

export function coralGeometry(seed, bleached = false) {
  const r = mulberry32(seed), parts = [];
  const c0 = bleached ? C('#d9d6ce') : C('#ff6b8b');
  const c1 = bleached ? C('#b5b0a4') : C('#ff9e44');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.5;
    const p0 = V(0, -0.1, 0);
    const p1 = V(Math.cos(a) * 0.45, 0.45 + r() * 0.3, Math.sin(a) * 0.45);
    parts.push(paint(flat(limb(p0, p1, 0.1, 0.13, 5)), c0.clone().lerp(c1, r())));
  }
  return merge(parts);
}

export function makeSun(P, M, add) {
  const sun = new THREE.Group(); sun.name = P + 'Sun'; sun.position.set(13, 14.5, -9);
  add(sun, new THREE.Mesh(flat(new THREE.SphereGeometry(1.6, 10, 7)), M.sun), P + 'SunDisc', false, false);
  const rayG = flat(new THREE.ConeGeometry(0.24, 1.2, 4));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, ray = new THREE.Mesh(rayG, M.sunRay);
    ray.position.set(Math.cos(a) * 2.7, Math.sin(a) * 2.7, 0); ray.rotation.z = a - Math.PI / 2;
    add(sun, ray, `${P}SunRay_${pad(k + 1)}`, false, false);
  }
  return sun;
}

export function buildCommonScene(P, M, topts, stageIdx, tracks) {
  const g = new THREE.Group();
  const add = (parent, mesh, name, cast = true, recv = true) => {
    mesh.name = name; mesh.castShadow = cast; mesh.receiveShadow = recv; parent.add(mesh); return mesh;
  };

  const t = buildTerrain(topts);
  add(g, new THREE.Mesh(t.top, M.vc), P + 'Terrain', false, true);
  add(g, new THREE.Mesh(t.sides, M.vc), P + 'SlabSides', false, false);

  // Gedung kota di kejauhan kiri belakang
  const cityParts = BUILDINGS.map((b) => cityGeometry(b));
  add(g, new THREE.Mesh(merge(cityParts), M.vc), P + 'CitySkyline');

  // Rumah-rumah warga di pesisir
  HOUSES.forEach((h, i) => {
    const damaged = stageIdx === 2;
    const mesh = new THREE.Mesh(houseGeometry(h, damaged), M.vc);
    const y = baseHeight(h.x, h.z, topts.erosion || 0) - 0.08;
    mesh.position.set(h.x, y, h.z);
    mesh.rotation.y = h.ry;
    if (damaged) {
      mesh.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.14;
      mesh.rotation.x = 0.08;
    }
    add(g, mesh, `${P}CoastalHouse_${pad(i + 1)}`);
  });

  // Tiang listrik pesisir
  POLES.forEach((p, i) => {
    const mesh = new THREE.Mesh(powerPoleGeometry(), M.vc);
    mesh.position.set(p.x, baseHeight(p.x, p.z, topts.erosion || 0), p.z);
    if (stageIdx === 1) mesh.rotation.z = 0.12 * (i + 1);
    if (stageIdx === 2) mesh.rotation.z = 0.45 * (i % 2 ? 1 : -1);
    add(g, mesh, `${P}PowerPole_${pad(i + 1)}`);
  });

  // Pohon kelapa
  const swayRng = mulberry32(88 + stageIdx);
  PALMS.forEach((p, i) => {
    const mesh = new THREE.Mesh(palmGeometry(p.seed, stageIdx), M.vc);
    mesh.position.set(p.x, baseHeight(p.x, p.z, topts.erosion || 0), p.z);
    mesh.scale.setScalar(p.s);
    if (stageIdx === 2 && i % 2 === 1) {
      mesh.rotation.z = 1.15; // Tumbang sebagian di tahap 3
    }
    const name = `${P}Palm_${pad(i + 1)}`;
    add(g, mesh, name);
    if (tracks.TreeSway && !(stageIdx === 2 && i % 2 === 1)) {
      tracks.TreeSway.push(treeSwayTrack(name, mesh.quaternion.clone(), swayRng));
    }
  });

  // Pohon Bakau (Mangrove)
  MANGROVES.forEach((m, i) => {
    const dead = stageIdx === 2;
    const mesh = new THREE.Mesh(mangroveGeometry(m.seed, dead), M.vc);
    mesh.position.set(m.x, baseHeight(m.x, m.z, topts.erosion || 0), m.z);
    mesh.scale.setScalar(m.s);
    const name = `${P}Mangrove_${pad(i + 1)}`;
    add(g, mesh, name);
  });

  // Terumbu Karang di perairan dangkal
  const coralParts = CORALS.map((c) => {
    const cg = coralGeometry(c.seed, stageIdx === 2);
    cg.scale(c.s, c.s, c.s);
    cg.translate(c.x, baseHeight(c.x, c.z, 0) + 0.05, c.z);
    return cg;
  });
  add(g, new THREE.Mesh(merge(coralParts), M.vc), P + 'CoralReef');

  return { g, add };
}

// ============================================================================
// 7. STAGES 1, 2, 3
// ============================================================================

// TAHAP 1: Permukaan laut naik (Pencairan es gletser & pemuaian air laut)
export function buildStage1(M) {
  const tracks = { SunPulse: [], WaterRise: [], WaveRipple: [], RiseArrows: [], IcebergBob: [], TreeSway: [] };
  const { g, add } = buildCommonScene('S1_', M, { erosion: 0, floodX: 1.5, seed: 10 }, 0, tracks);
  g.name = 'Stage1_PermukaanLautNaik';

  // Gunung es & Gletser besar di kanan belakang
  const glaciers = [
    { x: 9.5, z: -8.8, r: 4.2, h: 8.5, s: 1 },
    { x: 14.8, z: -8.2, r: 4.8, h: 9.8, s: 2 },
    { x: 17.2, z: -3.8, r: 3.6, h: 6.8, s: 3 },
  ];
  glaciers.forEach((gl, i) => {
    const m = new THREE.Mesh(glacierMountainGeometry(gl.r, gl.h, gl.s), M.ice);
    m.position.set(gl.x, baseHeight(gl.x, gl.z) - 0.4, gl.z);
    add(g, m, `S1_Glacier_${pad(i + 1)}`);
  });

  // Bongkahan es mengapung (Icebergs)
  [[8.2, -1.5, 2.8, 2.2, 2.2], [13.5, 1.8, 3.4, 2.6, 2.5], [16.5, 5.5, 2.2, 1.6, 1.8]].forEach(([x, z, w, h, d], i) => {
    const name = `S1_Iceberg_${pad(i + 1)}`;
    const m = new THREE.Mesh(icebergGeometry(w, h, d, 30 + i), M.ice);
    m.position.set(x, -0.35, z);
    add(g, m, name);
    tracks.IcebergBob.push(...icebergBobTracks(name, x, -0.35, z));
  });

  // Air laut (bergerak naik dari level normal ke naik)
  const water = add(g, new THREE.Mesh(oceanGeometry(-1.5, W / 2, -D / 2, D / 2, 42, 32, 11, 0.12, false), M.water), 'S1_SeaWater', false, false);
  water.position.set(0, -0.55, 0);
  tracks.WaterRise.push(...waterRiseTracks('S1_SeaWater', 0, -0.65, -0.1, 0));
  tracks.WaveRipple.push(rippleTrack('S1_SeaWater'));

  // Indikator Garis Putus-putus: Permukaan Laut Normal (Biru) & Permukaan Laut Naik (Merah)
  const makeDashLine = (y) => {
    const a = [];
    for (let i = 0; i < 14; i++) {
      const b = flat(new THREE.BoxGeometry(0.75, 0.08, 0.08));
      b.translate(-0.5 + i * 1.35, y, 8.5);
      a.push(b);
    }
    return merge(a);
  };
  add(g, new THREE.Mesh(makeDashLine(-0.65), M.dashNormal), 'S1_SeaLevelNormal', false, false);
  add(g, new THREE.Mesh(makeDashLine(0.35), M.dashRise), 'S1_SeaLevelRise', false, false);

  // Panah Merah Besar & Panah Biru Pemuaian Air Laut (seperti di infografis Tahap 1)
  const shaft = flat(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 6)); shaft.translate(0, 0.55, 0);
  const head = flat(new THREE.ConeGeometry(0.42, 0.75, 6)); head.translate(0, 1.3, 0);
  const arrowGeo = merge([shaft, head]);

  const redArrow = new THREE.Mesh(arrowGeo, M.redArrow);
  redArrow.position.set(10.5, -0.5, 8.5);
  add(g, redArrow, 'S1_MainRiseArrow', false, false);
  tracks.RiseArrows.push(...arrowUpTracks('S1_MainRiseArrow', 10.5, -0.5, 8.5, 0));

  [[3.2, 8.5], [5.8, 8.5], [8.2, 8.5]].forEach(([x, z], i) => {
    const name = `S1_ExpandArrow_${pad(i + 1)}`;
    const m = new THREE.Mesh(arrowGeo, M.cyanArrow);
    m.scale.setScalar(0.75);
    m.position.set(x, -0.6, z);
    add(g, m, name, false, false);
    tracks.RiseArrows.push(...arrowUpTracks(name, x, -0.6, z, i + 1));
  });

  const sun = makeSun('S1_', M, add); g.add(sun);
  tracks.SunPulse.push(...sunPulseTracks('S1_Sun', 1));

  return { group: g, tracks };
}

// TAHAP 2: Air memasuki wilayah pesisir (Banjir rob, gelombang tinggi merendam rumah & pohon)
export function buildStage2(M) {
  const tracks = { SunPulse: [], WaterRise: [], WaveRipple: [], RiseArrows: [], IcebergBob: [], TreeSway: [] };
  const { g, add } = buildCommonScene('S2_', M, { erosion: 0.15, floodX: -9.5, seed: 20 }, 1, tracks);
  g.name = 'Stage2_AirMemasukiWilayahPesisir';

  // Gletser menyusut drastis
  const glaciers = [
    { x: 10.0, z: -9.0, r: 3.3, h: 5.5, s: 1 },
    { x: 15.2, z: -8.5, r: 3.8, h: 6.4, s: 2 },
  ];
  glaciers.forEach((gl, i) => {
    const m = new THREE.Mesh(glacierMountainGeometry(gl.r, gl.h, gl.s), M.ice);
    m.position.set(gl.x, baseHeight(gl.x, gl.z) - 0.5, gl.z);
    add(g, m, `S2_Glacier_${pad(i + 1)}`);
  });

  // Air laut masuk jauh ke daratan (-11.5 .. 20), merendam rumah-rumah pesisir
  const water = add(g, new THREE.Mesh(oceanGeometry(-11.5, W / 2, -D / 2, D / 2, 54, 36, 22, 0.24, false), M.water), 'S2_FloodWater', false, false);
  water.position.set(0, 0.48, 0);
  tracks.WaterRise.push(...waterRiseTracks('S2_FloodWater', 0, 0.38, 0.65, 0));
  tracks.WaveRipple.push(rippleTrack('S2_FloodWater'));

  // Panah arus gelombang menerjang ke arah pesisir (-X)
  const shaft = flat(new THREE.CylinderGeometry(0.15, 0.15, 1.3, 6));
  shaft.rotateZ(Math.PI / 2); shaft.translate(-0.65, 0, 0);
  const head = flat(new THREE.ConeGeometry(0.4, 0.8, 6));
  head.rotateZ(Math.PI / 2); head.translate(-1.5, 0, 0);
  const surgeArrowGeo = merge([shaft, head]);

  [[3.5, -3.5], [4.5, 1.5], [3.0, 6.0], [-1.0, -0.5], [-0.5, 4.5]].forEach(([x, z], i) => {
    const name = `S2_SurgeArrow_${pad(i + 1)}`;
    const m = new THREE.Mesh(surgeArrowGeo, M.cyanArrow);
    m.position.set(x, 0.85, z);
    add(g, m, name, false, false);
    tracks.RiseArrows.push(...waveSurgeTracks(name, x, 0.85, z, i));
  });

  const sun = makeSun('S2_', M, add); g.add(sun);
  tracks.SunPulse.push(...sunPulseTracks('S2_Sun', 1.05));

  return { group: g, tracks };
}

// TAHAP 3: Habitat pesisir terganggu (Mangrove mati, tanah berlumpur tererosi, terumbu karang rusak)
export function buildStage3(M) {
  const tracks = { SunPulse: [], WaveRipple: [], TreeSway: [] };
  const { g, add } = buildCommonScene('S3_', M, {
    erosion: 0.85,
    floodX: -8.0,
    seed: 30,
    pal: { landA: '#6e683b', landB: '#524b28', mud: '#4a3828', sand: '#7a6448', sea: '#2b4c59' }
  }, 2, tracks);
  g.name = 'Stage3_HabitatPesisirTerganggu';

  // Air laut keruh kecokelatan menggenangi rawa lumpur dan akar mangrove yang mati
  const water = add(g, new THREE.Mesh(oceanGeometry(-9.5, W / 2, -D / 2, D / 2, 50, 34, 33, 0.1, true), M.water), 'S3_MuddyWater', false, false);
  water.position.set(0, 0.18, 0);
  tracks.WaveRipple.push(rippleTrack('S3_MuddyWater'));

  // Batang kayu hanyut & puing-puing di lumpur pesisir
  const rng = mulberry32(99), debris = [];
  for (let i = 0; i < 14; i++) {
    const x = -8.5 + rng() * 10, z = -10 + rng() * 20;
    const y = baseHeight(x, z, 0.85) + 0.05;
    const p0 = V(x, y, z), p1 = V(x + (rng() - 0.5) * 1.6, y + (rng() - 0.4) * 0.25, z + (rng() - 0.5) * 1.6);
    debris.push(paint(flat(limb(p0, p1, 0.09, 0.06, 5)), '#473423'));
  }
  add(g, new THREE.Mesh(merge(debris), M.vc), 'S3_CoastalDebris');

  const sun = makeSun('S3_', M, add); g.add(sun);
  tracks.SunPulse.push(...sunPulseTracks('S3_Sun', 1));

  return { group: g, tracks };
}

// ============================================================================
// 8. GLTF EXPORTER
// ============================================================================
export function exportGLB(root, clips) {
  return new Promise((res, rej) =>
    new GLTFExporter().parse(root, res, rej, { binary: true, animations: clips, onlyVisible: false }));
}

export function clipsFor(root, clips) {
  const out = [];
  for (const c of clips) {
    const tracks = c.tracks.filter((t) => root.getObjectByName(t.name.split('.')[0]));
    if (tracks.length) out.push(new THREE.AnimationClip(c.name, c.duration, tracks));
  }
  return out;
}

export function downloadBuffer(buffer, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ============================================================================
// 9. MAIN VIEWER & APPLICATION LOGIC
// ============================================================================
const LABEL = [
  '1 · Permukaan laut naik',
  '2 · Air memasuki wilayah pesisir',
  '3 · Habitat pesisir terganggu'
];
const SKY = [0x87ceeb, 0x6897bb, 0x8ea6b4];
const BUILDERS = [buildStage1, buildStage2, buildStage3];
const SPACING = 48, LIMIT = 40000;
const $ = (id) => document.getElementById(id);
const msg = (t) => { const el = $('msg'); if (el) el.textContent = t; };

if (typeof document !== 'undefined' && $('c')) {
  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xf5fbff, 0x5a6e58, 0.95));
  const sunL = new THREE.DirectionalLight(0xfff4d8, 2.3);
  sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048);
  Object.assign(sunL.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
  scene.add(sunL, sunL.target);

  const mats = createMaterials();
  const diorama = new THREE.Group(); diorama.name = 'AirNaik'; scene.add(diorama);
  const errors = [];
  const stages = BUILDERS.map((b, i) => {
    try { return b ? b(mats) : null; }
    catch (e) { console.error(`Stage${i + 1} gagal dibuat:`, e); errors.push(`Stage${i + 1}: ${e.message}`); return null; }
  });
  stages.forEach((s) => s && diorama.add(s.group));

  const labelR = new CSS2DRenderer();
  Object.assign(labelR.domElement.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none' });
  document.body.appendChild(labelR.domElement);
  const labelEls = stages.map((s) => {
    if (!s) return null;
    const el = document.createElement('div'); el.className = 'lbl';
    const o = new CSS2DObject(el); o.position.set(0, -5.2, 13.5); s.group.add(o);
    return el;
  });
  const clips = buildClips(stages);
  const mixer = new THREE.AnimationMixer(diorama);
  clips.forEach((c) => mixer.clipAction(c).play());

  let current = 0, showAll = false;

  function applyLayout(tile = showAll) {
    stages.forEach((s, i) => { if (!s) return; s.group.position.set(tile ? (i - 1) * SPACING : 0, 0, 0); s.group.visible = tile || i === current; });
  }
  function frame() {
    const c = 0;
    sunL.position.set(c + 14, 26, 18); sunL.target.position.set(c, 0, 0);
    const far = showAll ? 3.2 : 1;
    camera.position.set(c + 6 * far, 16 * far, 42 * far); controls.target.set(c, 3, 0); controls.update();
  }
  function select(i) {
    if (!stages[i]) { msg(`Tahap ${i + 1} gagal dibuat. Lihat Console (F12).`); return; }
    current = i;
    scene.background = new THREE.Color(SKY[i]); scene.fog = new THREE.Fog(SKY[i], 120, 500);
    applyLayout(); frame(); refreshUI();
    msg(LABEL[i]);
  }
  function refreshUI() {
    [...$('tabs').children].forEach((b, i) => b.classList.toggle('on', i === current));
    $('stats').innerHTML = '';
    let total = 0;
    stages.forEach((s, i) => {
      const li = document.createElement('li');
      if (!s) li.textContent = `Stage${i + 1}: gagal dibuat`;
      else {
        const n = countTris(s.group); total += n;
        labelEls[i].innerHTML = `${LABEL[i]}<small>${n.toLocaleString('id-ID')} segitiga</small>`;
        li.textContent = `Stage${i + 1}: ${n.toLocaleString('id-ID')} segitiga (maks ${LIMIT.toLocaleString('id-ID')})`;
        if (n > LIMIT) li.className = 'warn';
      }
      $('stats').appendChild(li);
    });
    const t = document.createElement('li');
    t.textContent = `Total: ${total.toLocaleString('id-ID')} segitiga (batas 110.000)`;
    if (total > 110000) t.className = 'warn';
    $('stats').appendChild(t);
  }

  LABEL.forEach((l, i) => {
    const b = document.createElement('button'); b.textContent = l; b.disabled = !stages[i]; b.onclick = () => select(i); $('tabs').appendChild(b);
  });
  addEventListener('keydown', (e) => { if (e.key >= '1' && e.key <= '3') select(+e.key - 1); });
  $('all').onchange = (e) => { showAll = e.target.checked; applyLayout(); frame(); };

  $('exportAll').onclick = async () => {
    try {
      msg('Mengekspor…'); applyLayout(true);
      const buf = await exportGLB(diorama, clipsFor(diorama, clips));
      applyLayout(); downloadBuffer(buf, 'airnaik.glb'); msg(`airnaik.glb (${(buf.byteLength / 1024).toFixed(0)} KB)`);
    } catch (err) { applyLayout(); console.error(err); msg('Ekspor gagal: ' + err.message); }
  };
  $('exportEach').onclick = async () => {
    try {
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i]; if (!s) continue;
        s.group.position.set(0, 0, 0);
        const buf = await exportGLB(s.group, clipsFor(s.group, clips));
        downloadBuffer(buf, `airnaik_stage${i + 1}.glb`);
        await new Promise((r) => setTimeout(r, 400));
      }
      applyLayout(); msg('Ekspor per tahap selesai.');
    } catch (err) { applyLayout(); console.error(err); msg('Ekspor gagal: ' + err.message); }
  };

  function resize() { labelR.setSize(innerWidth, innerHeight); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  select(stages.findIndex(Boolean));
  if (errors.length) msg(errors.join(' | '));
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => { mixer.update(clock.getDelta()); controls.update(); renderer.render(scene, camera); labelR.render(scene, camera); });
}