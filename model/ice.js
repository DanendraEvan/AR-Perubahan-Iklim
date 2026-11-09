/* ====================================================================
 *  ice.js  -  Diorama Perubahan Iklim (4 tahap): model A-Frame + MindAR sekaligus viewer/ekspor GLB
 *
 *  Mode AR   : muat setelah A-Frame, <script src="./model/ice.js"></script>
 *  Mode viewer: halaman TANPA A-Frame berisi #app, #stageButtons, #stats, #showAll,
 *              #status, #btnExportAll, #btnExportEach + importmap 'three' -> <script src="./ice.js"></script>
 *  File ini:
 *    1) memakai THREE milik A-Frame (AFRAME.THREE), tanpa import/module
 *    2) mendaftarkan komponen A-Frame 'model-iklim'
 *    3) mengisi window.MODEL_CONFIG agar dipanggil oleh HTML (C.komponen)
 * ==================================================================== */
(function () {
  'use strict';

  function buatModel(THREE) {

  
      /* ------------------------------------------------------------------ *
       *  lib_2.js / lib.js
       * ------------------------------------------------------------------ */
  
      const SLAB = { x0: -20, x1: 20, z0: -12, z1: 12, baseY: -3.4 };
  
      const CLIP_DURATION = {
        SunPulse: 4,
        HeatArrows: 3,
        IceMelt: 10,
        Waterfall: 2,
        SplashRing: 2,
        IceBergFloat: 6,
        SeaRise: 12,
        WaveMotion: 6,
      };
  
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      const lerp = (a, b, t) => a + (b - a) * t;
      function smoothstep(a, b, x) {
        const t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
      }
  
      function mulberry32(seed) {
        let a = seed | 0;
        return function () {
          a = (a + 0x6d2b79f5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
  
      function hash2(ix, iy, seed) {
        let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967295;
      }
  
      function makeNoise(seed = 1) {
        return (x, y) => {
          const x0 = Math.floor(x), y0 = Math.floor(y);
          const fx = x - x0, fy = y - y0;
          const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
          const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
          const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
          return lerp(lerp(a, b, u), lerp(c, d, u), v);
        };
      }
      const noise = makeNoise(1337);
  
      const col = (hex) => new THREE.Color(hex);
      const mix = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));
      const tint = (c, k) => c.clone().multiplyScalar(k);
  
      const ICE_LOW = col('#6fb6e0');
      const ICE_MID = col('#a9dcf5');
      const ICE_HIGH = col('#e4f5ff');
      const ICE_SNOW = col('#f6fcff');
      const ICE_CREVICE = col('#5a9fd0');
      const ICE_WET = col('#5f9cc4');
  
      function iceColor(vy, topY, r, ny, wet = 0) {
        const t = clamp((vy + 1.4) / (topY + 1.4), 0, 1);
        let c = t < 0.45 ? mix(ICE_LOW, ICE_MID, t / 0.45) : mix(ICE_MID, ICE_HIGH, (t - 0.45) / 0.55);
        if (ny > 0.7) c = mix(c, ICE_SNOW, 0.6);
        if (Math.abs(ny) < 0.35 && r < 0.22) c = mix(c, ICE_CREVICE, 0.5);
        if (wet > 0) c = mix(c, ICE_WET, wet);
        c.multiplyScalar(0.93 + r * 0.1);
        c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
        return c;
      }
  
      function createMaterials() {
        const base = { vertexColors: true, flatShading: true, metalness: 0 };
        return {
          ice: new THREE.MeshStandardMaterial({
            ...base, name: 'Ice', color: 0xffffff, roughness: 0.25,
            transparent: true, opacity: 0.92,
          }),
          water: new THREE.MeshStandardMaterial({
            ...base, name: 'Water', color: 0xffffff, roughness: 0.1,
            transparent: true, opacity: 0.8,
          }),
          rock: new THREE.MeshStandardMaterial({ ...base, name: 'Rock', color: 0xffffff, roughness: 0.92 }),
          terrain: new THREE.MeshStandardMaterial({ ...base, name: 'Terrain', color: 0xffffff, roughness: 0.95 }),
        };
      }
  
      function toFlat(geo) {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.deleteAttribute('uv');
        g.deleteAttribute('normal');
        g.computeVertexNormals();
        return g;
      }
  
      function paintGeometry(geo, rng, fn) {
        const pos = geo.attributes.position;
        if (!geo.attributes.normal) geo.computeVertexNormals();
        const nor = geo.attributes.normal;
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i += 3) {
          const r = rng();
          const ny = nor.getY(i);
          for (let k = 0; k < 3; k++) {
            const c = fn(pos.getY(i + k), ny, r, pos.getX(i + k), pos.getZ(i + k));
            colors[(i + k) * 3] = c.r;
            colors[(i + k) * 3 + 1] = c.g;
            colors[(i + k) * 3 + 2] = c.b;
          }
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
  
      class TriBuilder {
        constructor() { this.p = []; this.c = []; }
        tri(a, b, c, ca, cb, cc, expect) {
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
          const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          if (nx * nx + ny * ny + nz * nz < 1e-10) return;
          if (expect && nx * expect[0] + ny * expect[1] + nz * expect[2] < 0) {
            [b, c] = [c, b];
            [cb, cc] = [cc, cb];
          }
          for (const [v, k] of [[a, ca], [b, cb], [c, cc]]) {
            this.p.push(v[0], v[1], v[2]);
            this.c.push(k.r, k.g, k.b);
          }
        }
        geometry() {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
          g.computeVertexNormals();
          return g;
        }
      }
  
      function shoreZ(x) {
        return -3.2 + 1.2 * Math.sin(x * 0.22 + 0.6) + 0.6 * Math.sin(x * 0.5);
      }
  
      function terrainHeight(x, z) {
        const d = z - shoreZ(x);
        const land = 0.9 + 0.35 * noise(x * 0.35 + 10, z * 0.35) + Math.max(0, -z - 8) * 0.12;
        const sea = -2.5 + 0.3 * noise(x * 0.4, z * 0.4 + 20);
        return lerp(land, sea, smoothstep(0, 3.5, d));
      }
  
      const STRATA = [
        { lo: SLAB.baseY, hi: -2.6, c: col('#3a2e25') },
        { lo: -2.6, hi: -1.8, c: col('#54402f') },
        { lo: -1.8, hi: -0.9, c: col('#74593d') },
        { lo: -0.9, hi: 0.1, c: col('#9a7f58') },
        { lo: 0.1, hi: 99, c: col('#6b675d') },
      ];
  
      function buildTerrainGeometries(seed = 21, opts = {}) {
        const rng = mulberry32(seed);
        const { x0, x1, z0, z1, baseY } = SLAB;
        const WL = opts.waterLevel ?? 0;
        const nx = 64, nz = 40;
        const X = (i) => x0 + ((x1 - x0) * i) / nx;
        const Z = (j) => z0 + ((z1 - z0) * j) / nz;
  
        const landA = col(opts.landA ?? '#6f6b61');
        const landB = col(opts.landB ?? '#8d887a');
        const sand = col('#cdbb8c');
        const deep = col('#4a7c93');
  
        const H = [];
        for (let j = 0; j <= nz; j++) {
          H[j] = [];
          for (let i = 0; i <= nx; i++) H[j][i] = terrainHeight(X(i), Z(j));
        }
  
        const topColor = (h, r) => {
          const land = mix(landA, landB, r);
          let c;
          if (h > 0.35) c = land;
          else if (h > -0.15) c = mix(sand, land, smoothstep(-0.05, 0.35, h));
          else c = mix(sand, deep, smoothstep(-0.15, -2.6, h));
          return tint(c, 0.95 + rng() * 0.1);
        };
  
        const tb = new TriBuilder();
        const UP = [0, 1, 0];
        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            const p00 = [X(i), H[j][i], Z(j)], p10 = [X(i + 1), H[j][i + 1], Z(j)];
            const p01 = [X(i), H[j + 1][i], Z(j + 1)], p11 = [X(i + 1), H[j + 1][i + 1], Z(j + 1)];
            const tris = (i + j) % 2
              ? [[p00, p10, p11], [p00, p11, p01]]
              : [[p00, p10, p01], [p10, p11, p01]];
            for (const [a, b, c] of tris) {
              const k = topColor((a[1] + b[1] + c[1]) / 3, rng());
              tb.tri(a, b, c, k, k, k, UP);
            }
          }
        }
  
        const range = (n) => Array.from({ length: n + 1 }, (_, i) => i);
        const edges = [
          { pts: range(nx).map((i) => [X(i), Z(nz)]), out: [0, 0, 1] },
          { pts: range(nx).map((i) => [X(nx - i), Z(0)]), out: [0, 0, -1] },
          { pts: range(nz).map((j) => [x1, Z(nz - j)]), out: [1, 0, 0] },
          { pts: range(nz).map((j) => [x0, Z(j)]), out: [-1, 0, 0] },
        ];
  
        const wb = new TriBuilder();
        const waterDeep = col('#1f6fa8'), waterTop = col('#3aa0d0');
  
        for (const { pts, out } of edges) {
          for (let s = 0; s < pts.length - 1; s++) {
            const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
            const ha = terrainHeight(ax, az), hb = terrainHeight(bx, bz);
  
            for (const band of STRATA) {
              const ta = Math.min(band.hi, Math.max(band.lo, ha));
              const tb2 = Math.min(band.hi, Math.max(band.lo, hb));
              if (ta <= band.lo + 1e-6 && tb2 <= band.lo + 1e-6) continue;
              const k = tint(band.c, 0.94 + rng() * 0.1);
              const A = [ax, band.lo, az], B = [bx, band.lo, bz], C = [bx, tb2, bz], D = [ax, ta, az];
              tb.tri(A, B, C, k, k, k, out);
              tb.tri(A, C, D, k, k, k, out);
            }
  
            if (ha < WL - 1e-6 || hb < WL - 1e-6) {
              const la = Math.min(ha, WL), lb = Math.min(hb, WL);
              const A = [ax, la, az], B = [bx, lb, bz], C = [bx, WL, bz], D = [ax, WL, az];
              wb.tri(A, B, C, waterDeep, waterDeep, waterTop, out);
              wb.tri(A, C, D, waterDeep, waterTop, waterTop, out);
            }
          }
        }
  
        const dark = col('#2a211a');
        const bA = [x0, baseY, z0], bB = [x1, baseY, z0], bC = [x1, baseY, z1], bD = [x0, baseY, z1];
        tb.tri(bA, bB, bC, dark, dark, dark, [0, -1, 0]);
        tb.tri(bA, bC, bD, dark, dark, dark, [0, -1, 0]);
  
        return { terrain: tb.geometry(), waterSides: wb.geometry() };
      }
  
      function buildSeaSurface(name, material, seed = 5) {
        const { x0, x1, z0, z1 } = SLAB;
        const g = toFlat(new THREE.PlaneGeometry(x1 - x0, z1 - z0, 64, 40).rotateX(-Math.PI / 2));
        const pos = g.attributes.position;
  
        const fade = (x, z) => smoothstep(0, 1.6, Math.min(x - x0, x1 - x, z1 - z, z - z0));
        const wave = (x, z, th) =>
          fade(x, z) * (
            0.11 * Math.sin(x * 0.8 + th) * Math.cos(z * 0.65 - th) +
            0.06 * Math.sin(x * 1.7 - z * 1.3 + 2 * th) +
            0.12 * (noise(x * 0.9, z * 0.9 + 50) - 0.5)
          );
  
        const morphs = [new Float32Array(pos.count * 3), new Float32Array(pos.count * 3)];
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), z = pos.getZ(i);
          pos.setY(i, wave(x, z, 0));
          morphs.forEach((m, k) => {
            m[i * 3] = x;
            m[i * 3 + 1] = wave(x, z, (2 * Math.PI * (k + 1)) / 3);
            m[i * 3 + 2] = z;
          });
        }
        g.computeVertexNormals();
  
        const rng = mulberry32(seed);
        const deepW = col('#1f6fa8'), shallowW = col('#3aa0d0');
        paintGeometry(g, rng, (vy, ny, r, vx, vz) => {
          const shallow = smoothstep(-2.4, -0.3, terrainHeight(vx, vz));
          return mix(deepW, shallowW, shallow * 0.7 + r * 0.3);
        });
  
        g.morphAttributes.position = morphs.map((a) => new THREE.Float32BufferAttribute(a, 3));
        const mesh = new THREE.Mesh(g, material);
        mesh.name = name;
        mesh.frustumCulled = false;
        return mesh;
      }
  
      const PEAKS = [
        { x: -16, z: -9.5, r: 5.5, h: 6.5 },
        { x: -9.5, z: -10, r: 6.5, h: 9 },
        { x: -2.5, z: -9.8, r: 7, h: 11 },
        { x: 4.5, z: -10.3, r: 5.5, h: 8 },
        { x: 11, z: -10.8, r: 5, h: 6 },
        { x: 17, z: -10.5, r: 4.5, h: 4.5 },
        { x: -5.5, z: -7.8, r: 3.6, h: 5.5 },
        { x: -13, z: -7.5, r: 3.2, h: 4 },
      ];
  
      function buildMountains(prefix, material, opts = {}) {
        const rng = mulberry32(777);
        const snowK = opts.snow ?? 1;
        const group = new THREE.Group();
        group.name = `${prefix}Mountains`;
        const rockDark = col('#3d4148'), rockLight = col('#6b6f75');
        const snowA = col('#f4f9fd'), snowB = col('#dcebf5');
        const { x0, x1, z0 } = SLAB;
  
        PEAKS.forEach((p, idx) => {
          const geo = new THREE.ConeGeometry(p.r, p.h, 7 + (idx % 2), 5, true);
          geo.translate(0, p.h / 2, 0);
          const pos = geo.attributes.position;
          const off = idx * 13.7;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            const k = 1 - y / p.h;
            const jx = (noise(x * 0.8 + off, z * 0.8 + y * 0.5) - 0.5) * p.r * 0.55 * (0.25 + k);
            const jz = (noise(z * 0.8 + off + 9, x * 0.8 - y * 0.5) - 0.5) * p.r * 0.55 * (0.25 + k);
            const jy = y > 0.05 ? (noise(x * 1.1 + off, z * 1.1 - y) - 0.5) * p.h * 0.18 : 0;
            pos.setXYZ(
              i,
              clamp(x + jx + p.x, x0, x1),
              y + jy + 0.2,
              Math.max(z + jz + p.z, z0),
            );
          }
          const g = toFlat(geo);
          const snowLine = p.h * 0.5 + 0.2;
          paintGeometry(g, rng, (vy, ny, r) => {
            const snowAmt = smoothstep(snowLine - 0.7, snowLine + 0.7, vy + ny * 1.3 + (r - 0.5) * 1.1) * snowK;
            const rock = mix(rockDark, rockLight, r * 0.8 + (vy / p.h) * 0.3);
            return mix(rock, mix(snowA, snowB, r), snowAmt);
          });
          const mesh = new THREE.Mesh(g, material);
          mesh.name = `${prefix}Mountain_${String(idx + 1).padStart(2, '0')}`;
          group.add(mesh);
        });
        return group;
      }
  
      function icePrism(rng, cx, cz, baseY, topY, r, opts = {}) {
        const sides = opts.sides ?? 5 + Math.floor(rng() * 3);
        const h = topY - baseY;
        const g = new THREE.CylinderGeometry(r * (opts.taper ?? 0.6 + rng() * 0.25), r, h, sides, 2, false);
        const pos = g.attributes.position;
        const s = rng() * 100;
        const lean = (rng() - 0.5) * 0.6 * r;
  
        for (let i = 0; i < pos.count; i++) {
          const ox = pos.getX(i), oy = pos.getY(i), oz = pos.getZ(i);
          const t = oy / h + 0.5;
          const bulge = Math.sin(Math.PI * t);
          let x = ox + (noise(ox * 2.3 + s, oy * 0.8 + oz * 1.1) - 0.5) * 0.45 * r * bulge + lean * t;
          let z = oz + (noise(oz * 2.3 + s + 7, oy * 0.8 + ox * 1.1) - 0.5) * 0.45 * r * bulge;
          let y = oy;
          if (t > 0.99) y += (noise(ox * 3 + s, oz * 3) - 0.5) * Math.min(h * 0.25, 1.4);
          pos.setXYZ(i, x, y, z);
        }
        g.rotateY(rng() * Math.PI * 2);
        g.translate(cx, (baseY + topY) / 2, cz);
  
        const flat = toFlat(g);
        paintGeometry(flat, rng, (vy, ny, r2) => iceColor(vy, topY, r2, ny, opts.wet ?? 0));
        return flat;
      }
  
      function makeBergGeometry(rng, sx, sy, sz, wet = 0) {
        const g = new THREE.IcosahedronGeometry(1, 1);
        const pos = g.attributes.position;
        const s = rng() * 50;
        for (let i = 0; i < pos.count; i++) {
          const ox = pos.getX(i), oy = pos.getY(i), oz = pos.getZ(i);
          const nx = noise(ox * 2 + s, oz * 2), nz = noise(oz * 2 + s, ox * 2 + 3);
          const x = ox * sx * (0.85 + 0.3 * nx);
          const z = oz * sz * (0.85 + 0.3 * nz);
          const y = Math.min(oy * sy, 0.5 * sy);
          pos.setXYZ(i, x, y, z);
        }
        const flat = toFlat(g);
        paintGeometry(flat, rng, (vy, ny, r) => iceColor(vy + 0.08, 0.6, r, ny, wet));
        return flat;
      }
  
      /* ------------------------------------------------------------------ *
       *  props.js
       * ------------------------------------------------------------------ */
  
      const pad = (n, w = 2) => String(n).padStart(w, '0');
  
      function loopTrack(Track, name, T, N, fn) {
        const times = [], values = [];
        for (let k = 0; k <= N; k++) {
          times.push((T * k) / N);
          values.push(...fn((k % N) / N));
        }
        return new Track(name, times, values);
      }
      const wrap = (u) => u - Math.floor(u);
  
      function stdMat(name, color, extra = {}) {
        return new THREE.MeshStandardMaterial({ name, color, roughness: 0.7, metalness: 0, flatShading: true, ...extra });
      }
  
      function createPropMaterials() {
        return {
          sun: stdMat('Sun', '#ffd84a', { emissive: '#ffb000', emissiveIntensity: 1.2, roughness: 0.6 }),
          red: stdMat('RedHot', '#d92b1f', { roughness: 0.5, emissive: '#7a0d05', emissiveIntensity: 0.5 }),
          thermoGlass: stdMat('ThermoGlass', '#f4f8ff', { roughness: 0.1, transparent: true, opacity: 0.55 }),
          tick: stdMat('ThermoTick', '#33404d'),
          blue: stdMat('BlueArrow', '#2b8cff', { roughness: 0.4, emissive: '#0b4fb0', emissiveIntensity: 0.5 }),
          meltwater: stdMat('Meltwater', '#4fb4ea', { roughness: 0.1, transparent: true, opacity: 0.75 }),
          waterfall: stdMat('Waterfall', '#6cc0ee', { roughness: 0.1, transparent: true, opacity: 0.75 }),
          splash: stdMat('Splash', '#e8f6ff', { roughness: 0.2, transparent: true, opacity: 0.85 }),
          crack: stdMat('IceCrack', '#2a6a9c', { roughness: 0.6 }),
          concreteA: stdMat('ConcreteA', '#cfcfca', { roughness: 0.9 }),
          concreteB: stdMat('ConcreteB', '#b5b5b0', { roughness: 0.9 }),
          glassA: stdMat('GlassA', '#7fb3d1', { roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.9 }),
          glassB: stdMat('GlassB', '#5f93b5', { roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.9 }),
          wall: stdMat('HouseWall', '#e9dcc4', { roughness: 0.9 }),
          roof: stdMat('HouseRoof', '#c4552f', { roughness: 0.85 }),
          trunk: stdMat('PalmTrunk', '#7a5a38', { roughness: 0.95 }),
          frond: stdMat('PalmFrond', '#2f8a3c', { roughness: 0.85 }),
          dash: stdMat('LevelDash', '#ffffff', { roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.25 }),
        };
      }
  
      function boxMesh(name, mat, w, h, d, x = 0, y = 0, z = 0) {
        const m = new THREE.Mesh(toFlat(new THREE.BoxGeometry(w, h, d)), mat);
        m.name = name;
        m.position.set(x, y, z);
        return m;
      }
  
      function baseDiorama(P, mats, { terrain = {}, snow = 1, waterLevel = 0, sideRise = 0 } = {}) {
        const { terrain: tg, waterSides } = buildTerrainGeometries(21, { ...terrain, waterLevel });
  
        if (sideRise > 0) {
          const pos = waterSides.attributes.position;
          const arr = new Float32Array(pos.array);
          for (let i = 0; i < pos.count; i++) if (pos.getY(i) >= waterLevel - 1e-5) arr[i * 3 + 1] += sideRise;
          waterSides.morphAttributes.position = [new THREE.Float32BufferAttribute(arr, 3)];
        }
  
        const terrainMesh = new THREE.Mesh(tg, mats.terrain);
        terrainMesh.name = `${P}Terrain`;
        const sidesMesh = new THREE.Mesh(waterSides, mats.water);
        sidesMesh.name = `${P}SeaCutawaySides`;
        sidesMesh.frustumCulled = false;
        const sea = buildSeaSurface(`${P}SeaSurface`, mats.water);
        const mountains = buildMountains(P, mats.rock, { snow });
        const wave = new THREE.NumberKeyframeTrack(
          `${P}SeaSurface.morphTargetInfluences`,
          [0, 2, 4, 6].map((t) => (t / 6) * CLIP_DURATION.WaveMotion),
          [0, 0, 1, 0, 0, 1, 0, 0],
        );
        return { terrainMesh, sidesMesh, sea, mountains, wave };
      }
  
      const ROWS = [
        { zOff: 1.0, h: 5.2, hv: 1.5, r: [0.85, 1.15], step: 1.05 },
        { zOff: -0.3, h: 5.6, hv: 1.7, r: [0.9, 1.2], step: 1.15 },
        { zOff: -1.7, h: 5.4, hv: 1.6, r: [0.95, 1.3], step: 1.25 },
        { zOff: -3.3, h: 5.0, hv: 1.8, r: [1.0, 1.4], step: 1.4 },
        { zOff: -5.0, h: 4.6, hv: 1.6, r: [1.1, 1.5], step: 1.6 },
      ];
  
      function makeIceCliff(P, mats, rng, { hScale = 1, wet = 0, modify = null, spires = 16 } = {}) {
        const cliff = new THREE.Group();
        cliff.name = `${P}IceCliff`;
        let n = 0;
        ROWS.forEach((row, ri) => {
          let x = -19.4 + rng() * 0.4;
          while (x < 19.4) {
            const z = shoreZ(x) + row.zOff + (rng() - 0.5) * 0.4;
            if (z > -11.4) {
              const env = 0.5 * Math.sin(x * 0.17 + ri) + 0.3 * Math.sin(x * 0.41);
              const base = row.h + env * 0.6 + (noise(x * 0.45 + ri * 7, ri * 3.1) - 0.5) * 2 * row.hv;
              const m = modify ? modify(x, ri) : null;
              const topY = Math.max(0.5, base * hScale * (m?.k ?? 1));
              const r = lerp(row.r[0], row.r[1], rng());
              const geo = icePrism(rng, x, z, -1.4, topY, r, { wet });
              if (!m?.skip) {
                const mesh = new THREE.Mesh(geo, mats.ice);
                mesh.name = `${P}IceCliff_${pad(++n, 3)}`;
                cliff.add(mesh);
              } else geo.dispose();
            }
            x += row.step * (0.85 + rng() * 0.3);
          }
        });
        for (let i = 1; i <= spires; i++) {
          const x = -18 + rng() * 36;
          const z = shoreZ(x) + 0.2 + rng() * 0.8;
          const top = (7.2 + rng() * 2.0) * hScale;
          const mesh = new THREE.Mesh(
            icePrism(rng, x, z, -1.4, top, 0.4 + rng() * 0.2, { taper: 0.15, sides: 5, wet }),
            mats.ice,
          );
          mesh.name = `${P}IceSpire_${pad(i)}`;
          cliff.add(mesh);
        }
        return cliff;
      }
  
      function makeBergs(P, mats, rng, spots, wet = 0) {
        const group = new THREE.Group();
        group.name = `${P}IceBergs`;
        const tracks = [];
        const T = CLIP_DURATION.IceBergFloat, N = 6;
        const q = new THREE.Quaternion();
  
        spots.forEach((s, i) => {
          const geo = makeBergGeometry(
            rng,
            s.sx ?? (1.4 + rng() * 1.2),
            s.sy ?? (0.7 + rng() * 0.3),
            s.sz ?? (1.1 + rng() * 0.9),
            wet,
          );
          const mesh = new THREE.Mesh(geo, mats.ice);
          mesh.name = `${P}IceBerg_${pad(i + 1)}`;
          group.add(mesh);
  
          const ph = rng() * Math.PI * 2, yaw = rng() * Math.PI * 2;
          const times = [], pv = [], qv = [];
          for (let k = 0; k <= N; k++) {
            const a = (2 * Math.PI * (k % N)) / N + ph;
            times.push((T * k) / N);
            pv.push(s.x, 0.08 + 0.07 * Math.sin(a), s.z);
            q.setFromEuler(new THREE.Euler(0.05 * Math.sin(a + 1), yaw, 0.06 * Math.sin(a + 2), 'YXZ'));
            qv.push(q.x, q.y, q.z, q.w);
          }
          mesh.position.set(pv[0], pv[1], pv[2]);
          mesh.quaternion.set(qv[0], qv[1], qv[2], qv[3]);
          tracks.push(
            new THREE.VectorKeyframeTrack(`${mesh.name}.position`, times, pv),
            new THREE.QuaternionKeyframeTrack(`${mesh.name}.quaternion`, times, qv),
          );
        });
        return { group, tracks };
      }
  
      function makeArrow(name, mat, { len = 3, r = 0.18, headLen = 1, headR = 0.5 } = {}) {
        const g = new THREE.Group();
        g.name = name;
        const shaft = new THREE.Mesh(toFlat(new THREE.CylinderGeometry(r, r, len, 6, 1)), mat);
        shaft.name = `${name}_Shaft`;
        shaft.position.y = len / 2;
        const head = new THREE.Mesh(toFlat(new THREE.ConeGeometry(headR, headLen, 6, 1)), mat);
        head.name = `${name}_Head`;
        head.position.y = len + headLen / 2;
        g.add(shaft, head);
        return g;
      }
  
      function makeCurvedArrow(name, mat, pts, { r = 0.2, headLen = 1.1, headR = 0.55 } = {}) {
        const g = new THREE.Group();
        g.name = name;
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
        const shaft = new THREE.Mesh(toFlat(new THREE.TubeGeometry(curve, 16, r, 5, false)), mat);
        shaft.name = `${name}_Shaft`;
        const tan = curve.getTangent(1).normalize();
        const head = new THREE.Mesh(toFlat(new THREE.ConeGeometry(headR, headLen, 6, 1)), mat);
        head.name = `${name}_Head`;
        head.position.copy(curve.getPoint(1)).addScaledVector(tan, headLen * 0.35);
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        g.add(shaft, head);
        return g;
      }
  
      /* ------------------------------------------------------------------ *
       *  stage1.js
       * ------------------------------------------------------------------ */
  
      function buildStage1() {
        const P = 'S1_';
        const mats = createMaterials();
        const rng = mulberry32(101);
        const root = new THREE.Group();
        root.name = 'Stage1_EsGletserBesar';
        const tracks = { IceBergFloat: [], WaveMotion: [] };
  
        const { terrain, waterSides } = buildTerrainGeometries();
        const terrainMesh = new THREE.Mesh(terrain, mats.terrain);
        terrainMesh.name = `${P}Terrain`;
        const sidesMesh = new THREE.Mesh(waterSides, mats.water);
        sidesMesh.name = `${P}SeaCutawaySides`;
        const sea = buildSeaSurface(`${P}SeaSurface`, mats.water);
        root.add(terrainMesh, sidesMesh, sea);
        root.add(buildMountains(P, mats.rock));
  
        tracks.WaveMotion.push(
          new THREE.NumberKeyframeTrack(
            `${P}SeaSurface.morphTargetInfluences`,
            [0, 2, 4, 6].map((t) => (t / 6) * CLIP_DURATION.WaveMotion),
            [0, 0, 1, 0, 0, 1, 0, 0],
          ),
        );
  
        const cliff = new THREE.Group();
        cliff.name = `${P}IceCliff`;
        const rows = [
          { zOff: 1.0, h: 5.2, hv: 1.5, r: [0.85, 1.15], step: 1.05 },
          { zOff: -0.3, h: 5.6, hv: 1.7, r: [0.9, 1.2], step: 1.15 },
          { zOff: -1.7, h: 5.4, hv: 1.6, r: [0.95, 1.3], step: 1.25 },
          { zOff: -3.3, h: 5.0, hv: 1.8, r: [1.0, 1.4], step: 1.4 },
          { zOff: -5.0, h: 4.6, hv: 1.6, r: [1.1, 1.5], step: 1.6 },
        ];
        let n = 0;
        rows.forEach((row, ri) => {
          let x = -19.4 + rng() * 0.4;
          while (x < 19.4) {
            const z = shoreZ(x) + row.zOff + (rng() - 0.5) * 0.4;
            if (z > -11.4) {
              const env = 0.5 * Math.sin(x * 0.17 + ri) + 0.3 * Math.sin(x * 0.41);
              const topY = row.h + env * 0.6 + (noise(x * 0.45 + ri * 7, ri * 3.1) - 0.5) * 2 * row.hv;
              const r = lerp(row.r[0], row.r[1], rng());
              const mesh = new THREE.Mesh(icePrism(rng, x, z, -1.4, topY, r), mats.ice);
              mesh.name = `${P}IceCliff_${pad(++n, 3)}`;
              cliff.add(mesh);
            }
            x += row.step * (0.85 + rng() * 0.3);
          }
        });
  
        for (let i = 1; i <= 16; i++) {
          const x = -18 + rng() * 36;
          const z = shoreZ(x) + 0.2 + rng() * 0.8;
          const mesh = new THREE.Mesh(
            icePrism(rng, x, z, -1.4, 7.2 + rng() * 2.0, 0.4 + rng() * 0.2, { taper: 0.15, sides: 5 }),
            mats.ice,
          );
          mesh.name = `${P}IceSpire_${pad(i)}`;
          cliff.add(mesh);
        }
        root.add(cliff);
  
        const debris = new THREE.Group();
        debris.name = `${P}IceDebris`;
        for (let i = 1; i <= 14; i++) {
          const x = -18 + rng() * 36;
          const z = shoreZ(x) + 1.9 + rng() * 1.4;
          const s = 0.25 + rng() * 0.35;
          const mesh = new THREE.Mesh(makeBergGeometry(rng, s * 1.4, s, s * 1.1), mats.ice);
          mesh.name = `${P}IceDebris_${pad(i)}`;
          mesh.position.set(x, 0.02, z);
          mesh.rotation.y = rng() * Math.PI * 2;
          debris.add(mesh);
        }
        root.add(debris);
  
        const bergs = new THREE.Group();
        bergs.name = `${P}IceBergs`;
        const spots = [[-12, 6.5], [-5, 8.5], [2, 5.5], [9, 8], [15, 5.5], [-16, 4.2]];
        const T = CLIP_DURATION.IceBergFloat, N = 6;
        const q = new THREE.Quaternion();
  
        spots.forEach(([bx, bz], i) => {
          const geo = makeBergGeometry(rng, 1.4 + rng() * 1.2, 0.7 + rng() * 0.3, 1.1 + rng() * 0.9);
          const mesh = new THREE.Mesh(geo, mats.ice);
          mesh.name = `${P}IceBerg_${pad(i + 1)}`;
          bergs.add(mesh);
  
          const ph = rng() * Math.PI * 2, yaw = rng() * Math.PI * 2;
          const times = [], pv = [], qv = [];
          for (let k = 0; k <= N; k++) {
            const a = (2 * Math.PI * (k % N)) / N + ph;
            times.push((T * k) / N);
            pv.push(bx, 0.08 + 0.07 * Math.sin(a), bz);
            q.setFromEuler(new THREE.Euler(0.05 * Math.sin(a + 1), yaw, 0.06 * Math.sin(a + 2), 'YXZ'));
            qv.push(q.x, q.y, q.z, q.w);
          }
          mesh.position.set(pv[0], pv[1], pv[2]);
          mesh.quaternion.set(qv[0], qv[1], qv[2], qv[3]);
          tracks.IceBergFloat.push(
            new THREE.VectorKeyframeTrack(`${mesh.name}.position`, times, pv),
            new THREE.QuaternionKeyframeTrack(`${mesh.name}.quaternion`, times, qv),
          );
        });
        root.add(bergs);
  
        return { group: root, tracks };
      }
  
      /* ------------------------------------------------------------------ *
       *  stage2.js
       * ------------------------------------------------------------------ */
  
      function buildStage2() {
        const P = 'S2_';
        const mats = createMaterials();
        const pm = createPropMaterials();
        mats.ice.roughness = 0.12;
        mats.ice.opacity = 0.9;
  
        const root = new THREE.Group();
        root.name = 'Stage2_SuhuMeningkat';
        const tracks = { SunPulse: [], HeatArrows: [], IceMelt: [], IceBergFloat: [], WaveMotion: [] };
  
        const b = baseDiorama(P, mats, { snow: 0.75 });
        root.add(b.terrainMesh, b.sidesMesh, b.sea, b.mountains);
        tracks.WaveMotion.push(b.wave);
  
        const rng = mulberry32(101);
        const cliff = makeIceCliff(P, mats, rng, { hScale: 0.72, wet: 0.45, spires: 10 });
        root.add(cliff);
        tracks.IceMelt.push(
          loopTrack(THREE.VectorKeyframeTrack, `${P}IceCliff.scale`, CLIP_DURATION.IceMelt, 20, (u) => {
            const y = u < 0.9 ? 1 - 0.12 * (u / 0.9) : 0.88 + 0.12 * ((u - 0.9) / 0.1);
            return [1, y, 1];
          }),
        );
  
        const streams = new THREE.Group();
        streams.name = `${P}MeltStreams`;
        for (let i = 1; i <= 8; i++) {
          const x = -17 + rng() * 34;
          streams.add(boxMesh(`${P}MeltStream_${pad(i)}`, pm.meltwater, 0.12, 2.2, 0.1, x, 1.5, shoreZ(x) + 2.05));
        }
        root.add(streams);
  
        const bergs = makeBergs(P, mats, rng, [
          { x: -12, z: 6.5 }, { x: -5, z: 8.5 }, { x: 2, z: 5.5 },
          { x: 9, z: 8 }, { x: 15, z: 5.5 }, { x: -16, z: 4.2 },
        ], 0.4);
        root.add(bergs.group);
        tracks.IceBergFloat.push(...bergs.tracks);
  
        const sun = new THREE.Group();
        sun.name = `${P}Sun`;
        sun.position.set(9, 13, -9);
        const core = new THREE.Mesh(toFlat(new THREE.SphereGeometry(2, 12, 8)), pm.sun);
        core.name = `${P}SunCore`;
        sun.add(core);
        for (let k = 0; k < 10; k++) {
          const a = (2 * Math.PI * k) / 10;
          const ray = new THREE.Mesh(toFlat(new THREE.ConeGeometry(0.28, 1.5, 4, 1)), pm.sun);
          ray.name = `${P}SunRay_${pad(k + 1)}`;
          ray.position.set(Math.cos(a) * 3.3, Math.sin(a) * 3.3, 0);
          ray.rotation.z = a - Math.PI / 2;
          sun.add(ray);
        }
        root.add(sun);
        tracks.SunPulse.push(
          loopTrack(THREE.VectorKeyframeTrack, `${P}Sun.scale`, CLIP_DURATION.SunPulse, 8, (u) => {
            const s = 1 + 0.12 * Math.sin(2 * Math.PI * u);
            return [s, s, s];
          }),
        );
  
        const th = new THREE.Group();
        th.name = `${P}Thermometer`;
        th.position.set(17, 3, 3);
        const body = new THREE.Mesh(toFlat(new THREE.CylinderGeometry(0.38, 0.38, 5, 8, 1)), pm.thermoGlass);
        body.name = `${P}Thermometer_Glass`;
        body.position.y = 2.5;
        const bulbGlass = new THREE.Mesh(toFlat(new THREE.SphereGeometry(0.8, 10, 6)), pm.thermoGlass);
        bulbGlass.name = `${P}Thermometer_BulbGlass`;
        const bulb = new THREE.Mesh(toFlat(new THREE.SphereGeometry(0.6, 10, 6)), pm.red);
        bulb.name = `${P}Thermometer_Bulb`;
        const column = new THREE.Mesh(toFlat(new THREE.CylinderGeometry(0.2, 0.2, 3.6, 6, 1)), pm.red);
        column.name = `${P}Thermometer_Column`;
        column.position.y = 1.8;
        th.add(bulbGlass, bulb, body, column);
        for (let i = 0; i < 5; i++) th.add(boxMesh(`${P}Thermometer_Tick_${pad(i + 1)}`, pm.tick, 0.5, 0.05, 0.05, 0.7, 1.2 + i * 0.7, 0));
        root.add(th);
  
        const T = CLIP_DURATION.HeatArrows;
        [-10, -4, 2, 8, 13].forEach((x, i) => {
          const arrow = makeArrow(`${P}HeatArrow_${pad(i + 1)}`, pm.red, { len: 2.2, r: 0.2, headLen: 1.1, headR: 0.55 });
          const ph = (i * 0.37) % 1, y0 = 5.2, z = -4;
          const posFn = (u) => [x, y0 + 2.4 * wrap(u + ph), z];
          const sclFn = (u) => {
            const w = wrap(u + ph);
            const s = Math.max(0.01, Math.min(smoothstep(0, 0.15, w), 1 - smoothstep(0.8, 1, w)));
            return [s, s, s];
          };
          const p0 = posFn(0), s0 = sclFn(0);
          arrow.position.set(...p0);
          arrow.scale.set(...s0);
          tracks.HeatArrows.push(
            loopTrack(THREE.VectorKeyframeTrack, `${arrow.name}.position`, T, 24, posFn),
            loopTrack(THREE.VectorKeyframeTrack, `${arrow.name}.scale`, T, 24, sclFn),
          );
          root.add(arrow);
        });
  
        return { group: root, tracks };
      }
  
      /* ------------------------------------------------------------------ *
       *  stage3.js
       * ------------------------------------------------------------------ */
  
      function buildStage3() {
        const P = 'S3_';
        const mats = createMaterials();
        const pm = createPropMaterials();
        mats.ice.roughness = 1.18;
        mats.ice.opacity = 0.9;
  
        const root = new THREE.Group();
        root.name = 'Stage3_EsMencair';
        const tracks = { IceMelt: [], Waterfall: [], SplashRing: [], IceBergFloat: [], WaveMotion: [] };
  
        const b = baseDiorama(P, mats, { snow: 0.6 });
        root.add(b.terrainMesh, b.sidesMesh, b.sea, b.mountains);
        tracks.WaveMotion.push(b.wave);
  
        const rng = mulberry32(101);
        const cliff = makeIceCliff(P, mats, rng, {
          hScale: 0.88,
          wet: 0.25,
          spires: 8,
          modify: (x, ri) => {
            if (x > -3.2 && x < 4.2) {
              if (ri === 0 && x > -1.5 && x < 2.5) return { skip: true };
              return { k: ri <= 1 ? 0.28 : 0.65 };
            }
            return null;
          },
        });
        root.add(cliff);
        tracks.IceMelt.push(
          loopTrack(THREE.VectorKeyframeTrack, `${P}IceCliff.scale`, CLIP_DURATION.IceMelt, 20, (u) => {
            const y = u < 0.9 ? 1 - 0.1 * (u / 0.9) : 0.9 + 0.1 * ((u - 0.9) / 0.1);
            return [1, y, 1];
          }),
        );
  
        const cracks = new THREE.Group();
        cracks.name = `${P}IceCracks`;
        const crackXs = [-17, -14.5, -11.5, -8.5, -6, 6.5, 9, 12.5, 16];
        crackXs.forEach((x, i) => {
          const c = boxMesh(`${P}IceCrack_${pad(i + 1)}`, pm.crack, 0.07, 1.6 + rng() * 1.2, 0.07,
            x, 2.6 + rng() * 1.5, shoreZ(x) + 2.0);
          c.rotation.z = (rng() - 0.5) * 0.6;
          cracks.add(c);
        });
        root.add(cracks);
  
        const wfX = -3.7, wfZ = shoreZ(wfX) + 2.1, wfTop = 4.2, wfH = 4.2;
        const wf = new THREE.Group();
        wf.name = `${P}WaterfallGroup`;
        [-0.7, -0.35, 0, 0.35, 0.7].forEach((dx, i) => {
          const geo = toFlat(new THREE.BoxGeometry(0.3 + (i % 2) * 0.08, wfH, 0.12));
          geo.translate(0, -wfH / 2, 0);
          const m = new THREE.Mesh(geo, pm.waterfall);
          m.name = `${P}Waterfall_${pad(i + 1)}`;
          m.position.set(wfX + dx, wfTop, wfZ + (i % 2) * 0.05);
          wf.add(m);
          const ph = i * 0.21;
          tracks.Waterfall.push(
            loopTrack(THREE.VectorKeyframeTrack, `${m.name}.scale`, CLIP_DURATION.Waterfall, 8, (u) => {
              const e = 0.5 - 0.5 * Math.cos(2 * Math.PI * wrap(u + ph));
              return [1, 1 - 0.2 * e, 1];
            }),
          );
        });
        root.add(wf);
  
        const splashGeo = toFlat(new THREE.TorusGeometry(1, 0.09, 4, 20).rotateX(Math.PI / 2));
        const splash = new THREE.Group();
        splash.name = `${P}Splash`;
        [0, 0.33, 0.66].forEach((ph, i) => {
          const m = new THREE.Mesh(splashGeo, pm.splash);
          m.name = `${P}SplashRing_${pad(i + 1)}`;
          m.position.set(wfX + [-0.5, 0.2, 0.8][i], 0.12, wfZ + 0.9);
          const fn = (u) => {
            const w = wrap(u + ph);
            const xz = Math.max(0.05, 0.05 + 2.15 * (1 - (1 - w) * (1 - w)));
            const y = w < 0.12 ? lerp(0.05, 1, w / 0.12) : lerp(1, 0.05, (w - 0.12) / 0.88);
            return [xz, y, xz];
          };
          m.scale.set(...fn(0));
          splash.add(m);
          tracks.SplashRing.push(
            loopTrack(THREE.VectorKeyframeTrack, `${m.name}.scale`, CLIP_DURATION.SplashRing, 24, fn),
          );
        });
        root.add(splash);
  
        const bergs = makeBergs(P, mats, rng, [
          { x: -1.5, z: 2.8, sx: 2.6, sy: 1.5, sz: 2.0 },
          { x: 3.8, z: 2.2, sx: 2.2, sy: 1.3, sz: 1.8 },
          { x: -12, z: 6.5 }, { x: 6, z: 8.5 }, { x: 11, z: 5.5 },
          { x: 15, z: 8.5 }, { x: -6, z: 9 },
        ], 0.25);
        root.add(bergs.group);
        tracks.IceBergFloat.push(...bergs.tracks);
  
        root.add(
          makeCurvedArrow(`${P}BlueArrow_01`, pm.blue, [[-2.8, 4.4, -1.2], [-1.6, 4.6, 0.4], [-0.4, 3.0, 1.8], [0.4, 0.9, 2.6]]),
          makeCurvedArrow(`${P}BlueArrow_02`, pm.blue, [[-1.8, 3.6, -1.2], [0.0, 3.9, 0.5], [1.8, 2.6, 2.0], [2.8, 0.9, 3.0]]),
        );
  
        return { group: root, tracks };
      }
  
      /* ------------------------------------------------------------------ *
       *  stage4.js
       * ------------------------------------------------------------------ */
  
      const WL = 1.85;
      const RISE = 0.25;
  
      function makeBuilding(P, idx, pm, x, z, w, d, h) {
        const g = new THREE.Group();
        g.name = `${P}Building_${pad(idx)}`;
        g.position.set(x, terrainHeight(x, z) - 0.15, z);
        const concrete = idx % 2 ? pm.concreteA : pm.concreteB;
        const glass = idx % 3 ? pm.glassA : pm.glassB;
        const towerH = h - 0.73;
        g.add(boxMesh(`${g.name}_Podium`, concrete, w + 0.2, 0.55, d + 0.2, 0, 0.275, 0));
        g.add(boxMesh(`${g.name}_Tower`, glass, w, towerH, d, 0, 0.55 + towerH / 2, 0));
        g.add(boxMesh(`${g.name}_Roof`, concrete, w + 0.12, 0.18, d + 0.12, 0, h - 0.09, 0));
        const floors = Math.max(1, Math.floor((h - 0.9) / 1.0));
        for (let f = 0; f < floors; f++) {
          g.add(boxMesh(`${g.name}_Slab_${pad(f + 1)}`, concrete, w + 0.08, 0.07, d + 0.08,
            0, 0.55 + ((f + 1) * towerH) / (floors + 1), 0));
        }
        if (h > 5) g.add(boxMesh(`${g.name}_Crown`, glass, w * 0.65, 1.1, d * 0.65, 0, h + 0.55, 0));
        return g;
      }
  
      function makeHouse(P, idx, pm, x, z, yaw) {
        const g = new THREE.Group();
        g.name = `${P}House_${pad(idx)}`;
        g.position.set(x, terrainHeight(x, z) - 0.18, z);
        g.rotation.y = yaw;
        g.add(boxMesh(`${g.name}_Walls`, pm.wall, 1.3, 1.0, 1.1, 0, 0.5, 0));
        const roofGeo = toFlat(new THREE.ConeGeometry(1.0, 0.7, 4, 1).rotateY(Math.PI / 4));
        const roof = new THREE.Mesh(roofGeo, pm.roof);
        roof.name = `${g.name}_Roof`;
        roof.position.y = 1.35;
        g.add(roof);
        return g;
      }
  
      function buildStage4() {
        const P = 'S4_';
        const mats = createMaterials();
        const pm = createPropMaterials();
        const rng = mulberry32(404);
  
        const root = new THREE.Group();
        root.name = 'Stage4_AirLautBertambah';
        const tracks = { SeaRise: [], WaveMotion: [] };
  
        const b = baseDiorama(P, mats, {
          snow: 0.15,
          waterLevel: WL,
          sideRise: RISE,
          terrain: { landA: '#5f7d45', landB: '#7f9455' },
        });
        b.sea.position.y = WL;
        root.add(b.terrainMesh, b.sidesMesh, b.sea, b.mountains);
        tracks.WaveMotion.push(b.wave);
  
        const city = new THREE.Group();
        city.name = `${P}City`;
        let bi = 0;
        [{ off: -3.0, hmin: 2.6, hmax: 4.6 }, { off: -5.0, hmin: 4.0, hmax: 7.2 }].forEach((row) => {
          [6.8, 9.4, 12.0, 14.6, 17.2].forEach((bx) => {
            const x = bx + (rng() - 0.5) * 0.5;
            const z = shoreZ(x) + row.off + (rng() - 0.5) * 0.3;
            const h = row.hmin + rng() * (row.hmax - row.hmin);
            city.add(makeBuilding(P, ++bi, pm, x, z, 1.2 + rng() * 0.6, 1.1 + rng() * 0.5, h));
          });
        });
        root.add(city);
  
        const houses = new THREE.Group();
        houses.name = `${P}Houses`;
        [[7, 0.45], [9.8, 0.7], [12.6, 0.5], [15.2, 0.9], [17.6, 0.4], [4.6, 1.0]].forEach(([x, d], i) => {
          houses.add(makeHouse(P, i + 1, pm, x, shoreZ(x) + d, (rng() - 0.5) * 0.5));
        });
        root.add(houses);
  
        const frondGeo = toFlat(new THREE.ConeGeometry(0.32, 1.8, 4, 1).translate(0, 0.9, 0));
        const palms = new THREE.Group();
        palms.name = `${P}Palms`;
        const palmSpots = [
          [5.5, -1.6], [8.3, -1.4], [11, -1.7], [13.8, -1.3], [16.5, -1.6], [18.8, -1.2],
          [6.2, 0.2], [10.5, 0.15], [15, 0.2], [18.5, 0.1], [12.2, -1.0], [3.6, -0.6],
        ];
        palmSpots.forEach(([x, d], i) => {
          const z = shoreZ(x) + d;
          const g = new THREE.Group();
          g.name = `${P}Palm_${pad(i + 1)}`;
          g.position.set(x, terrainHeight(x, z) - 0.05, z);
          g.rotation.y = rng() * Math.PI * 2;
          const h = 2.0 + rng() * 0.8, lean = 0.08 + rng() * 0.12;
          const trunk = new THREE.Mesh(toFlat(new THREE.CylinderGeometry(0.1, 0.17, h, 6, 1).translate(0, h / 2, 0)), pm.trunk);
          trunk.name = `${g.name}_Trunk`;
          trunk.rotation.z = lean;
          g.add(trunk);
          const crown = [-Math.sin(lean) * h, Math.cos(lean) * h, 0];
          for (let k = 0; k < 6; k++) {
            const f = new THREE.Mesh(frondGeo, pm.frond);
            f.name = `${g.name}_Frond_${pad(k + 1)}`;
            f.position.set(...crown);
            f.rotation.order = 'YXZ';
            f.rotation.set(0, (k * Math.PI) / 3 + rng() * 0.4, 1.15 + rng() * 0.3);
            f.scale.set(1, 1, 0.3);
            g.add(f);
          }
          palms.add(g);
        });
        root.add(palms);
  
        const mkDashes = (name, y) => {
          const g = new THREE.Group();
          g.name = name;
          g.position.set(0, y, 9.5);
          for (let i = 0; i < 16; i++) {
            g.add(boxMesh(`${name}_Dash_${pad(i + 1)}`, pm.dash, 0.5, 0.06, 0.06, -18 + i * 0.95, 0, 0));
          }
          return g;
        };
        const oldMarker = mkDashes(`${P}OldLevelMarker`, 0.03);
        const newMarker = mkDashes(`${P}NewLevelMarker`, WL + 0.08);
        newMarker.position.z = 9.5;
        root.add(oldMarker, newMarker);
        root.add(
          boxMesh(`${P}LevelBracket_01`, pm.dash, 0.06, WL + 0.1, 0.06, -18.3, (WL + 0.1) / 2, 9.5),
          boxMesh(`${P}LevelBracket_02`, pm.dash, 0.06, WL + 0.1, 0.06, -3.7, (WL + 0.1) / 2, 9.5),
        );
  
        const arrow = makeArrow(`${P}SeaRiseArrow`, pm.blue, { len: 4.5, r: 0.45, headLen: 2.2, headR: 1.2 });
        arrow.position.set(-11, WL + 0.15, 9.5);
        root.add(arrow);
  
        const T = CLIP_DURATION.SeaRise;
        const ease = (u) => 0.5 * (1 - Math.cos(2 * Math.PI * u));
        tracks.SeaRise.push(
          loopTrack(THREE.VectorKeyframeTrack, `${P}SeaSurface.position`, T, 24, (u) => [0, WL + RISE * ease(u), 0]),
          loopTrack(THREE.NumberKeyframeTrack, `${P}SeaCutawaySides.morphTargetInfluences`, T, 24, (u) => [ease(u)]),
          loopTrack(THREE.VectorKeyframeTrack, `${P}NewLevelMarker.position`, T, 24, (u) => [0, WL + 0.08 + RISE * ease(u), 9.5]),
          loopTrack(THREE.VectorKeyframeTrack, `${P}SeaRiseArrow.position`, T, 24, (u) => [-11, WL + 0.15 + RISE * ease(u), 9.5]),
        );
  
        return { group: root, tracks };
      }
  
  
      /* ------------------------------------------------------------------ *
       *  Daftar tahap
       * ------------------------------------------------------------------ */
      const STAGES = [
        { id: 1, name: 'Stage1_EsGletserBesar', label: 'Es/Gletser besar', file: 'tahap1-es-gletser-besar',
          sky: ['#8fc3ee', '#e3f2fc'], build: buildStage1 },
        { id: 2, name: 'Stage2_SuhuMeningkat', label: 'Suhu meningkat', file: 'tahap2-suhu-meningkat',
          sky: ['#f08a4b', '#ffe0a8'], build: buildStage2 },
        { id: 3, name: 'Stage3_EsMencair', label: 'Es mencair', file: 'tahap3-es-mencair',
          sky: ['#9ec8e6', '#e6f1f8'], build: buildStage3 },
        { id: 4, name: 'Stage4_AirLautBertambah', label: 'Air laut bertambah', file: 'tahap4-air-laut-bertambah',
          sky: ['#6fb4ea', '#cfe9fb'], build: buildStage4 },
      ];
  
      /* ------------------------------------------------------------------ *
       *  Konfigurasi yang dibaca HTML (bisa ditimpa dengan mendefinisikan
       *  window.MODEL_CONFIG sebelum file ini dimuat)
       * ------------------------------------------------------------------ */
      window.MODEL_CONFIG = Object.assign({
        nama: 'Perubahan Iklim',
        komponen: 'model-iklim',
        scale: 1,            // 1 = lebar diorama pas ~90% lebar gambar target
        position: '0 0 0',
        rotation: '0 0 0',
        tahap: 1,            // tahap awal (1-4)
        siklus: 12,          // detik per tahap; 0 = tidak ganti otomatis
        miring: 15,          // derajat condong ke arah kamera agar permukaan terlihat
      }, window.MODEL_CONFIG || {});
  
      /* ------------------------------------------------------------------ *
       *  Komponen A-Frame
       * ------------------------------------------------------------------ */
      if (window.AFRAME) AFRAME.registerComponent('model-iklim', {
        init: function () {
          const C = window.MODEL_CONFIG;
          this.C = C;
          this.waktu = 0;
          this.stages = STAGES.map((d) => Object.assign({}, d));
  
          const root = new THREE.Group();   // diambil pusat-zoom lewat getObject3D('mesh')
          root.name = 'ModelIklim';
          const tilt = new THREE.Group();   // skala + kemiringan
          const holder = new THREE.Group(); // menggeser pusat diorama ke titik asal
          const world = new THREE.Group();
          world.name = 'PerubahanIklim';
  
          const buckets = {};
          for (const def of this.stages) {
            const res = def.build();
            def.group = res.group;
            for (const [clipName, tr] of Object.entries(res.tracks)) {
              (buckets[clipName] = buckets[clipName] || []).push(...tr);
            }
            world.add(def.group);
          }
  
          const clips = Object.entries(buckets).map(
            ([name, tr]) => new THREE.AnimationClip(name, CLIP_DURATION[name] ?? -1, tr),
          );
          this.mixer = new THREE.AnimationMixer(world);
          clips.forEach((c) => this.mixer.clipAction(c).play());
  
          // Normalisasi ukuran & pusat (semua tahap masih terlihat saat diukur)
          const box = new THREE.Box3().setFromObject(world);
          const size = box.getSize(new THREE.Vector3());
          const ctr = box.getCenter(new THREE.Vector3());
          holder.position.copy(ctr).multiplyScalar(-1);
          tilt.scale.setScalar(0.9 / Math.max(size.x, size.z, 0.001));
          tilt.rotation.x = THREE.MathUtils.degToRad(C.miring || 0);
  
          holder.add(world);
          tilt.add(holder);
          root.add(tilt);
          root.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b5a45, 0.9));
  
          this.root = root;
          this.el.setObject3D('mesh', root);
          this.setTahap(C.tahap || 1);
        },
  
        setTahap: function (n) {
          n = clamp(Math.round(n), 1, this.stages.length);
          this.current = n;
          this.waktu = 0;
          for (const d of this.stages) d.group.visible = d.id === n;
          const d = this.stages[n - 1];
          this.el.emit('stagechange', { id: n, label: d.label, nama: d.name });
        },
  
        tahapBerikutnya: function () {
          this.setTahap((this.current % this.stages.length) + 1);
        },
  
        // Terlihat hanya bila seluruh rantai induk terlihat (smooth-follow menyembunyikan saat target hilang)
        _terlihat: function () {
          for (let o = this.el.object3D; o; o = o.parent) if (!o.visible) return false;
          return true;
        },
  
        tick: function (time, dt) {
          if (!this.mixer || !this._terlihat()) return;
          const d = Math.min(dt || 0, 100) / 1000;
          this.mixer.update(d);
          if (this.C.siklus > 0) {
            this.waktu += d;
            if (this.waktu >= this.C.siklus) this.tahapBerikutnya();
          }
        },
  
        remove: function () {
          this.el.removeObject3D('mesh');
          if (!this.root) return;
          this.root.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) [].concat(o.material).forEach((m) => m.dispose());
          });
          this.root = null;
          this.mixer = null;
        },
      });

      return { STAGES, CLIP_DURATION };

  }

  /* ---------------- MODE AR (A-Frame ada) ---------------- */
  if (window.AFRAME) { buatModel(window.AFRAME.THREE); return; }

  /* ---------------- MODE VIEWER (tanpa A-Frame) ---------------- */
  if (!document.getElementById('app')) return;

  (async function jalankanViewer() {
    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');

    const { STAGES: DEF, CLIP_DURATION } = buatModel(Object.assign({}, THREE));
    const STAGES = DEF.map((d) => ({ ...d }));

const GRID = { 1: [-24, 0, -15], 2: [24, 0, -15], 3: [-24, 0, 15], 4: [24, 0, 15] };
const LIMIT_PER_STAGE = 40000, LIMIT_TOTAL = 150000;

/* ------------------------------------------------------------------ *
 *  Scene
 * ------------------------------------------------------------------ */
const scene = new THREE.Scene();
const world = new THREE.Group(); // semua yang diekspor ada di sini (cahaya tidak)
world.name = 'PerubahanIklim';
scene.add(world);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b5a45, 1.1);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-12, 22, 16);
scene.add(hemi, sun);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ *
 *  Bangun tahap + gabungkan track animasi menjadi clip
 * ------------------------------------------------------------------ */
const trackBuckets = {};
for (const def of STAGES) {
  if (def.build) {
    const res = def.build();
    def.group = res.group;
    for (const [clipName, tr] of Object.entries(res.tracks)) {
      (trackBuckets[clipName] ??= []).push(...tr);
    }
  } else {
    def.group = new THREE.Group();
    def.group.name = def.name;
  }
  def.built = !!def.build;
  def.tris = countTris(def.group);
  world.add(def.group);
}
const clips = Object.entries(trackBuckets).map(
  ([name, tr]) => new THREE.AnimationClip(name, CLIP_DURATION[name] ?? -1, tr),
);

const mixer = new THREE.AnimationMixer(world);
clips.forEach((c) => mixer.clipAction(c).play());

function countTris(obj) {
  let t = 0;
  obj.traverse((o) => {
    if (o.isMesh) {
      const g = o.geometry;
      t += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  return Math.round(t);
}

/* ------------------------------------------------------------------ *
 *  UI
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('id-ID');
let current = 1;

const btnWrap = $('stageButtons');
for (const def of STAGES) {
  const b = document.createElement('button');
  b.textContent = `${def.id} · ${def.label}`;
  b.disabled = !def.built;
  b.title = def.built ? '' : 'Belum dikerjakan';
  b.addEventListener('click', () => selectStage(def.id));
  def.button = b;
  btnWrap.appendChild(b);
}

function renderStats() {
  const ul = $('stats');
  ul.innerHTML = '';
  let total = 0;
  for (const def of STAGES) {
    const li = document.createElement('li');
    const over = def.tris > LIMIT_PER_STAGE;
    li.className = !def.built ? 'pending' : over ? 'warn' : '';
    li.innerHTML = `<span>Tahap ${def.id}</span><span>${def.built ? fmt(def.tris) + (over ? ' ⚠' : '') : 'belum dibuat'}</span>`;
    ul.appendChild(li);
    total += def.tris;
  }
  const li = document.createElement('li');
  li.className = total > LIMIT_TOTAL ? 'warn' : '';
  li.innerHTML = `<span><b>Total</b></span><span><b>${fmt(total)}</b> / ${fmt(LIMIT_TOTAL)}</span>`;
  ul.appendChild(li);
}

function frameCamera(all) {
  if (all) {
    camera.position.set(0, 52, 88);
    controls.target.set(0, 0, 0);
  } else {
    camera.position.set(0, 14, 36);
    controls.target.set(0, 2, -2);
  }
  controls.update();
}

function applyLayout() {
  const all = $('showAll').checked;
  for (const def of STAGES) {
    def.group.visible = def.built && (all || def.id === current);
    def.group.position.set(...(all ? GRID[def.id] : [0, 0, 0]));
    def.button.classList.toggle('active', !all && def.id === current);
  }
  const sky = all ? ['#b3d3ee', '#eaf4fb'] : STAGES[current - 1].sky;
  document.body.style.background = `linear-gradient(${sky[0]}, ${sky[1]})`;
  hemi.color.set(sky[1]);
}

function selectStage(id) {
  if (!STAGES[id - 1].built) return;
  current = id;
  applyLayout();
}

$('showAll').addEventListener('change', () => {
  applyLayout();
  frameCamera($('showAll').checked);
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') return;
  if (/^[1-4]$/.test(e.key)) selectStage(Number(e.key));
});

let statusTimer;
function setStatus(msg, ms = 3000) {
  const el = $('status');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ------------------------------------------------------------------ *
 *  Ekspor GLB
 * ------------------------------------------------------------------ */
function download(buffer, filename) {
  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Hanya clip dengan track yang node-nya ada di dalam `group`. */
function clipsFor(group) {
  const out = [];
  for (const clip of clips) {
    const tr = clip.tracks.filter((t) => {
      const node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
      return !!group.getObjectByName(node);
    });
    if (tr.length) out.push(new THREE.AnimationClip(clip.name, clip.duration, tr));
  }
  return out;
}

async function exportGLB(input, animations, filename) {
  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(input, { binary: true, animations, onlyVisible: false });
  download(buffer, filename);
}

$('btnExportAll').addEventListener('click', async () => {
  try {
    setStatus('Mengekspor semua tahap…', 8000);
    // tata letak 2×2 saat ekspor agar tahap tidak bertumpuk
    for (const def of STAGES) def.group.position.set(...GRID[def.id]);
    await exportGLB(world, clips, 'perubahan-iklim.glb');
    setStatus('Selesai: perubahan-iklim.glb');
  } catch (err) {
    console.error(err);
    setStatus('Gagal ekspor: ' + err.message, 6000);
  } finally {
    applyLayout();
  }
});

$('btnExportEach').addEventListener('click', async () => {
  try {
    const built = STAGES.filter((s) => s.built);
    for (const def of built) {
      setStatus(`Mengekspor ${def.name}…`, 8000);
      def.group.position.set(0, 0, 0);
      await exportGLB(def.group, clipsFor(def.group), `${def.file}.glb`);
      await new Promise((r) => setTimeout(r, 400)); // beri jeda agar browser tidak memblokir unduhan beruntun
    }
    setStatus(`Selesai: ${built.length} file GLB`);
  } catch (err) {
    console.error(err);
    setStatus('Gagal ekspor: ' + err.message, 6000);
  } finally {
    applyLayout();
  }
});

/* ------------------------------------------------------------------ *
 *  Start
 * ------------------------------------------------------------------ */
renderStats();
applyLayout();
frameCamera(false);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  mixer.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
});
  })().catch((e) => console.error('Viewer gagal:', e));
})();