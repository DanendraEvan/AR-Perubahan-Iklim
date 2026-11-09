/* ============================================================================
   kebakaran-ar.js (Versi Standalone 1 File)
   Sudah mencakup seluruh geometri model.js (dengan termometer di luar pulau)
   dan komponen A-Frame 'kebakaran-model' tanpa perlu fetch file eksternal.
   ========================================================================== */
   (function () {
    var INFO = [
      { judul: 'Suhu meningkat',
        teks: 'Suhu udara naik akibat cuaca ekstrem dan pemanasan global. Tanah mulai kehilangan kelembapan dan tumbuhan mulai layu.' },
      { judul: 'Hutan menjadi kering',
        teks: 'Daun gugur dan menumpuk, tanah retak, semak mengering. Hutan berubah menjadi bahan bakar alami yang mudah tersulut.' },
      { judul: 'Kebakaran hutan terjadi',
        teks: 'Percikan api dari puntung rokok, pembukaan lahan dengan membakar, atau petir menyulut kobaran yang cepat menjalar lewat serasah kering.' },
      { judul: 'Asap menyebar & habitat rusak',
        teks: 'Asap menyebar dan menurunkan kualitas udara. Pohon hangus, satwa kehilangan tempat tinggal dan sumber makanan.' },
    ];
  
    window.MODEL_CONFIG = {
      nama: 'Kebakaran Hutan',
      komponen: 'kebakaran-model',
      scale: 0.045,
      position: '0 0.075 0',
      rotation: '0 0 0',
    };
  
    function gabung(geos) {
      var T = AFRAME.THREE, names = Object.keys(geos[0].attributes), total = 0;
      geos.forEach(function (g) { total += g.attributes.position.count; });
      var out = new T.BufferGeometry();
      names.forEach(function (nm) {
        var size = geos[0].attributes[nm].itemSize, arr = new Float32Array(total * size), off = 0;
        geos.forEach(function (g) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].array.length; });
        out.setAttribute(nm, new T.BufferAttribute(arr, size));
      });
      return out;
    }
  
    function buatGeneratorModel(THREE, mergeGeometries) {
      const STAGES = [
        { n: 1, group: 'Stage1_SuhuMeningkat', label: 'Suhu meningkat', file: 'stage1-suhu-meningkat' },
        { n: 2, group: 'Stage2_HutanKering', label: 'Hutan menjadi kering', file: 'stage2-hutan-kering' },
        { n: 3, group: 'Stage3_Kebakaran', label: 'Kebakaran hutan terjadi', file: 'stage3-kebakaran' },
        { n: 4, group: 'Stage4_HabitatRusak', label: 'Asap menyebar & habitat rusak', file: 'stage4-habitat-rusak' },
      ];
      const STAGE_POS = [[-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5], [11.5, 11.5]];
      const R = 10, RN = 22, SEG = 72, BOT = -1.6;
      const GLADE = { x: -1.5, z: 1.5 };
  
      const clamp01 = (t) => Math.min(1, Math.max(0, t));
      const pad = (i) => String(i).padStart(2, '0');
      const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const hash3 = (x, y, z, s = 0) => {
        let h = Math.imul(Math.round(x * 1000) | 0, 374761393) ^ Math.imul(Math.round(y * 1000) | 0, 668265263) ^
                Math.imul(Math.round(z * 1000) | 0, 2147483647) ^ Math.imul(s | 0, 1274126177);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      };
      const fr = (f, s) => hash3(f, s, 3, 77);
      const smooth = (t) => t * t * (3 - 2 * t);
      function vnoise(x, z, s = 1) {
        const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
        const a = hash3(ix, iz, 0, s), b = hash3(ix + 1, iz, 0, s), c = hash3(ix, iz + 1, 0, s), d = hash3(ix + 1, iz + 1, 0, s);
        const top = a + (b - a) * fx, bot = c + (d - c) * fx;
        return top + (bot - top) * fz;
      }
      const height = (x, z) => (vnoise(x * 0.22, z * 0.22, 11) - 0.5) * 1.4 + (vnoise(x * 0.7, z * 0.7, 23) - 0.5) * 0.35;
  
      const _c = new THREE.Color();
      const L = (o, a, b, t) => { o.set(a); o.lerp(_c.set(b), clamp01(t)); return o; };
      const mixTo = (o, hex, t) => o.lerp(_c.set(hex), t);
  
      const std = (name, o = {}) => {
        const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, ...o });
        m.name = name; return m;
      };
      const M = {
        solid: std('Mat_Solid'),
        flameTip: std('Mat_FlameTip', { color: 0xffffff, emissive: 0xff2a00, emissiveIntensity: 2.0, roughness: 1 }),
        flameMid: std('Mat_FlameMid', { color: 0xffffff, emissive: 0xff7a10, emissiveIntensity: 2.2, roughness: 1 }),
        flameCore: std('Mat_FlameCore', { color: 0xffffff, emissive: 0xffd860, emissiveIntensity: 2.6, roughness: 1 }),
        ember: std('Mat_Ember', { color: 0xffffff, emissive: 0xff4a10, emissiveIntensity: 1.8, roughness: 1 }),
        sun: std('Mat_Sun', { color: 0xffffff, emissive: 0xffc83a, emissiveIntensity: 2.2, roughness: 1 }),
        arrow: std('Mat_HeatArrow', { color: 0xffffff, emissive: 0xff2a1a, emissiveIntensity: 0.8, roughness: 0.8 }),
        smokeDark: std('Mat_SmokeDark', { transparent: true, opacity: 0.82, depthWrite: false, roughness: 1 }),
        smokeGray: std('Mat_SmokeGray', { transparent: true, opacity: 0.62, depthWrite: false, roughness: 1 }),
      };
  
      function jitter(g, a, seed) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          p.setXYZ(i, x + (hash3(x, y, z, seed) - 0.5) * a, y + (hash3(x, y, z, seed + 7) - 0.5) * a, z + (hash3(x, y, z, seed + 13) - 0.5) * a);
        }
      }
      function finish(g, colorFn) {
        if (g.index) g = g.toNonIndexed();
        g.deleteAttribute('uv');
        g.computeVertexNormals();
        const p = g.attributes.position, c = new Float32Array(p.count * 3), o = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          colorFn(o, p.getX(i), p.getY(i), p.getZ(i), (i / 3) | 0);
          c[i * 3] = o.r; c[i * 3 + 1] = o.g; c[i * 3 + 2] = o.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return g;
      }
      function part(g, o, cf) {
        if (o.jit) jitter(g, o.jit, o.seed || 1);
        const q = o.q || new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.r || [0, 0, 0])));
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...(o.p || [0, 0, 0])), q, new THREE.Vector3(...(o.s || [1, 1, 1]))));
        return finish(g, cf);
      }
      function mk(name, geos, mat, shadow = true) {
        if (!geos.length) return null;
        const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
        const m = new THREE.Mesh(geo, mat);
        m.name = name; m.castShadow = shadow; m.receiveShadow = true;
        return m;
      }
      const add = (parent, obj) => { if (obj) parent.add(obj); return obj; };
  
      function pushTri(out, A, B, C, hint) {
        const ux = B.p[0] - A.p[0], uy = B.p[1] - A.p[1], uz = B.p[2] - A.p[2];
        const vx = C.p[0] - A.p[0], vy = C.p[1] - A.p[1], vz = C.p[2] - A.p[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { const t = B; B = C; C = t; }
        for (const V of [A, B, C]) { out.pos.push(V.p[0], V.p[1], V.p[2]); out.col.push(V.c.r, V.c.g, V.c.b); }
      }
      function terrainColor(n) {
        return (o, x, y, z) => {
          const a = vnoise(x * 0.6, z * 0.6, 5), b = vnoise(x * 0.3, z * 0.3, 9);
          if (n === 1) { L(o, 0x4a7a2a, 0x7aa63e, a); if (b > 0.7) mixTo(o, 0x6a5a30, 0.55); o.multiplyScalar(0.85 + (y + 0.9) * 0.18); }
          else if (n === 2) {
            L(o, 0x9a7c44, 0x7c6034, a); if (b > 0.62) mixTo(o, 0xb89c5a, 0.5);
            if (Math.abs(vnoise(x * 0.8, z * 0.8, 31) - 0.5) < 0.045) mixTo(o, 0x3a2918, 0.8);
          } else if (n === 3) {
            L(o, 0x2a1e17, 0x3c2b20, a); const e = vnoise(x * 0.7, z * 0.7, 41);
            if (e > 0.62) mixTo(o, e > 0.78 ? 0xe8661c : 0xb3361a, clamp01((e - 0.62) * 4));
          } else { L(o, 0x24211f, 0x3d3a37, a); if (vnoise(x * 0.5, z * 0.5, 51) > 0.6) mixTo(o, 0x7a766f, 0.55); }
        };
      }
      function buildTerrain(n) {
        const out = { pos: [], col: [] }, cf = terrainColor(n), tmp = new THREE.Color();
        const ring = (i, j) => { const r = R * i / RN, a = (j % SEG) / SEG * Math.PI * 2, x = r * Math.cos(a), z = r * Math.sin(a); return [x, height(x, z), z]; };
        const top = (a, b, c) => {
          const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
          cf(tmp, cx, cy, cz); tmp.multiplyScalar(0.94 + hash3(cx, cz, 0, 3) * 0.12);
          const C = tmp.clone(); pushTri(out, { p: a, c: C }, { p: b, c: C }, { p: c, c: C }, [0, 1, 0]);
        };
        for (let i = 0; i < RN; i++) for (let j = 0; j < SEG; j++) {
          const p00 = ring(i, j), p01 = ring(i, j + 1), p10 = ring(i + 1, j), p11 = ring(i + 1, j + 1);
          if (i === 0) top(p00, p10, p11); else { top(p00, p10, p11); top(p00, p11, p01); }
        }
        const dark = n >= 3 ? 0.6 : 1, bands = [0x6a4b2c, 0x4d3720, 0x33241a], wc = new THREE.Color();
        for (let j = 0; j < SEG; j++) {
          const a = ring(RN, j), b = ring(RN, j + 1), am = ((j + 0.5) / SEG) * Math.PI * 2, hint = [Math.cos(am), 0, Math.sin(am)];
          for (let k = 0; k < 3; k++) {
            const ya = (h, t) => h + (BOT - h) * t;
            const q = [[a[0], ya(a[1], k / 3), a[2]], [b[0], ya(b[1], k / 3), b[2]], [b[0], ya(b[1], (k + 1) / 3), b[2]], [a[0], ya(a[1], (k + 1) / 3), a[2]]];
            wc.set(bands[k]).multiplyScalar(dark * (0.88 + hash3(j, k, 0, 9) * 0.24));
            const C = wc.clone();
            pushTri(out, { p: q[0], c: C }, { p: q[1], c: C }, { p: q[2], c: C }, hint);
            pushTri(out, { p: q[0], c: C }, { p: q[2], c: C }, { p: q[3], c: C }, hint);
          }
          const C = new THREE.Color(0x1f1610);
          pushTri(out, { p: [0, BOT, 0], c: C }, { p: [a[0], BOT, a[2]], c: C }, { p: [b[0], BOT, b[2]], c: C }, [0, -1, 0]);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, M.solid); m.name = `S${n}_Terrain`; m.receiveShadow = true; m.castShadow = true;
        return m;
      }
  
      function makeTreeSpecs() {
        const rnd = mulberry32(2024), specs = []; let guard = 0;
        while (specs.length < 28 && guard++ < 5000) {
          const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 8.7, x = r * Math.cos(a), z = r * Math.sin(a);
          if (Math.hypot(x - GLADE.x, z - GLADE.z) < 3.3) continue;
          if (specs.some((s) => Math.hypot(s.x - x, s.z - z) < 1.6)) continue;
          const type = rnd() < 0.62 ? 'round' : 'pine';
          const H = type === 'round' ? 2.6 + rnd() * 1.2 : 3.4 + rnd() * 1.6;
          const sp = {
            id: specs.length + 1, x, z, y: height(x, z), type, H, s: 0.85 + rnd() * 0.4,
            rb: type === 'round' ? 0.16 + rnd() * 0.05 : 0.13 + rnd() * 0.03,
            tx: (rnd() - 0.5) * 0.16, tz: (rnd() - 0.5) * 0.16, seed: 100 + specs.length,
            nb: 2 + Math.floor(rnd() * 3),
            br: Array.from({ length: 4 }, () => ({ h: 0.45 + rnd() * 0.35, yaw: rnd() * 6.28, pitch: 0.7 + rnd() * 0.5, len: 0.7 + rnd() * 0.7 })),
            tw: Array.from({ length: 3 }, () => ({ h: 0.3 + rnd() * 0.5, yaw: rnd() * 6.28, pitch: 0.5 + rnd() * 0.6, len: 0.4 + rnd() * 0.4 })),
            bl: Array.from({ length: 3 }, () => ({ ox: (rnd() - 0.5) * 1.2, oy: rnd() * 0.4, oz: (rnd() - 0.5) * 1.2, r: 0.95 + rnd() * 0.5, rot: rnd() * 6.28 })),
            pr: 0.9 + rnd() * 0.25, bare: rnd() < 0.3, burn: rnd() < 0.6, broken: rnd() < 0.25,
          };
          sp.top = new THREE.Vector3(0, sp.H * 0.92, 0).applyEuler(new THREE.Euler(sp.tx, 0, sp.tz)).multiplyScalar(sp.s);
          specs.push(sp);
        }
        return specs;
      }
      const TREES = makeTreeSpecs();
  
      function scatter(count, seed, minD, flat = false, maxR = 8.8) {
        const r = mulberry32(seed), out = []; let g = 0;
        while (out.length < count && g++ < 4000) {
          const a = r() * 6.2832, d = Math.sqrt(r()) * maxR, x = d * Math.cos(a), z = d * Math.sin(a);
          if (!flat && Math.hypot(x - GLADE.x, z - GLADE.z) < 3.3) continue;
          if (TREES.some((t) => Math.hypot(t.x - x, t.z - z) < minD)) continue;
          if (out.some((o) => Math.hypot(o.x - x, o.z - z) < minD)) continue;
          out.push({ id: out.length + 1, x, z, y: height(x, z), u: [r(), r(), r(), r(), r()] });
        }
        return out;
      }
      const ROCKS = scatter(9, 301, 1.2), SHRUBS = scatter(16, 302, 1.0), LOGS = scatter(5, 303, 1.7),
        STUMPS = scatter(8, 304, 1.1), COAL = scatter(28, 305, 0.5, true), LEAVES = scatter(45, 306, 0.4, true),
        EMBERS = scatter(22, 307, 0.7, true), GROUNDFIRE = scatter(7, 308, 1.2, true), ARROWPOS = scatter(6, 309, 2.2, true, 6.5);
  
      const barkColor = (n, s) => (o, x, y, z, f) => {
        const t = clamp01(y / s.H);
        if (n <= 2) L(o, 0x3a291b, 0x75573a, t);
        else if (n === 3) { L(o, 0x120d0a, 0x2b1d15, t); if (fr(f, 1) > 0.82) o.set(0x7a2b0f); }
        else { L(o, 0x100f0e, 0x2a2826, t); if (fr(f, 2) > 0.8) o.set(0x4a4744); }
        o.multiplyScalar(0.9 + fr(f, 3) * 0.2);
      };
      const canopyColor = (n, s) => (o, x, y, z, f) => {
        const pine = s.type === 'pine', t = clamp01((y - s.H * 0.45) / (s.H * 0.75)), r = fr(f, 5), r2 = fr(f, 6);
        if (n === 1) { if (pine) L(o, 0x1d4a2c, 0x417f3d, t); else L(o, 0x2a5a22, 0x8cb84a, t); if (r < 0.25) mixTo(o, 0x1b3f1a, 0.45); }
        else if (n === 2) {
          if (pine) L(o, 0x6b5a2a, 0xa08235, t); else L(o, 0xa8782b, 0xd2b24c, t);
          if (r < 0.3) mixTo(o, 0x7a4a20, 0.6); else if (r > 0.85) mixTo(o, 0x9a9a3a, 0.5);
        } else { L(o, 0x17100c, 0x4a2410, t * r); if (r2 > 0.72) mixTo(o, 0xb83a12, 0.7); }
        o.multiplyScalar(0.9 + r2 * 0.2);
      };
  
      function buildTree(s, n) {
        const P = `S${n}_Tree_${pad(s.id)}`, g = new THREE.Group();
        g.name = P; g.position.set(s.x, s.y - 0.05, s.z); g.scale.setScalar(s.s);
        const Hs = (n === 4 && s.broken) ? s.H * 0.55 : s.H, rb = s.rb, rt = rb * 0.4;
        const tilt = new THREE.Euler(s.tx, 0, s.tz), tp = (t) => new THREE.Vector3(0, Hs * t, 0).applyEuler(tilt);
        const bark = barkColor(n, s), wood = [];
        const tg = new THREE.CylinderGeometry(rt, rb, Hs, 7, 3, true); tg.translate(0, Hs / 2, 0);
        wood.push(part(tg, { r: [s.tx, 0, s.tz], jit: 0.05, seed: s.seed }, bark));
        const nbr = n === 4 ? 4 : s.nb;
        for (let k = 0; k < nbr; k++) {
          const b = s.br[k], hh = (n === 4 && s.broken) ? Math.min(b.h, 0.5) : b.h, base = tp(hh);
          const bg = new THREE.CylinderGeometry(rb * 0.25, rb * 0.5, b.len, 5, 1, true); bg.translate(0, b.len / 2, 0);
          wood.push(part(bg, { p: base.toArray(), r: [0, b.yaw, b.pitch] }, bark));
        }
        if (n === 4) for (const w of s.tw) {
          const hh = s.broken ? Math.min(w.h, 0.5) : w.h, base = tp(hh);
          const wg = new THREE.CylinderGeometry(rb * 0.12, rb * 0.25, w.len, 4, 1, true); wg.translate(0, w.len / 2, 0);
          wood.push(part(wg, { p: base.toArray(), r: [0, w.yaw, w.pitch] }, bark));
        }
        add(g, mk(`${P}_Trunk`, wood, M.solid));
        const showCanopy = n === 1 || (n === 2 && !s.bare) || (n === 3 && !s.bare);
        if (showCanopy) {
          const th = n === 2 ? 0.8 : n === 3 ? 0.85 : 1, cc = canopyColor(n, s), can = [];
          if (s.type === 'round') {
            const top = tp(0.92), nb = n === 2 ? 2 : 3;
            for (let k = 0; k < nb; k++) {
              const b = s.bl[k], r = b.r * th;
              can.push(part(new THREE.IcosahedronGeometry(1, 1), { p: [top.x + b.ox, top.y + b.oy + r * 0.35, top.z + b.oz], s: [r, r * 0.82, r], r: [0, b.rot, 0], jit: 0.38, seed: s.seed + k }, cc));
            }
          } else {
            for (let k = 0; k < 4; k++) {
              const rad = (1.35 - k * 0.28) * s.pr * th, hgt = 1.5 * th, base = tp(0.3 + k * 0.17);
              const cg = new THREE.ConeGeometry(rad, hgt, 7, 2, false); cg.translate(0, hgt / 2, 0);
              can.push(part(cg, { p: base.toArray(), r: [0, k * 0.7 + s.seed, 0], jit: 0.2, seed: s.seed + k }, cc));
            }
          }
          add(g, mk(`${P}_Canopy`, can, M.solid));
        }
        return g;
      }
  
      function addEnv(g, n) {
        const P = `S${n}_`;
        const rocks = ROCKS.map((r) => part(new THREE.IcosahedronGeometry(1, 1), {
          p: [r.x, r.y + 0.05, r.z], s: [0.35 + r.u[0] * 0.35, 0.22 + r.u[1] * 0.18, 0.3 + r.u[2] * 0.3], r: [0, r.u[3] * 6.28, 0], jit: 0.3, seed: 400 + r.id,
        }, (o, x, y, z, f) => {
          if (n <= 2) L(o, 0x6f6d68, 0x95918a, fr(f, 11)); else if (n === 3) L(o, 0x2c2a28, 0x4a4744, fr(f, 11)); else L(o, 0x4a4743, 0x6a665f, fr(f, 11));
        }));
        add(g, mk(`${P}Rocks`, rocks, M.solid));
        const shr = [];
        SHRUBS.forEach((s, i) => {
          if (n === 4 && i % 2) return;
          const k = n === 4 ? 0.45 : 1;
          for (let b = 0; b < 3; b++) {
            const rr = (0.32 + s.u[b] * 0.22) * (n === 4 ? 0.7 : 1);
            shr.push(part(new THREE.IcosahedronGeometry(1, 0), {
              p: [s.x + (s.u[(b + 1) % 5] - 0.5) * 0.7, s.y + 0.15 * k + rr * 0.3, s.z + (s.u[(b + 2) % 5] - 0.5) * 0.7], s: [rr, rr * 0.75 * k + 0.05, rr], jit: 0.3, seed: 500 + s.id * 3 + b,
            }, (o, x, y, z, f) => {
              if (n === 1) L(o, 0x3e6a2a, 0x78a23c, fr(f, 12)); else if (n === 2) L(o, 0x8a7a3a, 0xb09448, fr(f, 12));
              else if (n === 3) { L(o, 0x1c140f, 0x3a261a, fr(f, 12)); if (fr(f, 13) > 0.85) o.set(0xa83410); } else L(o, 0x121110, 0x2c2a28, fr(f, 12));
            }));
          }
        });
        add(g, mk(`${P}Shrubs`, shr, M.solid));
        const logs = [];
        LOGS.slice(0, [3, 3, 4, 5][n - 1]).forEach((l) => {
          const len = 2.2 + l.u[0] * 0.9, rad = 0.2 + l.u[1] * 0.07, cg = new THREE.CylinderGeometry(rad * 0.85, rad, len, 6, 1, false);
          cg.rotateZ(Math.PI / 2);
          logs.push(part(cg, { p: [l.x, l.y + rad * 0.9, l.z], r: [(l.u[2] - 0.5) * 0.1, l.u[3] * 6.28, 0], jit: 0.04, seed: 600 + l.id }, (o, x, y, z, f) => {
            if (n === 1) L(o, 0x4a3622, 0x6a4e32, fr(f, 14)); else if (n === 2) L(o, 0x5e4a32, 0x7c6444, fr(f, 14));
            else if (n === 3) { L(o, 0x14100d, 0x2a1c14, fr(f, 14)); if (fr(f, 15) > 0.88) o.set(0x9a3010); } else { L(o, 0x151413, 0x2a2826, fr(f, 14)); if (fr(f, 15) > 0.8) o.set(0x55524e); }
          }));
        });
        add(g, mk(`${P}FallenLogs`, logs, M.solid));
        if (n >= 3) {
          const st = [];
          STUMPS.slice(0, n === 3 ? 6 : 8).forEach((s) => {
            const h = 0.5 + s.u[0] * 0.4, rad = 0.3 + s.u[1] * 0.15, cg = new THREE.CylinderGeometry(rad * 0.8, rad, h, 7, 2, false);
            cg.translate(0, h / 2, 0);
            const p = cg.attributes.position;
            for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.9) p.setY(i, p.getY(i) + (hash3(p.getX(i), p.getY(i), p.getZ(i), 3) - 0.5) * 0.3);
            st.push(part(cg, { p: [s.x, s.y - 0.05, s.z], jit: 0.05, seed: 700 + s.id }, (o, x, y, z, f) => {
              L(o, 0x0f0d0c, 0x2a2624, fr(f, 16)); if (n === 3 && fr(f, 17) > 0.85) o.set(0x9a3010); else if (n === 4 && fr(f, 17) > 0.8) o.set(0x5a5753);
            }));
          });
          add(g, mk(`${P}Stumps`, st, M.solid));
          const coal = COAL.map((c) => part(new THREE.IcosahedronGeometry(1, 0), {
            p: [c.x, c.y + 0.03, c.z], s: [0.14 + c.u[0] * 0.18, 0.05 + c.u[1] * 0.05, 0.12 + c.u[2] * 0.16], r: [0, c.u[3] * 6.28, 0], jit: 0.2, seed: 800 + c.id,
          }, (o, x, y, z, f) => { L(o, 0x0c0b0a, 0x2e2b29, fr(f, 18)); if (fr(f, 19) > 0.8) o.set(n === 4 ? 0x77736d : 0x4a4744); }));
          add(g, mk(`${P}Charcoal`, coal, M.solid));
        }
        if (n === 2) {
          const lv = LEAVES.map((c) => part(new THREE.IcosahedronGeometry(1, 0), {
            p: [c.x, c.y + 0.02, c.z], s: [0.3 + c.u[0] * 0.4, 0.04 + c.u[1] * 0.04, 0.25 + c.u[2] * 0.35], r: [0, c.u[3] * 6.28, 0], jit: 0.2, seed: 900 + c.id,
          }, (o, x, y, z, f) => {
            const r = fr(f, 20); if (r < 0.35) o.set(0xb8902c); else if (r < 0.6) o.set(0x9a5f25); else if (r < 0.85) o.set(0x7a4a20); else o.set(0xc4a040);
            o.multiplyScalar(0.9 + fr(f, 21) * 0.2);
          }));
          add(g, mk('S2_LeafLitter', lv, M.solid));
        }
      }
  
      const FLAMES = [], SMOKES = [], ARROWS = [], DEERS = [], BIRDS = [], SUNS = [];
  
      function bend(g, hh, amt) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const t = clamp01(p.getY(i) / hh); p.setX(i, p.getX(i) + amt * t * t); }
      }
      function buildFlame(name, seed, h) {
        const g = new THREE.Group(); g.name = name; const r = mulberry32(seed);
        const layers = [['Tip', M.flameTip, 4, 1, 0.34, 0xffa818, 0xc91d06], ['Mid', M.flameMid, 3, 0.74, 0.26, 0xffc83a, 0xff5a0c], ['Core', M.flameCore, 2, 0.46, 0.17, 0xfff6cc, 0xffd23a]];
        for (const [nm, mat, cnt, hf, rf, c0, c1] of layers) {
          const geos = [];
          for (let k = 0; k < cnt; k++) {
            const hh = h * hf * (0.75 + r() * 0.5), rr = h * rf * (0.8 + r() * 0.4);
            const cg = new THREE.ConeGeometry(rr, hh, 5, 2, true); cg.translate(0, hh / 2, 0);
            bend(cg, hh, (r() - 0.5) * hh * 0.7);
            const a = r() * 6.28, d = (nm === 'Core' ? 0.1 : 0.28) * h * r();
            geos.push(part(cg, { p: [Math.cos(a) * d, 0, Math.sin(a) * d], r: [(r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3], jit: hh * 0.12, seed: seed + k },
              (o, x, y) => { L(o, c0, c1, y / hh); }));
          }
          add(g, mk(`${name}_${nm}`, geos, mat, false));
        }
        return g;
      }
      function addFlame(parent, name, x, y, z, h, seed) {
        const f = buildFlame(name, seed, h); f.position.set(x, y, z); parent.add(f); FLAMES.push({ obj: f, seed }); return f;
      }
      function buildSmoke(name, seed, baseR, puffs, h, dark) {
        const r = mulberry32(seed), geos = [];
        for (let i = 0; i < puffs; i++) {
          const t = puffs > 1 ? i / (puffs - 1) : 0, rad = baseR * (1 + t * 1.9) * (0.8 + r() * 0.4);
          const p = [(r() - 0.5) * baseR * 1.6 * (1 + t) + t * baseR * 1.2, t * h, (r() - 0.5) * baseR * 1.6 * (1 + t)];
          geos.push(part(new THREE.IcosahedronGeometry(1, 0), { p, s: [rad, rad * 0.85, rad], r: [r() * 3, r() * 3, 0], jit: 0.35, seed: seed + i },
            (o, x, y, z, f) => { const k = t * 0.8 + fr(f, 1) * 0.25; if (dark) L(o, 0x141414, 0x4c4c4c, k); else L(o, 0x6e6e6e, 0xb4b4b4, k); }));
        }
        return mk(name, geos, dark ? M.smokeDark : M.smokeGray, false);
      }
      function addSmoke(parent, name, seed, x, y, z, baseR, puffs, h, dark, drift) {
        const m = buildSmoke(name, seed, baseR, puffs, h, dark); m.position.set(x, y, z); parent.add(m);
        SMOKES.push({ obj: m, dx: drift[0], dz: drift[1], rise: drift[2], grow: drift[3] }); return m;
      }
      function buildArrow(name) {
        const sh = new THREE.CylinderGeometry(0.12, 0.12, 1.7, 6, 1, false); sh.translate(0, 0.85, 0);
        const hd = new THREE.ConeGeometry(0.34, 0.95, 6, 1, false); hd.translate(0, 1.7 + 0.475, 0);
        const cf = (o, x, y) => { L(o, 0xd5201a, 0xff5a3a, y / 2.7); };
        return mk(name, [part(sh, {}, cf), part(hd, {}, cf)], M.arrow, false);
      }
      function buildThermometer() {
        const g = new THREE.Group(); g.name = 'S1_Thermometer';
        const glass = (o, x, y, z, f) => { o.set(0xdfe7ea).multiplyScalar(0.92 + fr(f, 3) * 0.1); };
        const red = (o, x, y, z, f) => { o.set(0xd01818).multiplyScalar(0.9 + fr(f, 4) * 0.2); };
        const tube = new THREE.CylinderGeometry(0.3, 0.3, 4, 8, 1, false); tube.translate(0, 2.2, 0);
        const cap = new THREE.IcosahedronGeometry(0.3, 1); cap.translate(0, 4.2, 0);
        const merc = new THREE.CylinderGeometry(0.33, 0.33, 2.6, 8, 1, false); merc.translate(0, 1.5, 0);
        const bulb = new THREE.IcosahedronGeometry(0.62, 1); bulb.translate(0, 0.2, 0);
        const geos = [part(tube, {}, glass), part(cap, {}, glass), part(merc, {}, red), part(bulb, {}, red)];
        for (let i = 0; i < 7; i++) {
          const w = i % 2 ? 0.2 : 0.34;
          geos.push(part(new THREE.BoxGeometry(w, 0.05, 0.08), { p: [0.34, 1.2 + i * 0.45, 0] }, (o) => { o.set(0x2a2a2a); }));
        }
        add(g, mk('S1_Thermometer_Body', geos, M.solid));
        return g;
      }
      function buildSun() {
        const g = new THREE.Group(); g.name = 'S1_Sun';
        add(g, mk('S1_SunBall', [part(new THREE.IcosahedronGeometry(1.7, 2), {}, (o, x, y, z, f) => { L(o, 0xfff2a0, 0xffc030, fr(f, 3)); })], M.sun, false));
        const rays = [], N = 14, up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < N; i++) {
          const yy = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(1 - yy * yy), th = i * 2.399963;
          const d = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr);
          const cg = new THREE.ConeGeometry(0.22, 1.0, 5, 1, true); cg.translate(0, 0.5, 0);
          rays.push(part(cg, { p: d.clone().multiplyScalar(1.85).toArray(), q: new THREE.Quaternion().setFromUnitVectors(up, d) }, (o, x, y, z, f) => { L(o, 0xffe070, 0xffb020, fr(f, 3)); }));
        }
        add(g, mk('S1_SunRays', rays, M.sun, false));
        return g;
      }
  
      function addStage1(g) {
        const sun = buildSun(); sun.position.set(4, 12.5, -6); g.add(sun); SUNS.push({ obj: sun });
        // Posisi termometer di luar pulau (x = -11.8) agar tidak tertutup pohon
        const th = buildThermometer(); th.position.set(-11.8, 0.5, 4.5); th.scale.setScalar(1.25); g.add(th);
        const grp = new THREE.Group(); grp.name = 'S1_HeatArrows';
        ARROWPOS.forEach((p, i) => {
          const a = buildArrow(`S1_HeatArrow_${pad(i + 1)}`); a.position.set(p.x, p.y + 3.4, p.z); grp.add(a);
          ARROWS.push({ obj: a, phase: i / ARROWPOS.length });
        });
        g.add(grp);
      }
      function addStage3(g) {
        const fire = new THREE.Group(), smoke = new THREE.Group(); fire.name = 'S3_Fire'; smoke.name = 'S3_Smoke';
        const burning = TREES.filter((t) => t.burn); let fi = 0;
        burning.forEach((t) => {
          addFlame(fire, `S3_Flame_${pad(++fi)}`, t.x + t.top.x, t.y + t.top.y - 0.3, t.z + t.top.z, 1.7 * t.s, 1000 + fi);
          addFlame(fire, `S3_Flame_${pad(++fi)}`, t.x + 0.15, t.y, t.z, 1.0 * t.s, 1000 + fi);
        });
        GROUNDFIRE.forEach((p) => addFlame(fire, `S3_Flame_${pad(++fi)}`, p.x, p.y, p.z, 1.1 + p.u[0] * 0.8, 1000 + fi));
        burning.slice(0, 8).forEach((t, i) => addSmoke(smoke, `S3_Smoke_${pad(i + 1)}`, 700 + i, t.x + t.top.x, t.y + t.top.y + 0.5, t.z + t.top.z, 0.75, 7, 6.5, true, [1.2 + (i % 3) * 0.4, 0.6 - (i % 2), 1.4 + 0.1 * i, 1.3]));
        [[-3, 10.5, -2], [3, 11, 3], [0, 12, -5]].forEach((p, i) => addSmoke(smoke, `S3_SmokeCloud_${pad(i + 1)}`, 760 + i, p[0], p[1], p[2], 1.8, 5, 3.5, true, [1.5, 1, 0.8, 1.25]));
        g.add(fire); g.add(smoke);
        const em = EMBERS.map((c) => part(new THREE.IcosahedronGeometry(1, 0), {
          p: [c.x, c.y + 0.04, c.z], s: [0.14 + c.u[0] * 0.16, 0.05, 0.12 + c.u[1] * 0.14], r: [0, c.u[2] * 6.28, 0], jit: 0.2, seed: 1200 + c.id,
        }, (o, x, y, z, f) => { L(o, 0xff7a1c, 0xd02a08, fr(f, 22)); }));
        add(g, mk('S3_Embers', em, M.ember, false));
      }
  
      function buildDeer(name, sc, antlers) {
        const g = new THREE.Group(); g.name = name; g.scale.setScalar(sc);
        const brown = (o, x, y, z, f) => {
          o.set(0x8a5a34); if (y < 0.82) mixTo(o, 0xcdb28c, clamp01((0.82 - y) / 0.18));
          if (z < -0.7 && y > 0.9) mixTo(o, 0xe6d6bc, 0.35); o.multiplyScalar(0.93 + fr(f, 9) * 0.14);
        };
        const horn = (o) => { o.set(0xd9c9a6); }, white = (o) => { o.set(0xf2e8d6); };
        const parts = [];
        parts.push(part(new THREE.IcosahedronGeometry(1, 1), { p: [0, 1, 0], s: [0.36, 0.4, 0.86], jit: 0.12, seed: 5 }, brown));
        const nb = [0, 1.18, 0.62], Ln = 0.64, ang = 0.75;
        const nc = [0, nb[1] + Math.cos(ang) * Ln / 2, nb[2] + Math.sin(ang) * Ln / 2], nt = [0, nb[1] + Math.cos(ang) * Ln, nb[2] + Math.sin(ang) * Ln];
        parts.push(part(new THREE.CylinderGeometry(0.085, 0.16, Ln, 6, 1, true), { p: nc, r: [ang, 0, 0] }, brown));
        parts.push(part(new THREE.IcosahedronGeometry(1, 0), { p: [0, nt[1] + 0.02, nt[2] + 0.12], s: [0.1, 0.11, 0.22], r: [0.55, 0, 0] }, brown));
        parts.push(part(new THREE.IcosahedronGeometry(1, 0), { p: [0, nt[1] - 0.1, nt[2] + 0.3], s: [0.06, 0.06, 0.12], r: [0.55, 0, 0] }, (o) => { o.set(0x4a3426); }));
        for (const s of [-1, 1]) {
          const eg = new THREE.ConeGeometry(0.05, 0.22, 4, 1, false); eg.translate(0, 0.11, 0);
          parts.push(part(eg, { p: [s * 0.09, nt[1] + 0.1, nt[2] + 0.04], r: [-0.2, 0, -s * 0.9] }, brown));
          if (antlers) {
            const bg = new THREE.CylinderGeometry(0.014, 0.03, 0.75, 5, 1, true); bg.translate(0, 0.375, 0);
            parts.push(part(bg, { p: [s * 0.07, nt[1] + 0.14, nt[2]], r: [-0.45, 0, -s * 0.35] }, horn));
            for (let k = 0; k < 2; k++) {
              const tg = new THREE.CylinderGeometry(0.01, 0.02, 0.32, 5, 1, true); tg.translate(0, 0.16, 0);
              parts.push(part(tg, { p: [s * (0.1 + k * 0.06), nt[1] + 0.3 + k * 0.2, nt[2] - 0.12 - k * 0.14], r: [-0.3, 0, -s * 0.9] }, horn));
            }
          }
        }
        const tg = new THREE.ConeGeometry(0.06, 0.2, 5, 1, false); tg.translate(0, 0.1, 0);
        parts.push(part(tg, { p: [0, 1.25, -0.84], r: [-2.4, 0, 0] }, white));
        add(g, mk(`${name}_Body`, parts, M.solid));
        const legs = {};
        for (const [id, x, z] of [['FL', 0.2, 0.52], ['FR', -0.2, 0.52], ['RL', 0.2, -0.55], ['RR', -0.2, -0.55]]) {
          const pv = new THREE.Group(); pv.name = `${name}_Leg${id}`; pv.position.set(x, 0.94, z);
          const leg = (o, xx, y) => { L(o, 0x7a5232, 0x5a3a22, -y / 0.9); };
          const up = new THREE.CylinderGeometry(0.075, 0.05, 0.46, 5, 1, true); up.translate(0, -0.23, 0);
          const lo = new THREE.CylinderGeometry(0.045, 0.034, 0.46, 5, 1, true); lo.translate(0, -0.23, 0);
          const hf = new THREE.ConeGeometry(0.05, 0.1, 5, 1, false); hf.translate(0, -0.45, 0);
          const kr = [id[0] === 'R' ? 0.18 : -0.1, 0, 0];
          add(pv, mk(`${name}_Leg${id}_Mesh`, [part(up, {}, leg), part(lo, { p: [0, -0.46, 0], r: kr }, leg), part(hf, { p: [0, -0.46, 0], r: kr }, (o) => { o.set(0x241a14); })], M.solid));
          g.add(pv); legs[id] = pv;
        }
        return { g, legs };
      }
      function buildBird(name) {
        const g = new THREE.Group(); g.name = name; g.scale.setScalar(1.4);
        const dk = (o, x, y, z, f) => { L(o, 0x3b3430, 0x6b625a, fr(f, 3)); };
        const body = [
          part(new THREE.IcosahedronGeometry(1, 0), { s: [0.12, 0.1, 0.3], jit: 0.04, seed: 2 }, dk),
          part(new THREE.IcosahedronGeometry(1, 0), { p: [0, 0.04, 0.3], s: [0.07, 0.07, 0.07] }, (o) => { o.set(0x2a2522); }),
          part(new THREE.ConeGeometry(0.025, 0.1, 4, 1, false), { p: [0, 0.03, 0.4], r: [Math.PI / 2, 0, 0] }, (o) => { o.set(0xc9a227); }),
          part(new THREE.ConeGeometry(0.09, 0.3, 4, 1, false), { p: [0, 0, -0.38], s: [1, 1, 0.3], r: [-Math.PI / 2, 0, 0] }, dk),
        ];
        add(g, mk(`${name}_Body`, body, M.solid));
        const wing = (side) => {
          const pv = new THREE.Group(); pv.name = `${name}_Wing${side > 0 ? 'R' : 'L'}`; pv.position.set(side * 0.08, 0.03, 0);
          const bg = new THREE.BoxGeometry(0.7, 0.02, 0.3, 1, 1, 1), p = bg.attributes.position;
          for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (1 - 0.55 * Math.abs(p.getX(i)) / 0.35));
          bg.translate(side * 0.35, 0, 0);
          add(pv, mk(`${pv.name}_Mesh`, [part(bg, {}, (o, x, y, z, f) => { L(o, 0x2d2926, 0x4a423c, Math.abs(x) / 0.7 + fr(f, 3) * 0.2); })], M.solid));
          g.add(pv); return pv;
        };
        return { g, wl: wing(-1), wr: wing(1) };
      }
      function addStage4(g) {
        const smoke = new THREE.Group(); smoke.name = 'S4_Smoke';
        STUMPS.slice(0, 5).forEach((s, i) => addSmoke(smoke, `S4_Smoke_${pad(i + 1)}`, 1300 + i, s.x, s.y + 0.8, s.z, 0.35, 6, 5, false, [1.0 + i * 0.2, -0.6, 1.0, 1.2]));
        [[-4, 9, -3], [4, 8.5, 2], [0, 10, 5]].forEach((p, i) => addSmoke(smoke, `S4_SmokeCloud_${pad(i + 1)}`, 1360 + i, p[0], p[1], p[2], 1.8, 5, 3.5, false, [1.5, 1, 0.8, 1.2]));
        g.add(smoke);
        const d = buildDeer('Deer', 1, true), f = buildDeer('Deer_Fawn', 0.6, false);
        g.add(d.g); g.add(f.g);
        DEERS.push({ obj: d.g, legs: d.legs, R: 2.3, phase: 0 }, { obj: f.g, legs: f.legs, R: 1.5, phase: 0.9 });
        const b1 = buildBird('Bird'), b2 = buildBird('Bird_2');
        g.add(b1.g); g.add(b2.g);
        BIRDS.push({ obj: b1.g, wl: b1.wl, wr: b1.wr, R: 5.5, y: 6.5, phase: 0 }, { obj: b2.g, wl: b2.wl, wr: b2.wr, R: 7, y: 7.2, phase: Math.PI });
      }
  
      function buildStage(n) {
        const st = STAGES[n - 1], g = new THREE.Group();
        g.name = st.group; g.position.set(STAGE_POS[n - 1][0], 0, STAGE_POS[n - 1][1]);
        g.add(buildTerrain(n));
        const trees = new THREE.Group(); trees.name = `S${n}_Trees`;
        TREES.forEach((s) => trees.add(buildTree(s, n)));
        g.add(trees);
        addEnv(g, n);
        if (n === 1) addStage1(g);
        if (n === 3) addStage3(g);
        if (n === 4) addStage4(g);
        return g;
      }
  
      const CLIP_DURATIONS = { FlameFlicker: 1.2, SmokeRise: 6, HeatArrows: 2.4, DeerWalk: 12, BirdFly: 8, SunPulse: 4 };
      const AY = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
      const qa = (axis, a) => new THREE.Quaternion().setFromAxisAngle(axis, a);
  
      function makeClips() {
        const tr = {}; for (const k in CLIP_DURATIONS) tr[k] = [];
        const V = (n, p, t, v) => new THREE.VectorKeyframeTrack(`${n}.${p}`, t, v);
        const Q = (n, t, v) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, t, v);
  
        for (const f of FLAMES) {
          const r = mulberry32(f.seed), times = [0, 0.2, 0.45, 0.7, 0.95, 1.2], k = f.obj.scale, sc = [], q = [];
          for (let i = 0; i < 5; i++) {
            sc.push(k.x * (1 + (r() - 0.5) * 0.22), k.y * (1 + (r() - 0.5) * 0.3), k.z * (1 + (r() - 0.5) * 0.22));
            q.push(...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (r() - 0.5) * 0.5, (r() - 0.5) * 0.22)).toArray());
          }
          sc.push(sc[0], sc[1], sc[2]); q.push(q[0], q[1], q[2], q[3]);
          tr.FlameFlicker.push(V(f.obj.name, 'scale', times, sc), Q(f.obj.name, times, q));
        }
        for (const s of SMOKES) {
          const p = s.obj.position, T = [0, 3, 6];
          tr.SmokeRise.push(V(s.obj.name, 'position', T, [p.x, p.y, p.z, p.x + s.dx, p.y + s.rise, p.z + s.dz, p.x, p.y, p.z]),
            V(s.obj.name, 'scale', T, [1, 1, 1, s.grow, s.grow, s.grow, 1, 1, 1]));
        }
        for (const a of ARROWS) {
          const p = a.obj.position, N = 48, T = [], P = [], S = [];
          for (let i = 0; i <= N; i++) {
            const t = i / N * CLIP_DURATIONS.HeatArrows, u = ((i / N) + a.phase) % 1;
            const k = Math.max(0.01, u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1);
            T.push(t); P.push(p.x, p.y + 2.2 * u, p.z); S.push(k, k, k);
          }
          tr.HeatArrows.push(V(a.obj.name, 'position', T, P), V(a.obj.name, 'scale', T, S));
        }
        for (const s of SUNS) tr.SunPulse.push(V(s.obj.name, 'scale', [0, 2, 4], [1, 1, 1, 1.07, 1.07, 1.07, 1, 1, 1]));
        for (const d of DEERS) {
          const N = 48, T = [], P = [], Qs = [], leg = { FL: [], FR: [], RL: [], RR: [] };
          for (let i = 0; i <= N; i++) {
            const th = d.phase + 2 * Math.PI * i / N, x = GLADE.x + d.R * Math.cos(th), z = GLADE.z + d.R * Math.sin(th);
            T.push(i * 0.25); P.push(x, height(x, z), z); Qs.push(...qa(AY, -th).toArray());
            for (const id in leg) leg[id].push(...qa(AX, 0.5 * Math.sin(2 * Math.PI * i / 4 + (id === 'FR' || id === 'RL' ? Math.PI : 0))).toArray());
          }
          tr.DeerWalk.push(V(d.obj.name, 'position', T, P), Q(d.obj.name, T, Qs));
          for (const id in leg) tr.DeerWalk.push(Q(d.legs[id].name, T, leg[id]));
          d.obj.position.set(P[0], P[1], P[2]); d.obj.quaternion.set(Qs[0], Qs[1], Qs[2], Qs[3]);
        }
        for (const b of BIRDS) {
          const N = 32, T = [], P = [], Qs = [], wl = [], wr = [];
          for (let i = 0; i <= N; i++) {
            const th = b.phase + 2 * Math.PI * i / N, a = i % 2 ? 0.6 : -0.6;
            T.push(i * 0.25); P.push(GLADE.x + b.R * Math.cos(th), b.y + 0.4 * Math.sin(2 * Math.PI * i / N * 2), GLADE.z + b.R * Math.sin(th));
            Qs.push(...qa(AY, -th).toArray()); wr.push(...qa(AZ, a).toArray()); wl.push(...qa(AZ, -a).toArray());
          }
          tr.BirdFly.push(V(b.obj.name, 'position', T, P), Q(b.obj.name, T, Qs), Q(b.wl.name, T, wl), Q(b.wr.name, T, wr));
          b.obj.position.set(P[0], P[1], P[2]); b.obj.quaternion.set(Qs[0], Qs[1], Qs[2], Qs[3]);
        }
        return Object.keys(CLIP_DURATIONS).filter((k) => tr[k].length).map((k) => new THREE.AnimationClip(k, CLIP_DURATIONS[k], tr[k]));
      }
  
      function buildModel() {
        FLAMES.length = SMOKES.length = ARROWS.length = DEERS.length = BIRDS.length = SUNS.length = 0;
        const root = new THREE.Group(); root.name = 'KebakaranHutan';
        const stages = [1, 2, 3, 4].map(buildStage);
        stages.forEach((s) => root.add(s));
        const clips = makeClips();
        return { root, stages, clips };
      }
  
      return { buildModel };
    }
  
    var K = window.KEBAKARAN = { jumlah: 4, tahap: 1, INFO: INFO, siap: false, stages: [], setStage: function () {} };
  
    AFRAME.registerComponent('kebakaran-model', {
      init: function () {
        var self = this, T = AFRAME.THREE;
        this.mixer = null;
        try {
          var api = buatGeneratorModel(T, gabung);
          var m = api.buildModel();
          m.stages.forEach(function (g) { g.position.set(0, 0, 0); });
          self.el.setObject3D('mesh', m.root);
          self.mixer = new T.AnimationMixer(m.root);
          m.clips.forEach(function (c) { self.mixer.clipAction(c).play(); });
  
          K.stages = m.stages;
          K.setStage = function (n) {
            n = Math.min(K.jumlah, Math.max(1, n));
            K.tahap = n;
            m.stages.forEach(function (g, i) { g.visible = (i === n - 1); });
          };
          K.setStage(1);
          K.siap = true;
          window.dispatchEvent(new CustomEvent('kebakaran-siap'));
        } catch (e) {
          console.error(e);
        }
      },
      tick: function (t, dt) {
        if (this.mixer) this.mixer.update(Math.min(dt, 100) / 1000);
      },
    });
  })();