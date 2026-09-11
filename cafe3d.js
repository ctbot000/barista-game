/* Bean & Brew — the 3D café.
   Everything here advances on the simulation's own clock: update(dt) is called
   from the fixed-step loop, never from the render path, so a driven harness
   that runs N updates gets the same picture as N real frames. */

import * as THREE from 'three';

const C = {
  wallBack:   0x6d5442,
  wallLower:  0x63482f,
  counter:    0x8a5a33,
  counterTop: 0x9c6a3d,
  front:      0x5e3d24,
  chrome:     0xc6cace,
  chromeDark: 0x8b9095,
  fascia:     0x6b5240,
  black:      0x362c26,
  cup:        0xf7f0e5,
  saucer:     0xe8dcc8,
  espresso:   0x53290f,
  crema:      0xc78e4f,
  milk:       0xf2e3cd,
  foam:       0xfffaf1,
  water:      0x9a6a3e,
  grounds:    0x55341c,
  brass:      0xc9953f,
  lampShade:  0xd8a05a
};

// A 1.0 albedo is not a 1.0 pixel: these are fed through ambient + N·L, so the
// dark end is lifted well above what the flat 2D palette used.
const mat = {
  matte:  (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.0, ...o }),
  metal:  (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.28, metalness: 0.85, ...o }),
  gloss:  (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.0, ...o }),
  liquid: (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.18, metalness: 0.05, ...o })
};

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const shade = (o, cast = true, receive = true) => {
  o.traverse((n) => { if (n.isMesh) { n.castShadow = cast; n.receiveShadow = receive; } });
  return o;
};

const MIN_W = 320, MIN_H = 220;   // a hidden pane measures 0; never build a world from that

export const Cafe3D = {

  ready: false,
  t: 0,

  /* ── construction ───────────────────────────────────── */

  init(canvas) {
    if (this.ready) return true;
    let gl;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: false,
        preserveDrawingBuffer: true            // so the frame survives to a capture
      });
      gl = this.renderer.getContext();
    } catch (e) { return false; }
    if (!gl) return false;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1d1410);
    this.scene.fog = new THREE.Fog(0x1d1410, 26, 52);

    this.camera = new THREE.PerspectiveCamera(36, 16 / 10, 0.1, 90);
    this.camPos = new THREE.Vector3(3.4, 7.4, 13.2);
    this.camAim = new THREE.Vector3(-1.4, 2.1, 0.2);
    this.camPosT = this.camPos.clone();
    this.camAimT = this.camAim.clone();

    this.buildEnvironment();
    this.buildLights();
    this.buildRoom();
    this.buildMachine();
    this.buildGrinder();
    this.buildCup();
    this.buildPitcher();
    this.buildCustomer();
    this.buildParticles();

    this.anim = {
      burr: 0, doseFill: 0, puck: 0, portaDock: 0,
      streamEsp: 0, streamGrounds: 0, pitcherLift: 0, onTarget: 0,
      cupSlide: 0, serveT: -1, shake: 0, custBob: 0, custX: 0
    };
    this._v = new THREE.Vector3();
    this.fit = 1;
    this.prevServe = -1;
    this.prevCustId = -1;
    this.ready = true;
    return true;
  },

  // A metal surface shows what is around it. With no environment there is
  // nothing to reflect, so every chrome part renders near-black however bright
  // the lamps are — this supplies a room for them to mirror.
  buildEnvironment() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const ctx = c.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0.00, '#8a6a4e');
    grd.addColorStop(0.42, '#d8a068');
    grd.addColorStop(0.58, '#7d5a3e');
    grd.addColorStop(1.00, '#2a1e16');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = '#ffe0b0';
    ctx.fillRect(6, 9, 14, 5);           // the pendant, as a bright band to catch
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(tex).texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();
    tex.dispose();
  },

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffdfba, 0x3a2a1e, 0.78));

    // Key light lives well off every surface it lights — height, not power, is
    // what widens the pool on a flat counter.
    const key = new THREE.DirectionalLight(0xffd9a8, 2.3);
    key.position.set(6, 14, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const s = key.shadow.camera;
    s.left = -16; s.right = 16; s.top = 14; s.bottom = -13; s.near = 1; s.far = 46;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    const pendant = new THREE.PointLight(0xffb964, 90, 34, 2);
    pendant.position.set(-2.2, 8.4, 1.2);
    this.scene.add(pendant);
    this.pendant = pendant;

    const rim = new THREE.DirectionalLight(0x7fb0ff, 0.5);
    rim.position.set(-9, 5, -10);
    this.scene.add(rim);

    this.scene.add(new THREE.AmbientLight(0xffe2c0, 0.34));
  },

  buildRoom() {
    const g = new THREE.Group();

    g.add(shade(put(box(40, 28, 0.5, mat.matte(C.wallBack)), 0, 5, -8.5), false, true));
    g.add(shade(put(box(40, 7.0, 0.3, mat.matte(C.wallLower)), 0, -5.7, -8.2), false, true));
    g.add(shade(put(box(40, 0.4, 22, mat.matte(0x4a3527)), 0, -9.4, 0), false, true));

    // counter: top surface at y = 0
    g.add(shade(put(box(26, 0.8, 7.0, mat.gloss(C.counterTop, { roughness: 0.42 })), 0, -0.4, 0.6)));
    g.add(shade(put(box(26, 8.4, 0.5, mat.matte(C.front)), 0, -5.0, -3.15), false, true));
    g.add(shade(put(box(26, 0.24, 0.62, mat.metal(C.brass, { roughness: 0.4 })), 0, -0.92, -3.42), false, false));

    // back counter + shelf
    g.add(shade(put(box(26, 5.0, 2.6, mat.matte(0x6b4a30)), -2, -6.7, -9.0), false, true));
    g.add(shade(put(box(26, 0.4, 2.8, mat.gloss(0x8a6440)), -2, -4.0, -9.0), false, true));
    const shelf = shade(put(box(17, 0.4, 1.8, mat.matte(0x6b4a30)), -2, 4.4, -8.0));
    g.add(shelf);
    for (let i = 0; i < 10; i++) {
      g.add(shade(put(cyl(0.45, 0.36, 0.7, mat.gloss(i % 3 === 0 ? 0xe4b98a : C.cup), 14),
        -9.4 + i * 1.6, 4.95, -8.0)));
    }
    for (let i = 0; i < 6; i++) {
      g.add(shade(put(cyl(0.45, 0.36, 0.7, mat.gloss(C.cup), 14), -8 + i * 1.5, -3.45, -9.0)));
    }
    for (let i = 0; i < 2; i++) {
      g.add(shade(put(box(2.0, 2.6, 1.4, mat.matte(0x7a6446)), -11.0 + i * 2.3, -7.9, -6.6)));
    }

    // pendant lamp, hung well off the counter so its pool is wide
    g.add(shade(put(cyl(0.06, 0.06, 7.0, mat.matte(C.black), 6), -2.2, 13.5, 1.2), false, false));
    const shadeMesh = put(new THREE.Mesh(
      new THREE.ConeGeometry(2.0, 1.8, 26, 1, true),
      new THREE.MeshStandardMaterial({ color: C.lampShade, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide })
    ), -2.2, 9.3, 1.2);
    g.add(shadeMesh);
    g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd79a })), -2.2, 8.6, 1.2));

    // menu board on the back wall
    g.add(shade(put(box(7.0, 4.2, 0.25, mat.matte(0x2f2620)), 8.6, 5.4, -8.1), false, false));
    for (let i = 0; i < 5; i++) {
      g.add(put(box(4.0 - (i % 2) * 1.2, 0.18, 0.06, new THREE.MeshBasicMaterial({ color: 0xd9c39a })),
        7.6 - (i % 2) * 0.6, 6.8 - i * 0.72, -7.95));
    }

    this.scene.add(g);
  },
  buildMachine() {
    const g = new THREE.Group();
    g.position.set(-2.6, 0, -0.2);

    const bodyM = mat.metal(C.chrome, { roughness: 0.22 });
    g.add(shade(put(box(6.6, 4.2, 3.4, bodyM), 0, 2.1, 0)));
    g.add(shade(put(box(6.9, 0.3, 3.6, mat.metal(C.chromeDark)), 0, 4.35, 0)));
    g.add(shade(put(box(6.2, 2.0, 0.3, mat.matte(C.fascia)), 0, 2.6, 1.72)));
    g.add(shade(put(box(6.7, 0.34, 3.5, mat.metal(C.brass, { roughness: 0.35 })), 0, 0.17, 0)));

    for (let i = 0; i < 4; i++) {
      g.add(shade(put(cyl(0.42, 0.34, 0.64, mat.gloss(C.cup), 14), -2.3 + i * 1.5, 4.82, -0.5)));
    }

    // group head — high enough that a cup fits under it
    g.add(shade(put(cyl(0.82, 0.7, 1.0, mat.metal(C.chromeDark)), 0.2, 2.5, 2.3)));
    g.add(shade(put(cyl(0.3, 0.24, 0.3, mat.metal(C.chrome), 12), 0.2, 1.9, 2.3)));

    // drip tray, sitting on the counter in front
    g.add(shade(put(box(5.4, 0.26, 2.2, mat.metal(C.chromeDark)), 0, 0.13, 2.6)));
    for (let i = 0; i < 11; i++) {
      g.add(put(box(0.28, 0.08, 2.0, mat.metal(0xa8adb2)), -2.4 + i * 0.48, 0.3, 2.6));
    }

    // steam wand, hinged on the right cheek
    const wand = new THREE.Group();
    wand.position.set(3.0, 3.8, 1.5);
    const arm = shade(put(cyl(0.12, 0.1, 2.6, mat.metal(C.chrome), 10), 0, -1.1, 0.3));
    arm.rotation.x = 0.3;
    wand.add(arm);
    wand.add(shade(put(cyl(0.15, 0.11, 0.34, mat.metal(C.chromeDark), 10), 0, -2.45, 0.7)));
    g.add(wand);
    g.add(shade(put(cyl(0.24, 0.24, 0.42, mat.metal(C.brass), 10), 3.0, 4.0, 1.2)));
    // world position of the wand tip, where the pitcher has to meet it
    this.wandTipW = new THREE.Vector3(-2.6 + 3.0, 3.8 - 2.45, -0.2 + 2.2);

    // gauge + knobs on the fascia
    const gauge = shade(put(cyl(0.55, 0.55, 0.18, mat.metal(C.brass), 20), -2.2, 3.2, 1.76));
    gauge.rotation.x = Math.PI / 2;
    g.add(gauge);
    g.add(put(cyl(0.46, 0.46, 0.04, new THREE.MeshBasicMaterial({ color: 0xf3e4c4 }), 20)
      .rotateX(Math.PI / 2), -2.2, 3.2, 1.86));
    const needle = put(box(0.05, 0.36, 0.02, new THREE.MeshBasicMaterial({ color: 0xa23b2c })), -2.2, 3.34, 1.89);
    g.add(needle);
    this.needle = needle;
    for (let i = 0; i < 2; i++) {
      g.add(shade(put(cyl(0.22, 0.22, 0.32, mat.metal(C.chromeDark), 12).rotateX(Math.PI / 2),
        1.4 + i * 0.9, 3.2, 1.8)));
    }

    this.machine = g;
    this.scene.add(g);

    // The portafilter travels between the grinder and the group head, so it is
    // its own top-level object rather than a child of the machine.
    const porta = new THREE.Group();
    const basket = shade(put(cyl(0.78, 0.64, 0.52, mat.metal(C.chromeDark)), 0, 0, 0));
    porta.add(basket);
    porta.add(shade(put(cyl(0.3, 0.22, 0.26, mat.metal(C.chromeDark), 10), 0, -0.36, 0)));
    const puck = put(cyl(0.66, 0.6, 0.3, mat.matte(C.grounds), 18), 0, 0.1, 0);
    puck.scale.y = 0.01;
    porta.add(puck);
    this.puck = puck;
    const handle = shade(put(cyl(0.16, 0.14, 2.0, mat.matte(C.black), 12), 0, -0.04, 1.3));
    handle.rotation.x = Math.PI / 2;
    porta.add(handle);
    porta.add(shade(put(cyl(0.21, 0.21, 0.26, mat.metal(C.brass), 12), 0, -0.04, 2.24)));
    this.portaDock = new THREE.Vector3(-2.4, 2.06, 2.1);
    this.portaFill = new THREE.Vector3(-8.4, 0.62, 1.05);
    porta.position.copy(this.portaFill);
    this.porta = porta;
    this.scene.add(porta);
  },
  buildGrinder() {
    const g = new THREE.Group();
    g.position.set(-8.4, 0, -0.4);

    g.add(shade(put(box(2.1, 3.6, 2.1, mat.metal(C.chromeDark, { roughness: 0.34 })), 0, 1.8, 0)));
    g.add(shade(put(box(2.3, 0.26, 2.3, mat.metal(C.brass, { roughness: 0.4 })), 0, 0.13, 0)));
    g.add(shade(put(cyl(0.22, 0.22, 1.4, mat.metal(C.chrome), 10), 0, 1.0, 1.35)));
    g.add(shade(put(box(1.4, 0.12, 1.0, mat.metal(C.chrome)), 0, 0.35, 1.5)));

    const hopper = shade(put(cyl(1.15, 0.6, 2.2, new THREE.MeshStandardMaterial({
      color: 0x7a5636, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.5
    }), 22), 0, 4.9, 0));
    g.add(hopper);
    this.hopper = hopper;
    g.add(shade(put(cyl(0.95, 0.55, 1.2, mat.matte(0x4d2f18), 18), 0, 4.4, 0)));
    g.add(shade(put(cyl(1.2, 1.2, 0.22, mat.metal(C.chrome), 22), 0, 3.72, 0)));
    g.add(shade(put(cyl(1.22, 1.22, 0.12, mat.metal(C.chromeDark), 22), 0, 6.06, 0)));

    const burr = put(cyl(0.66, 0.66, 0.22, mat.metal(0x9a9ea3, { roughness: 0.5 }), 12), 0, 3.6, 0);
    g.add(burr);
    this.burr = burr;

    this.grinder = g;
    this.scene.add(g);
  },
  buildCup() {
    const g = new THREE.Group();
    g.scale.setScalar(0.5);                       // ~8 cm across at 1 unit = 10 cm
    this.cupHome = new THREE.Vector3(-2.4, 0.30, 2.1);
    this.cupServe = new THREE.Vector3(5.4, 0.0, -1.8);
    g.position.copy(this.cupHome);

    g.add(shade(put(cyl(1.95, 1.8, 0.16, mat.gloss(C.saucer), 28), 0, 0.08, 0)));

    // The lathe runs up the outside, over the rim and back down the inside, so
    // the cup is genuinely hollow rather than a capped cylinder.
    const prof = [
      [0.00, 0.00], [0.90, 0.00], [0.99, 0.18], [1.14, 1.62], [1.16, 1.74],
      [1.05, 1.80], [1.01, 1.70], [0.86, 0.22], [0.78, 0.18], [0.00, 0.18]
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const shell = new THREE.Mesh(
      new THREE.LatheGeometry(prof, 40),
      new THREE.MeshStandardMaterial({ color: C.cup, roughness: 0.3, metalness: 0.0, side: THREE.DoubleSide })
    );
    put(shell, 0, 0.16, 0);
    shell.castShadow = true; shell.receiveShadow = true;
    g.add(shell);

    const handle = shade(put(new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.11, 10, 20, Math.PI * 1.15), mat.gloss(C.cup)
    ), 1.14, 1.08, 0));
    handle.rotation.y = Math.PI / 2;
    handle.rotation.z = -0.35;
    g.add(handle);

    this.layers = {};
    const mk = (colour) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.86, 1, 28), mat.liquid(colour));
      m.visible = false;
      g.add(m);
      return m;
    };
    this.layers.espresso = mk(C.espresso);
    this.layers.milk = mk(C.milk);
    this.layers.foam = mk(C.foam);
    this.cupInnerBase = 0.35;
    this.cupInnerTop = 1.70;

    this.ice = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const q = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36),
        new THREE.MeshStandardMaterial({ color: 0xdaf0ff, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.72 }));
      q.position.set(Math.cos(i * 2.3) * 0.42, 1.1 + (i % 3) * 0.22, Math.sin(i * 2.3) * 0.42);
      q.rotation.set(i, i * 1.7, i * 0.6);
      this.ice.add(q);
    }
    this.ice.visible = false;
    g.add(this.ice);

    this.cup = g;
    this.scene.add(g);
  },
  buildPitcher() {
    const g = new THREE.Group();
    g.scale.setScalar(0.62);
    this.pitcherHome = new THREE.Vector3(1.6, 0.0, 2.9);
    g.position.copy(this.pitcherHome);

    g.add(shade(put(cyl(1.0, 0.78, 2.0, mat.metal(C.chrome, { roughness: 0.2 })), 0, 1.0, 0)));
    const spout = put(new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.8, 12, 1, true),
      mat.metal(C.chrome, { side: THREE.DoubleSide })), 0.86, 1.9, 0);
    spout.rotation.z = -0.75;
    g.add(spout);
    const handle = shade(put(new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.1, 8, 16, Math.PI * 1.1), mat.metal(C.chromeDark)), -1.04, 1.0, 0));
    handle.rotation.y = Math.PI / 2;
    g.add(handle);

    const milk = put(cyl(0.92, 0.74, 1.2, mat.liquid(C.milk), 22), 0, 0.72, 0);
    g.add(milk);
    this.pitcherMilk = milk;

    const halo = put(new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 8, 30),
      new THREE.MeshBasicMaterial({ color: 0x9fe6a8, transparent: true, opacity: 0 })), 0, 1.1, 0);
    halo.rotation.x = Math.PI / 2;
    g.add(halo);
    this.halo = halo;

    this.pitcher = g;
    this.scene.add(g);
  },
  buildCustomer() {
    // Built with the feet at local y = 0, then stood on the floor facing the bar.
    const g = new THREE.Group();
    g.position.set(5.6, -9.2, -6.6);
    g.rotation.y = 0.16;
    g.scale.setScalar(0.85);

    const legs = shade(put(new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 4.0, 6, 14), mat.matte(0x4a5464)), 0, 3.1, 0));
    g.add(legs);
    this.custLegs = legs;
    const body = shade(put(new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 3.2, 6, 16), mat.matte(0x7d90ab)), 0, 8.4, 0));
    g.add(body);
    this.custBody = body;

    const head = new THREE.Group();
    head.position.set(0, 13.1, 0);
    g.add(head);
    this.custHead = head;

    const R = 1.3;
    const skull = shade(put(new THREE.Mesh(new THREE.SphereGeometry(R, 20, 16), mat.matte(0xd7a077)), 0, 0, 0));
    head.add(skull);
    this.custSkull = skull;
    // Hair is a cap that sits proud of the skull. An offset that looks right in
    // a flat sketch would put it inside the sphere, where nothing reports it.
    const hair = shade(put(new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.045, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), mat.matte(0x3a2a20)), 0, 0.04, 0));
    head.add(hair);
    this.custHair = hair;
    // Features are projected onto the surface, not placed at a flat offset.
    const onSkull = (dx, dy, dz, r, colour) => {
      const d = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(R * 0.97);
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat.matte(colour));
      m.position.copy(d);
      head.add(m);
      return m;
    };
    onSkull(-0.34, 0.12, 0.93, 0.15, 0x2b2018);
    onSkull(0.34, 0.12, 0.93, 0.15, 0x2b2018);
    const nose = onSkull(0, -0.12, 1, 0.13, 0xc98f68);
    nose.scale.set(0.8, 0.8, 1.1);

    for (const s of [-1, 1]) {
      const arm = shade(put(new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.6, 4, 10), mat.matte(0x6c7e98)), s * 1.72, 8.3, 0.25));
      arm.rotation.z = s * 0.14;
      g.add(arm);
    }
    this.customer = g;
    this.scene.add(g);
  },
  buildParticles() {
    const mkPool = (n, geo, material) => {
      const arr = [];
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo, material.clone());
        m.visible = false;
        this.scene.add(m);
        arr.push({ mesh: m, life: 0, ttl: 0, vx: 0, vy: 0, vz: 0 });
      }
      return arr;
    };
    this.grounds = mkPool(26, new THREE.BoxGeometry(0.09, 0.09, 0.09), mat.matte(C.grounds));
    this.steam = mkPool(24, new THREE.SphereGeometry(0.26, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff3e2, transparent: true, opacity: 0.4 }));

    const streamMat = new THREE.MeshStandardMaterial({ color: C.crema, roughness: 0.3, transparent: true, opacity: 0.92 });
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 1, 8), streamMat);
    s.visible = false;
    this.scene.add(s);
    this.espStream = s;
  },

  /* ── per-step camera ────────────────────────────────── */

  aimFor(step) {
    switch (step) {
      case 'grind':   return [new THREE.Vector3(-2.4, 7.2, 12.6), new THREE.Vector3(-6.6, 2.4, -0.3)];
      case 'extract': return [new THREE.Vector3(-0.6, 5.4, 11.0), new THREE.Vector3(-2.4, 1.3, 1.2)];
      case 'steam':   return [new THREE.Vector3(3.0, 6.0, 11.4),  new THREE.Vector3(0.4, 1.8, 1.4)];
      case 'finish':  return [new THREE.Vector3(3.0, 6.8, 13.0),  new THREE.Vector3(1.4, 1.6, -0.6)];
      default:        return [new THREE.Vector3(3.2, 7.6, 15.4),  new THREE.Vector3(0.2, 1.6, -1.2)];
    }
  },

  /* ── update: sim clock only ─────────────────────────── */

  update(dt, v) {
    if (!this.ready || !v) return;
    this.t += dt;
    const a = this.anim;

    // camera easing lives here, not in draw(), so N driven steps == N frames
    const [pt, at] = this.aimFor(v.step);
    this.camPosT.copy(pt); this.camAimT.copy(at);
    const k = Math.min(1, dt * 2.6);
    this.camPos.lerp(this.camPosT, k);
    this.camAim.lerp(this.camAimT, k);
    const sway = v.phase === 'playing' ? 1 : 0.35;
    const off = this._v.copy(this.camPos).sub(this.camAim).multiplyScalar(this.fit);
    this.camera.position.copy(this.camAim).add(off);
    this.camera.position.x += Math.sin(this.t * 0.31) * 0.22 * sway;
    this.camera.position.y += Math.sin(this.t * 0.23 + 1.1) * 0.14 * sway;
    this.camera.lookAt(this.camAim);

    // grinder
    const grinding = v.step === 'grind' && v.grinding;
    a.burr += (grinding ? 15 : 0.25) * dt;
    this.burr.rotation.y = a.burr;
    this.hopper.position.x = grinding ? Math.sin(this.t * 44) * 0.03 : 0;
    if (grinding) this.emitGrounds(dt);

    // dose builds in the portafilter while grinding, then stays as a puck
    const dose = v.step === 'grind' ? v.grindV : (v.dosed ? 1 : 0);
    a.doseFill += (dose - a.doseFill) * Math.min(1, dt * 12);
    this.puck.scale.y = Math.max(0.01, a.doseFill);
    this.puck.position.y = 0.08 + a.doseFill * 0.12;

    // the portafilter itself travels: under the grinder to be dosed, then into
    // the group head to be pulled
    const dock = (v.step === 'extract' || v.step === 'steam' || v.step === 'finish') ? 1 : 0;
    a.portaDock += (dock - a.portaDock) * Math.min(1, dt * 5);
    const e = a.portaDock * a.portaDock * (3 - 2 * a.portaDock);
    this.porta.position.lerpVectors(this.portaFill, this.portaDock, e);
    this.porta.position.y += Math.sin(e * Math.PI) * 0.9;      // lifted across
    this.porta.rotation.y = e * 0.5;

    // espresso stream while a shot is live
    const pouring = v.step === 'extract' ? 1 : 0;
    a.streamEsp += (pouring - a.streamEsp) * Math.min(1, dt * 9);
    this.updateStream(a.streamEsp, v.liquid);
    this.needle.rotation.z = -0.9 + a.streamEsp * 1.5 + Math.sin(this.t * 9) * 0.05 * a.streamEsp;

    // steaming
    const steaming = v.step === 'steam';
    a.pitcherLift += ((steaming ? 1 : 0) - a.pitcherLift) * Math.min(1, dt * 6);
    const L = a.pitcherLift;
    // wand depth: 0 skims the surface, 1 buries the tip
    const depth = steaming ? (1 - v.wand) : 0;
    this.pitcher.position.x = this.pitcherHome.x + (this.wandTipW.x - this.pitcherHome.x) * L;
    this.pitcher.position.z = this.pitcherHome.z + (this.wandTipW.z - this.pitcherHome.z) * L;
    this.pitcher.position.y = this.pitcherHome.y + L * (0.36 + depth * 0.62);
    this.pitcher.rotation.z = L * (0.1 + depth * 0.12);
    a.onTarget += ((steaming && v.steamOn ? 1 : 0) - a.onTarget) * Math.min(1, dt * 10);
    this.halo.material.opacity = a.onTarget * 0.85;
    this.halo.scale.setScalar(1 + a.onTarget * 0.06);
    this.pitcherMilk.scale.y = 1 + (steaming ? Math.sin(this.t * 7) * 0.03 : 0);
    if (steaming && v.steamT > 0) this.emitSteam(dt, v.steamOn);

    // cup contents
    this.setLiquid(v.liquid, v.tint);
    this.ice.visible = !!v.ice;

    // serve: the cup slides across to the customer, then a fresh one appears
    if (v.serveTick !== this.prevServe) { if (this.prevServe >= 0) a.serveT = 0; this.prevServe = v.serveTick; }
    if (a.serveT >= 0) {
      a.serveT += dt;
      const p = Math.min(1, a.serveT / 0.85);
      const e = p * p * (3 - 2 * p);
      this.cup.position.lerpVectors(this.cupHome, this.cupServe, e);
      this.cup.position.y = Math.sin(p * Math.PI) * 0.35;
      if (a.serveT > 1.15) { a.serveT = -1; this.cup.position.copy(this.cupHome); }
    } else {
      this.cup.position.copy(this.cupHome);
      this.cup.position.y = 0;
    }

    // the customer waiting at the counter
    this.customer.visible = !!v.customer;
    if (v.customer) {
      if (v.customer.id !== this.prevCustId) { this.prevCustId = v.customer.id; this.dressCustomer(v.customer); }
      a.custBob += dt;
      this.customer.position.y = Math.sin(a.custBob * 1.7) * 0.06;
      // impatience: shifting from foot to foot, faster as the bar runs down
      const fret = 1 - v.customer.patience;
      this.customer.rotation.y = 0.16 + Math.sin(a.custBob * (1.2 + fret * 5)) * 0.16 * (0.3 + fret);
      this.custHead.rotation.z = Math.sin(a.custBob * (1 + fret * 4)) * 0.11 * (0.2 + fret);
    }

    this.stepParticles(dt);
  },

  dressCustomer(c) {
    const shirts = [0x7d90ab, 0x9c7a5e, 0x6e8a71, 0x9d6e7e, 0x87789f, 0xb08a58];
    const hairs = [0x3a2a20, 0x1f1a17, 0x6b4a2a, 0x8a7a6a, 0x4a2f3a];
    const skins = [0xd7a077, 0xb87f56, 0xe8c09a, 0x8d6042];
    const h = (c.id * 2654435761) >>> 0;
    this.custBody.material = mat.matte(shirts[h % shirts.length]);
    this.custHair.material = mat.matte(hairs[(h >>> 3) % hairs.length]);
    this.custSkull.material = mat.matte(skins[(h >>> 6) % skins.length]);
    const tall = 0.85 * (0.94 + ((h >>> 9) % 100) / 100 * 0.16);
    this.customer.scale.set(0.85, tall, 0.85);
  },

  setLiquid(L, tint) {
    if (!L) L = { espresso: 0, milk: 0, foam: 0 };
    const base = this.cupInnerBase, span = this.cupInnerTop - this.cupInnerBase;
    let y = base;
    const place = (mesh, frac, colour) => {
      const h = frac * span;
      mesh.visible = h > 0.004;
      if (!mesh.visible) return;
      mesh.scale.y = h;
      mesh.position.set(0, y + h / 2, 0);
      // the taper means an upper layer is a touch wider than a lower one
      const r = 0.86 + 0.09 * ((y - base) / span);
      mesh.scale.x = mesh.scale.z = r / 0.95;
      if (colour !== undefined) mesh.material.color.setHex(colour);
      y += h;
    };
    const tintOf = { choc: 0x4b2a18, caramel: 0xb07a3c, cinn: 0xa8794a };
    place(this.layers.espresso, L.espresso, tint && tintOf[tint] ? tintOf[tint] : (L.water ? C.water : C.espresso));
    place(this.layers.milk, L.milk, C.milk);
    place(this.layers.foam, L.foam, C.foam);
  },

  updateStream(amount, liquid) {
    const s = this.espStream;
    s.visible = amount > 0.05;
    if (!s.visible) return;
    const topY = this.porta.position.y - 0.5;                          // the spout
    const fill = (liquid ? liquid.espresso + liquid.milk + liquid.foam : 0);
    const surface = this.cup.position.y + (this.cupInnerBase + fill * (this.cupInnerTop - this.cupInnerBase)) * this.cup.scale.y;
    const h = Math.max(0.06, (topY - surface) * amount);
    s.scale.set(1, h, 1);
    s.position.set(this.cup.position.x, topY - h / 2, this.cup.position.z);
    s.material.opacity = 0.6 + 0.3 * amount + Math.sin(this.t * 30) * 0.05;
  },

  emitGrounds(dt) {
    this.groundsAcc = (this.groundsAcc || 0) + dt;
    while (this.groundsAcc > 0.035) {
      this.groundsAcc -= 0.035;
      const p = this.grounds.find((q) => q.life <= 0);
      if (!p) break;
      p.life = p.ttl = 0.55;
      p.mesh.visible = true;
      p.mesh.position.set(this.grinder.position.x + (Math.random() - 0.5) * 0.18, 1.55,
        this.grinder.position.z + 1.45 + (Math.random() - 0.5) * 0.18);
      p.vx = (Math.random() - 0.5) * 0.4; p.vy = -0.2; p.vz = (Math.random() - 0.5) * 0.4;
    }
  },

  emitSteam(dt, hot) {
    this.steamAcc = (this.steamAcc || 0) + dt;
    while (this.steamAcc > 0.05) {
      this.steamAcc -= 0.05;
      const p = this.steam.find((q) => q.life <= 0);
      if (!p) break;
      p.life = p.ttl = 1.1;
      p.mesh.visible = true;
      p.mesh.position.set(
        this.pitcher.position.x + (Math.random() - 0.5) * 0.5,
        this.pitcher.position.y + 1.3,
        this.pitcher.position.z + (Math.random() - 0.5) * 0.5
      );
      p.vx = (Math.random() - 0.5) * 0.5; p.vy = 1.5 + Math.random(); p.vz = (Math.random() - 0.5) * 0.5;
      p.mesh.material.color.setHex(hot ? 0xfff3e2 : 0xe8dcd0);
    }
  },

  stepParticles(dt) {
    for (const p of this.grounds) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += 6 * dt; p.mesh.rotation.y += 4 * dt;
      if (p.mesh.position.y < this.porta.position.y + 0.1) p.life = 0.0001;
    }
    for (const p of this.steam) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const f = p.life / p.ttl;
      p.mesh.material.opacity = 0.45 * f;
      p.mesh.scale.setScalar(0.6 + (1 - f) * 1.6);
    }
  },

  /* ── presentation ───────────────────────────────────── */

  resize(w, h) {
    if (!this.ready) return;
    // a hidden pane measures 0; a clamped small world is recoverable, a zero one is not
    const W = Math.max(MIN_W, Math.round(w) || 0);
    const H = Math.max(MIN_H, Math.round(h) || 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(W, H, false);
    const aspect = W / H;
    this.camera.aspect = aspect;
    // Vertical FOV is fixed, so a portrait frame shows less of the scene's
    // width, not more of its height. Back off until the horizontal field is
    // roughly what a 16:10 frame would give.
    this.fit = Math.min(2.1, Math.max(1, 1.5 / Math.max(0.5, aspect)));
    this.camera.updateProjectionMatrix();
  },

  draw() {
    if (!this.ready) return;
    this.renderer.render(this.scene, this.camera);
  },

  // Reads the buffer inside the drawing task, which answers "did the GPU make
  // this frame" independently of whether the compositor ever showed it.
  probe() {
    if (!this.ready) return null;
    this.renderer.render(this.scene, this.camera);
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(4 * 9);
    const pts = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75],
                 [0.2, 0.8], [0.8, 0.8], [0.2, 0.2], [0.8, 0.2]];
    const out = [];
    pts.forEach((p, i) => {
      const buf = px.subarray(i * 4, i * 4 + 4);
      gl.readPixels((p[0] * w) | 0, (p[1] * h) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      out.push([buf[0], buf[1], buf[2]]);
    });
    return { size: [w, h], samples: out };
  }
};
