/* =====================================================================
 * SIRKUIT - js/lab-uji.js
 * Lab Uji Kode: PHP siswa dieksekusi sungguhan oleh php-cli lewat
 * api/lab-run.php, kueri SQL siswa dieksekusi MySQL lewat endpoint yang sama,
 * dan keduanya dinilai Checker di server. Latihan JavaScript (dan PHP bila
 * hosting memblokir proc_open) berjalan di ruang isolasi peramban
 * (js/lab-sandbox.js); jejaknya dilaporkan ke api/lab-run.php untuk dinilai,
 * jadi kriteria latihan tidak pernah turun ke peramban.
 * Classic script - mengekspos window.LabUji.
 */

const $l = (sel) => document.querySelector(sel);
const $$l = (sel) => Array.from(document.querySelectorAll(sel));

const LAB_STORE = "sirkuit_lab_v2";
const RUN_TIMEOUT_MS = 20000;

const LAB_LEVEL_CLASS = {
  log: "",
  info: "c-info",
  warn: "c-warn",
  error: "c-err",
  ok: "c-ok",
  dim: "c-dim",
};

const LabUji = {
  index: 0,
  solved: new Set(),
  bank: null,
  runner: "",
  catatanRunner: "",
  skema: null,
  skemaBasis: "",
  grid: null,
  frame: null,
  frameReady: null,
  sandboxSrc: null,
  running: false,
  watchdog: null,
  bound: false,
  batal: null,
  dibatalkan: false,
  lastRun: null,

  exercises() {
    return this.bank || [];
  },
  current() {
    return this.exercises()[this.index] || null;
  },

  init() {
    try {
      const raw = JSON.parse(localStorage.getItem(LAB_STORE) || "{}");
      (raw.solved || []).forEach((id) => this.solved.add(id));
    } catch (e) {
      /* storage kosong atau rusak: mulai tanpa riwayat */
    }
    this.renderSchema();
    this.renderList();
    this.showTask(this.index);
    this.muatDariServer();

    if (this.bound) return;
    this.bound = true;

    $l("#labLoadTask").addEventListener("click", () => this.loadKerangka());
    $l("#labPrevTask").addEventListener("click", () => this.showTask(this.index - 1));
    $l("#labNextTask").addEventListener("click", () => this.showTask(this.index + 1));
    $l("#labRun").addEventListener("click", () => this.run());
    $l("#labCheck").addEventListener("click", () => this.run({ periksa: true }));
    $l("#labStop").addEventListener("click", () => this.stop());
    $l("#labClear").addEventListener("click", () => {
      this.out().innerHTML = "";
      $l("#labRunStat").textContent = "Belum dijalankan";
    });
    $l("#labMode").addEventListener("change", () => this.write("dim", "Mode sistem diubah ke " + $l("#labMode").value + ". Jalankan ulang kode untuk memakai kondisi ini."));
    $l("#labLang").addEventListener("change", () => {
      const lang = $l("#labLang").value;
      const idx = this.exercises().findIndex((e) => e.bahasa === lang);
      if (idx >= 0) this.showTask(idx);
      else this.write("dim", "Tidak ada latihan " + this.bahasaLabel(lang) + " pada bank latihan. Tulis kode sendiri di editor.");
    });
    $l("#labCode").addEventListener("input", () => {
      if (!this.running) $l("#labRunStat").textContent = "Kode diubah, belum dijalankan";
    });
  },

  out() {
    return $l("#labOut");
  },

  /** Bank latihan, status runner, dan struktur tabel dibaca dari MySQL. */
  async muatDariServer() {
    const r = await Api.get("exercises.php");
    if (r.ok) {
      this.bank = r.data.data || [];
      this.runner = r.data.runner || "browser";
      this.catatanRunner = r.data.catatan_runner || "";
      this.showTask(Math.min(this.index, Math.max(0, this.bank.length - 1)));
    } else {
      $l("#labProgress").textContent = "Bank latihan gagal dimuat";
      $l("#labExDetail").innerHTML = "<b>Bank latihan tidak terbaca dari MySQL.</b><br>" + (r.error || Api.pesanServer) + "<br><br>Tulis kode sendiri di editor dan tekan Jalankan; kode tetap dijalankan php-cli atau MySQL sesuai pilihan bahasa.";
      this.write("warn", "Bank latihan tidak terbaca dari MySQL: " + (r.error || Api.pesanServer) + ". Buka ulang halaman ini untuk mencoba lagi.");
    }
    this.tagRunner();

    const s = await Api.get("schema.php");
    if (s.ok) {
      this.skema = s.data.data || [];
      this.skemaBasis = (s.data.meta && s.data.meta.basis_data) || "";
      this.renderSchema();
    }
  },

  tagRunner() {
    const el = $l("#labJalankan");
    if (!el) return;
    el.textContent = this.runner === "server" ? "PHP dijalankan php-cli server" : "PHP dijalankan ruang isolasi peramban";
    el.title = this.runner === "server" ? "Kode PHP siswa dijalankan anak proses php-cli dengan batas waktu dan memori." : this.catatanRunner || "Hosting memblokir proc_open, PHP dijalankan simulator di peramban.";
  },

  loadSandbox() {
    if (this.sandboxSrc) return Promise.resolve(this.sandboxSrc);
    const ambil = (file) =>
      fetch(file + "?v=" + encodeURIComponent(SIRKUIT_CONFIG.VERSION || "1"), { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(file + " HTTP " + r.status);
        return r.text();
      });
    this._loading = this._loading || Promise.all([ambil("js/php-mini.js"), ambil("js/lab-sandbox.js")])
      .then(([php, sandbox]) => {
        this.sandboxSrc = php + "\n" + sandbox;
        return this.sandboxSrc;
      })
      .catch((err) => {
        this._loading = null;
        this.write("error", "Gagal memuat ruang uji: " + err.message + ". Jalankan aplikasi lewat server lokal (bukan file://).");
        return null;
      });
    return this._loading;
  },

  /* ---------------- Data latihan ---------------- */
  buildTables() {
    const stamp = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
    const siswa = SIRKUIT_CONFIG.STUDENTS.map((s) => ({ id: s.id, nisn: s.nisn, nama: s.nama, kelas: s.kelas, created_at: stamp(120) }));
    const nilai_ukk = SIRKUIT_CONFIG.STUDENTS.map((s, i) => ({
      id: i + 1, siswa_id: s.id, nama: s.nama, paket_keahlian: "RPL", nilai: s.skor, is_published: s.skor >= 70, created_at: stamp(30),
    }));
    const jurnal_pkl = SIRKUIT_CONFIG.STUDENTS.slice(0, 8).map((s, i) => ({
      id: i + 1, siswa_id: s.id,
      hari: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Senin", "Selasa", "Rabu"][i],
      isi: ["Membuat endpoint REST API nilai siswa dengan PHP", "Login sesi PHP dan Proteksi Halaman", "Optimasi query MySQL dengan JOIN dan INDEX", "Perbaikan header Authorization di .htaccess", "Pengujian rate limiting mod_qos pada Apache", "Menyusun jurnal harian dengan form HTML dan PHP", "Debug error MySQL 1054 Unknown column", "Refactor query MySQLi ke PDO prepared statement"][i],
      created_at: stamp(i * 3 + 1),
    }));
    const proyek = SIRKUIT_CONFIG.STUDENTS.slice(8, 16).map((s, i) => ({
      id: i + 1, siswa_id: s.id,
      judul: ["Sistem Informasi Prakerin", "Dashboard Nilai UKK", "Absensi WebRTC", "Katalog Buku Perpustakaan", "Penjadwalan Piket", "Lapor Gangguan Lab", "E-Rapor SMK", "Portal Alumni"][i],
      status: ["draft", "review", "publikasi"][i % 3], deadline: "2027-04-30", created_at: stamp(i + 5),
    }));
    const prakerin = SIRKUIT_CONFIG.STUDENTS.slice(0, 12).map((s, i) => ({
      id: i + 1, siswa_id: s.id,
      paket: ["Pengembangan Aplikasi Web", "Administrasi Jaringan", "Pengembangan Aplikasi Web", "Basis Data", "Pemodelan dan Simulasi", "Pengembangan Aplikasi Web", "Jaringan Fiber Optik", "Pengembangan Aplikasi Web", "Basis Data", "Pemodelan dan Simulasi", "Pengembangan Aplikasi Web", "Basis Data"][i],
      jam: 40 + i * 8, catatan: "Logbook minggu " + ((i % 8) + 1), updated_at: stamp(i + 20),
    }));
    const sesi_login = SIRKUIT_CONFIG.STUDENTS.slice(16, 26).map((s, i) => ({
      id: i + 1, siswa_id: s.id, token: "tok_" + s.nisn + "_" + (i + 1),
      status: i % 2 ? "kedaluwarsa" : "aktif", ip: "10.10.2." + (10 + i), dibuat_at: stamp(i % 2 ? 400 : 5), kedaluwarsa_at: stamp(i % 2 ? 399 : 4),
    }));
    return [
      { nama: "siswa", kolom: SIRKUIT_CONFIG.LAB_SCHEMA[0].kolom, rows: siswa },
      { nama: "nilai_ukk", kolom: SIRKUIT_CONFIG.LAB_SCHEMA[1].kolom, rows: nilai_ukk },
      { nama: "jurnal_pkl", kolom: SIRKUIT_CONFIG.LAB_SCHEMA[2].kolom, rows: jurnal_pkl },
      { nama: "proyek", kolom: SIRKUIT_CONFIG.LAB_SCHEMA[3].kolom, rows: proyek },
      { nama: "prakerin", kolom: SIRKUIT_CONFIG.LAB_SCHEMA[4].kolom, rows: prakerin },
      { nama: "sesi_login", kolom: SIRKUIT_CONFIG.LAB_SCHEMA[5].kolom, rows: sesi_login },
    ];
  },

  buildRoutes() {
    const extra = [
      { path: "/api/nilai-siswa.php", metode: "GET", nama: "Nilai siswa per kelas" },
      { path: "/api/prakerin-siswa.php", metode: "GET", nama: "Logbook prakerin" },
      { path: "/api/proyek-siswa.php", metode: "GET", nama: "Daftar proyek siswa" },
    ];
    const all = [...SIRKUIT_CONFIG.ENDPOINTS, ...extra, ...SIRKUIT_CONFIG.SCENARIOS.map((s) => ({ path: s.endpointAwal, metode: s.metodeAwal, nama: "Endpoint studi kasus PBL" }))];
    const seen = new Set();
    const tableOf = (p) => {
      const x = String(p).toLowerCase();
      if (x.includes("jurnal")) return "jurnal_pkl";
      if (x.includes("proyek")) return "proyek";
      if (x.includes("nilai")) return "nilai_ukk";
      if (x.includes("prakerin")) return "prakerin";
      if (x.includes("sesi") || x.includes("auth")) return "sesi_login";
      return "siswa";
    };
    return all
      .filter((e) => {
        const key = String(e.path).split("?")[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((e) => ({ path: String(e.path).split("?")[0], metode: e.metode, nama: e.nama, tabel: tableOf(e.path) }));
  },

  /** Petunjuk kolom dibaca dari information_schema bila server menjawab. */
  renderSchema() {
    const el = $l("#labSchema");
    if (!el) return;
    if (this.skema) {
      const peran = { PRI: "kunci utama", UNI: "unik", MUL: "indeks" };
      const kepala = "-- database ruang latihan" + (this.skemaBasis ? ": " + this.skemaBasis : "") + "\n";
      el.textContent =
        kepala +
        this.skema
          .map((t) => "-- tabel " + t.tabel + "\n" + t.kolom.map((k) => "   " + String(k.kolom).padEnd(16) + String(k.tipe).padEnd(20) + [peran[k.kunci] || "", k.boleh_null === "YES" ? "boleh NULL" : "", k.extra === "auto_increment" ? "auto increment" : ""].filter(Boolean).join(", ")).join("\n"))
          .join("\n\n");
      return;
    }
    const lines = SIRKUIT_CONFIG.LAB_SCHEMA.map((t) => "-- tabel " + t.tabel + "\n" + t.kolom.map((k) => "   " + k.nama.padEnd(16) + k.tipe.padEnd(20) + "-- contoh: " + k.contoh).join("\n"));
    el.textContent = lines.join("\n\n");
  },

  /* ---------------- Tampilan latihan ---------------- */
  bahasaLabel(b) {
    return b === "php" ? "PHP" : b === "sql" ? "SQL" : "JavaScript";
  },

  renderList() {
    $l("#labExercises").innerHTML = this.exercises()
      .map((e, i) => `<li data-ex="${i}" class="${i === this.index ? "sel" : ""} ${this.solved.has(e.id) ? "solved" : ""}">${e.judul} <span class="c-dim">(${this.bahasaLabel(e.bahasa)})</span></li>`)
      .join("");
    $$l("#labExercises li").forEach((li) => li.addEventListener("click", () => this.showTask(parseInt(li.dataset.ex, 10))));
    const total = this.exercises().length;
    $l("#labProgress").textContent = `${this.solved.size} dari ${total} selesai`;
  },

  showTask(i) {
    const daftar = this.exercises();
    if (!daftar.length) return;
    const n = Math.max(0, Math.min(daftar.length - 1, i));
    this.index = n;
    const e = daftar[n];
    $l("#labLang").value = e.bahasa;
    $l("#labMode").value = e.mode || "NORMAL";
    $l("#labCode").value = e.kerangka || "";
    $l("#labExDetail").innerHTML = `<b>Latihan ${e.id}: ${e.judul}</b><br>${e.tujuan}<br><br>${e.petunjuk}`;
    this.renderList();
    $l("#labRunStat").textContent = "Kerangka dimuat, belum dijalankan";
  },

  loadKerangka() {
    const e = this.current();
    if (!e) return;
    $l("#labCode").value = e.kerangka || "";
    this.write("dim", "Kerangka kode latihan dimuat ke editor.");
  },

  /* ---------------- iframe sandbox ---------------- */
  async ensureFrame() {
    const src = await this.loadSandbox();
    if (!src) return null;
    if (this.frame && this.frameReady) return this.frameReady;
    const host = $l("#view-lab");
    const frame = document.createElement("iframe");
    frame.setAttribute("title", "Ruang uji kode");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.style.cssText = "position:absolute;width:1px;height:1px;border:0;left:-9999px;top:0;";
    frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ruang Uji</title></head><body><script>${src}<\/script></body></html>`;
    this.frame = frame;
    this.frameReady = new Promise((resolve) => {
      const onMessage = (ev) => {
        const d = ev.data || {};
        if (d.__sirkuitLab !== true) return;
        if (d.type === "hello") {
          frame.contentWindow.postMessage({ __sirkuitLab: true, type: "init", tables: this.buildTables(), endpoints: this.buildRoutes(), rateLimit: SIRKUIT_CONFIG.LAB_RATE_LIMIT }, "*");
          resolve(frame);
        } else if (d.type === "output") {
          this.write(d.level, d.text);
        } else if (d.type === "done") {
          const selesai = this._sandboxDone;
          this._sandboxDone = null;
          if (selesai) selesai(d.trace || {});
        }
      };
      this._onMessage = onMessage;
      window.addEventListener("message", onMessage);
    });
    host.appendChild(frame);
    return this.frameReady;
  },

  write(level, text) {
    const pre = this.out();
    if (!pre) return;
    this.log = (this.log || []).concat([text]);
    const line = document.createElement("div");
    line.className = LAB_LEVEL_CLASS[level] || "";
    line.textContent = text;
    pre.appendChild(line);
    pre.scrollTop = pre.scrollHeight;
  },

  clearOut() {
    this.log = [];
    this.out().innerHTML = "";
  },

  /* ---------------- Menjalankan kode ---------------- */
  async run(opts = {}) {
    if (this.running) {
      this.write("warn", "Kode masih berjalan. Tekan Hentikan untuk membatalkan.");
      return;
    }
    const ex = this.current();
    const bahasa = $l("#labLang").value;
    const mode = $l("#labMode").value;
    const kode = $l("#labCode").value;
    const latihan = ex && bahasa === ex.bahasa ? Number(ex.id) : 0;

    this.running = true;
    this.dibatalkan = false;
    this.batal = typeof AbortController !== "undefined" ? new AbortController() : null;
    $l("#labRun").disabled = true;
    $l("#labRunStat").textContent = "Menjalankan kode...";
    this.clearOut();
    this.write("dim", `Mode ${mode} | ${this.bahasaLabel(bahasa)} | ${labSumber(bahasa, this.runner)}`);
    if (opts.periksa) this.write("dim", "Jawaban diperiksa sesuai aturan latihan " + (latihan ? "nomor " + latihan : "yang sedang dibuka"));

    this.watchdog = setTimeout(() => {
      if (!this.running) return;
      this.write("error", "Kode dihentikan: berjalan lebih dari " + RUN_TIMEOUT_MS / 1000 + " detik. Periksa kemungkinan loop tanpa henti.");
      this.stop(true);
    }, RUN_TIMEOUT_MS);

    let hasil = null;
    try {
      if (bahasa === "sql") hasil = await this.jalankanServer("sql", mode, kode, latihan);
      else if (bahasa === "php" && this.runner === "server") hasil = await this.jalankanServer("php", mode, kode, latihan);
      if (!hasil && !this.dibatalkan) hasil = await this.jalankanPeramban(kode, bahasa, mode, latihan);
      if (hasil && !this.dibatalkan) this.saji(hasil);
    } finally {
      this.lepas();
    }
  },

  /** Permintaan eksekusi ke server: PHP dijalankan php-cli, SQL dijalankan MySQL. */
  async jalankanServer(bahasa, mode, kode, latihan) {
    const body = { bahasa, mode, kode };
    if (latihan) body.exercise_id = latihan;
    const r = await Api.minta("lab-run.php", { body, signal: this.batal ? this.batal.signal : undefined });
    if (r.ok) {
      return {
        sumber: "server",
        bahasa,
        mode: r.data.mode || mode,
        output: r.data.output || "",
        header: r.data.header || [],
        calls: r.data.calls || [],
        queries: r.data.queries || [],
        fatal: r.data.fatal || null,
        peringatan: r.data.peringatan || [],
        durasi_ms: r.data.durasi_ms || 0,
        dihentikan: !!r.data.dihentikan,
        basis_data: r.data.basis_data || "",
        pemroses: r.data.pemroses || "",
        penilaian: r.data.penilaian || null,
        lulus: !!r.data.lulus,
      };
    }
    if (this.dibatalkan) return null;
    /* 415/503 berarti hosting memblokir runner; latihan PHP jatuh ke peramban. */
    if ((r.status === 415 || r.status === 503) && bahasa === "php") {
      this.runner = "browser";
      this.catatanRunner = (r.data && r.data.message) || "";
      this.tagRunner();
      this.write("warn", this.catatanRunner + " Latihan PHP dialihkan ke ruang isolasi peramban.");
      return null;
    }
    this.write("error", "Server menolak permintaan: " + (r.error || Api.pesanServer));
    return { sumber: "server", bahasa, mode, output: "", header: [], calls: [], queries: [], fatal: r.error || "lab-run.php menolak permintaan", peringatan: [], penilaian: null, lulus: false };
  },

  /** Ruang isolasi peramban: dijalankan di iframe, lalu jejaknya dinilai server. */
  async jalankanPeramban(kode, bahasa, mode, latihan) {
    const jejak = await new Promise((resolve) => {
      this.ensureFrame().then((frame) => {
        if (!frame) {
          resolve(null);
          return;
        }
        this._sandboxDone = resolve;
        frame.contentWindow.postMessage({ __sirkuitLab: true, type: "run", code: kode, language: bahasa, mode: mode }, "*");
      });
    });
    if (!jejak) return null;

    const peta = {
      sumber: "browser",
      bahasa,
      mode,
      output: (jejak.messages || []).map((m) => m.text).join("\n"),
      header: jejak.headers || [],
      calls: (jejak.calls || []).map((c) => ({ method: c.method, path: c.path, status: c.status, from_cache: !!c.fromCache, waktu_ms: c.latencyMs || 0 })),
      queries: (jejak.queries || []).map((q) => ({
        sql: q.sql,
        rows: (q.rows || []).length,
        terpengaruh: q.affected !== undefined && q.affected !== null ? q.affected : (q.rows || []).length,
        waktu_ms: 0,
        error: q.error || null,
        kode: null,
        kolom: q.columns || [],
        data: q.rows || [],
      })),
      fatal: jejak.fatal || null,
      peringatan: [],
      penilaian: null,
      lulus: false,
    };

    if (latihan) {
      const r = await Api.minta("lab-run.php", {
        body: { exercise_id: latihan, bahasa, mode, jejak: { output: peta.output, header: peta.header, calls: jejak.calls || [], queries: peta.queries, fatal: peta.fatal, mode, dihentikan: false } },
        signal: this.batal ? this.batal.signal : undefined,
      });
      if (r.ok) {
        peta.penilaian = r.data.penilaian || null;
        peta.lulus = !!r.data.lulus;
      } else {
        this.write("error", "Penilaian server gagal: " + (r.error || Api.pesanServer));
      }
    }
    return peta;
  },

  /** Menyajikan satu hasil eksekusi pada konsol, grid, dan status latihan. */
  saji(hasil) {
    const trace = { calls: hasil.calls || [], queries: hasil.queries || [], headers: hasil.header || [] };

    if (hasil.pemroses) this.write("dim", "Dijalankan oleh: " + hasil.pemroses + (hasil.basis_data ? " pada database " + hasil.basis_data : ""));
    if (hasil.sumber === "server" && hasil.output) {
      hasil.output.split("\n").forEach((baris) => this.write("log", baris));
    }
    (hasil.header || []).forEach((h) => this.write("dim", "Header PHP: " + h));
    if ((hasil.peringatan || []).length) {
      this.write("dim", "Peringatan PHP:");
      hasil.peringatan.forEach((p) => this.write("warn", "   " + p));
    }
    if (trace.calls.length) {
      this.write("dim", "Ringkasan HTTP:");
      trace.calls.forEach((c, i) => {
        const cls = c.status === 200 ? "ok" : c.status >= 500 ? "error" : "warn";
        const ms = c.waktu_ms || c.latencyMs || 0;
        this.write(cls, `   ${i + 1}. ${c.method} ${c.path} -> ${c.status}${ms ? ", " + ms + " ms" : ""}${c.from_cache || c.fromCache ? ", cache Apache" : ""}`);
      });
    }
    if (trace.queries.length) {
      const gagal = trace.queries.filter((q) => q.error).length;
      this.write("dim", `Ringkasan SQL: ${trace.queries.length} statement, ${gagal} gagal.`);
      trace.queries.forEach((q, i) => this.write(q.error ? "error" : "log", `   ${i + 1}. ${q.error ? "GAGAL: " + q.error : (q.rows || 0) + " baris, " + (q.waktu_ms || 0) + " ms"} | ${String(q.sql).replace(/\s+/g, " ").slice(0, 110)}`));
    }
    if (hasil.dihentikan) this.write("error", "Anak proses PHP dihentikan server karena melewati batas waktu. Periksa loop tanpa henti atau kueri yang memindai seluruh tabel.");
    if (hasil.fatal) this.write("error", "Fatal: " + hasil.fatal);
    this.tampilGrid(trace.queries);

    this.lastRun = {
      kode: $l("#labCode").value,
      bahasa: hasil.bahasa,
      mode: hasil.mode,
      output: (this.log || []).join("\n"),
      trace,
      passed: !!hasil.lulus,
      pesan: hasil.penilaian ? hasil.penilaian.pesan : "",
    };

    const nilai = hasil.penilaian;
    if (nilai) {
      this.write(nilai.passed ? "ok" : "error", "Hasil pemeriksaan: " + (nilai.passed ? "TEPAT. " : "BELUM TEPAT. ") + nilai.pesan);
      (nilai.periksa || []).forEach((p) => {
        if (!p.lulus) this.write("dim", "   aturan " + p.aturan + ": " + (p.pesan || "belum terpenuhi"));
      });
      if (nilai.passed) {
        this.markSolved();
        $l("#labRunStat").textContent = "Latihan tuntas";
      } else {
        $l("#labRunStat").textContent = "Berjalan selesai, latihan belum tuntas";
      }
    } else {
      $l("#labRunStat").textContent = hasil.dihentikan ? "Dihentikan (batas waktu)" : "Berjalan selesai";
    }
  },

  /** Kueri terakhir yang benar-benar punya hasil; aturan yang sama dipakai grid dan lampiran jawaban. */
  pilihKueri(queries) {
    const berisi = (queries || []).filter((q) => !q.error && ((q.data || []).length || (q.kolom || []).length));
    return berisi[berisi.length - 1] || null;
  },

  /** Baris hasil kueri terakhir digambar sebagai grid MySQL yang sebenarnya. */
  tampilGrid(queries) {
    const host = $l("#labGridHasil");
    if (!host || !window.DataGrid) return;
    const q = this.pilihKueri(queries);
    if (!this.grid) this.grid = DataGrid.buat(host, { mode: "hasil", judul: "Baris MySQL dari kode saya" });
    if (!q) {
      this.grid.kosong("Kode belum mengembalikan baris MySQL. Kueri yang gagal tidak punya baris hasil.");
      return;
    }
    this.grid.isi(
      {
        perintah: (/^\s*(\w+)/.exec(String(q.sql)) || [, ""])[1].toUpperCase(),
        sql: q.sql,
        kolom: (q.kolom || []).map((nama) => ({ nama })),
        rows: q.data || [],
        waktu_ms: q.waktu_ms || 0,
        terpengaruh: q.terpengaruh || 0,
        server: "MySQL/MariaDB",
      },
      { judul: "Baris MySQL dari kode saya" }
    );
  },

  lepas() {
    clearTimeout(this.watchdog);
    this.running = false;
    this.batal = null;
    const tombol = $l("#labRun");
    if (tombol) tombol.disabled = false;
  },

  /** Tugas guru dapat menunjuk nomor latihan pada bank latihan (lab_exercises.id). */
  bukaLatihanServer(id) {
    const n = Number(id);
    const idx = this.exercises().findIndex((e) => Number(e.id) === n);
    if (idx < 0) {
      this.write("warn", "Latihan nomor " + n + " belum ada pada daftar latihan, kerjakan dengan menulis kode sendiri.");
      return false;
    }
    this.showTask(idx);
    return true;
  },

  /** Isi POST api/submissions.php dari hasil jalan terakhir. */
  payloadJawaban() {
    const r = this.lastRun;
    if (!r) return null;
    const terakhir = this.pilihKueri(r.trace.queries);
    const panggilan = r.trace.calls || [];
    const status = panggilan.length ? panggilan[panggilan.length - 1].status : 200;
    return {
      kode: r.kode,
      output: r.output,
      status_http: status || 200,
      lulus: r.passed,
      jejak: { mode: r.mode, bahasa: r.bahasa, calls: panggilan, queries: r.trace.queries, headers: r.trace.headers },
      hasil_grid: terakhir ? { kolom: terakhir.kolom || [], rows: (terakhir.data || []).slice(0, 100), sql: terakhir.sql } : null,
    };
  },

  markSolved() {
    const ex = this.current();
    if (!ex || this.solved.has(ex.id)) return;
    this.solved.add(ex.id);
    localStorage.setItem(LAB_STORE, JSON.stringify({ solved: [...this.solved] }));
    this.renderList();
    if (window.SIRKUIT_toast) SIRKUIT_toast(`Latihan ${ex.judul} tuntas.`, "success");
  },

  stop(fromTimeout) {
    clearTimeout(this.watchdog);
    this.dibatalkan = true;
    if (this.batal) this.batal.abort();
    const menunggu = this._sandboxDone;
    this._sandboxDone = null;
    if (menunggu) menunggu(null);
    this.lepas();
    if (this.frame) {
      window.removeEventListener("message", this._onMessage);
      this.frame.remove();
      this.frame = null;
      this.frameReady = null;
    }
    if (!fromTimeout) this.write("warn", "Eksekusi kode dihentikan. Ruang uji siap dipakai kembali.");
    $l("#labRunStat").textContent = "Dihentikan";
  },
};

function labSumber(bahasa, runner) {
  if (bahasa === "sql") return "MySQL ruang latihan (api/lab-run.php)";
  if (bahasa === "php") return runner === "server" ? "php-cli di server (api/lab-run.php)" : "ruang isolasi peramban, dinilai server";
  return "ruang isolasi peramban, dinilai server";
}

if (typeof window !== "undefined") window.LabUji = LabUji;
