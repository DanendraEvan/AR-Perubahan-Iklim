import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ============================================================================
// 1. COMMON UTILITIES & GEOMETRY HELPERS (common.js)
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

// Voronoi sederhana: edge = jarak ke tepi sel (d2 - d1)
export function voronoi(x, z, cell, seed) {
  const gx = x / cell, gz = z / cell, ix = Math.floor(gx), iz = Math.floor(gz);
  let d1 = 1e9, d2 = 1e9;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cz = iz + dz;
    const px = cx + 0.15 + 0.7 * hash2(cx, cz, seed), pz = cz + 0.15 + 0.7 * hash2(cz, cx, seed + 11);
    const d = Math.hypot(gx - px, gz - pz) * cell;
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}

// ---- geometri: non-indexed, normal per-face, hanya position/normal/color ----
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

export function treeGeometry(seed, foliage = null) {
  const rng = mulberry32(seed), frng = mulberry32(seed + 999), parts = [];   // frng terpisah: struktur cabang sama di semua tahap
  const b0 = C('#5b4633'), b1 = C('#8a7860');
  const blob = (p, k) => {
    if (!foliage || frng() > foliage.density * k) return;
    const bg = flat(new THREE.IcosahedronGeometry(foliage.size * (0.8 + frng() * 0.5), 0));
    bg.translate(p.x, p.y, p.z);
    const c0 = C(foliage.colors[0]), c1 = C(foliage.colors[1]);
    parts.push(paintFaces(bg, () => c0.clone().lerp(c1, frng())));
  };
  const grow = (p0, dir, len, r, depth) => {
    const p1 = p0.clone().addScaledVector(dir, len);
    parts.push(paint(flat(limb(p0, p1, r, r * 0.62, depth < 2 ? 6 : 5)), b0.clone().lerp(b1, rng() * 0.8)));
    if (depth >= 3 || r < 0.07) { blob(p1, 1); return; }
    if (depth === 2) blob(p1, 0.6);
    const n = depth === 0 ? 4 : 2 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const t = depth === 0 ? 0.5 + 0.5 * (i / (n - 1)) : 0.6 + 0.4 * (i / Math.max(1, n - 1));
      const base = p0.clone().addScaledVector(dir, len * t);
      const axis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(dir).normalize();
      const cd = dir.clone().applyAxisAngle(axis, 0.45 + rng() * 0.6); cd.y += 0.25; cd.normalize();
      grow(base, cd, len * (0.62 + rng() * 0.15), r * 0.58, depth + 1);
    }
  };
  grow(new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.08, 1, 0.03).normalize(), 4.6, 0.6, 0);
  return merge(parts);
}

export function mountainGeometry(m, loC = '#7a6a58', hiC = '#a08c74') {
  let g = new THREE.ConeGeometry(m.r, m.h, 9, 4, true);
  g.translate(0, m.h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = r2(p.getX(i)), y = p.getY(i), z = r2(p.getZ(i)), k = y / m.h;
    const h1 = hash3(x * 40 + m.seed, r2(y) * 40, z * 40), h2 = hash3(x * 40, r2(y) * 40 + m.seed, z * 40 + 3);
    const f = 1 + (h1 - 0.5) * 0.45 * (1 - k * 0.5);
    p.setXYZ(i, p.getX(i) * f, y + (k > 0.01 && k < 0.99 ? (h2 - 0.5) * m.h * 0.14 : 0), p.getZ(i) * f);
  }
  g = flat(g);
  const lo = C(loC), hi = C(hiC);
  return paintFaces(g, (cx, cy, cz) => lo.clone().lerp(hi, clamp(cy / m.h * 0.5 + hash3(cx * 30, cy * 30, cz * 30) * 0.55, 0, 1)));
}

export function rockGeometry(seed, size) {
  const g = flat(new THREE.IcosahedronGeometry(size, 0));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const h = 0.75 + 0.5 * hash3(r2(p.getX(i)) * 9 + seed, r2(p.getY(i)) * 9, r2(p.getZ(i)) * 9);
    p.setXYZ(i, p.getX(i) * h, p.getY(i) * h * 0.6, p.getZ(i) * h);
  }
  g.computeVertexNormals();
  const lo = C('#7a6a58'), hi = C('#a08c74');
  return paintFaces(g, (cx, cy, cz) => lo.clone().lerp(hi, hash3(cx * 20 + seed, cy * 20, cz * 20)));
}

export function countTris(root) {
  let n = 0;
  root.traverse((o) => { if (o.isMesh) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return Math.round(n);
}

// ============================================================================
// 2. WORLD CONSTANTS & HEIGHT FUNCTIONS (world.js)
// ============================================================================
export const W = 40, D = 26, BOTTOM = -4;
export const LAKE = { x: 6, z: 3, rx: 8.5, rz: 5.8, depth: 2.2 };

// > 0 di dalam cekungan, 0 di tepi
export function basinT(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
  const r = Math.hypot(dx, dz) * (1 + 0.36 * (vnoise(x * 0.35, z * 0.35, 21) - 0.5));
  return 1 - r;
}
export function baseHeight(x, z) {
  let h = (fbm(x * 0.12, z * 0.12, 1) - 0.5) * 0.8;
  h += smoothstep(-3, -12.5, z) * (1.3 + 1.0 * fbm(x * 0.1, z * 0.1, 5)); // kaki bukit di belakang
  const t = basinT(x, z);
  h += 0.5 * smoothstep(-0.45, -0.1, t) * (1 - smoothstep(-0.1, 0.1, t)); // bibir danau
  h -= LAKE.depth * smoothstep(0, 0.75, t);
  return h;
}

export const MOUNTAINS = (() => {
  const r = mulberry32(2024);
  const defs = [[-16, -8.8, 3.6, 6.2], [-10, -8.5, 4.0, 8.0], [-3.5, -8.6, 4.1, 9.0], [3, -8.4, 4.0, 7.2], [9.5, -8.6, 3.9, 8.4], [16, -8.8, 3.6, 6.0]];
  return defs.map((d, i) => ({ id: i + 1, x: d[0] + (r() - 0.5), z: d[1] + (r() - 0.5) * 0.6, r: d[2] * (0.92 + r() * 0.16), h: d[3] * (0.92 + r() * 0.16), seed: 100 + i }));
})();

export const TREE_BIG = { x: -13.5, z: -1.5, s: 1, seed: 11, ry: 0.6 };
export const TREE_SMALL = { x: 15.5, z: 8, s: 0.55, seed: 77, ry: 2.0 };
export const THERMO = { x: 17.5, z: -1.5 };

// ============================================================================
// 3. ANIMATIONS (animations.js)
// ============================================================================
// Durasi tiap clip (semua track dalam satu clip berdurasi sama, keyframe akhir = awal).
export const DUR = { SunPulse: 3, HeatArrows: 3, WaterShrink: 6, WaterArrow: 2.5, PlantWilt: 5, WaterRipple: 4 };

export function sunPulseTracks(node, base = 1) {
  const s = base, p = base * 1.12;
  return [new THREE.VectorKeyframeTrack(`${node}.scale`, [0, 1.5, 3], [s, s, s, p, p, p, s, s, s])];
}

// Panah naik berulang; "memudar" lewat scale kecil di awal/akhir siklus (opacity tidak ada di glTF).
export function heatArrowTracks(node, x, y, z, idx) {
  const s = 0.1 + 0.25 * idx;
  const T = [0, s, s + 0.9, s + 1.8, s + 1.82, 3];
  const dy = [0, 0, 1.3, 2.6, 0, 0], sc = [0.01, 0.01, 1, 0.01, 0.01, 0.01];
  return [
    new THREE.VectorKeyframeTrack(`${node}.position`, T, dy.flatMap((d) => [x, y + d, z])),
    new THREE.VectorKeyframeTrack(`${node}.scale`, T, sc.flatMap((v) => [v, v, v])),
  ];
}

// Gabungkan track dari semua tahap ke clip bernama yang sama.
export function buildClips(infos) {
  const by = {};
  infos.forEach((i) => { if (i) for (const [k, t] of Object.entries(i.tracks)) (by[k] ??= []).push(...t); });
  return Object.entries(by).filter(([, t]) => t.length).map(([n, t]) => new THREE.AnimationClip(n, DUR[n], t));
}

// ---- Stage2 / Stage3 ----
export function waterShrinkTracks(node, x, y, z) {
  const T = [0, 3, 6];
  return [
    new THREE.VectorKeyframeTrack(`${node}.position`, T, [x, y, z, x, y - 0.35, z, x, y, z]),
    new THREE.VectorKeyframeTrack(`${node}.scale`, T, [1, 1, 1, 0.96, 1, 0.96, 1, 1, 1]),
  ];
}
export function waterArrowTracks(node, x, y, z, idx) {
  const s = 0.15 * idx, T = [0, s + 0.3, s + 0.8, s + 1.8, s + 1.82, 2.5];
  const dy = [0, 0, -0.5, -1.1, 0, 0], sc = [0.01, 0.01, 1, 0.01, 0.01, 0.01];
  return [
    new THREE.VectorKeyframeTrack(`${node}.position`, T, dy.flatMap((d) => [x, y + d, z])),
    new THREE.VectorKeyframeTrack(`${node}.scale`, T, sc.flatMap((v) => [v, v, v])),
  ];
}
export function rippleTrack(node) {
  return new THREE.NumberKeyframeTrack(`${node}.morphTargetInfluences`, [0, 1, 2, 3, 4], [1, 0, 0.5, 0.5, 0, 1, 0.5, 0.5, 1, 0]);
}
export function plantWiltTrack(node, q0, rng) {
  const axis = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize(), a = 0.05 + rng() * 0.05, vals = [];
  [0, 1, 0, -1, 0].forEach((s) => { const q = q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, a * s)); vals.push(q.x, q.y, q.z, q.w); });
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, [0, 1.25, 2.5, 3.75, 5], vals);
}

// ============================================================================
// 4. MATERIALS (materials.js)
// ============================================================================
const S = (o) => new THREE.MeshStandardMaterial(o);

export function createMaterials() {
  return {
    vc: S({ name: 'Mat_VertexColor', vertexColors: true, roughness: 0.95, metalness: 0 }),
    sun: S({ name: 'Mat_Sun', color: 0xffc21a, emissive: 0xffc21a, emissiveIntensity: 1, roughness: 0.6, metalness: 0 }),
    sunRay: S({ name: 'Mat_SunRay', color: 0xffd54a, emissive: 0xffb000, emissiveIntensity: 0.8, roughness: 0.6, metalness: 0 }),
    glass: S({ name: 'Mat_ThermoGlass', color: 0xd8eef5, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.35 }),
    red: S({ name: 'Mat_ThermoRed', color: 0xd01c1c, emissive: 0x400000, roughness: 0.35, metalness: 0 }),
    scale: S({ name: 'Mat_ThermoScale', color: 0x2b2b2b, roughness: 0.8, metalness: 0 }),
    water: S({ name: 'Mat_Water', vertexColors: true, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.8 }),
    dash: S({ name: 'Mat_Dash', color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.8, metalness: 0 }),
    waterArrow: S({ name: 'Mat_WaterArrow', color: 0x2a7fd4, emissive: 0x103a70, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0 }),
    heatArrow: S({ name: 'Mat_HeatArrow', color: 0xe02a1c, emissive: 0x8a1208, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0 }),
  };
}

// ============================================================================
// 5. TERRAIN (terrain.js)
// ============================================================================
export const NX = 104, NZ = 68;
const X = (i) => -W / 2 + (W * i) / NX, Z = (j) => -D / 2 + (D * j) / NZ;

// Heightfield + retakan voronoi + warna vertex. Mengembalikan { top, sides }.
export function buildTerrain(o) {
  const { cell = 2.7, crackW = 0.2, crackDepth = 0.17, mudEdge = -0.25, seed = 3, pal = {}, mudAmt = 0.85 } = o;
  const n = (NX + 1) * (NZ + 1), hs = new Float32Array(n), cs = new Float32Array(n * 3);
  const cA = C(pal.a || '#c9a36b'), cB = C(pal.b || '#8a6a43'), cr = C(pal.crack || '#4a3322'), pale = C(pal.pale || '#d9bd89'), mud = C(pal.mud || '#6b4a2f'), t = new THREE.Color();
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const k = j * (NX + 1) + i, x = X(i), z = Z(j);
    const wx = x + (vnoise(x * 0.4, z * 0.4, 9) - 0.5) * 1.6, wz = z + (vnoise(x * 0.4 + 7, z * 0.4, 13) - 0.5) * 1.6;
    let c = 0, lift = 0.5;
    if (crackW > 0) { const e = voronoi(wx, wz, cell, seed); c = 1 - smoothstep(crackW, crackW * 2.4, e); lift = smoothstep(crackW * 2.4, crackW * 6, e); }
    hs[k] = baseHeight(x, z) - crackDepth * c + 0.07 * lift;
    t.copy(cA).lerp(cB, clamp((fbm(x * 0.25 + 3, z * 0.25, 4) - 0.25) * 1.6, 0, 1)).lerp(pale, lift * 0.3);
    t.lerp(mud, smoothstep(mudEdge, mudEdge + 0.35, basinT(x, z)) * mudAmt).lerp(cr, c * 0.9);
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
  const levels = [-1, -2, -3, BOTTOM], layer = ['#a98353', '#8a6a43', '#6a4f33', '#3f2e20'];
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
  tmp.set('#2d2018');
  quad([-W / 2, BOTTOM, -D / 2], [W / 2, BOTTOM, -D / 2], [W / 2, BOTTOM, D / 2], [-W / 2, BOTTOM, D / 2], [0, -1, 0], tmp);
  return makeGeo(pos, col);
}

// ============================================================================
// 6. WATER (water.js)
// ============================================================================
// Permukaan air low poly: PlaneGeometry non-indexed, titik diberi noise, 2 morph target riak.
export function waterGeometry(w, d, sx, sz, seed) {
  const pg = new THREE.PlaneGeometry(w, d, sx, sz).rotateX(-Math.PI / 2), pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {            // petakan kotak -> elips
    const u = pp.getX(i) / (w / 2), v = pp.getZ(i) / (d / 2);
    pp.setX(i, (w / 2) * u * Math.sqrt(1 - (v * v) / 2)); pp.setZ(i, (d / 2) * v * Math.sqrt(1 - (u * u) / 2));
  }
  const g = flat(pg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, (vnoise(p.getX(i) * 0.8, p.getZ(i) * 0.8, seed) - 0.5) * 0.08);
  g.computeVertexNormals();
  const lo = C('#2f7fa0'), hi = C('#4fa3bf');
  paintFaces(g, (cx, cy, cz) => lo.clone().lerp(hi, hash3(cx * 5 + seed, cy, cz * 5)));
  const mk = (ph, name) => {
    const a = [];
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); a.push(0, Math.sin(x * 1.3 + ph) * Math.cos(z * 1.1 + ph * 0.7) * 0.1, 0); }
    const at = new THREE.Float32BufferAttribute(a, 3); at.name = name; return at;
  };
  g.morphAttributes.position = [mk(0, 'rippleA'), mk(2.2, 'rippleB')];
  g.morphTargetsRelative = true;
  return g;
}

// ============================================================================
// 7. BASE SCENE ELEMENTS (base.js)
// ============================================================================
export const lakeFloorY = (t) => -LAKE.depth * smoothstep(0, 0.75, t);

// Tanah + gunung + pohon + batu: posisi identik di semua tahap (fungsi tinggi & seed sama).
export function buildBase(P, M, topts, opt = {}) {
  const g = new THREE.Group();
  const add = (parent, mesh, name, cast = true, recv = true) => { mesh.name = name; mesh.castShadow = cast; mesh.receiveShadow = recv; parent.add(mesh); return mesh; };
  const t = buildTerrain(topts);
  add(g, new THREE.Mesh(t.top, M.vc), P + 'Terrain', false);
  add(g, new THREE.Mesh(t.sides, M.vc), P + 'SlabSides', false);
  MOUNTAINS.forEach((m) => {
    const mesh = new THREE.Mesh(mountainGeometry(m, ...(opt.mtn || [])), M.vc);
    mesh.position.set(m.x, baseHeight(m.x, m.z) - 0.7, m.z); mesh.rotation.y = m.seed;
    add(g, mesh, `${P}Mountain_${pad(m.id)}`);
  });
  [[TREE_BIG, 'Tree_Big'], [TREE_SMALL, 'Tree_Small']].forEach(([T, n]) => {
    const m = new THREE.Mesh(treeGeometry(T.seed, opt.foliage || null), M.vc);
    m.position.set(T.x, baseHeight(T.x, T.z), T.z); m.scale.setScalar(T.s); m.rotation.y = T.ry;
    add(g, m, P + n);
  });
  const rng = mulberry32(5), rocks = [];
  for (let tries = 0; rocks.length < 16 && tries < 200; tries++) {
    const x = -18 + 36 * rng(), z = -6 + 18 * rng();
    if (basinT(x, z) > -0.1 || Math.hypot(x - TREE_BIG.x, z - TREE_BIG.z) < 2.5 || Math.hypot(x - THERMO.x, z - THERMO.z) < 2.5) continue;
    const gg = rockGeometry(rocks.length + 1, 0.25 + rng() * 0.35);
    gg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, baseHeight(x, z) + 0.03, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6), new THREE.Vector3(1, 1, 1)));
    rocks.push(gg);
  }
  add(g, new THREE.Mesh(merge(rocks), M.vc), P + 'Rocks');
  return { g, add };
}

export function makeSun(P, M, add) {
  const sun = new THREE.Group(); sun.name = P + 'Sun'; sun.position.set(5, 15, -9);
  add(sun, new THREE.Mesh(flat(new THREE.SphereGeometry(1.7, 10, 7)), M.sun), P + 'SunDisc', false, false);
  const rayG = flat(new THREE.ConeGeometry(0.26, 1.3, 4));
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, ray = new THREE.Mesh(rayG, M.sunRay);
    ray.position.set(Math.cos(a) * 2.9, Math.sin(a) * 2.9, 0); ray.rotation.z = a - Math.PI / 2;
    add(sun, ray, `${P}SunRay_${pad(k + 1)}`, false, false);
  }
  return sun;
}

// Cincin pucat di dinding cekungan = garis bekas permukaan air lama (kontur basinT = level).
export function ringsGeometry(levels) {
  const pos = [], col = [], S = 72, a = C('#d9c9a2'), b = C('#b89a6a'), tmp = new THREE.Color();
  const pt = (th, k) => { const x = LAKE.x + Math.cos(th) * LAKE.rx * k, z = LAKE.z + Math.sin(th) * LAKE.rz * k; return new THREE.Vector3(x, baseHeight(x, z) + 0.08, z); };
  const kFor = (th, t0) => {
    let lo = 0, hi = 1.4;
    for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2, x = LAKE.x + Math.cos(th) * LAKE.rx * m, z = LAKE.z + Math.sin(th) * LAKE.rz * m; if (basinT(x, z) > t0) lo = m; else hi = m; }
    return lo;
  };
  levels.forEach((t0, li) => {
    for (let s = 0; s < S; s++) {
      const th0 = (s / S) * Math.PI * 2, th1 = ((s + 1) / S) * Math.PI * 2, k0 = kFor(th0, t0), k1 = kFor(th1, t0);
      const A = pt(th0, k0), B = pt(th1, k1), Cc = pt(th1, k1 - 0.04), D = pt(th0, k0 - 0.04);
      const up = B.clone().sub(A).cross(D.clone().sub(A)).y > 0;
      const tri = up ? [A, B, Cc, A, Cc, D] : [A, Cc, B, A, D, Cc];
      tmp.copy(a).lerp(b, (li % 2) * 0.35 + ((s * 7 + li) % 5) * 0.04);
      tri.forEach((v) => { pos.push(v.x, v.y, v.z); col.push(tmp.r, tmp.g, tmp.b); });
    }
  });
  return makeGeo(pos, col);
}

export function addThermometer(P, M, g, add) {
  const th = new THREE.Group(); th.name = P + 'Thermometer';
  th.position.set(THERMO.x, baseHeight(THERMO.x, THERMO.z), THERMO.z);
  add(th, new THREE.Mesh(flat(new THREE.SphereGeometry(0.85, 10, 8)), M.red), P + 'Thermo_Bulb', true, false).position.y = 0.85;
  add(th, new THREE.Mesh(flat(new THREE.CylinderGeometry(0.22, 0.22, 4.75, 6)), M.red), P + 'Thermo_Column', false, false).position.y = 3.2;
  add(th, new THREE.Mesh(flat(new THREE.SphereGeometry(1.02, 10, 8)), M.glass), P + 'Thermo_GlassBulb', false, false).position.y = 0.85;
  add(th, new THREE.Mesh(flat(new THREE.CylinderGeometry(0.42, 0.42, 6.6, 8)), M.glass), P + 'Thermo_GlassTube', false, false).position.y = 4.2;
  const ticks = [];
  for (let k = 0; k < 9; k++) { const b = flat(new THREE.BoxGeometry(k % 2 ? 0.3 : 0.5, 0.07, 0.07)); b.translate(0.75, 1.8 + k * 0.65, 0); ticks.push(b); }
  add(th, new THREE.Mesh(merge(ticks), M.scale), P + 'Thermo_Scale', false, false);
  g.add(th);
}

export function addHeatArrows(P, M, g, add, out) {
  const s = flat(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 6)); s.translate(0, 0.8, 0);
  const c = flat(new THREE.ConeGeometry(0.52, 1.0, 6)); c.translate(0, 2.1, 0);
  const geo = merge([s, c]);
  [[-9, 6], [-4.5, 9.5], [-1, -3], [12, 10.5], [-15, 8.5]].forEach(([x, z], i) => {
    const y = baseHeight(x, z) + 0.4, name = `${P}HeatArrow_${pad(i + 1)}`;
    const m = new THREE.Mesh(geo, M.heatArrow); m.position.set(x, y, z);
    add(g, m, name, false, false);
    out.push(...heatArrowTracks(name, x, y, z, i));
  });
}

// ============================================================================
// 8. CORN FIELD (field.js)
// ============================================================================
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const along = (p0, p1, p2, y) => (y <= p1.y ? p0.clone().lerp(p1, y / p1.y) : p1.clone().lerp(p2, (y - p1.y) / (p2.y - p1.y)));

// State 0: subur — hijau tegak, 6-7 daun lebar melengkung, tongkol hijau.
function freshGeometry(seed) {
  const r = mulberry32(seed), parts = [];
  const h = 1.7 + r() * 1.0, lx = (r() - 0.5) * 0.25, lz = (r() - 0.5) * 0.25;
  const p0 = V(0, -0.05, 0), p1 = V(lx * 0.4, h * 0.62, lz * 0.4), p2 = V(lx, h * 0.98, lz);
  const sA = C('#6aa038'), sB = C('#8bb043');
  parts.push(paint(flat(limb(p0, p1, 0.1, 0.08, 5, true)), sA.clone().lerp(sB, r() * 0.5)));
  parts.push(paint(flat(limb(p1, p2, 0.08, 0.05, 5, true)), sA.clone().lerp(sB, r() * 0.5)));
  const n = 6 + Math.floor(r() * 2), lA = C('#4f8f2a'), lB = C('#86b83e');
  for (let i = 0; i < n; i++) {
    const base = along(p0, p1, p2, h * (0.22 + 0.68 * (i / n)));
    const ph = i * 2.4 + r() * 0.8, out = V(Math.cos(ph), 0, Math.sin(ph));
    const q1 = base.clone().addScaledVector(out.clone().multiplyScalar(0.8).add(V(0, 0.55, 0)).normalize(), 0.6 * (0.8 + r() * 0.4));
    const q2 = q1.clone().addScaledVector(out.clone().multiplyScalar(0.8).add(V(0, -0.2, 0)).normalize(), 0.75 * (0.8 + r() * 0.4));
    const col = lA.clone().lerp(lB, r());
    parts.push(paint(flat(limb(base, q1, 0.12, 0.1, 3, true)), col));
    parts.push(paint(flat(limb(q1, q2, 0.1, 0.01, 3, true)), col.clone().lerp(lB, 0.3)));
  }
  const c = flat(new THREE.ConeGeometry(0.08, 0.4, 4)); c.translate(0, 0.2, 0); c.rotateZ(-0.6); c.translate(p1.x + 0.08, p1.y, p1.z);
  parts.push(paint(c, C('#b9c45a').lerp(C('#d9c95a'), r())));
  return merge(parts);
}

// State 1: mulai layu — kuning/cokelat, daun terkulai, batang miring (dead = hampir mati).
function wiltGeometry(seed, dead) {
  const r = mulberry32(seed), parts = [];
  const h = dead ? 1.1 + r() * 0.7 : 1.5 + r() * 1.0;
  const lx = (r() - 0.5) * (dead ? 0.9 : 0.5), lz = (r() - 0.5) * (dead ? 0.9 : 0.5);
  const sA = dead ? C('#8a6a32') : C('#9aa245'), sB = C('#8a6a32');
  const p0 = V(0, -0.05, 0), p1 = V(lx * 0.4, h * 0.62, lz * 0.4), p2 = V(lx * 1.3, h * (dead ? 0.8 : 0.97), lz * 1.3);
  parts.push(paint(flat(limb(p0, p1, 0.09, 0.07, 5, true)), sA.clone().lerp(sB, dead ? 0.8 : r() * 0.5)));
  parts.push(paint(flat(limb(p1, p2, 0.07, 0.045, 5, true)), sA.clone().lerp(sB, dead ? 0.9 : 0.3 + r() * 0.5)));
  const n = dead ? 2 + Math.floor(r() * 2) : 4 + Math.floor(r() * 3);
  const lA = C('#c9b24a'), lB = C('#8f7a35'), dB = C('#6a5428');
  for (let i = 0; i < n; i++) {
    const base = along(p0, p1, p2, h * (0.3 + 0.6 * (i / n)));
    const ph = i * 2.4 + r() * 0.8, out = V(Math.cos(ph), 0, Math.sin(ph));
    const q1 = base.clone().addScaledVector(out.clone().multiplyScalar(0.8).add(V(0, dead ? 0.1 : 0.45, 0)).normalize(), (dead ? 0.35 : 0.5) * (0.8 + r() * 0.4));
    const q2 = q1.clone().addScaledVector(out.clone().multiplyScalar(0.8).add(V(0, dead ? -0.9 : -0.55, 0)).normalize(), (dead ? 0.5 : 0.62) * (0.8 + r() * 0.4));
    const col = dead ? lB.clone().lerp(dB, r()) : lA.clone().lerp(lB, r() * 0.8);
    parts.push(paint(flat(limb(base, q1, 0.1, 0.085, 3, true)), col));
    parts.push(paint(flat(limb(q1, q2, 0.085, 0.008, 3, true)), col.clone().lerp(dB, 0.25)));
  }
  if (!dead || r() < 0.4) {
    const c = flat(new THREE.ConeGeometry(0.07, 0.34, 4)); c.translate(0, 0.17, 0); c.rotateZ(-0.7); c.translate(p1.x + 0.08, p1.y, p1.z);
    parts.push(paint(c, C('#c9b24a').lerp(C('#8a6a32'), dead ? 0.8 : r() * 0.5)));
  }
  return merge(parts);
}

// State 2: kering — batang cokelat patah/menunduk, TANPA daun.
function dryGeometry(seed) {
  const r = mulberry32(seed), parts = [];
  const h = 1.0 + r() * 0.8, lx = (r() - 0.5) * 1.1, lz = (r() - 0.5) * 1.1;
  const p0 = V(0, -0.05, 0), p1 = V(lx * 0.4, h * 0.6, lz * 0.4), p2 = V(lx * 1.5, h * 0.85, lz * 1.5), p3 = V(lx * 1.9, h * 0.7, lz * 1.9);
  const a = C('#7a5a30'), b = C('#9a7a42');
  parts.push(paint(flat(limb(p0, p1, 0.08, 0.065, 5, true)), a.clone().lerp(b, r() * 0.6)));
  parts.push(paint(flat(limb(p1, p2, 0.065, 0.045, 5, true)), a.clone().lerp(b, r() * 0.6)));
  parts.push(paint(flat(limb(p2, p3, 0.045, 0.025, 4, true)), a.clone().lerp(b, 0.4 + r() * 0.4)));
  return merge(parts);
}

// Ladang: posisi/rotasi/skala SAMA di semua tahap; hanya wujud tanamannya yang berubah.
export function buildField(P, M, g, add, state, tracks, limit = 38500) {
  const mk = (fn, seeds) => seeds.map((s) => fn(s));
  const live = state === 0 ? mk(freshGeometry, [201, 202, 203, 204, 205, 206]) : state === 1 ? mk((s) => wiltGeometry(s, false), [201, 202, 203, 204, 205, 206]) : null;
  const dead = state === 1 ? mk((s) => wiltGeometry(s, true), [301, 302, 303]) : null;
  const dry = state === 2 ? mk(dryGeometry, [401, 402, 403, 404, 405, 406]) : null;
  const tris = (geo) => geo.attributes.position.count / 3;

  const spots = [];
  for (const z of [3.2, 4.4, 5.6, 6.8, 8.0]) for (let x = -17; x <= -4; x += 1.25) spots.push([x, z]);
  for (const z of [9.7, 10.7, 11.7]) for (let x = -17.5; x <= 17.5; x += 1.25) spots.push([x, z]);

  const rng = mulberry32(31), wr = mulberry32(77);
  let budget = limit - countTris(g);
  const cnt = { live: 0, dead: 0, dry: 0, fallen: 0 };
  const tag = { live: 'CornPlant', dead: 'CornDead', dry: 'CornDry', fallen: 'CornFallen' };
  for (const [sx, sz] of spots) {
    const jx = rng(), jz = rng(), roll = rng(), pick = rng(), sc = rng(), r1 = rng(), r2 = rng(), r3 = rng();
    const x = sx + (jx - 0.5) * 0.3, z = sz + (jz - 0.5) * 0.25;
    if (basinT(x, z) > -0.12 || Math.hypot(x - TREE_SMALL.x, z - TREE_SMALL.z) < 1.5) continue;
    let kind, geo;
    if (state === 0) { kind = 'live'; geo = live[Math.floor(pick * live.length)]; }
    else if (state === 1) { kind = roll < 0.08 ? 'fallen' : roll < 0.3 ? 'dead' : 'live'; geo = kind === 'live' ? live[Math.floor(pick * live.length)] : dead[Math.floor(pick * dead.length)]; }
    else { kind = roll < 0.15 ? 'fallen' : 'dry'; geo = dry[Math.floor(pick * dry.length)]; }
    if (tris(geo) > budget) break;
    budget -= tris(geo);
    const m = new THREE.Mesh(geo, M.vc);
    m.position.set(x, baseHeight(x, z) - 0.05, z);
    m.scale.setScalar(0.85 + sc * 0.3);
    if (kind === 'fallen') m.rotation.set(0, r1 * 6.28, (r2 < 0.5 ? -1 : 1) * (1.25 + r3 * 0.25), 'YXZ');
    else { const lean = state === 2 ? 0.5 : 0.36; m.rotation.set((r2 - 0.5) * lean, r1 * 6.28, (r3 - 0.5) * lean, 'YXZ'); }
    const name = `${P}${tag[kind]}_${pad(++cnt[kind], 3)}`;
    add(g, m, name, true, false);
    if (kind !== 'fallen') tracks.PlantWilt.push(plantWiltTrack(name, m.quaternion.clone(), wr));
  }
}

// ============================================================================
// 9. STAGES 1, 2, 3 (stage1.js, stage2.js, stage3.js)
// ============================================================================
// Tahap 1: subur, air melimpah.
export function buildStage1(M) {
  const { g, add } = buildBase('S1_', M,
    { crackW: 0, crackDepth: 0, mudEdge: 0.0, mudAmt: 0.7, seed: 3, pal: { a: '#6f9a3c', b: '#4f7a2d', pale: '#86ab4a', mud: '#5a4630' } },
    { foliage: { colors: ['#3f7f2a', '#6fa83a'], density: 0.9, size: 0.95 }, mtn: ['#68735a', '#9a9880'] });
  g.name = 'Stage1_SuburAirMelimpah';
  const tracks = { SunPulse: [], WaterRipple: [], PlantWilt: [] };

  const wy = lakeFloorY(0.08);                       // permukaan air penuh
  const water = add(g, new THREE.Mesh(waterGeometry(19, 13, 30, 20, 7), M.water), 'S1_LakeWater', false, false);
  water.position.set(LAKE.x, wy, LAKE.z);
  tracks.WaterRipple.push(rippleTrack('S1_LakeWater'));

  const sun = makeSun('S1_', M, add); sun.scale.setScalar(0.6); g.add(sun);
  tracks.SunPulse.push(...sunPulseTracks('S1_Sun', 0.6));

  buildField('S1_', M, g, add, 0, tracks);
  return { group: g, tracks };
}

// Tahap 2: suhu meningkat, air menyusut, tanaman mulai layu.
export function buildStage2(M) {
  const { g, add } = buildBase('S2_', M,
    { cell: 3.0, crackW: 0.13, crackDepth: 0.12, mudEdge: 0.0, seed: 4, pal: { a: '#b9a35f', b: '#8f7a45', pale: '#cdb878' } },
    { foliage: { colors: ['#b8a63e', '#8f7a35'], density: 0.45, size: 0.8 } });
  g.name = 'Stage2_SuhuNaikAirMenyusut';
  const tracks = { SunPulse: [], HeatArrows: [], WaterShrink: [], WaterArrow: [], WaterRipple: [], PlantWilt: [] };

  add(g, new THREE.Mesh(ringsGeometry([0.1, 0.22, 0.34]), M.vc), 'S2_WaterlineRings', false, true);

  const wy = lakeFloorY(0.5);
  const water = add(g, new THREE.Mesh(waterGeometry(19, 13, 30, 20, 7), M.water), 'S2_LakeWater', false, false);
  water.position.set(LAKE.x, wy, LAKE.z);
  tracks.WaterShrink.push(...waterShrinkTracks('S2_LakeWater', LAKE.x, wy, LAKE.z));
  tracks.WaterRipple.push(rippleTrack('S2_LakeWater'));

  const sun = makeSun('S2_', M, add); g.add(sun);
  tracks.SunPulse.push(...sunPulseTracks('S2_Sun', 1));
  addThermometer('S2_', M, g, add);
  addHeatArrows('S2_', M, g, add, tracks.HeatArrows);

  const dashes = (y) => { const a = []; for (let i = 0; i < 9; i++) { const b = flat(new THREE.BoxGeometry(0.5, 0.06, 0.06)); b.translate(2.75 + i * 0.85, y, LAKE.z); a.push(b); } return merge(a); };
  add(g, new THREE.Mesh(dashes(lakeFloorY(0.08) + 0.1), M.dash), 'S2_WaterLevelOld', false, false);
  add(g, new THREE.Mesh(dashes(wy + 0.08), M.dash), 'S2_WaterLevelNew', false, false);

  const shaft = flat(new THREE.CylinderGeometry(0.17, 0.17, 1.2, 6)); shaft.translate(0, 1.4, 0);
  const cone = flat(new THREE.ConeGeometry(0.45, 0.8, 6)); cone.rotateX(Math.PI); cone.translate(0, 0.4, 0);
  const arrowGeo = merge([shaft, cone]);
  [[4.5, 3.5], [8, 2.5]].forEach(([x, z], i) => {
    const name = `S2_WaterArrow_${pad(i + 1)}`, m = new THREE.Mesh(arrowGeo, M.waterArrow);
    m.position.set(x, -0.1, z); add(g, m, name, false, false);
    tracks.WaterArrow.push(...waterArrowTracks(name, x, -0.1, z, i));
  });

  buildField('S2_', M, g, add, 1, tracks);
  return { group: g, tracks };
}

// Tahap 3: air hilang, tanaman kering tanpa daun.
export function buildStage3(M) {
  const { g, add } = buildBase('S3_', M, { cell: 3.4, crackW: 0.36, crackDepth: 0.3, mudEdge: -0.3, seed: 5 });
  g.name = 'Stage3_KeringTanpaDaun';
  const tracks = { SunPulse: [], PlantWilt: [] };

  add(g, new THREE.Mesh(ringsGeometry([0.1, 0.22, 0.34, 0.5, 0.66]), M.vc), 'S3_WaterlineRings', false, true);
  const sun = makeSun('S3_', M, add); g.add(sun);
  tracks.SunPulse.push(...sunPulseTracks('S3_Sun', 1));
  addThermometer('S3_', M, g, add);

  buildField('S3_', M, g, add, 2, tracks);
  return { group: g, tracks };
}

// ============================================================================
// 10. GLTF EXPORTER (exporter.js)
// ============================================================================
export function exportGLB(root, clips) {
  return new Promise((res, rej) =>
    new GLTFExporter().parse(root, res, rej, { binary: true, animations: clips, onlyVisible: false }));
}

// Hanya sisakan track yang node-nya ada di root (untuk ekspor per tahap).
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
// 11. MAIN VIEWER & APPLICATION LOGIC (main.js)
// ============================================================================
const LABEL = ['1 · Subur & air melimpah', '2 · Suhu naik, air menyusut, tanaman layu', '3 · Air hilang, tanaman kering'];
const SKY = [0x8ec9ee, 0xf0a05a, 0xc8a276];          // biru cerah, jingga panas, cokelat hangat
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

  // Cahaya HANYA untuk viewer (tidak ikut GLB)
  scene.add(new THREE.HemisphereLight(0xfff2dc, 0x8a6a43, 0.9));
  const sunL = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048);
  Object.assign(sunL.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
  scene.add(sunL, sunL.target);

  const mats = createMaterials();
  const diorama = new THREE.Group(); diorama.name = 'Kekeringan'; scene.add(diorama);
  const errors = [];
  const stages = BUILDERS.map((b, i) => {
    try { return b ? b(mats) : null; }
    catch (e) { console.error(`Stage${i + 1} gagal dibuat:`, e); errors.push(`Stage${i + 1}: ${e.message}`); return null; }
  });
  stages.forEach((s) => s && diorama.add(s.group));

  // Label 3D di bawah tiap lempengan (nama tahap + jumlah segitiga)
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
    const c = showAll ? 0 : 0;
    sunL.position.set(c - 14, 26, 18); sunL.target.position.set(c, 0, 0);
    const far = showAll ? 3.2 : 1;
    camera.position.set(c + 8 * far, 17 * far, 42 * far); controls.target.set(c, 4, 0); controls.update();
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
      else { const n = countTris(s.group); total += n; labelEls[i].innerHTML = `${LABEL[i]}<small>${n.toLocaleString('id-ID')} segitiga</small>`; li.textContent = `Stage${i + 1}: ${n.toLocaleString('id-ID')} segitiga (maks ${LIMIT.toLocaleString('id-ID')})`; if (n > LIMIT) li.className = 'warn'; }
      $('stats').appendChild(li);
    });
    const t = document.createElement('li'); t.textContent = `Total: ${total.toLocaleString('id-ID')} segitiga (batas 110.000)`; if (total > 110000) t.className = 'warn'; $('stats').appendChild(t);
  }

  LABEL.forEach((l, i) => {
    const b = document.createElement('button'); b.textContent = l; b.disabled = !stages[i]; b.onclick = () => select(i); $('tabs').appendChild(b);
  });
  addEventListener('keydown', (e) => { if (e.key >= '1' && e.key <= '3') select(+e.key - 1); });
  $('all').onchange = (e) => { showAll = e.target.checked; applyLayout(); frame(); };

  $('exportAll').onclick = async () => {
    try {
      msg('Mengekspor…'); applyLayout(true);                  // tata berjajar agar tidak bertumpuk
      const buf = await exportGLB(diorama, clipsFor(diorama, clips));
      applyLayout(); downloadBuffer(buf, 'kekeringan.glb'); msg(`kekeringan.glb (${(buf.byteLength / 1024).toFixed(0)} KB)`);
    } catch (err) { applyLayout(); console.error(err); msg('Ekspor gagal: ' + err.message); }
  };
  $('exportEach').onclick = async () => {
    try {
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i]; if (!s) continue;
        s.group.position.set(0, 0, 0);
        const buf = await exportGLB(s.group, clipsFor(s.group, clips));
        downloadBuffer(buf, `kekeringan_stage${i + 1}.glb`);
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
