/* =====================================================================
 * SIRKUIT - js/scene3d.js
 * Engine Three.js WebGL: 4 Node arsitektur 3D detail, pipa jaringan,
 * animasi paket data, raycasting hotspot, HUD kamera, mode performa.
 * Di-load oleh main.js sebagai ES module (dynamic import).
 * ===================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COLORS = {
  accent: 0xe2670a,      // oranye: node Apache, tabung request, paket GET
  accentSoft: 0xf2a30c,  // amber: panah arah, lampu latar, LED status
  accentHi: 0xffd75e,    // kuning: aksen skrip PHP dan garis tinggi
  emerald: 0x34d399,     // hijau: node MySQL, paket POST, jalur response
  amber: 0xf2a30c,       // kuning-oranye: level peringatan
  rose: 0xf2668b,        // merah muda: level kritis dan paket gagal
  steel: 0x2a231c,
  grid: 0x5a4733,
  gridSub: 0x2e251d,
  bg: 0x1b1613,
};

const NODE_ACCENT = {
  client: COLORS.accentHi,
  gateway: COLORS.accent,
  backend: COLORS.accentSoft,
  database: COLORS.emerald,
};

const STEP_DEF = [
  { node: "client", title: "Browser mengirim request HTTP (form fetch, header, body JSON)", legs: [["upper", 0]], arrive: "gateway" },
  { node: "gateway", title: "Apache Web Server mencocokkan rute .htaccess dan batas trafik", legs: [["upper", 1]], arrive: "backend" },
  { node: "backend", title: "Skrip PHP memverifikasi session lalu menyusun kueri PDO", legs: [["upper", 2]], arrive: "database" },
  { node: "database", title: "MySQL/MariaDB mengeksekusi SQL terhadap tabel siswa", legs: [], arrive: "database" },
  { node: "database", title: "Response JSON mengalir balik ke client", legs: [["lower", 2], ["lower", 1], ["lower", 0]], arrive: "client" },
];

const STEP_ORDER = ["client", "gateway", "backend", "database"];

const NODE_POS = {
  client: new THREE.Vector3(-10, 0.35, 1.5),  gateway: new THREE.Vector3(-3.4, 0.35, -1.2),
  backend: new THREE.Vector3(3.4, 0.35, -1.2),
  database: new THREE.Vector3(10, 0.35, 1.5),
};

const LABELS = {
  client: { main: "1. CLIENT (Browser / Frontend UI)", sub: "Form HTML + fetch() | Origin sekolah" },
  gateway: { main: "2. WEB SERVER (Apache)", sub: ".htaccess + mod_rewrite | Rate Limit" },
  backend: { main: "3. BACKEND PHP", sub: "PHP 8 + session & PDO Statement" },
  database: { main: "4. DATABASE MySQL", sub: "MariaDB / phpMyAdmin" },
};

function makeLabelSprite(main, sub) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 1024, 220);
  ctx.font = "700 44px 'Plus Jakarta Sans', 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#f7f1e6";
  ctx.shadowColor = "rgba(242,163,12,0.85)";
  ctx.shadowBlur = 18;
  ctx.fillText(main, 512, 72);
  ctx.shadowBlur = 0;
  ctx.font = "500 30px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#ffd75e";
  ctx.fillText(sub, 512, 132);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(9.4, 2.0, 1);
  return sprite;
}

function screenTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#17120f";
  ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = "rgba(242,163,12,0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, 484, 292);
  ctx.fillStyle = "#e2670a";
  ctx.fillRect(14, 14, 484, 40);
  ctx.fillStyle = "#f7f1e6";
  ctx.font = "700 22px monospace";
  ctx.fillText("SIRKUIT - Rapor Digital SMKN 1 Mejayan", 28, 42);
  ctx.strokeStyle = "rgba(255,215,94,0.5)";
  ctx.lineWidth = 1.5;
  for (let y = 84; y < 292; y += 28) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(30 + 120 + Math.random() * 300, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#34d399";
  ctx.fillRect(30, 250, 90, 26);
  ctx.fillRect(135, 250, 60, 26);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

class Scene3DEngine {
  constructor() {
    this.ready = false;
    this.mode = "high";
    this.nodes = {};
    this.health = { client: "normal", gateway: "normal", backend: "normal", database: "normal" };
    this._packets = [];
    this._bursts = [];
    this._rings = {};
    this._shockwaves = [];
    this._cameraAnim = null;
    this._fpsFrames = 0;
    this._fpsTime = performance.now();
    this._aborted = false;
    this._runId = 0;
    this._floatLabels = [];
    this.busy = false;
    this.onFps = null;
    this.onNodeClick = null;
  }

  init(container) {
    this.container = container;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 620;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(w, h);
    this._applyPixelRatio();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(COLORS.bg, 0.016);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 220);
    this.camera.position.set(0, 10.5, 21);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.target.set(0, 1.6, 0);

    // ---- Lighting
    this.scene.add(new THREE.AmbientLight(0x5a4636, 1.15));
    const dir = new THREE.DirectionalLight(0xffe0b0, 1.25);
    dir.position.set(8, 16, 10);
    dir.castShadow = this.mode === "high";
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -18; dir.shadow.camera.right = 18;
    dir.shadow.camera.top = 18; dir.shadow.camera.bottom = -18;
    this.dirLight = dir;
    this.scene.add(dir);
    const cyanPt = new THREE.PointLight(COLORS.accentSoft, 26, 42, 1.8);
    cyanPt.position.set(-10, 6, 4);
    this.scene.add(cyanPt);
    const emeraldPt = new THREE.PointLight(COLORS.emerald, 22, 40, 1.8);
    emeraldPt.position.set(10, 5.5, 3);
    this.scene.add(emeraldPt);

    // ---- Cyber grid floor
    const grid = new THREE.GridHelper(90, 90, COLORS.grid, COLORS.gridSub);
    grid.position.y = -0.9;
    grid.material.transparent = true;
    grid.material.opacity = 0.85;
    this.scene.add(grid);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: 0x0f0c0a, roughness: 0.92, metalness: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.92;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ---- Build nodes
    ["client", "gateway", "backend", "database"].forEach((id) => this._buildNode(id));

    // ---- Tubes + curves
    this._buildConduits();

    // ---- Ambient floating particles
    this._buildParticles();

    // ---- Raycasting
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._onPointerDown = (e) => this._handlePointer(e);
    this.renderer.domElement.addEventListener("pointerdown", this._onPointerDown);

    window.addEventListener("resize", () => this.resize());

    this.clock = new THREE.Clock();
    this._animate();
    this.ready = true;
  }

  _applyPixelRatio() {
    const pr = this.mode === "high" ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.25);
    if (this.renderer) this.renderer.setPixelRatio(pr);
  }

  _hexPedestal(radius) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.08, 0.34, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a231c, metalness: 0.75, roughness: 0.35 })
    );
    base.castShadow = this.mode === "high";
    base.receiveShadow = true;
    group.add(base);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.94, 0.045, 10, 6),
      new THREE.MeshStandardMaterial({ color: COLORS.accentSoft, emissive: COLORS.accentSoft, emissiveIntensity: 2.2 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.19;
    group.add(rim);
    return group;
  }

  _buildNode(id) {
    const pos = NODE_POS[id];
    const root = new THREE.Group();
    root.position.copy(pos);
    root.userData.nodeId = id;

    const pedestal = this._hexPedestal(id === "client" ? 2.1 : 1.9);
    root.add(pedestal);

    const accent = NODE_ACCENT[id];
    const glowMat = new THREE.MeshStandardMaterial({
      color: COLORS.accent, emissive: accent, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.95,
    });
    root.userData.glowMats = [glowMat];
    root.userData.glowBase = 1.0;
    root.userData.accent = accent;
    this._pendingLeds = [];

    if (id === "client") this._buildClient(root, glowMat);
    if (id === "gateway") this._buildGateway(root, glowMat);
    if (id === "backend") this._buildBackend(root, glowMat);
    if (id === "database") this._buildDatabase(root, glowMat);
    root.userData.leds = this._pendingLeds;
    this._pendingLeds = [];

    // health ring (di atas pedestal)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.35, 0.05, 8, 40),
      new THREE.MeshBasicMaterial({ color: COLORS.emerald, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.22;
    root.add(ring);
    this._rings[id] = ring;

    const label = makeLabelSprite(LABELS[id].main, LABELS[id].sub);
    label.position.y = id === "backend" ? 6.6 : 6.1;
    root.add(label);
    root.userData.label = label;

    // invisible hit proxy untuk raycast yang lega
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 6.2, 4.4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.y = 2.6;
    proxy.userData.nodeId = id;
    root.add(proxy);

    this.scene.add(root);
    this.nodes[id] = root;
  }

  _metal(color, roughness = 0.3) {
    return new THREE.MeshStandardMaterial({ color, metalness: 0.82, roughness });
  }

  _glow(color, intensity = 1.6, opacity = 1) {
    return new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: intensity,
      transparent: opacity < 1, opacity, metalness: 0.4, roughness: 0.25,
    });
  }

  _led(parent, x, y, z, color, size = 0.05) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), this._glow(color, 2.6));
    led.position.set(x, y, z);
    parent.add(led);
    this._pendingLeds.push(led);
    return led;
  }

  _cable(parent, from, to, color, radius = 0.05) {
    const mid = from.clone().lerp(to, 0.5);
    mid.y -= 0.5;
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 6, false), this._glow(color, 0.5, 0.85));
    parent.add(mesh);
    return mesh;
  }

  _buildClient(root, glowMat) {
    const accent = NODE_ACCENT.client;
    const body = this._metal(0x2f2a22, 0.28);
    const dark = this._metal(0x191511, 0.55);

    // meja laboratorium
    const desk = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 2.1), dark);
    desk.position.set(0, 0.62, 0.25);
    desk.receiveShadow = this.mode === "high";
    root.add(desk);
    [[-1.6, -0.65], [1.6, -0.65], [-1.6, 1.15], [1.6, 1.15]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), body);
      leg.position.set(x, 0.3, z);
      root.add(leg);
    });

    // laptop: badan, layar, baris keyboard, trackpad
    const laptop = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.13, 1.55), body);
    base.castShadow = this.mode === "high";
    laptop.add(base);
    for (let r = 0; r < 4; r += 1) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.02, 0.09), this._glow(accent, 0.55, 0.7));
      row.position.set(-0.05, 0.08, -0.45 + r * 0.17);
      laptop.add(row);
    }
    const trackpad = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.4), this._glow(COLORS.accentHi, 0.4, 0.55));
    trackpad.position.set(0.0, 0.08, 0.44);
    laptop.add(trackpad);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.1), body);
    frame.position.set(0, 0.76, -0.74);
    frame.rotation.x = -0.12;
    laptop.add(frame);
    const screenTex = screenTexture();
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.16, 1.28),
      new THREE.MeshStandardMaterial({ map: screenTex, emissive: COLORS.accentHi, emissiveIntensity: 0.5, emissiveMap: screenTex })
    );
    screen.position.set(0, 0.76, -0.68);
    screen.rotation.x = -0.12;
    laptop.add(screen);
    laptop.position.set(-0.4, 1.3, 0.15);
    laptop.rotation.y = 0.32;
    root.add(laptop);

    // monitor kedua di belakang laptop
    const mon = new THREE.Group();
    const monFrame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.2, 0.09), body);
    monFrame.castShadow = this.mode === "high";
    mon.add(monFrame);
    const monScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.04), this._glow(accent, 0.7, 0.9));
    monScreen.position.z = 0.05;
    mon.add(monScreen);
    for (let i = 0; i < 5; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.02), this._glow(i % 2 ? COLORS.emerald : COLORS.accentHi, 1.2, 0.85));
      bar.position.set(-0.62 + i * 0.3, -0.14, 0.07);
      mon.add(bar);
    }
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.55, 10), dark);
    stand.position.y = -0.85;
    mon.add(stand);
    mon.position.set(1.05, 2.35, -0.75);
    mon.rotation.y = -0.42;
    root.add(mon);

    // smartphone
    const phone = new THREE.Group();
    const pbody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.24, 0.08), body);
    pbody.castShadow = this.mode === "high";
    phone.add(pbody);
    const pscr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.08), this._glow(accent, 0.95, 0.95));
    pscr.position.z = 0.045;
    phone.add(pscr);
    const pcap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.02), this._glow(COLORS.emerald, 1.4, 0.9));
    pcap.position.set(0, 0.22, 0.05);
    phone.add(pcap);
    phone.position.set(1.62, 1.3, 0.72);
    phone.rotation.y = -0.55;
    phone.rotation.x = -0.08;
    root.add(phone);

    // menara WiFi kecil + gelombang sinyal
    const tower = new THREE.Group();
    const tbase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.34, 12), dark);
    tower.add(tbase);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 8), body);
    mast.position.y = 0.6;
    tower.add(mast);
    for (let i = 0; i < 3; i += 1) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2 + i * 0.16, 0.018, 6, 24, Math.PI * 1.1), this._glow(accent, 1.5 - i * 0.35, 0.9 - i * 0.18));
      arc.position.y = 1.05;
      arc.rotation.y = 0.6;
      arc.rotation.z = 0.4;
      tower.add(arc);
    }
    this._led(tower, 0, 0.18, 0.26, COLORS.emerald, 0.04);
    tower.position.set(-1.62, 0.72, 0.85);
    root.add(tower);

    // CPU desktop di sisi pedestal
    const cpu = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.5, 0.72), this._metal(0x292319, 0.35));
    cpu.position.set(-1.72, 1.4, -0.85);
    cpu.castShadow = this.mode === "high";
    root.add(cpu);
    for (let i = 0; i < 4; i += 1) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.02), this._glow(accent, 1.1, 0.85));
      slit.position.set(-1.72, 0.85 + i * 0.26, -0.49);
      root.add(slit);
    }

    // kabel dari meja ke tepi pedestal
    this._cable(root, new THREE.Vector3(-0.4, 0.68, 0.95), new THREE.Vector3(1.5, 0.2, 1.6), accent, 0.04);
    this._cable(root, new THREE.Vector3(1.55, 0.68, 0.6), new THREE.Vector3(1.85, 0.2, -0.7), COLORS.emerald, 0.035);
    root.userData.fans = [];
    root.userData.orbits = [];
    root.userData.chipGroup = null;
  }

  _buildGateway(root, glowMat) {
    const accent = NODE_ACCENT.gateway;
    const shell = this._metal(0x292319, 0.26);
    root.userData.fans = [];

    // menara router berlapis
    for (let i = 0; i < 3; i += 1) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.0 - i * 0.07, 1.14 - i * 0.07, 1.0, 6), shell);
      drum.position.y = 0.9 + i * 1.08;
      drum.rotation.y = i * 0.18;
      drum.castShadow = this.mode === "high";
      root.add(drum);
      const seam = new THREE.Mesh(new THREE.TorusGeometry(1.05 - i * 0.07, 0.035, 6, 6), this._glow(accent, 1.5, 0.9));
      seam.rotation.x = Math.PI / 2;
      seam.position.y = 0.42 + i * 1.08;
      root.add(seam);
    }

    // celah panel menyala
    for (let i = 0; i < 6; i += 1) {
      const ang = (i / 6) * Math.PI * 2 + 0.52;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 2.5), this._glow(i % 2 ? COLORS.accentHi : accent, 0.85, 0.35));
      panel.position.set(Math.sin(ang) * 1.06, 2.1, Math.cos(ang) * 1.06);
      panel.rotation.y = ang;
      root.add(panel);
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.06), this._metal(0x191511, 0.6));
      port.position.set(Math.sin(ang) * 1.02, 0.66, Math.cos(ang) * 1.02);
      port.rotation.y = ang;
      root.add(port);
      this._led(root, Math.sin(ang) * 1.02, 0.86, Math.cos(ang) * 1.02, i === 4 ? COLORS.amber : COLORS.emerald, 0.035);
    }

    // perisai pelindung (wireframe)
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 0), new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.4 }));
    shield.position.y = 4.4;
    root.add(shield);
    root.userData.orbits = [shield];

    // inti router
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.74, 0), this._glow(accent, 1.15));
    core.position.y = 4.4;
    root.add(core);
    root.userData.core = core;

    // cincin orbital
    const ringMat = this._glow(COLORS.accentHi, 1.7, 0.95);
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.045, 8, 48), ringMat);
    ringA.position.y = 4.4;
    ringA.rotation.x = 1.15;
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.035, 8, 40), ringMat.clone());
    ringB.position.y = 4.4;
    ringB.rotation.z = 0.9;
    const ringC = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.025, 6, 44), this._glow(COLORS.emerald, 1.2, 0.7));
    ringC.position.y = 4.4;
    ringC.rotation.x = -0.5;
    root.add(ringA, ringB, ringC);
    root.userData.orbits.push(ringA, ringB, ringC);

    // antena dan lampu puncak
    [[-0.55, 0.35], [0.55, -0.35], [0, -0.62]].forEach(([x, z], i) => {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.05, 1.0 + i * 0.18, 6), this._metal(0x2f2a22, 0.4));
      ant.position.set(x, 5.3 + i * 0.09, z);
      ant.rotation.x = z * 0.5;
      root.add(ant);
      this._led(root, x, 5.85 + i * 0.18, z, i === 1 ? COLORS.amber : accent, 0.06);
    });
  }

  _buildBackend(root, glowMat) {
    const accent = NODE_ACCENT.backend;
    const frame = this._metal(0x2a231c, 0.3);
    root.userData.fans = [];
    root.userData.blades = [];

    // kerangka rak dengan rel sisi
    const rack = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.7, 1.7), frame);
    rack.position.y = 2.65;
    rack.castShadow = this.mode === "high";
    root.add(rack);
    [-1.3, 1.3].forEach((x) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 4.9, 0.09), this._glow(accent, 0.8, 0.75));
      rail.position.set(x, 2.65, 0.86);
      root.add(rail);
    });
    const topGrille = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.6), this._metal(0x191511, 0.6));
    topGrille.position.y = 5.05;
    root.add(topGrille);
    for (let i = 0; i < 8; i += 1) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 1.3), this._glow(COLORS.accentHi, 0.6, 0.6));
      slot.position.set(-0.95 + i * 0.27, 5.11, 0);
      root.add(slot);
    }

    // blade server
    for (let i = 0; i < 5; i += 1) {
      const blade = new THREE.Group();
      const bbody = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.72, 1.55), this._metal(0x362e24, 0.36));
      blade.add(bbody);
      for (let j = 0; j < 3; j += 1) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.04), this._glow(accent, 0.7, 0.7));
        vent.position.set(-0.35 + j * 0.36, 0.2, 0.79);
        blade.add(vent);
      }
      const isFaultRow = i === 2;
      for (let j = 0; j < 4; j += 1) {
        this._led(blade, -0.9 + j * 0.15, -0.18, 0.79, isFaultRow && j === 3 ? COLORS.rose : COLORS.emerald, 0.045);
      }
      // kipas dengan tiga sudu
      const fanHub = new THREE.Group();
      for (let s = 0; s < 3; s += 1) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.02), this._glow(accent, 0.55, 0.8));
        spoke.rotation.z = (s / 3) * Math.PI * 2;
        fanHub.add(spoke);
      }
      fanHub.position.set(0.66, 0, 0.8);
      blade.add(fanHub);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 18), glowMat);
      rim.position.set(0.66, 0, 0.8);
      blade.add(rim);
      root.userData.fans.push(fanHub);

      blade.position.y = 1.05 + i * 0.92;
      root.add(blade);
      root.userData.blades.push(blade);
    }

    // strip depan + kotak edge function mengapung
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.055, 0.06), this._glow(accent, 1.4, 0.9));
    strip.position.set(0, 0.68, 0.85);
    root.add(strip);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.75 }));
    cube.position.set(-1.9, 3.4, 0.2);
    root.add(cube);
    const cubeCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this._glow(COLORS.emerald, 1.6, 0.9));
    cubeCore.position.copy(cube.position);
    root.add(cubeCore);
    root.userData.orbits = [cube];
    root.userData.core = null;
    root.userData.chipGroup = null;

    // kabel backend ke rak tetangga
    this._cable(root, new THREE.Vector3(1.15, 1.1, 0.86), new THREE.Vector3(1.72, 0.2, 1.35), COLORS.emerald, 0.04);
    this._cable(root, new THREE.Vector3(-1.15, 1.3, 0.86), new THREE.Vector3(-1.72, 0.2, 1.35), accent, 0.04);
  }

  _buildDatabase(root, glowMat) {
    const accent = NODE_ACCENT.database;
    const accentGateway = NODE_ACCENT.gateway;
    const steel = this._metal(0x2a231c, 0.3);
    const emeraldMat = this._glow(accent, 0.9);
    root.userData.glowMats.push(emeraldMat);
    root.userData.fans = [];

    // tumpukan piringan dengan alur data
    for (let i = 0; i < 4; i += 1) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.56, 40), steel);
      disc.position.y = 1.1 + i * 0.8;
      disc.castShadow = this.mode === "high";
      root.add(disc);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.045, 8, 44), emeraldMat);
      edge.rotation.x = Math.PI / 2;
      edge.position.y = 1.1 + i * 0.8;
      root.add(edge);
      const seam = new THREE.Mesh(new THREE.CylinderGeometry(1.47, 1.47, 0.04, 40), emeraldMat);
      seam.position.y = 1.38 + i * 0.8;
      root.add(seam);
      for (let k = 0; k < 3; k += 1) {
        const groove = new THREE.Mesh(new THREE.TorusGeometry(0.5 + k * 0.35, 0.014, 6, 32), this._glow(accentGateway, 0.9, 0.7));
        groove.rotation.x = Math.PI / 2;
        groove.position.y = 1.39 + i * 0.8;
        root.add(groove);
      }
      this._led(root, 1.2, 1.1 + i * 0.8, 0.65, i === 1 ? COLORS.amber : COLORS.emerald, 0.04);
    }

    // pilar replika di sekeliling
    for (let i = 0; i < 3; i += 1) {
      const ang = (i / 3) * Math.PI * 2 + 0.4;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), this._metal(0x362e24, 0.45));
      pillar.position.set(Math.sin(ang) * 1.95, 1.7, Math.cos(ang) * 1.95);
      root.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), this._glow(accent, 1.3, 0.9));
      cap.position.set(Math.sin(ang) * 1.95, 3.05, Math.cos(ang) * 1.95);
      root.add(cap);
    }

    // inti bercahaya + cincin data + kubah
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 3.1, 20),
      new THREE.MeshStandardMaterial({ color: 0x6ee7b7, emissive: 0x6ee7b7, emissiveIntensity: 2.0, transparent: true, opacity: 0.85 })
    );
    core.position.y = 2.3;
    root.add(core);
    root.userData.core = core;

    const orbitMat = this._glow(accentGateway, 1.5, 0.85);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.038, 8, 60), orbitMat);
    ring.rotation.x = Math.PI / 2.4;
    ring.position.y = 2.3;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.025, 6, 48), this._glow(accent, 1.2, 0.75));
    ring2.rotation.x = Math.PI / 1.8;
    ring2.position.y = 2.3;
    root.add(ring, ring2);
    root.userData.orbits = [ring, ring2];

    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), emeraldMat);
    dome.position.y = 3.9;
    root.add(dome);

    // baris data mengaplingi tabel
    const chips = new THREE.Group();
    const chipCount = this.mode === "high" ? 14 : 6;
    for (let i = 0; i < chipCount; i += 1) {
      const a = (i / chipCount) * Math.PI * 2;
      const chip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), this._glow(i % 3 === 0 ? accent : accentGateway, 1.2, 0.9));
      chip.position.set(Math.cos(a) * 2.45, 1.0 + (i % 4) * 0.7, Math.sin(a) * 2.45);
      chip.rotation.y = -a;
      chips.add(chip);
    }
    chips.position.y = 0.4;
    root.add(chips);
    root.userData.chipGroup = chips;

    this._cable(root, new THREE.Vector3(-1.25, 1.0, 0.8), new THREE.Vector3(-1.8, 0.2, 1.3), accent, 0.045);
  }

  _buildConduits() {
    const ids = ["client", "gateway", "backend", "database"];
    this.curves = {
      upper: [], // request: client -> gateway -> backend -> database
      lower: [], // response: database -> backend -> gateway -> client
    };
    const tubeMatUpper = new THREE.MeshStandardMaterial({
      color: COLORS.accent, emissive: COLORS.accent, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.22, metalness: 0.3, roughness: 0.4,
    });
    const tubeMatLower = new THREE.MeshStandardMaterial({
      color: COLORS.emerald, emissive: COLORS.emerald, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.2, metalness: 0.3, roughness: 0.4,
    });
    this.tubeMats = { upper: tubeMatUpper, lower: tubeMatLower };

    for (let i = 0; i < 3; i += 1) {
      const a = NODE_POS[ids[i]];
      const b = NODE_POS[ids[i + 1]];
      const mid = a.clone().lerp(b, 0.5);
      // jalur atas (request)
      const up = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x, a.y + 3.0, a.z),
        new THREE.Vector3(mid.x, mid.y + 4.4, mid.z - 0.3),
        new THREE.Vector3(b.x, b.y + 3.0, b.z),
      ]);
      this.curves.upper.push({ curve: up, from: ids[i], to: ids[i + 1] });
      const tubeUp = new THREE.Mesh(new THREE.TubeGeometry(up, 40, 0.16, 10, false), tubeMatUpper);
      this.scene.add(tubeUp);
      // anak panah arah arus pada jalur atas
      for (let k = 1; k <= 3; k += 1) {
        const t = k / 4;
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), new THREE.MeshStandardMaterial({ color: COLORS.accentSoft, emissive: COLORS.accentSoft, emissiveIntensity: 2 }));
        const p = up.getPointAt(t);
        const tangent = up.getTangentAt(t);
        arrow.position.copy(p);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
        this.scene.add(arrow);
      }
      // jalur bawah (response)
      const low = new THREE.CatmullRomCurve3([
        new THREE.Vector3(b.x, b.y + 0.55, b.z + 1.6),
        new THREE.Vector3(mid.x, mid.y + 0.42, mid.z + 2.1),
        new THREE.Vector3(a.x, a.y + 0.55, a.z + 1.6),
      ]);
      this.curves.lower.push({ curve: low, from: ids[i + 1], to: ids[i] });
      const tubeLow = new THREE.Mesh(new THREE.TubeGeometry(low, 40, 0.14, 10, false), tubeMatLower);
      this.scene.add(tubeLow);
      for (let k = 1; k <= 3; k += 1) {
        const t = k / 4;
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 8), new THREE.MeshStandardMaterial({ color: COLORS.emerald, emissive: COLORS.emerald, emissiveIntensity: 1.8 }));
        const p = low.getPointAt(t);
        const tangent = low.getTangentAt(t);
        arrow.position.copy(p);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
        this.scene.add(arrow);
      }
    }

    // label jalur
    const upLabel = makeLabelSprite("JALUR ATAS - HTTP Request (JSON) & SQL Query", "");
    upLabel.scale.set(8.2, 1.4, 1);
    upLabel.position.set(0, 6.6, -3.2);
    this.scene.add(upLabel);
    const lowLabel = makeLabelSprite("JALUR BAWAH - Data Result (JSON) & HTTP Response", "");
    lowLabel.scale.set(8.2, 1.4, 1);
    lowLabel.position.set(0, -0.35, 4.4);
    this.scene.add(lowLabel);
  }

  _buildParticles() {
    const count = this.mode === "high" ? 340 : 90;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 46;
      arr[i * 3 + 1] = Math.random() * 14 + 0.5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: COLORS.accentSoft, size: 0.09, transparent: true, opacity: 0.55 })
    );
    this.scene.add(this.particles);
  }

  /* ---------------- Health & status ---------------- */
  setNodeHealth(nodeId, level) {
    if (!this.nodes[nodeId]) return;
    this.health[nodeId] = level;
    const color = level === "normal" ? COLORS.emerald : level === "warning" ? COLORS.amber : COLORS.rose;
    const ring = this._rings[nodeId];
    if (ring) ring.material.color.setHex(color);
    const glow = this.nodes[nodeId].userData.glowMats || [];
    glow.forEach((m) => {
      m.emissive.setHex(level === "critical" ? COLORS.rose : level === "warning" ? COLORS.amber : NODE_ACCENT[nodeId] ?? COLORS.accent);
      m.emissiveIntensity = level === "normal" ? 1.0 : 1.8;
    });
    if (level === "critical") this.spawnShockwave(nodeId, COLORS.rose);
  }

  setAllHealth(level) {
    Object.keys(this.nodes).forEach((id) => this.setNodeHealth(id, level));
  }

  spawnShockwave(nodeId, colorHex = COLORS.rose) {
    const pos = NODE_POS[nodeId].clone();
    pos.y += 2.2;
    const ringGeo = new THREE.RingGeometry(0.4, 0.55, 48);
    const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
    ringMesh.position.copy(pos);
    this.scene.add(ringMesh);
    this._shockwaves.push({ mesh: ringMesh, life: 1 });
  }

  /* ---------------- Packet animation ---------------- */
  _packetLabel(text, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.font = "700 38px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillText(text, 256, 58);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(4.6, 0.9, 1);
    return sprite;
  }

  _spawnPacket(colorHex) {
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 2.6, metalness: 0.4, roughness: 0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);

    // trail partikel
    const trailCount = this.mode === "high" ? 46 : 16;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(trailCount * 3), 3));
    const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ color: colorHex, size: 0.12, transparent: true, opacity: 0.8 }));
    this.scene.add(trail);

    const pkt = { mesh, trail, trailCount, history: [], dying: false };
    this._packets.push(pkt);
    return pkt;
  }

  _burstPacket(pkt, position, colorHex, count = 60) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = position.x; arr[i * 3 + 1] = position.y; arr[i * 3 + 2] = position.z;
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 0.24, (Math.random() - 0.2) * 0.2, (Math.random() - 0.5) * 0.24));
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: colorHex, size: 0.16, transparent: true, opacity: 1 }));
    this.scene.add(pts);
    this._bursts.push({ pts, vel, life: 1 });
  }

  _removePacket(pkt) {
    this.scene.remove(pkt.mesh, pkt.trail);
    pkt.mesh.geometry.dispose();
    pkt.trail.geometry.dispose();
    const i = this._packets.indexOf(pkt);
    if (i >= 0) this._packets.splice(i, 1);
  }

  _walk(pkt, segment, speed, labelFn, tStart = 0, tEnd = 1) {
    return new Promise((resolve) => {
      const dur = segment.curve.getLength() / (2.6 * speed);
      const start = performance.now();
      let label = null;
      const walk = () => {
        if (this._aborted) {
          if (label) { this.scene.remove(label); label.material.map.dispose(); }
          resolve(null);
          return;
        }
        const elapsed = (performance.now() - start) / 1000;
        const t = Math.min(elapsed / dur, 1);
        const tt = tStart + (tEnd - tStart) * t;
        const p = segment.curve.getPointAt(tt);
        pkt.mesh.position.copy(p);
        pkt.mesh.rotation.x += 0.08;
        pkt.mesh.rotation.y += 0.1;
        pkt.history.unshift(p.clone());
        if (pkt.history.length > pkt.trailCount) pkt.history.pop();
        const posAttr = pkt.trail.geometry.getAttribute("position");
        for (let i = 0; i < pkt.trailCount; i += 1) {
          const h = pkt.history[Math.min(i, pkt.history.length - 1)] || p;
          posAttr.setXYZ(i, h.x, h.y, h.z);
        }
        posAttr.needsUpdate = true;
        if (label) { label.position.copy(p); label.position.y += 0.85; }
        if (t >= 1) {
          if (label) { this.scene.remove(label); label.material.map.dispose(); }
          resolve(p.clone());
          return;
        }
        const nextLabel = labelFn ? labelFn(t) : null;
        if (nextLabel && (!label || label.userData.key !== nextLabel.key)) {
          if (label) { this.scene.remove(label); label.material.map.dispose(); }
          label = this._packetLabel(nextLabel.text, nextLabel.color);
          label.userData.key = nextLabel.key;
          this.scene.add(label);
        }
        requestAnimationFrame(walk);
      };
      requestAnimationFrame(walk);
    });
  }

  /**
   * Jalankan animasi request/response penuh.
   * opts: { method, status, speed, faultNode, labels: {request, sql, response} }
   * status === 200 -> perjalanan penuh pulang-pergi.
   * selain itu -> paket pecah di node kegagalan.
   */
  async sendRequest(opts) {
    if (!this.ready || this.busy) return;
    const speed = opts.speed || 1;
    this._aborted = false;
    this.busy = true;
    const methodColor = { GET: COLORS.accent, POST: COLORS.emerald, PUT: COLORS.amber, DELETE: COLORS.rose }[opts.method] || COLORS.accent;
    const isError = opts.status !== 200;
    const level = !isError ? "normal" : [401, 429].includes(opts.status) ? "warning" : "critical";
    const faultIdx = ["gateway", "backend", "database"].indexOf(opts.faultNode || "gateway");

    this.setAllHealth("normal");
    if (isError) {
      this.setNodeHealth(opts.faultNode || "gateway", level);
      if (opts.faultNode === "database") this.setNodeHealth("backend", "warning");
    }

    const reqLabels = [
      { key: "req", text: `[${opts.method}] Request JSON`, color: "#ffd75e" },
      { key: "sql", text: opts.labels?.sql || `[SQL] SELECT * FROM siswa`, color: "#6ee7b7" },
      { key: "fwd", text: `[PHP] Route -> Session -> Query`, color: "#ffd75e" },
    ];

    // ---- Request: client -> ... (berhenti di fault node)
    let pkt = this._spawnPacket(methodColor);
    let lastPos = null;
    for (let s = 0; s <= 2; s += 1) {
      if (isError && s > faultIdx) break;
      const seg = this.curves.upper[s];
      const isLastLeg = isError ? s === faultIdx : s === 2;
      lastPos = await this._walk(
        pkt,
        seg,
        speed,
        (t) => {
          if (t < 0.02) return reqLabels[0];
          if (isLastLeg && !isError && t > 0.45) return reqLabels[1];
          return s === 0 ? reqLabels[0] : s === 1 ? reqLabels[2] : reqLabels[1];
        },
        0,
        1
      );
      if (this._aborted) { this._removePacket(pkt); this.busy = false; return; }
      if (isError && s === faultIdx) {
        // pecah menjadi partikel merah + shockwave
        this._burstPacket(pkt, lastPos, COLORS.rose, this.mode === "high" ? 80 : 30);
        this.spawnShockwave(seg.to, COLORS.rose);
        const err = this._packetLabel(`${opts.status} - ditolak di ${LABELS[seg.to].main.split("(")[0].trim()}`, "#f2668b");
        this._floatLabel(err, lastPos, 2600 / speed);
        this._removePacket(pkt);
        this._settleErrorNode(seg.to, level);
        this.busy = false;
        return;
      }
    }
    this._removePacket(pkt);

    if (isError) { this.busy = false; return; }

    // pulse kueri di database
    this.setNodeHealth("database", "normal");
    this.nodes.database.userData.core.scale.set(1.6, 1.2, 1.6);
    setTimeout(() => this.nodes.database?.userData.core?.scale.set(1, 1, 1), 380);

    // ---- Response: database -> client via jalur bawah
    const resLabels = [
      { key: "res", text: opts.labels?.response || `[200 OK] Response JSON`, color: "#6ee7b7" },
      { key: "res2", text: `[200 OK] HTTP Response -> Render UI`, color: "#34d399" },
    ];
    pkt = this._spawnPacket(COLORS.emerald);
    for (let s = 2; s >= 0; s -= 1) {
      const seg = this.curves.lower[s];
      lastPos = await this._walk(pkt, seg, speed, (t) => (t > 0.55 ? resLabels[1] : resLabels[0]), 0, 1);
      if (this._aborted) { this._removePacket(pkt); this.busy = false; return; }
    }
    this._removePacket(pkt);
    this.busy = false;
  }

  /* ---------------- Langkah proses individual (tombol per-tahap) ---------------- */

  _floatLabel(sprite, position, ms) {
    sprite.position.copy(position);
    sprite.position.y += 1.35;
    this.scene.add(sprite);
    const entry = { sprite, timer: setTimeout(() => this._dropFloat(sprite), ms) };
    this._floatLabels.push(entry);
    return sprite;
  }

  _dropFloat(sprite) {
    this.scene.remove(sprite);
    if (sprite.material.map) sprite.material.map.dispose();
    const i = this._floatLabels.findIndex((f) => f.sprite === sprite);
    if (i >= 0) this._floatLabels.splice(i, 1);
  }

  _pulseNode(nodeId, colorHex) {
    this.spawnShockwave(nodeId, colorHex);
    const g = this.nodes[nodeId];
    if (!g) return;
    (g.userData.glowMats || []).forEach((m) => {
      m.emissiveIntensity = 3.4;
      setTimeout(() => { m.emissiveIntensity = g.userData.glowBase ?? 1.1; }, 520);
    });
    if (nodeId === "database" && g.userData.core) {
      g.userData.core.scale.set(1.55, 1.25, 1.55);
      setTimeout(() => this.nodes.database?.userData.core?.scale.set(1, 1, 1), 460);
    }
  }

  /**
   * Menjalankan satu tahap proses saja (dipakai tombol "Jalankan Proses per Langkah").
   * step 0..3 = tahap request, step 4 = response mengalir balik ke client.
   * opts: { speed, method, status, faultNode, labels: { sql } }
   */
  async runStep(step, opts = {}) {
    if (!this.ready) return { ok: false, batal: true };
    const def = STEP_DEF[step];
    if (!def) return { ok: false, batal: true };
    const speed = opts.speed || 1;
    const isError = !!opts.status && opts.status !== 200;
    const level = [401, 429].includes(opts.status) ? "warning" : "critical";

    this._aborted = false;
    this.busy = true;

    const hasil = { step, node: def.node, judul: def.title, ok: true, batal: false, tidakTercapai: false, respons: null };
    const idx = (n) => STEP_ORDER.indexOf(n);
    const penghambat = isError ? idx(opts.faultNode) : -1;
    const tunggu = (ms) => new Promise((r) => setTimeout(r, ms / speed));

    // tahap 5 (response): sumber payload error adalah node penghambat, bukan database
    let nodeAksi = def.node;
    let legs = def.legs;
    if (step === 4 && penghambat >= 0) {
      nodeAksi = STEP_ORDER[penghambat];
      legs = def.legs.filter(([jenis, leg]) => idx(this.curves[jenis][leg].from) <= penghambat);
    }
    const aktor = idx(nodeAksi);
    const accent = NODE_ACCENT[nodeAksi] ?? COLORS.accent;
    this.focusNode(nodeAksi);
    this._pulseNode(nodeAksi, accent);

    // tahap setelah node penghambat tidak pernah tersentuh request
    if (step !== 4 && penghambat >= 0 && aktor > penghambat) {
      await tunggu(450);
      this.busy = false;
      return { ...hasil, ok: false, tidakTercapai: true, respons: opts.status };
    }

    // tahap 3: database mengeksekusi kueri, paket tidak berpindah node
    if (def.legs.length === 0) {
      const sql = opts.labels?.sql || "[SQL] SELECT * FROM siswa";
      const pos = NODE_POS[def.node].clone();
      pos.y += 4.6;
      this._floatLabel(this._packetLabel(sql, "#6ee7b7"), pos, 2400 / speed);
      if (penghambat === aktor) {
        const pos2 = NODE_POS[def.node].clone();
        pos2.y += 3.2;
        this._burstAt(def.node, COLORS.rose);
        this._floatLabel(this._packetLabel(`${opts.status} - kueri ditolak database`, "#f2668b"), pos2, 2600 / speed);
        this.setNodeHealth(def.node, level);
        await tunggu(1400);
        this.busy = false;
        return { ...hasil, ok: false, respons: opts.status };
      }
      await tunggu(1400);
      this.busy = false;
      return hasil;
    }

    // tahap 4 (response) selalu mengalir balik; saat gagal, yang kembali adalah payload error
    const tolakDiSini = isError && penghambat === aktor && step !== 4;
    const warna = step === 4 ? (isError ? COLORS.rose : COLORS.emerald) : ({ GET: COLORS.accent, POST: COLORS.emerald, PUT: COLORS.amber, DELETE: COLORS.rose }[opts.method] || COLORS.accent);
    if (tolakDiSini) {
      const pos = NODE_POS[nodeAksi].clone();
      pos.y += 3.0;
      const pkt = this._spawnPacket(warna);
      pkt.mesh.position.copy(pos);
      const lab = this._packetLabel(`${opts.status} dihasilkan ${LABELS[nodeAksi].main.split("(")[0].trim()}`, "#f2668b");
      this._floatLabel(lab, pos, 2400 / speed);
      await tunggu(650);
      this._burstPacket(pkt, pos, COLORS.rose, this.mode === "high" ? 70 : 26);
      this.spawnShockwave(nodeAksi, COLORS.rose);
      this.setNodeHealth(nodeAksi, level);
      this._removePacket(pkt);
      this.busy = false;
      return { ...hasil, ok: false, respons: opts.status };
    }
    if (!legs.length) {
      this.busy = false;
      return { ...hasil, ok: false, respons: opts.status };
    }
    const pkt = this._spawnPacket(warna);
    for (const [jenis, leg] of legs) {
      const seg = this.curves[jenis][leg];
      const teks =
        step === 0 ? `[${opts.method || "GET"}] Request HTTP + Header (session/Cookie)`
        : step === 1 ? `[APACHE] Rute .htaccess cocok, kuota trafik aman`
        : step === 2 ? `[PHP] Session valid, kueri PDO disusun`
        : leg === 2 ? (isError ? `[${opts.status}] Payload error dari MySQL` : "[MySQL] Result set (array asosiatif)")
        : leg === 1 ? (isError ? `[${opts.status}] Response PHP -> Apache` : "[200 OK] Response PHP -> Apache")
        : (isError ? `[${opts.status}] Response Apache -> render UI` : "[200 OK] Response Apache -> render UI");
      const lab = { key: `s${step}-${leg}`, text: teks, color: isError && step === 4 ? "#f2668b" : step === 4 ? "#6ee7b7" : "#ffd75e" };
      pkt.mesh.position.copy(seg.curve.getPointAt(0));
      const akhir = await this._walk(pkt, seg, speed, () => lab, 0, 1);
      if (this._aborted || akhir === null) {
        this._removePacket(pkt);
        this.busy = false;
        return { ...hasil, ok: false, batal: true };
      }
      this._pulseNode(seg.to, NODE_ACCENT[seg.to] ?? COLORS.accent);
    }
    if (isError && step === 4) this.setNodeHealth("client", "warning");
    this._removePacket(pkt);
    this.busy = false;
    return hasil;
  }

  _burstAt(nodeId, colorHex) {
    const pos = NODE_POS[nodeId].clone();
    pos.y += 2.6;
    const pkt = this._spawnPacket(colorHex);
    pkt.mesh.position.copy(pos);
    this._burstPacket(pkt, pos, colorHex, this.mode === "high" ? 70 : 26);
    this.spawnShockwave(nodeId, colorHex);
    this._removePacket(pkt);
  }

  /** Menghentikan seluruh animasi paket dan menghapus label yang masih tampil. */
  stopAll() {
    this._aborted = true;
    [...this._packets].forEach((pkt) => this._removePacket(pkt));
    this._floatLabels.forEach((f) => {
      clearTimeout(f.timer);
      this.scene.remove(f.sprite);
      if (f.sprite.material.map) f.sprite.material.map.dispose();
    });
    this._floatLabels = [];
    this._bursts.forEach((b) => { this.scene.remove(b.pts); b.pts.geometry.dispose(); });
    this._bursts = [];
    this._shockwaves.forEach((sw) => { this.scene.remove(sw.mesh); sw.mesh.geometry.dispose(); });
    this._shockwaves = [];
    this.busy = false;
  }

  get stepDefs() {
    return STEP_DEF.map((s, i) => ({ i, node: s.node, judul: s.title, jumlahLeg: s.legs.length }));
  }

  _settleErrorNode(nodeId, level) {
    // biarkan node tetap menyala sesuai level selama 4 detik lalu pulihkan bila masih sehat
    setTimeout(() => {
      if (this.health[nodeId] === level && this.healthPulse === "ok") this.setNodeHealth(nodeId, "normal");
    }, 4200);
  }

  /* ---------------- Interaction ---------------- */
  _handlePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [];
    Object.values(this.nodes).forEach((g) => g.traverse((o) => { if (o.isMesh) targets.push(o); }));
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const h of hits) {
      let obj = h.object;
      while (obj && !obj.userData.nodeId) obj = obj.parent;
      if (obj?.userData?.nodeId) {
        if (this.onNodeClick) this.onNodeClick(obj.userData.nodeId);
        return;
      }
    }
  }

  focusNode(nodeId) {
    if (!this.nodes[nodeId]) return;
    const p = NODE_POS[nodeId];
    this._cameraAnim = {
      camFrom: this.camera.position.clone(),
      camTo: new THREE.Vector3(p.x * 0.72, p.y + 6.2, p.z + 9.5),
      tgtFrom: this.controls.target.clone(),
      tgtTo: new THREE.Vector3(p.x, p.y + 2.4, p.z),
      start: performance.now(),
      dur: 850,
    };
  }

  /* ---------------- Camera HUD ---------------- */
  resetCamera() {
    this._cameraAnim = {
      camFrom: this.camera.position.clone(), camTo: new THREE.Vector3(0, 10.5, 21),
      tgtFrom: this.controls.target.clone(), tgtTo: new THREE.Vector3(0, 1.6, 0),
      start: performance.now(), dur: 800,
    };
  }

  topDown() {
    this._cameraAnim = {
      camFrom: this.camera.position.clone(), camTo: new THREE.Vector3(0.01, 26, 0.4),
      tgtFrom: this.controls.target.clone(), tgtTo: new THREE.Vector3(0, 0, 0),
      start: performance.now(), dur: 850,
    };
  }

  isoView() {
    this._cameraAnim = {
      camFrom: this.camera.position.clone(), camTo: new THREE.Vector3(16, 13, 16),
      tgtFrom: this.controls.target.clone(), tgtTo: new THREE.Vector3(0, 1.4, 0),
      start: performance.now(), dur: 850,
    };
  }

  setAutoRotate(on) {
    this.controls.autoRotate = Boolean(on);
    this.controls.autoRotateSpeed = 0.9;
  }

  setPerformanceMode(mode) {
    this.mode = mode;
    this._applyPixelRatio();
    this.renderer.shadowMap.enabled = mode === "high";
    this.dirLight.castShadow = mode === "high";
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this._buildParticles();
    }
  }

  resize() {
    if (!this.renderer || !this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = this.clock.getDelta();
    const now = performance.now();

    // FPS
    this._fpsFrames += 1;
    if (now - this._fpsTime >= 500) {
      const fps = Math.round((this._fpsFrames * 1000) / (now - this._fpsTime));
      this._fpsFrames = 0;
      this._fpsTime = now;
      if (this.onFps) this.onFps(fps);
    }

    // camera tween
    if (this._cameraAnim) {
      const a = this._cameraAnim;
      let t = (now - a.start) / a.dur;
      if (t >= 1) { t = 1; this._cameraAnim = null; }
      const e = this._easeInOut(t);
      this.camera.position.lerpVectors(a.camFrom, a.camTo, e);
      this.controls.target.lerpVectors(a.tgtFrom, a.tgtTo, e);
    }

    // animasi node
    Object.entries(this.nodes).forEach(([id, g]) => {
      if (g.userData.orbits) {
        g.userData.orbits.forEach((o, i) => {
          o.rotation.y += dt * (0.7 + i * 0.5);
          o.rotation.z += dt * 0.22;
        });
      }
      if (g.userData.core) {
        const s = 1 + Math.sin(now * 0.0022 + NODE_POS[id].x) * 0.07;
        if (id !== "database") g.userData.core.scale.setScalar(s);
      }
      if (g.userData.fans) g.userData.fans.forEach((f, i) => { f.rotation.z += dt * (9 + i * 2); });
      if (g.userData.chipGroup) g.userData.chipGroup.rotation.y += dt * 0.55;
      if (g.userData.leds) {
        g.userData.leds.forEach((led, i) => {
          const base = led.material.emissive.getHex() === COLORS.rose ? 0.4 : 2.6;
          led.material.emissiveIntensity = base * (0.55 + 0.45 * Math.abs(Math.sin(now * 0.003 + i * 1.7)));
        });
      }
      // pulse health ring
      const ring = this._rings[id];
      if (ring) {
        const lvl = this.health[id];
        const speed = lvl === "normal" ? 0.002 : 0.006;
        ring.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(now * speed));
        ring.scale.setScalar(lvl === "normal" ? 1 : 1 + 0.05 * Math.sin(now * 0.008));
      }
      // gentle label bob
      if (g.userData.label) g.userData.label.position.y = (id === "backend" ? 6.6 : 6.1) + Math.sin(now * 0.0016 + NODE_POS[id].x) * 0.12;
    });

    // shockwave rings
    this._shockwaves = this._shockwaves.filter((sw) => {
      sw.life -= dt * 0.85;
      if (sw.life <= 0) { this.scene.remove(sw.mesh); sw.mesh.geometry.dispose(); return false; }
      const k = 1 - sw.life;
      sw.mesh.scale.setScalar(1 + k * 6);
      sw.mesh.material.opacity = sw.life * 0.9;
      sw.mesh.lookAt(this.camera.position);
      return true;
    });

    // burst particles
    this._bursts = this._bursts.filter((b) => {
      b.life -= dt * 0.9;
      if (b.life <= 0) { this.scene.remove(b.pts); b.pts.geometry.dispose(); return false; }
      const pos = b.pts.geometry.getAttribute("position");
      for (let i = 0; i < b.vel.length; i += 1) {
        pos.setXYZ(i, pos.getX(i) + b.vel[i].x, pos.getY(i) + b.vel[i].y - dt * 0.05, pos.getZ(i) + b.vel[i].z);
      }
      pos.needsUpdate = true;
      b.pts.material.opacity = b.life;
      return true;
    });

    if (this.particles) this.particles.rotation.y += dt * 0.014;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

export default Scene3DEngine;
