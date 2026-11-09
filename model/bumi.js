/* model.js - Lapisan Atmosfer Bumi untuk Earth AR Scanner
   Model dibuat langsung dengan three.js (bawaan A-Frame), jadi tidak perlu file .glb.
   Disesuaikan dengan demo Three.js "Lapisan Atmosfer Bumi 3D":
   - data informasi tiap lapisan (ketinggian, suhu, penjelasan, isi) ada di blok DATA di bawah -> edit teks di sana
   - memilih lapisan = lapisan itu disorot (lebih terang), lapisan ozon ikut menyala untuk stratosfer
   - Mode potongan, Label, dan Jeda tersedia lewat window.MODEL_API (dipakai menu mengambang di ar.html)
   Kontrak untuk ar.html:
     MODEL_CONFIG.info                -> data menu (judul, petunjuk, bagian[], tombol[])
     MODEL_API.pilih(idBagian | null) -> sorot satu lapisan (null = tidak ada yang dipilih)
     MODEL_API.atur(idTombol, true/false) -> 'potongan' | 'label' | 'jeda' */
     (function () {
      const T = AFRAME.THREE, TAU = Math.PI * 2, OFF = 5.6; // OFF: bumi diangkat agar berdiri di atas marker
      let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const rdir = () => { const u = rnd() * 2 - 1, a = rnd() * TAU, q = Math.sqrt(1 - u * u); return new T.Vector3(q * Math.cos(a), u, q * Math.sin(a)); };
      const Y = new T.Vector3(0, 1, 0);
    
      /* =====================================================================
         DATA INFORMASI (edit teks di sini; urutan dari lapisan terluar ke terdalam)
         k = kunci, n = nama, alt = ketinggian, r0/r1 = jari-jari dalam/luar model,
         col = warna cangkang, sol = warna potongan, tp = suhu, d = penjelasan, it = isi/benda
         ===================================================================== */
      const INFO_JUDUL = 'Lapisan Atmosfer Bumi';
      const INFO_PETUNJUK = 'Pilih salah satu lapisan untuk melihat penjelasan dan benda-benda yang ada di dalamnya.';
      const DATA = [
        { k: 'exo', n: 'Eksosfer', alt: '600 – 10.000 km', r0: 8.8, r1: 10.4, col: 0x2b4aa8, sol: 0x1b3585,
          tp: 'Sangat jarang; udara hampir hampa',
          d: 'Lapisan terluar atmosfer. Gas hidrogen dan helium sangat renggang dan sebagian bisa lepas ke ruang angkasa. Batas bawahnya disebut eksobase.',
          it: ['Satelit GPS', 'Satelit komunikasi', 'Teleskop luar angkasa', 'Partikel hidrogen dan helium'] },
        { k: 'the', n: 'Termosfer', alt: '85 – 600 km', r0: 7.4, r1: 8.8, col: 0x2f66c4, sol: 0x2552a6,
          tp: 'Naik hingga sekitar 2.000 °C, tetapi udaranya sangat tipis',
          d: 'Atom gas menyerap sinar-X dan ultraviolet Matahari sehingga suhunya tinggi. Garis Karman (100 km) dianggap batas ruang angkasa. Aurora muncul di sini, dan stasiun luar angkasa mengorbit di lapisan ini.',
          it: ['Stasiun luar angkasa', 'Roket', 'Satelit orbit rendah', 'Aurora'] },
        { k: 'mes', n: 'Mesosfer', alt: '50 – 85 km', r0: 6.5, r1: 7.4, col: 0x3f7fd8, sol: 0x3568bd,
          tp: 'Lapisan terdingin, hingga sekitar −90 °C',
          d: 'Pelindung Bumi dari benda antariksa. Sebagian besar meteoroid terbakar akibat gesekan dengan udara dan tampak sebagai bintang jatuh.',
          it: ['Meteor (bintang jatuh)'] },
        { k: 'str', n: 'Stratosfer', alt: '12 – 50 km', r0: 5.7, r1: 6.5, col: 0x5aa0ee, sol: 0x4a8bdc,
          tp: 'Naik dari sekitar −60 °C hingga sekitar 0 °C',
          d: 'Udaranya tenang dan kering. Lapisan ozon di dalamnya menyerap sebagian besar sinar ultraviolet berbahaya dari Matahari.',
          it: ['Lapisan ozon', 'Pesawat jet tempur', 'Balon cuaca'] },
        { k: 'tro', n: 'Troposfer', alt: '0 – 12 km', r0: 5, r1: 5.7, col: 0x8ccaff, sol: 0x74b8f5,
          tp: 'Turun sekitar 6,5 °C setiap naik 1 km',
          d: 'Lapisan tempat kita hidup. Awan, hujan, angin, dan hampir semua peristiwa cuaca terjadi di sini.',
          it: ['Awan', 'Balon udara', 'Pesawat penumpang'] }
      ];
      const css = n => '#' + n.toString(16).padStart(6, '0');
    
      // Urutan internal terdalam -> terluar: [kunci, nama, ketinggian, r0, r1, warna, penjelasan]
      const LAY = DATA.slice().reverse().map(l => [l.k, l.n, l.alt, l.r0, l.r1, l.col, l.d]);
    
      // Titik nomor (dipertahankan untuk kompatibilitas): anchor menempel di lapisan, pin di sisi kanan model
      const hotspots = LAY.map((l, i) => {
        const rm = (l[3] + l[4]) / 2, th = (25 + (4 - i) * 20) * Math.PI / 180;
        return {
          id: String(i + 1), badge: 'LAPISAN #' + (i + 1), title: l[1] + ' (' + l[2] + ')', desc: l[6],
          anchor: [+(rm * Math.sin(th)).toFixed(2), +(rm * Math.cos(th) + OFF).toFixed(2), 0],
          pin: [13.5, +(OFF - 9 + i * 4.5).toFixed(2), 0],
          targetScale: 0.07, targetPos: { x: 0, y: 0, z: 0 }
        };
      });
    
      // Data untuk menu mengambang di ar.html
      const info = {
        judul: INFO_JUDUL,
        petunjuk: INFO_PETUNJUK,
        bagian: DATA.map(l => ({ id: l.k, nama: l.n, ketinggian: l.alt, suhu: l.tp, warna: css(l.col), deskripsi: l.d, isi: l.it })),
        tombol: [
          { id: 'potongan', nama: 'Mode potongan', awal: false },
          { id: 'label', nama: 'Label', awal: true },
          { id: 'jeda', nama: 'Jeda', awal: false }
        ]
      };
    
      window.MODEL_CONFIG = { nama: 'Atmosfer Bumi', komponen: 'atmosfer-model', scale: 0.045, pinScale: 3.2, animasi: false, position: '0 0 0', rotation: '0 0 0', hotspots: hotspots, info: info };
    
      const komp = () => { const el = document.getElementById('model-utama'); return el && el.components['atmosfer-model']; };
    
      // API untuk menu
      window.MODEL_API = {
        pilih: function (k) { const c = komp(); if (c) c.pilih(k); },
        atur: function (id, on) { const c = komp(); if (c) c.atur(id, on); }
      };
    
      // Tampilkan hanya satu lapisan (id nomor titik), atau semua bila null (dipertahankan)
      window.isolasiLapisan = function (id) {
        const c = komp();
        if (!c) return;
        const k = id ? LAY[+id - 1][0] : null;
        Object.keys(c.LG).forEach(x => { c.LG[x].visible = !k || x === k; });
      };
    
      AFRAME.registerComponent('atmosfer-model', {
        init: function () {
          const root = new T.Group(); root.position.y = OFF;
          const LG = this.LG = {}, orb = this.orb = [], self = this;
          DATA.slice().reverse().forEach(l => { LG[l.k] = new T.Group(); root.add(LG[l.k]); });
          let cur = 'tro';
          this.sel = null; this.paused = false; this.cutOn = false;
          this.cp0 = new T.Plane(new T.Vector3(0, 0, -1), 0); this.cp = new T.Plane();
          const M = (c, e) => new T.MeshLambertMaterial({ color: c, flatShading: true, emissive: e || 0 });
          const box = (w, h, d, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x || 0, y || 0, z || 0); return o; };
          const cyl = (r, l, m) => { const o = new T.Mesh(new T.CylinderGeometry(r, r, l, 8), m); o.rotation.x = Math.PI / 2; return o; };
          const cone = (r, l, m, z, dir) => { const o = new T.Mesh(new T.ConeGeometry(r, l, 8), m); o.rotation.x = dir * Math.PI / 2; o.position.z = z; return o; };
          const fin = (g, s) => { g.scale.setScalar(s); return g; };
          const SOL = () => M(0x2a4fb0, 0x0a1a50);
          const ring = (r, c, o) => { const p = []; for (let i = 0; i <= 96; i++) p.push(new T.Vector3(Math.cos(i / 96 * TAU) * r, Math.sin(i / 96 * TAU) * r, 0)); return new T.Line(new T.BufferGeometry().setFromPoints(p), new T.LineBasicMaterial({ color: c, transparent: true, opacity: o })); };
    
          // Bumi (low-poly, sama dengan demo)
          const BL = [[5,20,30,22],[-17,25,16,16],[27,15,12,28],[50,60,20,60],[32,95,22,30],[25,50,10,14],[60,20,12,25],[20,78,10,8],[-2,115,5,14],[-3,135,4,10],[47,-100,20,28],[65,-105,12,35],[20,-100,10,12],[72,-40,9,14],[-10,-60,20,14],[-32,-66,18,9],[-25,135,10,17],[-40,172,6,4]];
          const land = (la, lo) => {
            if (la < -72) return 1;
            const n = Math.abs((Math.sin(la * 12.9898 + lo * 78.233) * 43758.5453) % 1);
            for (const b of BL) { const dl = (la - b[0]) / b[2], dn = (((lo - b[1] + 540) % 360) - 180) / b[3]; if (dl * dl + dn * dn + (n - .5) * .3 < 1) return 1; }
            return 0;
          };
          const earth = this.earth = new T.Group(); root.add(earth);
          const g = new T.IcosahedronGeometry(5, 4).toNonIndexed(), p = g.attributes.position, c = [], col = new T.Color();
          for (let i = 0; i < p.count; i += 3) {
            const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
            const la = Math.asin(cy / Math.hypot(cx, cy, cz)) * 180 / Math.PI, lo = Math.atan2(cx, cz) * 180 / Math.PI, n = Math.abs((Math.sin(cx * 91.7 + cy * 47.3 + cz * 13.1) * 43758.5) % 1);
            if (land(la, lo)) {
              if (Math.abs(la) > 68) col.set(0xf1f5f9); else col.setHSL(.15 + .12 * Math.abs(Math.sin(la * .07 + lo * .05)), .62, .36 + .1 * n);
              for (let j = 0; j < 3; j++) p.setXYZ(i + j, p.getX(i + j) * 1.035, p.getY(i + j) * 1.035, p.getZ(i + j) * 1.035);
            } else col.setHSL(.56, .88, .36 + .12 * n);
            for (let j = 0; j < 3; j++) c.push(col.r, col.g, col.b);
          }
          g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
          earth.add(new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
          earth.add(new T.Mesh(new T.SphereGeometry(4.95, 32, 24), new T.MeshLambertMaterial({ color: 0x0b4f9e, side: T.DoubleSide })));
    
          // Cangkang tiap lapisan (disorot saat dipilih), cincin batas, lapisan ozon
          const sh = this.sh = {};
          DATA.forEach(l => {
            const m = new T.Mesh(new T.SphereGeometry(l.r1, 48, 32), new T.MeshBasicMaterial({ color: l.col, transparent: true, opacity: .13, side: T.DoubleSide, depthWrite: false }));
            m.renderOrder = Math.round(200 - l.r1 * 10); LG[l.k].add(m); LG[l.k].add(ring(l.r1, 0xffffff, .35)); sh[l.k] = m;
          });
          const oz = this.oz = new T.Mesh(new T.SphereGeometry(6.05, 40, 28), new T.MeshBasicMaterial({ color: 0x6ef0b0, transparent: true, opacity: .14, side: T.DoubleSide, depthWrite: false }));
          oz.renderOrder = 150; LG.str.add(oz); LG.str.add(ring(6.05, 0x6ef0b0, .8));
          LG.the.add(ring(7.7, 0xffffff, .8)); LG.exo.add(ring(8.8, 0xffd27a, .8));
    
          // Potongan penampang (tampil saat Mode potongan aktif)
          const cut = this.cut = new T.Group(); cut.visible = false; root.add(cut);
          DATA.forEach(l => { const a = new T.Mesh(new T.RingGeometry(l.r0, l.r1, 72), new T.MeshBasicMaterial({ color: l.sol, side: T.DoubleSide })); a.position.z = -.02; cut.add(a); });
          const disc = new T.Mesh(new T.CircleGeometry(5, 64), new T.MeshBasicMaterial({ color: 0x14518f, side: T.DoubleSide })); disc.position.z = -.02; cut.add(disc);
    
          // Label teks (sprite, selalu menghadap kamera); label ikut lapisannya
          const lbls = this.lbls = [];
          const lbl = (txt, color, small, grp, x, y) => {
            const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
            const cx = cv.getContext('2d');
            cx.font = (small ? '500 34px' : '700 44px') + ' system-ui, Arial, sans-serif';
            cx.textBaseline = 'middle'; cx.textAlign = small ? 'left' : 'center';
            cx.shadowColor = '#000'; cx.shadowBlur = 8; cx.fillStyle = color;
            cx.fillText(txt, small ? 10 : 256, 48);
            const tex = new T.CanvasTexture(cv);
            if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace; else if (T.sRGBEncoding) tex.encoding = T.sRGBEncoding;
            const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
            sp.center.set(small ? 0 : .5, .5);
            const w = small ? 8 : 7.5; sp.scale.set(w, w * 96 / 512, 1);
            sp.position.set(x, y, -.3); sp.renderOrder = 999; grp.add(sp); lbls.push(sp);
          };
          DATA.forEach(l => lbl(l.n, '#ffffff', false, LG[l.k], 0, (l.r0 + l.r1) / 2));
          const pol = (r, deg) => [r * Math.sin(deg * Math.PI / 180), r * Math.cos(deg * Math.PI / 180)];
          [['Lapisan ozon', 6.05, 48, '#6ef0b0', 'str'], ['Garis Karman (100 km)', 7.7, 44, '#ffffff', 'the'], ['Eksobase', 8.8, 40, '#ffd27a', 'exo']].forEach(a => { const q = pol(a[1], a[2]); lbl(a[0], a[3], true, LG[a[4]], q[0], q[1]); });
    
          // Benda
          const cloud = () => { const g = new T.Group(), m = M(0xffffff, 0x4a4a55); [[0,0,0,.2],[.2,-.03,.04,.15],[-.2,-.03,-.03,.14],[.05,.07,-.05,.14]].forEach(a => { const o = new T.Mesh(new T.IcosahedronGeometry(a[3], 0), m); o.position.set(a[0], a[1], a[2]); g.add(o); }); return g; };
          const balloon = (s, cols) => { const g = new T.Group(), geo = new T.IcosahedronGeometry(.2, 1).toNonIndexed(), q = geo.attributes.position, cc = [], k = new T.Color();
            for (let i = 0; i < q.count; i += 3) { const a = Math.atan2(q.getX(i) + q.getX(i + 1) + q.getX(i + 2), q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2)); k.set(cols[Math.floor((a + Math.PI) / TAU * 8) % cols.length]); for (let j = 0; j < 3; j++) cc.push(k.r, k.g, k.b); }
            geo.setAttribute('color', new T.Float32BufferAttribute(cc, 3));
            const b = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true })); b.position.y = .22; g.add(b); g.add(box(.07, .05, .07, M(0x8d6e63), 0, -.03, 0)); return fin(g, s); };
          const plane = (c, s, jet) => { const g = new T.Group(), m = M(c), w = jet ? .5 : .75;
            g.add(cyl(.05, .6, m)); g.add(cone(.05, .16, m, -.38, -1)); g.add(box(w, .014, jet ? .24 : .14, M(jet ? 0x5d6d7e : 0xcfd8e8)));
            g.add(box(.012, .13, .1, M(jet ? 0x5d6d7e : 0xe53935), 0, .08, .26)); g.add(box(w * .4, .012, .07, m, 0, 0, .27)); return fin(g, s); };
          const sat = (s, body) => { const g = new T.Group(); g.add(box(.18, .18, .28, M(body || 0xd4af37))); [-1, 1].forEach(k => g.add(box(.5, .02, .2, SOL(), k * .4, 0, 0))); g.add(cone(.08, .1, M(0xeeeeee), -.2, -1)); return fin(g, s); };
          const station = s => { const g = new T.Group(); g.add(box(1.1, .03, .03, M(0xcfcfcf))); g.add(cyl(.06, .42, M(0xf2f2f2))); [-.5, -.3, .3, .5].forEach(x => g.add(box(.16, .01, .38, SOL(), x, 0, 0))); return fin(g, s); };
          const rocket = s => { const g = new T.Group(), r = M(0xe53935); g.add(cyl(.06, .5, M(0xf5f5f5))); g.add(cone(.06, .18, r, -.34, -1));
            for (let k = 0; k < 3; k++) { const h = new T.Group(); h.rotation.z = k * TAU / 3; h.add(box(.012, .14, .1, r, 0, .09, .2)); g.add(h); }
            g.add(cone(.05, .24, new T.MeshBasicMaterial({ color: 0xffa726 }), .38, 1)); return fin(g, s); };
          const scope = s => { const g = new T.Group(); g.add(cyl(.09, .5, M(0xb0b8c4))); [-1, 1].forEach(k => g.add(box(.4, .015, .16, SOL(), k * .3, 0, .1))); return fin(g, s); };
          const meteor = () => { const g = new T.Group(); g.add(new T.Mesh(new T.DodecahedronGeometry(.07, 0), M(0xff7a1a, 0xff4a00))); g.add(cone(.05, .55, new T.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .65 }), -.3, -1)); return g; };
          const orbit = (m, r, sp, tilt, ph) => { const pv = new T.Group(), sg = new T.Group(), h = new T.Group();
            pv.rotation.set(tilt[0], tilt[1], tilt[2]); sg.rotation.y = ph; h.position.x = r; h.rotation.z = -Math.PI / 2; h.add(m); sg.add(h); pv.add(sg); LG[cur].add(pv); orb.push({ g: sg, s: sp }); };
    
          // Troposfer
          cur = 'tro';
          const clouds = this.clouds = new T.Group(); LG.tro.add(clouds);
          for (let i = 0; i < 11; i++) { const d = rdir(), cl = cloud(); cl.position.copy(d).multiplyScalar(5.3); cl.quaternion.setFromUnitVectors(Y, d); cl.scale.setScalar(1 + rnd() * .5); clouds.add(cl); }
          orbit(balloon(1.7, [0xe53935, 0xffb300]), 5.32, .07, [.4, 0, .3], 0);
          orbit(balloon(1.5, [0x1e88e5, 0xffffff]), 5.32, .06, [-.7, 0, .9], 2);
          orbit(balloon(1.4, [0x43a047, 0xfdd835]), 5.32, .05, [1.1, 0, -.4], 4);
          orbit(plane(0xffffff, 1.9), 5.58, .28, [.3, 0, .2], 1);
          orbit(plane(0xffffff, 1.9), 5.58, -.22, [-.5, 0, -.6], 3.5);
          // Stratosfer
          cur = 'str';
          orbit(plane(0x8896a8, 1.9, true), 6.25, .4, [.9, 0, -.3], 0);
          orbit(plane(0x8896a8, 1.9, true), 6.25, -.34, [-.3, 0, .8], 2.5);
          orbit(balloon(1.1, [0xffffff, 0xc0c8d4]), 6.38, .08, [.2, 0, -1], 1);
          orbit(balloon(1.1, [0xffffff, 0xc0c8d4]), 6.38, .07, [-1, 0, .5], 4);
          // Mesosfer
          cur = 'mes';
          const mets = this.mets = []; for (let i = 0; i < 7; i++) { const m = meteor(); LG.mes.add(m); mets.push({ g: m, t: rnd(), sp: .22 + rnd() * .25, d: rdir() }); }
          // Termosfer
          cur = 'the';
          orbit(station(2), 8.0, .2, [.9, 0, .5], 0);
          orbit(rocket(2), 7.75, .32, [-.4, 0, -.8], 2);
          orbit(sat(2), 8.4, -.25, [.2, 0, 1.2], 1);
          orbit(sat(1.8, 0xb8c0cc), 8.4, .18, [-1, 0, .2], 3.5);
          const auro = this.auro = []; [1, -1].forEach(k => { const a = new T.Mesh(new T.TorusGeometry(2.7, .14, 6, 56), new T.MeshBasicMaterial({ color: 0x5dffa0, transparent: true, opacity: .6 })); a.rotation.x = Math.PI / 2; a.position.y = 7.45 * k; LG.the.add(a); auro.push(a); });
          // Eksosfer
          cur = 'exo';
          orbit(sat(1.8), 9.3, .17, [.5, 0, .4], 0);
          orbit(sat(1.8), 9.3, .17, [-.6, 0, 1.3], 2.1);
          orbit(sat(1.8), 9.3, .17, [.2, 0, -1.2], 4.2);
          orbit(scope(2), 9.7, .12, [1.1, 0, .2], 1);
          orbit(sat(2.4, 0xeaeaea), 10.0, .08, [-.2, 0, .6], 3);
          const pp = new Float32Array(480); for (let i = 0; i < 160; i++) { const d = rdir().multiplyScalar(8.9 + rnd() * 1.4); pp.set([d.x, d.y, d.z], i * 3); }
          const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pp, 3));
          const part = this.part = new T.Points(pg, new T.PointsMaterial({ color: 0xcfe9ff, size: .1 })); LG.exo.add(part);
    
          this.tm = 0; this.el.setObject3D('mesh', root); this.root = root;
        },
    
        // Sorot satu lapisan (kunci: 'exo' | 'the' | 'mes' | 'str' | 'tro'), null = tidak ada
        pilih: function (k) { this.sel = k || null; },
    
        // Tombol: 'potongan' | 'label' | 'jeda'
        atur: function (id, on) {
          on = !!on;
          if (id === 'potongan') {
            this.cutOn = on; this.cut.visible = on;
            if (!on) { const r = this.el.sceneEl && this.el.sceneEl.renderer; if (r) r.clippingPlanes = []; }
          } else if (id === 'label') {
            this.lbls.forEach(s => { s.visible = on; });
          } else if (id === 'jeda') {
            this.paused = on;
          }
        },
    
        tick: function (time, delta) {
          if (!this.orb) return;
          const dt = Math.min(delta / 1000, .05);
          if (!this.paused) {
            this.tm += dt;
            this.earth.rotation.y += dt * .08; this.clouds.rotation.y += dt * .1; this.part.rotation.y += dt * .02;
            this.orb.forEach(o => { o.g.rotation.y += o.s * dt; });
            this.mets.forEach(m => { m.t += m.sp * dt; if (m.t > 1) { m.t = 0; m.d = rdir(); }
              m.g.position.copy(m.d).multiplyScalar(7.4 - m.t * .9); m.g.lookAt(0, 0, 0); m.g.scale.setScalar(Math.max(.02, 1 - m.t * m.t * .95)); });
            this.auro.forEach((a, i) => { a.material.opacity = .4 + .25 * Math.sin(this.tm * 1.6 + i * 2); });
          }
          // Sorotan lapisan terpilih (halus)
          const k = Math.min(1, dt * 6);
          DATA.forEach(l => { const m = this.sh[l.k].material, to = this.sel === l.k ? .34 : .13; m.opacity += (to - m.opacity) * k; });
          const mo = this.oz.material, tz = this.sel === 'str' ? .3 : .14; mo.opacity += (tz - mo.opacity) * k;
          // Bidang potong mengikuti model (koordinat dunia)
          if (this.cutOn) {
            const r = this.el.sceneEl && this.el.sceneEl.renderer;
            if (r) { this.root.updateWorldMatrix(true, false); this.cp.copy(this.cp0).applyMatrix4(this.root.matrixWorld); r.clippingPlanes = [this.cp]; }
          }
        },
    
        remove: function () {
          const r = this.el.sceneEl && this.el.sceneEl.renderer; if (r) r.clippingPlanes = [];
          this.el.removeObject3D('mesh');
        }
      });
    })();