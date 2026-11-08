/* =====================================================================
 * SIRKUIT - js/pbl-simulator.js
 * Engine 5 Tahap PBL (Arends), 4 Skenario Troubleshooting,
 * 3D Node Hotspot Inspector & Live JSON Payload Viewer.
 * Classic script - mengekspos window.PBLSimulator.
 * ===================================================================== */

const $s = (sel) => document.querySelector(sel);
const $$s = (sel) => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightJson(str) {
  return esc(str)
    .replace(/"([^"\\]*(\\.[^"\\]*)*)":/g, '<span class="j-key">"$1"</span>:')
    .replace(/: ("[^"\\]*(\\.[^"\\]*)*")/g, ': <span class="j-str">$1</span>')
    .replace(/: (-?\d+(\.\d+)?)/g, ': <span class="j-num">$1</span>')
    .replace(/: (true|false)/g, ': <span class="j-bool">$1</span>')
    .replace(/: (null)/g, ': <span class="j-null">$1</span>');
}

const PBLSimulator = {
  state: {
    scenarioCode: "NORMAL",
    stage: 1,
    selectedSolution: null,
    visitedNodes: new Set(),
    investigated: false,
    resolved: false,
    inspectNode: "gateway",
    configs: {}, // { nodeId: { key: value } }
    speed: 1,
    method: "GET",
    endpoint: "/api/siswa.php?kelas=XI-RPL-1",
    busy: false,
    lastTxn: null,
  },

  scene: null, // di-set oleh main.js setelah Scene3D init

  /* ---------------- Setup ---------------- */
  init(scene) {
    this.scene = scene;
    if (scene) scene.onNodeClick = (id) => this.selectNode(id);

    // method buttons
    $$s("#methodRow .method-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.state.method = btn.dataset.method;
        $$s("#methodRow .method-btn").forEach((b) => (b.className = "method-btn"));
        btn.classList.add("sel-" + this.state.method);
        const opts = SIRKUIT_CONFIG.ENDPOINTS.filter((e) => e.metode === this.state.method);
        if (opts.length && !opts.some((o) => o.path === this.state.endpoint)) {
          this.setEndpoint(opts[0].path);
        }
        this.renderEndpointOptions();
      });
    });
    this.setEndpoint(this.state.endpoint);

    // speed
    $$s("#speedRow .chip").forEach((c) =>
      c.addEventListener("click", () => {
        this.state.speed = parseFloat(c.dataset.speed);
        $$s("#speedRow .chip").forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
      })
    );

    this.renderChips();

    // HUD kamera
    $s("#hudReset").addEventListener("click", () => this.scene?.resetCamera());
    $s("#hudTop").addEventListener("click", () => this.scene?.topDown());
    $s("#hudIso").addEventListener("click", () => this.scene?.isoView());
    $s("#hudRotate").addEventListener("click", (e) => {
      const on = !e.target.classList.contains("on");
      e.target.classList.toggle("on", on);
      e.target.textContent = on ? "Auto-Rotate: ON" : "Auto-Rotate: OFF";
      this.scene?.setAutoRotate(on);
    });
    $s("#hudPerfHigh").addEventListener("click", () => this.setPerf("high"));
    $s("#hudPerfLight").addEventListener("click", () => this.setPerf("light"));

    // aksi utama
    $s("#btnSendRequest").addEventListener("click", () => this.send());
    $s("#btnRepeat").addEventListener("click", () => this.send());
    $s("#btnStopFlow").addEventListener("click", () => this.stopProcess());
    $$s("#processRow .proc-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.runProcessStep(parseInt(btn.dataset.proc, 10)));
    });

    // node quickbar
    const qb = $s("#nodeQuickbar");
    ["client", "gateway", "backend", "database"].forEach((id) => {
      const meta = SIRKUIT_CONFIG.NODES.find((n) => n.id === id);
      const b = document.createElement("button");
      b.className = "node-btn";
      b.dataset.node = id;
      b.textContent = meta.nama.replace(/\s*\(.*\)/, "");
      b.addEventListener("click", () => this.selectNode(id));
      qb.appendChild(b);
    });

    // json tabs
    $$s(".json-tab").forEach((t) =>
      t.addEventListener("click", () => {
        $$s(".json-tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        $$s(".json-pane").forEach((p) => p.classList.add("hidden"));
        $s("#pane_" + t.dataset.pane).classList.remove("hidden");
      })
    );

    // stepper lanjut
    $$s(".pbl-step [data-next]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const from = parseInt(btn.dataset.next, 10);
        this.advanceStage(from);
      })
    );

    this.renderStepper();
    this.loadScenario("NORMAL", true);
    this.selectNode("gateway", false);
    this.renderMetrics();
    this.muatSkenario();
  },

  /* Soal kasus PBL berada di MySQL. Gejalanya diambil dari server supaya teks
     dan opsi solusi tidak lagi dibundel di berkas JS. */
  async muatSkenario() {
    if (this.sudahMuat || !Api.user) return;
    const r = await Api.get("scenarios.php");
    if (!r.ok) {
      this.toast("Gejala skenario gagal dimuat dari /api/scenarios.php: " + (r.error || "HTTP " + r.status), "error");
      return;
    }
    (r.data.data || []).forEach((db) => {
      const rig = SIRKUIT_CONFIG.SCENARIOS.find((x) => x.kode === db.kode);
      if (!rig) return;
      rig.judul = db.judul;
      rig.gejala = db.gejala;
      rig.konteks = db.konteks;
      rig.temuan = db.temuan;
      rig.refleksi = db.refleksi;
      rig.status = db.expected_status;
      rig.metodeAwal = db.metode;
      rig.endpointAwal = db.endpoint;
      rig.faultNode = db.fault_node;
      rig.solusi = (db.opsi || []).map((o) => ({
        id: String(o.opsi).toLowerCase(),
        teks: o.teks,
        benar: o.benar === undefined ? null : Boolean(o.benar),
      }));
    });
    this.sudahMuat = true;
    this.renderChips();
    if (this.state.scenarioCode !== "NORMAL") this.loadScenario(this.state.scenarioCode, true);
  },

  renderChips() {
    const bar = $s("#scenarioChips");
    bar.querySelectorAll(".chip").forEach((c) => c.remove());
    const chips = [{ code: "NORMAL", label: "Mode Normal (Eksplorasi Bebas 200 OK)" }].concat(
      SIRKUIT_CONFIG.SCENARIOS.map((s) => ({ code: s.kode, label: s.judul }))
    );
    chips.forEach((c) => {
      const el = document.createElement("button");
      el.className = "chip" + (c.code === this.state.scenarioCode ? " active" : "") + (c.code === "NORMAL" ? " success" : "");
      el.dataset.code = c.code;
      el.textContent = c.label;
      el.addEventListener("click", () => this.loadScenario(c.code));
      bar.appendChild(el);
    });
  },

  setPerf(mode) {
    this.scene?.setPerformanceMode(mode);
    $s("#hudPerfHigh").classList.toggle("on", mode === "high");
    $s("#hudPerfLight").classList.toggle("on", mode === "light");
    this.toast(mode === "high" ? "Mode Performa Tinggi (PC Lab): Glow & Shadow aktif." : "Mode Ringan (HP Low-Spec): Pixel ratio & partikel disederhanakan.", "info");
  },

  toast(msg, type = "info") {
    if (window.SIRKUIT_toast) SIRKUIT_toast(msg, type);
  },

  scenario() {
    if (this.state.scenarioCode === "NORMAL") {
      return {
        kode: "NORMAL", judul: "Mode Normal - Eksplorasi Bebas (Sistem Sehat 200 OK)",
        status: 200, faultNode: null, packetStopAt: null,
        gejala: "Seluruh komponen arsitektur sehat. Siswa bebas mencoba keempat metode HTTP (GET, POST, PUT, DELETE) dan mengamati aliran paket data 3D bolak-balik Client - Apache - PHP - MySQL dengan status 200 OK.",
        konteks: "Laboratorium RPL SMKN 1 Mejayan - sesi eksplorasi mandiri sebelum masuk studi kasus gangguan sistem.",
        temuan: "Tidak ada anomali. Header Authorization membawa token session yang valid, RewriteRule .htaccess cocok, kuota rate limit aman, dan koneksi PDO berjalan normal.",
        solusi: [], refleksi: "",
      };
    }
    return SIRKUIT_CONFIG.SCENARIOS.find((s) => s.kode === this.state.scenarioCode);
  },

  /* ---------------- Skenario & tahap PBL ---------------- */
  loadScenario(code, silent) {
    this.state.scenarioCode = code;
    this.state.stage = 1;
    this.state.selectedSolution = null;
    this.state.visitedNodes = new Set();
    this.state.investigated = false;
    this.state.resolved = code === "NORMAL";
    this.state.configs = {};
    // seed konfigurasi per skenario (kondisi awal saat error terjadi)
    const seedCfg = {
      E401: { client: { auth_header: "Bearer token_expired_null" }, backend: { jwt_validation: "AKTIF" } },
      E404: { client: { base_url: "/api/profil_prakerin_lama.php" } },
      E429: { gateway: { response_cache: "DISABLED", cache_ttl: "60s", pagination: "DISABLED", rate_limit: "fixed_window" } },
      E500: { backend: { sql_column: "tgl_input", db_connect: "mysqli_direct" }, database: { pooler: "NONAKTIF", max_conn: "20" } },
    };
    if (seedCfg[code]) this.state.configs = JSON.parse(JSON.stringify(seedCfg[code]));
    if (code !== "NORMAL") {
      const sc = this.scenario();
      this.state.method = sc.metodeAwal;
      this.state.endpoint = sc.endpointAwal;
      $$s("#methodRow .method-btn").forEach((b) => (b.className = "method-btn" + (b.dataset.method === sc.metodeAwal ? " sel-" + sc.metodeAwal : "")));
    } else {
      $$s("#methodRow .method-btn").forEach((b) => (b.className = "method-btn" + (b.dataset.method === "GET" ? " sel-GET" : "")));
      this.setEndpoint("/api/siswa.php?kelas=XI-RPL-1");
    }
    this.renderEndpointOptions();
    $$s("#scenarioChips .chip").forEach((c) => {
      const isSel = c.dataset.code === code;
      c.classList.toggle("active", isSel);
      c.classList.toggle("success", isSel && code === "NORMAL");
    });
    this.renderStepper();
    this.renderProblem();
    this.renderMetrics();
    const sc = this.scenario();
    if (sc.faultNode) this.selectNode(sc.faultNode, false);
    if (!silent) {
      this.toast(`Skenario dimuat: ${sc.judul}`, "info");
    }
    // pratinjau payload awal
    this.buildTxn(true);
    this.resetProcess(code === "NORMAL" ? "Siap. Jalankan salah satu tahap di bawah, atau tekan Jalankan Penuh untuk aliran bolak-balik." : "Skenario dimuat. Jalankan tahap per tahap untuk mencari di mana proses berhenti.");
  },

  resetProcess(text) {
    this._stopped = false;
    $$s("#processRow .proc-btn").forEach((b) => {
      b.disabled = false;
      b.classList.remove("running", "done-step", "fail", "blocked");
    });
    this.procStatus(text || "Belum ada proses dijalankan.");
  },

  sessionName() {
    return Api.user ? Api.user.nama : "Tamu";
  },
  sessionKelas() {
    if (!Api.user) return "XI RPL 1";
    return Api.user.peran === "guru" ? "Guru" : Api.user.kelas || "XI RPL 1";
  },

  cfg(nodeId, key, fallback) {
    return (this.state.configs[nodeId] || {})[key] ?? fallback;
  },

  setCfg(nodeId, key, value) {
    this.state.configs[nodeId] = this.state.configs[nodeId] || {};
    this.state.configs[nodeId][key] = value;
    if (nodeId === "client" && key === "base_url" && this.state.scenarioCode === "E404") {
      this.state.endpoint = value;
      this.renderEndpointOptions();
    }
    this.renderMetrics();
    this.buildTxn(true);
  },

  advanceStage(from) {
    if (from === 2 && this.state.scenarioCode !== "NORMAL" && this.state.visitedNodes.size < 4) {
      this.toast("Kunjungi/inspeksi keempat node 3D terlebih dahulu (klik objek di kanvas atau tombol node) untuk memetakan komponen yang terlibat.", "error");
      return;
    }
    if (from === 3 && !this.state.investigated) {
      this.toast("Jalankan minimal satu HTTP Request (Tahap 3: penyelidikan) sebelum masuk tahap solusi.", "error");
      return;
    }
    this.state.stage = Math.min(5, from + 1);
    this.renderStepper();
    this.renderProblem();
    if (this.state.stage === 5) {
      const sc = this.scenario();
      if (sc.refleksi) this.toast("Refleksi teknis kasus terbuka. Lanjutkan ke Kuis Evaluasi Diagnostik.", "success");
    }
  },

  renderStepper() {
    $$s(".pbl-step").forEach((el) => {
      const n = parseInt(el.dataset.step, 10);
      el.classList.toggle("active", n === this.state.stage);
      el.classList.toggle("done", n < this.state.stage);
      const nextBtn = el.querySelector("[data-next]");
      if (nextBtn) {
        const showAt = { 1: true, 2: true, 3: true };
        nextBtn.classList.toggle("hidden", !(showAt[n] && n === this.state.stage));
      }
    });
  },

  /* ---------------- Panel masalah (Gambar 3.4) ---------------- */
  renderProblem() {
    const sc = this.scenario();
    const stage = this.state.stage;
    const root = $s("#problemCard");
    let html = `
      <div class="p-title">${esc(sc.judul)}</div>
      <div class="p-ctx">${esc(sc.konteks)}</div>
      <div class="p-body"><b>Gejala:</b> ${esc(sc.gejala)}</div>
      ${stage >= 3 ? `<div class="p-temuan"><b>Temuan penyelidikan:</b> ${esc(sc.temuan)}</div>` : ""}
    `;

    if (this.state.scenarioCode !== "NORMAL") {
      if (stage === 4 && !this.state.resolved) {
        html += `<div class="cap" style="margin-top:14px">Tahap 4 - Pilih parameter konfigurasi perbaikan arsitektur:</div><div class="solution-opts">`;
        sc.solusi.forEach((s) => {
          const cls = this.state.selectedSolution === s.id ? "sel" : "";
          html += `<button class="sol-opt ${cls}" data-sol="${s.id}"><span class="radio"></span><span>${esc(s.teks)}</span></button>`;
        });
        html += `</div><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="btnApplySol">Terapkan Solusi & Uji Ulang Aliran Paket</button></div>`;
      }
      if (stage === 5 || this.state.resolved) {
        html += `
          <div class="reflection-box">
            <b> Kasus terselesaikan - Status 200 OK.</b><br>
            <b>Refleksi teknis (Tahap 5 PBL):</b> ${esc(sc.refleksi)}
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-success btn-sm" data-goto-quiz>Buka Kuis Evaluasi Diagnostik -></button>
            <button class="btn btn-ghost btn-sm" data-next-scenario>Coba Skenario Berikutnya</button>
          </div>`;
      }
    } else if (stage >= 3) {
      html += `<div style="margin-top:10px;font-size:12px;color:var(--text-low)">Mode bebas: kirim GET/POST/PUT/DELETE untuk melihat animasi paket normal, lalu bandingkan dengan keempat skenario gangguan.</div>`;
    }
    root.innerHTML = html;

    $$s("#problemCard .sol-opt").forEach((btn) =>
      btn.addEventListener("click", () => {
        this.state.selectedSolution = btn.dataset.sol;
        $$s("#problemCard .sol-opt").forEach((x) => x.classList.remove("sel"));
        btn.classList.add("sel");
      })
    );
    const apply = $s("#btnApplySol");
    if (apply) apply.addEventListener("click", () => this.applySolution());
    const quizBtn = root.querySelector("[data-goto-quiz]");
    if (quizBtn) quizBtn.addEventListener("click", () => window.SIRKUIT_navigate?.("modul"));
    const nextSc = root.querySelector("[data-next-scenario]");
    if (nextSc) {
      nextSc.addEventListener("click", () => {
        const codes = SIRKUIT_CONFIG.SCENARIOS.map((s) => s.kode);
        const idx = codes.indexOf(this.state.scenarioCode);
        this.loadScenario(codes[(idx + 1) % codes.length]);
      });
    }
    this.renderStepper();
  },

  async applySolution() {
    const sc = this.scenario();
    const chosen = sc.solusi.find((s) => s.id === this.state.selectedSolution);
    if (!chosen) {
      this.toast("Pilih salah satu opsi solusi konfigurasi terlebih dahulu.", "error");
      return;
    }
    // Kunci jawaban tidak ada di peramban untuk akun siswa, jadi server yang
    // menilai pilihan dan menjawab lewat kolom pilihan_tepat.
    const r = await Api.post("scenarios.php", {
      kode: this.state.scenarioCode,
      metode: this.state.method,
      status_http: chosen.benar === false ? sc.status : 200,
      is_resolved: chosen.benar !== false,
      selected_solution: String(chosen.id).toUpperCase(),
      latency_ms: 38,
    });
    const tepat = r.ok && r.data.pilihan_tepat !== null ? r.data.pilihan_tepat : chosen.benar !== false;
    if (!tepat) {
      const el = $s(`.sol-opt[data-sol="${chosen.id}"]`);
      if (el) {
        el.classList.add("wrong");
        setTimeout(() => el.classList.remove("wrong"), 900);
      }
      this.toast("Solusi tidak menyentuh akar masalah - analisis kembali temuan pada Node Inspector & JSON Viewer.", "error");
      return;
    }
    const good = $s(`.sol-opt[data-sol="${chosen.id}"]`);
    if (good) {
      good.classList.add("correct");
      good.classList.add("locked");
    }
    // terapkan konfigurasi perbaikan ke node
    const fixes = {
      E401: [
        ["client", "auth_header", "Bearer <token_sesi_valid>"],
        ["backend", "jwt_validation", "AKTIF"],
      ],
      E404: [
        ["client", "base_url", "/api/prakerin-siswa.php"],
      ],
      E429: [
        ["gateway", "response_cache", "ENABLED"],
        ["gateway", "cache_ttl", "60s"],
        ["gateway", "rate_limit", "token_bucket"],
        ["gateway", "pagination", "ENABLED"],
      ],
      E500: [
        ["database", "pooler", "AKTIF (PDO persistent)"],
        ["database", "max_conn", "500"],
        ["backend", "sql_column", "created_at"],
        ["backend", "db_connect", "pdo_persistent"],
      ],
    }[this.state.scenarioCode] || [];
    fixes.forEach(([n, k, v]) => this.setCfg(n, k, v));
    if (this.state.scenarioCode === "E404") {
      this.state.endpoint = "/api/prakerin-siswa.php";
      this.renderEndpointOptions();
    }
    this.toast("Konfigurasi perbaikan diterapkan, mengirim ulang HTTP Request sebagai pembuktian.", "info");
    this.resetProcess("Konfigurasi diperbarui. Mengirim request pembuktian ke seluruh pipeline...");
    this.send();
  },

  /* ---------------- Endpoint & node ---------------- */
  setEndpoint(path) {
    this.state.endpoint = path;
    const sel = $s("#endpointSelect");
    if (sel) sel.value = path;
  },

  renderEndpointOptions() {
    const sel = $s("#endpointSelect");
    if (!sel) return;
    if (!sel.dataset.built) {
      sel.dataset.built = "1";
      const extra = SIRKUIT_CONFIG.SCENARIOS.map((s) => ({ path: s.endpointAwal, metode: s.metodeAwal, nama: "Endpoint studi kasus PBL" }));
      const seen = new Set();
      const all = [...SIRKUIT_CONFIG.ENDPOINTS, ...extra].filter((e) => {
        const k = e.metode + " " + e.path;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      sel.innerHTML = all.map((e) => `<option value="${esc(e.path)}">${esc(e.metode)} ${esc(e.path)} - ${esc(e.nama)}</option>`).join("");
    }
    if (![...sel.options].some((o) => o.value === this.state.endpoint)) {
      const o = document.createElement("option");
      o.value = this.state.endpoint;
      o.textContent = `${this.state.method} ${this.state.endpoint} - Endpoint studi kasus PBL`;
      sel.appendChild(o);
    }
    sel.value = this.state.endpoint;
    sel.onchange = () => {
      this.state.endpoint = sel.value;
      const m = sel.value.split(" ")[0];
      if (SIRKUIT_CONFIG.HTTP_METHODS[m]) {
        this.state.method = m;
        $$s("#methodRow .method-btn").forEach((b) => (b.className = "method-btn" + (b.dataset.method === m ? " sel-" + m : "")));
      }
      this.buildTxn(true);
    };
  },

  selectNode(id, focus = true) {
    this.state.inspectNode = id;
    this.state.visitedNodes.add(id);
    $$s(".node-btn").forEach((b) => b.classList.toggle("sel", b.dataset.node === id));
    if (focus) this.scene?.focusNode(id);
    this.renderInspector();
    if (this.state.stage === 2 && this.state.visitedNodes.size === 4 && this.state.scenarioCode !== "NORMAL") {
      this.toast("Keempat komponen terpetakan - lanjutkan ke Tahap 3 (Penyelidikan).", "success");
    }
    this.renderStepper();
  },

  nodeMeta(id) {
    return SIRKUIT_CONFIG.NODES.find((n) => n.id === id);
  },

  nodeMetrics(id) {
    const meta = this.nodeMeta(id);
    const sc = this.scenario();
    const m = {};
    const activeFault = !this.state.resolved && sc.faultNode;
    const ov = activeFault && sc.metricOverride && sc.metricOverride[id];
    m.cpu = ov?.cpu ?? Math.round((meta.metrik.cpu[0] + meta.metrik.cpu[1]) / 2);
    m.ram = ov?.ram ?? Math.round((meta.metrik.ram[0] + meta.metrik.ram[1]) / 2);
    m.koneksi = ov?.koneksi ?? Math.round((meta.metrik.koneksi[0] + meta.metrik.koneksi[1]) / 2);
    m.latency = ov?.latency ?? Math.round((meta.metrik.latency[0] + meta.metrik.latency[1]) / 2);
    if (id === "gateway" && activeFault === "gateway" && this.state.scenarioCode === "E429") m.koneksi = 640;
    return m;
  },

  renderMetrics() {
    this.renderInspector();
  },

  renderInspector() {
    const id = this.state.inspectNode;
    const meta = this.nodeMeta(id);
    const m = this.nodeMetrics(id);
    const barClass = (v, warn, crit) => (v >= crit ? "crit" : v >= warn ? "warn" : "");
    const html = `
      <div style="font-size:13.5px;font-weight:800;color:var(--text-hi);margin-bottom:4px">${esc(meta.nama)}</div>
      <div style="font-size:11px;font-family:var(--font-mono);color:var(--info);margin-bottom:10px">${esc(meta.protokol)}</div>
      <div style="font-size:12.3px;color:var(--text-mid);line-height:1.65;margin-bottom:12px">${esc(meta.fungsi)}</div>
      <div class="inspector-metrics">
        <div class="metric"><div class="m-cap">CPU Usage</div><div class="m-val">${m.cpu}%</div><div class="bar"><i class="${barClass(m.cpu, 70, 90)}" style="width:${Math.min(m.cpu, 100)}%"></i></div></div>
        <div class="metric"><div class="m-cap">Memory Allocation</div><div class="m-val">${m.ram} MB</div><div class="bar"><i class="${barClass(m.ram, 1200, 1700)}" style="width:${Math.min((m.ram / 2000) * 100, 100)}%"></i></div></div>
        <div class="metric"><div class="m-cap">Active Connections</div><div class="m-val">${m.koneksi}</div><div class="bar"><i class="${barClass(m.koneksi, 200, 500)}" style="width:${Math.min((m.koneksi / 700) * 100, 100)}%"></i></div></div>
        <div class="metric"><div class="m-cap">Latency</div><div class="m-val">${m.latency} ms</div><div class="bar"><i class="${barClass(m.latency, 400, 900)}" style="width:${Math.min((m.latency / 1300) * 100, 100)}%"></i></div></div>
      </div>
      <div class="cap" style="font-size:10.5px;font-weight:800;letter-spacing:1px;color:var(--text-low);text-transform:uppercase;margin:10px 0 4px">Konfigurasi Teknis Aktif - Sakelar Perbaikan</div>
      <div id="cfgRows"></div>
    `;
    $s("#inspectorBody").innerHTML = html;

    const cfgRoot = $s("#cfgRows");
    meta.konfigurasi.forEach((k) => {
      const cur = this.cfg(id, k.kunci, k.nilai);
      const row = document.createElement("div");
      row.className = "cfg-row";
      if (k.tipe === "toggle") {
        const onState = ["ENABLED", "AKTIF (Port 6543)", "AKTIF"].includes(cur);
        row.innerHTML = `
          <span class="cfg-label">${esc(k.label)}</span>
          <label class="switch"><input type="checkbox" ${onState ? "checked" : ""}><span class="slider"></span></label>`;
        row.querySelector("input").addEventListener("change", (e) => {
          const val = e.target.checked ? k.opsi[0] : k.opsi[1];
          this.setCfg(id, k.kunci, val);
        });
      } else if (k.tipe === "select") {
        row.innerHTML = `
          <span class="cfg-label">${esc(k.label)}</span>
          <select class="input input-mono">${k.opsi.map((o) => `<option ${o === cur ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
        row.querySelector("select").addEventListener("change", (e) => {
          this.setCfg(id, k.kunci, e.target.value);
        });
      } else {
        row.innerHTML = `<span class="cfg-label">${esc(k.label)}</span><span class="input input-mono" style="padding:6px 9px;background:rgba(2,6,23,.6);font-size:11px;max-width:220px;overflow:auto">${esc(cur)}</span>`;
      }
      cfgRoot.appendChild(row);
    });
  },

  /* ---------------- Evaluasi kondisi sistem ---------------- */
  evalStatus(method, path) {
    const sc = this.scenario();
    const st = this.state;
    if (st.scenarioCode === "NORMAL") return { status: 200, level: "normal", faultNode: null };
    if (st.resolved) return { status: 200, level: "normal", faultNode: null };

    switch (sc.kode) {
      case "E401": {
        const hdr = this.cfg("client", "auth_header", "Bearer token_expired_null");
        const jwt = this.cfg("backend", "jwt_validation", "AKTIF");
        const ok = hdr.startsWith("Bearer <token") && jwt === "AKTIF";
        return ok ? { status: 200, level: "normal", faultNode: null } : { status: 401, level: "warning", faultNode: "gateway" };
      }
      case "E404": {
        const clean = path.split("?")[0];
        const registered = ["/api/prakerin-siswa.php", "/api/nilai-ukk.php", "/api/jurnal-pkl.php", "/api/proyek-siswa.php", "/api/sesi-log.php", "/api/auth.php", "/api/nilai-siswa.php", "/api/siswa.php"];
        const ok = registered.includes(clean);
        return ok ? { status: 200, level: "normal", faultNode: null } : { status: 404, level: "critical", faultNode: "gateway" };
      }
      case "E429": {
        const cache = this.cfg("gateway", "response_cache", "DISABLED");
        const bucket = this.cfg("gateway", "rate_limit", "token_bucket");
        const ok = cache === "ENABLED" && bucket === "token_bucket";
        return ok ? { status: 200, level: "normal", faultNode: null, cached: true } : { status: 429, level: "warning", faultNode: "gateway" };
      }
      case "E500": {
        const col = this.cfg("backend", "sql_column", "tgl_input");
        const conn = this.cfg("backend", "db_connect", "mysqli_direct");
        const ok = col === "created_at" && conn === "pdo_persistent";
        return ok ? { status: 200, level: "normal", faultNode: null } : { status: 500, level: "critical", faultNode: "database" };
      }
    }
    return { status: 200, level: "normal", faultNode: null };
  },

  /* ---------------- Payload builders ---------------- */
  baseHeaders(withAuthOverride) {
    const auth = this.cfg("client", "auth_header", this.state.scenarioCode === "E401" && !this.state.resolved ? "Bearer token_expired_null" : "Bearer <token_sesi_valid>");
    return {
      Host: "localhost",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0) SIRKUIT-Lab/1.0 Chrome/138",
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Request-Id": "req_" + Math.random().toString(36).slice(2, 10),
      Cookie: "PHPSESSID=" + Math.random().toString(36).slice(2, 12),
      Authorization: withAuthOverride ?? auth,
    };
  },

  requestBody(method, path) {
    if (method === "POST" && path.includes("jurnal-pkl")) {
      return { siswa_id: "25001", nama: "Fazrin Mauza Dwi Zuhudi", hari: "Senin", aktivitas: "Membuat CRUD nilai siswa dengan PHP PDO dan MySQL", jam_ke: "1-4", catatan: "Konsultasi pembimbing: gunakan kolom created_at bertipe DATETIME" };
    }
    if (method === "POST") {
      return { siswa_id: "25017", judul_proyek: "Sistem Informasi Prakerin RPL", tech_stack: ["HTML5", "PHP 8", "MySQL"], deadline: "2027-04-30", status_awal: "draft" };
    }
    if (method === "PUT" && path.includes("nilai-ukk")) {
      return { siswa_id: "25010", nama: "Hafiz Ardiansyah", paket_keahlian: "RPL", nilai_ukk: 85, penguji: "Bpk. Hendra Kusuma, S.Kom.", keterangan: "Revisi remedial UKK" };
    }
    if (method === "PUT") {
      return { siswa_id: "25003", nama: "Nabila Putri Ramadhani", perusahaan: "PT Madiun Digital Kreasi", posisi: "Web Developer Magang (PHP - MySQL)", logbook_week: 7 };
    }
    if (method === "DELETE") {
      return { filter: { expired_before: "2027-01-01T00:00:00Z", role: "siswa" }, dry_run: false };
    }
    return null;
  },

  sqlTrace(method, path, status) {
    const col = this.cfg("backend", "sql_column", this.state.scenarioCode === "E500" && !this.state.resolved ? "tgl_input" : "created_at");
    if (status === 401) return `-- WEB SERVER (Apache) -> BACKEND PHP\nsession_start();\n$token = $_SERVER['HTTP_AUTHORIZATION'] ?? '';\nif (!validasiTokenSesi($token)) {   // cookie PHPSESSID tidak terikat record sesi\n    http_response_code(401); exit;\n}\n-- Kueri MySQL TIDAK PERNAH DIJALANKAN (skrip dihentikan sebelum PDO)`;
    if (status === 404) return `-- WEB SERVER (Apache mod_rewrite)\nRewriteRule ^api/([a-z-]+)$ api/$1.php [L,QSA]\n   file ${path} TIDAK ADA di document root\n-- Terdaftar: /api/prakerin-siswa.php, /api/nilai-ukk.php, /api/jurnal-pkl.php\n-- Kueri MySQL TIDAK DIJALANKAN`;
    if (status === 429) return `-- WEB SERVER (Apache mod_qos)\nQS_SrvMaxConnPerIP 60 -> kuota per IP habis\n   429 Too Many Requests (Retry-After: 60)\n-- Skrip PHP TIDAK TERSENTUH - request dibatasi sebelum antrean\n-- Catatan: cache output = ${this.cfg("gateway", "response_cache", "DISABLED")}, pagination = ${this.cfg("gateway", "pagination", "DISABLED")}`;
    if (status === 500) return `-- BACKEND PHP -> MySQL (PDO)\n$sql = "INSERT INTO jurnal_pkl (siswa_id, isi, ${col}) VALUES (?, ?, NOW())";\n$stmt = $pdo->prepare($sql);\n$stmt->execute([25001, 'Membuat CRUD nilai siswa']);\n   500: Unknown column '${col}' in 'field list'  (MySQL error 1054)\n   500: Too many connections  (MySQL error 1040, max_connections=${this.cfg("database", "max_conn", "20")}, mode=${this.cfg("backend", "db_connect", "mysqli_direct")}, pooler ${this.cfg("database", "pooler", "NONAKTIF")})`;
    if (method === "GET" && path.includes("siswa")) return `-- BACKEND PHP -> MySQL (PDO prepared statement)\nSELECT * FROM siswa\nWHERE role='siswa' AND kelas='XI RPL 1'\nORDER BY nama_lengkap ASC;   -- idx_siswa_kelas (BTREE) -> 16 rows, 38 ms`;
    if (method === "GET") return `-- BACKEND PHP -> MySQL (PDO prepared statement)\nSELECT siswa_id, nama, paket_keahlian, nilai\nFROM nilai_ukk\nWHERE is_published = 1;   -- 32 rows, 41 ms`;
    if (method === "POST") return `-- BACKEND PHP -> MySQL (PDO prepared statement)\nINSERT INTO jurnal_pkl (siswa_id, isi, ${col})\nVALUES (25001, 'Membuat CRUD...', NOW());\n   -- 1 row affected, ${status === 200 ? "44 ms" : "ERROR"}`;
    if (method === "PUT") return `-- BACKEND PHP -> MySQL (PDO prepared statement)\nUPDATE nilai_ukk SET nilai = 85, updated_at = NOW()\nWHERE siswa_id = '25010';   -- GRANT guru_rpl: tabel nilai_ukk, 1 row, 39 ms`;
    return `-- BACKEND PHP -> MySQL (PDO prepared statement)\nDELETE FROM log_sesi\nWHERE created_at < NOW() - INTERVAL 90 DAY\n  AND role = 'siswa';   -- 214 rows, 51 ms`;
  },

  responsePayload(method, path, status, extra = {}) {
    if (status === 200) {
      const students = SIRKUIT_CONFIG.STUDENTS.filter((s) => (path.includes("XI-RPL-2") ? s.kelas === "XI RPL 2" : s.kelas === "XI RPL 1")).slice(0, 5);
      if (method === "GET") {
        return {
          status: "success", code: 200, message: "Data nilai siswa berhasil dimuat",
          count: students.length,
          data: students.map((s) => ({ id: s.id, nisn: s.nisn, nama: s.nama, kelas: s.kelas, nilai_ukk: s.skor, status_kkm: s.skor >= 75 ? "TUNTAS" : "PERLU BIMBINGAN" })),
          meta: { source: extra.cached ? "apache-cache (Cache-Control max-age=60)" : "mysql-mariadb (PDO)", server: "Apache 2.4 / PHP 8.2" },
        };
      }
      if (method === "POST") {
        return { status: "success", code: 200, message: "Record berhasil disimpan ke tabel MySQL", data: { id: "jurnal_" + Math.random().toString(36).slice(2, 8), created_at: new Date().toISOString().slice(0, 19).replace("T", " "), siswa: "Fazrin Mauza Dwi Zuhudi", kelas: "XI RPL 1" } };
      }
      if (method === "PUT") {
        return { status: "success", code: 200, message: "Nilai UKK diperbarui", data: { siswa_id: "25010", nama: "Hafiz Ardiansyah", nilai_lama: 68, nilai_baru: 85, revised_by: "Bpk. Hendra Kusuma, S.Kom." } };
      }
      return { status: "success", code: 200, message: "Log sesi kedaluwarsa dihapus", data: { deleted_count: 214, before: "2027-01-01T00:00:00Z" } };
    }
    const errMap = {
      401: { message: "Unauthorized: token sesi tidak dikenali", error_details: { reason: "token_expired_null", dicek_oleh: "validasiTokenSesi() di api/nilai-siswa.php", hint: "Ambil ulang Authorization header dari hasil login, jangan kirim 'null'" }, troubleshooting_hint: "Periksa Authorization Header pada node CLIENT di Hotspot Inspector - token Bearer tidak cocok dengan record sesi di MySQL sehingga skrip PHP menolak request." },
      404: { message: "Not Found: rute POST /api/profil_prakerin_lama.php tidak terdaftar", error_details: { closest_routes: ["/api/prakerin-siswa.php", "/api/nilai-ukk.php"], routing_table_version: "Apache 2.4 / mod_rewrite" }, troubleshooting_hint: "Bandingkan endpoint pada CLIENT dengan RewriteRule di .htaccess node WEB SERVER - path adalah bagian dari kontrak REST API." },
      429: { message: "Too Many Requests: kuota mod_qos habis (60 req/menit)", error_details: { retry_after: 60, x_ratelimit_remaining: 0, cpu_web_server: "98%" }, troubleshooting_hint: "Aktifkan Cache Output (Cache-Control TTL 60s) + Token Bucket mod_qos + pagination LIMIT/OFFSET pada node WEB SERVER.", headers: { "Retry-After": "60", "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": "0" } },
      500: { message: "Internal Server Error: koneksi MySQL penuh dan nama kolom salah", error_details: { mysql_error: "1054 Unknown column / 1040 Too many connections", max_connections: 20, koneksi_aktif: 21, kolom_dipakai: "tgl_input", kolom_seharusnya: "created_at DATETIME" }, troubleshooting_hint: "Gunakan PDO persistent connection (atau raise max_connections) dan perbaiki nama kolom pada SQL trace node BACKEND PHP." },
    };
    return { status: "error", code: status, ...errMap[status] };
  },

  buildTxn(previewOnly) {
    const { method, endpoint } = this.state;
    const ev = this.evalStatus(method, endpoint);
    const cached = ev.cached && ev.status === 200;
    const latency = ev.status === 200 ? (cached ? 38 : 41 + Math.floor(Math.random() * 30)) : ev.status === 429 ? 1240 : ev.status === 500 ? 1180 : 96;
    const payloadKB = method === "GET" ? (ev.status === 200 ? (cached ? "0.9 KB" : "1.4 KB") : "0.5 KB") : "0.7 KB";
    const txn = {
      method,
      path: endpoint,
      status: ev.status,
      faultNode: ev.faultNode,
      level: ev.level,
      latency,
      payloadKB,
      cached,
      headers: this.baseHeaders(),
      body: this.requestBody(method, endpoint),
      sql: this.sqlTrace(method, endpoint, ev.status),
      response: this.responsePayload(method, endpoint, ev.status, { cached }),
    };
    this.state.lastTxn = txn;
    this.renderTxn(txn);
    return txn;
  },

  renderTxn(txn) {
    $s("#txnMethod").textContent = txn.method;
    $s("#txnMethod").className = "txn-badge " + txn.method;
    $s("#txnPath").textContent = txn.path;
    $s("#txnStatus").textContent = `${txn.status} ${({ 200: "OK", 401: "Unauthorized", 404: "Not Found", 429: "Too Many Requests", 500: "Internal Server Error" })[txn.status]}`;
    $s("#txnStatus").className = "status-badge s" + txn.status;
    $s("#txnMeta").innerHTML = `Latency <b>${txn.latency} ms</b>, payload ${txn.payloadKB}${txn.cached ? ", dilayani dari cache Apache" : ""}`;
    $s("#pane_headers").innerHTML = highlightJson(JSON.stringify(txn.headers, null, 2));
    const body = txn.body ?? { note: `Request ${txn.method} ini tidak membawa body (idempotent read / delete by filter).` };
    $s("#pane_body").innerHTML = highlightJson(JSON.stringify(body, null, 2));
    $s("#pane_sql").innerHTML = txn.sql
      .split("\n")
      .map((l) => {
        const t = l.trim();
        if (t.startsWith("--")) return `<span class="j-comment">${esc(l)}</span>`;
        if (/ERROR|TIDAK|429|401|404|500|Retry-After|Unknown column|Too many connections|http_response_code/i.test(l)) return `<span class="j-null">${esc(l)}</span>`;
        return esc(l);
      })
      .join("\n");
    $s("#pane_response").innerHTML = highlightJson(JSON.stringify(txn.response, null, 2));
  },

  /* ---------------- Kirim request (animasi 3D + viewer + log) ---------------- */
  async send() {
    if (this.state.busy) return;
    this.state.busy = true;
    this._stopped = false;
    const btn = $s("#btnSendRequest");
    btn.disabled = true;
    const txn = this.buildTxn();
    this.setProcButtons(true);
    this.procStatus("Aliran penuh dijalankan: Browser ke Apache ke PHP ke MySQL, lalu response JSON mengalir balik ke client.");

    if (this.scene?.ready) {
      await this.scene.sendRequest({
        method: txn.method,
        status: txn.status,
        speed: this.state.speed,
        faultNode: txn.faultNode,
        labels: {
          sql: this.sqlLabel(txn),
          response: `[${txn.status}] Response JSON`,
        },
      });
    }
    this.setProcButtons(false);
    if (this._stopped) {
      this._stopped = false;
      this.state.busy = false;
      btn.disabled = false;
      return;
    }

    await this.settleFlow(txn, "Mengirim");
    this.state.busy = false;
    btn.disabled = false;
  },

  sqlLabel(txn) {
    return txn.sql.split("\n").find((l) => !l.trim().startsWith("--"))?.trim().slice(0, 34) || "[SQL] Kueri PDO MySQL";
  },

  async settleFlow(txn, aksi) {
    this.state.investigated = true;
    if (this.state.stage === 3) this.renderStepper();


    if (this.state.scenarioCode !== "NORMAL") {
      await Api.post("scenarios.php", {
        kode: this.state.scenarioCode,
        metode: txn.method,
        status_http: txn.status,
        is_resolved: txn.status === 200,
        selected_solution: this.state.selectedSolution || null,
        latency_ms: txn.latency,
      });
      if (txn.status === 200) {
        // terbukti sehat - solusi benar / perbaikan manual dari inspector
        if (this.state.stage >= 4 && !this.state.resolved) {
          this.state.resolved = true;
          this.state.stage = 5;
          this.renderStepper();
          this.renderProblem();
        }
      }
    }

    if (txn.status === 200) {
      this.toast(`${txn.method} ${txn.path} -> 200 OK (${txn.latency} ms), paket pulang-pergi mulus.`, "success");
    } else {
      this.toast(`Request dihentikan: ${txn.status} di node ${String(txn.faultNode).toUpperCase()}, inspeksi payload dan hotspot.`, "error");
    }
  },

  /* ---------------- Menjalankan satu tahap proses ---------------- */
  setProcButtons(disabled) {
    $$s("#processRow .proc-btn").forEach((b) => {
      b.disabled = !!disabled;
      if (disabled) b.classList.remove("running");
    });
  },

  procStatus(text) {
    const el = $s("#procStatus");
    if (el) el.textContent = text;
  },

  showPane(name) {
    const tab = $s(`.json-tab[data-pane="${name}"]`);
    if (tab) tab.click();
  },

  tahapCatatan(idx, txn, hasil) {
    const col = this.cfg("backend", "sql_column", "created_at");
    const auth = this.cfg("client", "auth_header", "Bearer <token_sesi_valid>");
    const cache = this.cfg("gateway", "response_cache", "DISABLED");
    const nodeNama = (id) => ({ client: "CLIENT", gateway: "WEB SERVER (Apache)", backend: "BACKEND PHP", database: "DATABASE MySQL" })[id] || String(id).toUpperCase();
    if (hasil?.tidakTercapai) {
      this.showPane(idx >= 2 ? "sql" : "headers");
      const tahapPenghambat = { client: 1, gateway: 2, backend: 3, database: 4 }[txn.faultNode] || 2;
      return `Tahap ${idx + 1} tidak tercapai: request sudah ditolak di node ${nodeNama(txn.faultNode)} dengan status ${txn.status}. Perbaiki konfigurasi pada tahap ${tahapPenghambat}, lalu jalankan ulang.`;
    }
    if (idx === 0) {
      this.showPane("headers");
      return `Tahap 1 (Client): menyusun ${txn.method} ${txn.path}. Header Authorization = "${auth}". Payload ${txn.payloadKB} siap dikirim.`;
    }
    if (idx === 1) {
      this.showPane("body");
      if (txn.status === 404) return "Tahap 2 (WEB SERVER): RewriteRule .htaccess tidak menemukan file PHP untuk path ini. Request berhenti dengan 404, skrip tidak tersentuh.";
      if (txn.status === 429) return "Tahap 2 (WEB SERVER): kuota mod_qos habis (X-RateLimit-Remaining: 0). Cache output = " + cache + ", request berhenti dengan 429.";
      if (txn.status === 401) return "Tahap 2 (WEB SERVER): Authorization \"" + auth + "\" tidak terikat record sesi, gerbang autentikasi menolak request. Status 401.";
      return "Tahap 2 (WEB SERVER): rute .htaccess cocok, kuota trafik aman, request diteruskan ke skrip PHP.";
    }
    if (idx === 2) {
      this.showPane("sql");
      return `Tahap 3 (Backend PHP): session_start() memvalidasi token, skrip menyusun kueri PDO dengan kolom "${col}".`;
    }
    if (idx === 3) {
      this.showPane("sql");
      if (txn.status === 500) return `Tahap 4 (DATABASE MySQL): kueri ditolak. Kolom "${col}" tidak ada pada tabel dan mode koneksi ${this.cfg("backend", "db_connect", "mysqli_direct")} membuat max_connections ${this.cfg("database", "max_conn", "20")} cepat habis. Status 500.`;
      return "Tahap 4 (DATABASE MySQL): SQL dieksekusi sesuai hak akses GRANT user MySQL, result set dikembalikan ke skrip PHP.";
    }
    this.showPane("response");
    if (txn.status !== 200) return `Tahap 5 (Response): client menerima ${txn.status} dari node ${nodeNama(txn.faultNode)}, bukan data. UI menampilkan pesan error.`;
    return `Tahap 5 (Response): ${txn.status} OK mengalir balik MySQL-PHP-Apache-browser, UI merender data dalam ${txn.latency} ms.`;
  },

  async runProcessStep(idx) {
    if (this.state.busy || !this.scene?.ready) return;
    this.state.busy = true;
    this._stopped = false;
    const txn = this.buildTxn();
    const btn = $s(`#processRow .proc-btn[data-proc="${idx}"]`);
    this.setProcButtons(true);
    $$s("#processRow .proc-btn").forEach((b) => b.classList.remove("running"));
    btn?.classList.add("running");
    this.procStatus(`Menjalankan tahap ${idx + 1} dari 5...`);

    const hasil = await this.scene.runStep(idx, {
      speed: this.state.speed,
      method: txn.method,
      status: txn.status,
      faultNode: txn.faultNode,
      labels: { sql: this.sqlLabel(txn) },
    });

    this.setProcButtons(false);
    if (this._stopped || hasil?.batal) {
      this._stopped = false;
      this.procStatus("Proses dihentikan. Paket dihapus dari jalur, silakan jalankan ulang tahap yang diinginkan.");
      this.state.busy = false;
      return;
    }

    btn?.classList.remove("running");
    btn?.classList.toggle("done-step", !!hasil?.ok);
    btn?.classList.toggle("fail", !hasil?.ok && !hasil?.tidakTercapai);
    btn?.classList.toggle("blocked", !!hasil?.tidakTercapai);
    const catatan = this.tahapCatatan(idx, txn, hasil);
    this.procStatus(catatan);
    this.state.lastCatatanTahap = catatan;

    if (idx === 4) await this.settleFlow(txn, `Menjalankan tahap per tahap (${txn.method} ${txn.path})`);
    else {
      this.state.investigated = true;
      if (this.state.stage === 3) this.renderStepper();
    }
    this.state.busy = false;
  },

  stopProcess() {
    this._stopped = true;
    this.scene?.stopAll();
    this.setProcButtons(false);
    $$s("#processRow .proc-btn").forEach((b) => b.classList.remove("running"));
    this.procStatus("Seluruh animasi paket dihentikan. Pipeline direset, tidak ada data yang diubah.");
    this.state.busy = false;
    const btn = $s("#btnSendRequest");
    if (btn) btn.disabled = false;
  },
};

if (typeof window !== "undefined") window.PBLSimulator = PBLSimulator;
