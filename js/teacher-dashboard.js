/* =====================================================================
 * SIRKUIT - js/teacher-dashboard.js
 * Dashboard Monitoring Guru. Semua angka diambil dari MySQL lewat
 * GET /api/dashboard.php (rekap), GET /api/grades.php (per siswa), dan
 * GET /api/scenarios.php (progres simulasi PBL satu kelas). Tidak ada data
 * contoh yang dikarang di peramban.
 * Classic script - mengekspos window.TeacherDashboard.
 * ===================================================================== */

const $d = (sel) => document.querySelector(sel);
const $$d = (sel) => Array.from(document.querySelectorAll(sel));

const TeacherDashboard = {
  siswa: [],
  rekap: null,
  progres: {},
  kodeSkenario: [],
  filters: { kelas: "SEMUA", kkm: "SEMUA", cari: "" },
  _bound: false,

  async render() {
    await this.muat();
    if (!this._bound) {
      this._bound = true;
      $d("#btnCsv").addEventListener("click", () => this.exportCsv());
      $d("#btnDashMuat").addEventListener("click", () => {
        this.muat().then(() => window.SIRKUIT_toast("Data dashboard dimuat ulang dari MySQL.", "success"));
      });
      $d("#dashSearch").addEventListener("input", (e) => {
        this.filters.cari = e.target.value.toLowerCase();
        this.renderTable();
      });
    }
  },

  async muat() {
    const kelas = this.filters.kelas === "SEMUA" ? undefined : this.filters.kelas;
    const [rek, grad, scn] = await Promise.all([
      Api.get("dashboard.php", kelas ? { kelas } : undefined),
      Api.get("grades.php", kelas ? { kelas } : undefined),
      Api.get("scenarios.php"),
    ]);
    if (!rek.ok || !grad.ok) {
      $d("#kpiGrid").innerHTML = `<div class="kpi-card panel"><div class="kpi-cap">Gagal memuat</div><div class="kpi-val">-</div><div class="kpi-sub">HTTP ${rek.status || grad.status}: ${rek.error || grad.error || "server PHP tidak menjawab"}</div></div>`;
      return;
    }
    this.rekap = rek.data;
    this.siswa = grad.data.data || [];
    this.kodeSkenario = (scn.data.data || []).map((s) => s.kode);
    (scn.data.progres_kelas || []).forEach((p) => {
      this.progres[p.student_name] = p;
    });
    this.renderKelasOptions();
    this.renderKpi();
    this.renderTable();
    this.renderLogs();
    this.renderValidasi();
    this.bindFilters();
  },

  renderKelasOptions() {
    const sel = $d("#dashKelas");
    const daftar = (this.rekap.ringkas.daftar_kelas || []).filter(Boolean);
    if (!daftar.length) return;
    const sekarang = sel.value;
    sel.innerHTML = '<option value="SEMUA">Semua Kelas</option>' + daftar.map((k) => `<option value="${k}">${k}</option>`).join("");
    sel.value = daftar.includes(sekarang) || sekarang === "SEMUA" ? sekarang : "SEMUA";
    this.filters.kelas = sel.value;
  },

  kpi() {
    const r = this.rekap.ringkas;
    const n = this.rekap.nilai_ukk || {};
    const lab = this.rekap.lab_runs || [];
    const totalCoba = lab.reduce((a, x) => a + Number(x.jumlah_jalankan || 0), 0);
    const totalLolos = lab.reduce((a, x) => a + Number(x.lulus || 0), 0);
    const selesai = Object.values(this.progres).reduce((a, p) => a + Number(p.terselesaikan || 0), 0);
    const perluSimulasi = Math.max(1, (r.total_siswa || 0) * (this.kodeSkenario.length || 4));
    return {
      total: r.total_siswa,
      pct: r.persen_tuntas_ukk,
      tuntas: Number(n.tuntas || 0),
      terdata: Number(n.terdata || 0),
      rata: n.rata_nilai,
      belumDinilai: r.belum_dinilai,
      tugasAktif: r.tugas_aktif,
      labLolos: totalCoba ? ((totalLolos / totalCoba) * 100).toFixed(1) : "0.0",
      totalCoba,
      simPct: (selesai / perluSimulasi) * 100,
      tanpaAkun: r.siswa_belum_punya_akun,
      kkm: this.rekap.meta.kkm,
    };
  },

  renderKpi() {
    const k = this.kpi();
    $d("#kpiGrid").innerHTML = `
      <div class="kpi-card panel">
        <div class="kpi-cap">Total Siswa Terdaftar</div>
        <div class="kpi-val">${k.total}</div>
        <div class="kpi-sub">${k.total - k.tanpaAkun} punya akun login, ${k.tanpaAkun} ada di tabel siswa tetapi belum tertaut NISN-nya</div>
      </div>
      <div class="kpi-card panel">
        <div class="kpi-cap">Ketuntasan Hasil UKK (KKM >= ${k.kkm})</div>
        <div class="kpi-val ${k.pct >= 85 ? "ok" : "warn"}">${Number(k.pct).toFixed(1)}%</div>
        <div class="kpi-sub">${k.tuntas} dari ${k.terdata} baris nilai, rata-rata ${k.rata ?? "-"}. Target Tabel 3.4: >= 85% ${k.pct >= 85 ? "tercapai" : "masih dipantau"}</div>
      </div>
      <div class="kpi-card panel">
        <div class="kpi-cap">Tugas dan Penilaian</div>
        <div class="kpi-val ${k.belumDinilai ? "warn" : "ok"}">${k.belumDinilai}</div>
        <div class="kpi-sub">${k.tugasAktif} tugas aktif menunggu dinilai. Kiriman siswa memakai upsert, jadi satu jawaban per tugas.</div>
      </div>
      <div class="kpi-card panel">
        <div class="kpi-cap">Lab Uji dan Simulasi PBL</div>
        <div class="kpi-val">${k.labLolos}%</div>
        <div class="kpi-sub">${k.totalCoba} dijalankan di Lab Uji, simulasi PBL terselesaikan ${k.simPct.toFixed(1)}% dari ${k.total} x ${this.kodeSkenario.length || 4} skenario</div>
      </div>`;
  },

  bindFilters() {
    const kelasSel = $d("#dashKelas");
    const kkmSel = $d("#dashKkm");
    if (!kelasSel.dataset.bound) {
      kelasSel.dataset.bound = "1";
      kelasSel.addEventListener("change", () => {
        this.filters.kelas = kelasSel.value;
        this.muat();
      });
      kkmSel.addEventListener("change", () => {
        this.filters.kkm = kkmSel.value;
        this.renderTable();
      });
    }
  },

  filtered() {
    const f = this.filters;
    const kkm = this.rekap.meta.kkm;
    return this.siswa.filter((s) => {
      const skor = Number(s.nilai ?? s.kuis_terbaik ?? 0);
      if (f.kkm === "TUNTAS" && skor < kkm) return false;
      if (f.kkm === "BELUM" && skor >= kkm) return false;
      if (f.cari && !String(s.nama).toLowerCase().includes(f.cari)) return false;
      return true;
    });
  },

  renderTable() {
    const rows = this.filtered();
    const kkm = this.rekap.meta.kkm;
    $d("#rekapBody").innerHTML = rows
      .map((s, i) => {
        const p = this.progres[s.nama];
        const selesai = p ? String(p.kode_selesai || "").split(",") : [];
        const dots = this.kodeSkenario
          .map((c) => `<span class="sc-dot ${selesai.includes(c) ? "ok" : "no"}" title="${c}">${c.replace(/[^0-9]/g, "")}</span>`)
          .join("");
        const tuntas = s.nilai !== null && Number(s.nilai) >= kkm;
        return `<tr>
          <td>${i + 1}</td>
          <td class="mono-cell">${s.nisn}</td>
          <td class="nama">${s.nama}</td>
          <td>${s.kelas}</td>
          <td class="mono-cell">${s.nilai ?? "-"}</td>
          <td>${dots}</td>
          <td class="mono-cell">${s.jumlah_tugas}/${s.tugas_dinilai}</td>
          <td class="mono-cell">${s.rata_tugas ?? "-"}</td>
          <td class="mono-cell">${s.kuis_terbaik ?? "-"}</td>
          <td><span class="status-pill-kkm ${tuntas ? "tuntas" : "remedial"}">${s.status_kkm || "BELUM ADA NILAI"}</span></td>
          <td><button class="text-btn" data-detail="${s.nisn}">Lihat Detail</button></td>
        </tr>`;
      })
      .join("");
    $d("#rowCount").textContent = `${rows.length} siswa ditampilkan`;
    $$d("[data-detail]").forEach((b) => b.addEventListener("click", () => this.showDetail(b.dataset.detail)));
  },

  showDetail(nisn) {
    const s = this.siswa.find((x) => x.nisn === nisn);
    if (!s) return;
    const p = this.progres[s.nama];
    const kkm = this.rekap.meta.kkm;
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `
      <div class="modal panel">
        <h3>Detail Progres - ${s.nama}</h3>
        <div class="m-note">NISN ${s.nisn}, ${s.kelas}, paket keahlian ${s.paket_keahlian || "RPL"}</div>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto">
          <div class="cfg-row"><span class="cfg-label">Nilai UKK (tabel nilai_ukk)</span><span class="mono">${s.nilai ?? "-"} / ${kkm}</span></div>
          <div class="cfg-row"><span class="cfg-label">Tugas terkirim / sudah dinilai</span><span class="mono">${s.jumlah_tugas} / ${s.tugas_dinilai}</span></div>
          <div class="cfg-row"><span class="cfg-label">Rata-rata nilai tugas</span><span class="mono">${s.rata_tugas ?? "-"}</span></div>
          <div class="cfg-row"><span class="cfg-label">Skor kuis terbaik</span><span class="mono">${s.kuis_terbaik ?? "-"} dari ${s.jumlah_kuis} percobaan</span></div>
          <div class="cfg-row"><span class="cfg-label">Skenario PBL terselesaikan</span><span class="mono">${p ? `${p.terselesaikan} dari ${p.percobaan} request, rata-rata ${p.rata_latency ?? "-"} ms` : "belum ada percobaan"}</span></div>
          ${this.kodeSkenario
            .map((c) => `<div class="cfg-row"><span class="cfg-label">Kasus ${c}</span><span class="sc-dot ${String((p || {}).kode_selesai || "").split(",").includes(c) ? "ok" : "no"}">${String((p || {}).kode_selesai || "").split(",").includes(c) ? "Selesai" : "Belum"}</span></div>`)
            .join("")}
        </div>
        <div class="modal-actions"><button class="btn" id="detailClose">Tutup</button></div>
      </div>`;
    document.body.appendChild(back);
    back.querySelector("#detailClose").addEventListener("click", () => back.remove());
    back.addEventListener("click", (e) => {
      if (e.target === back) back.remove();
    });
  },

  renderLogs() {
    const log = this.rekap.aktivitas_terbaru || [];
    const jam = (dt) => {
      const d = new Date(String(dt).replace(" ", "T") + "+07:00");
      return isNaN(d) ? String(dt) : d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB";
    };
    $d("#logFeed").innerHTML = log.length
      ? log
          .map(
            (l) => `<div class="log-item">
              <span class="log-time">${jam(l.created_at)}</span>
              <span class="log-text"><b>${l.nama}</b> (${l.kelas || l.peran}) - ${l.aktivitas}</span>
            </div>`
          )
          .join("")
      : '<p class="muted">Belum ada aktivitas tercatat. Log muncul begitu siswa login, menjalankan Lab Uji, atau mengirim jawaban.</p>';
  },

  renderValidasi() {
    const v = SIRKUIT_CONFIG.VALIDATION;
    const lab = this.rekap.lab_runs || [];
    $d("#validasiGrid").innerHTML = `
      <div class="validasi-card panel"><div class="v-cap">${v.blackbox.label}</div><div class="v-val">${v.blackbox.nilai}</div><div class="v-tag">Bebas Error Fungsional</div></div>
      <div class="validasi-card panel"><div class="v-cap">${v.materi.label}</div><div class="v-val">${v.materi.nilai}</div><div class="v-tag">${v.materi.kategori}</div></div>
      <div class="validasi-card panel"><div class="v-cap">${v.media.label}</div><div class="v-val">${v.media.nilai}</div><div class="v-tag">${v.media.kategori}</div></div>
      <div class="validasi-card panel">
        <div class="v-cap">Sumber Data Dashboard</div>
        <div class="v-val" style="font-size:13px;line-height:1.5">${Api.statusLabel()}</div>
        <div class="v-tag">Materi ajar (siswa, nilai_ukk, jurnal, proyek) dibaca dari database ruang latihan lewat DB::ajar(); akun, tugas, kuis, dan log dari database aplikasi lewat DB::app(). Keduanya MySQL di server yang sama.</div>
      </div>
      <div class="validasi-card panel">
        <div class="v-cap">Latihan Lab Uji per Bahasa</div>
        <div class="v-val" style="font-size:14px;line-height:1.6">${lab.length ? lab.map((l) => `${l.bahasa.toUpperCase()}: ${l.jumlah_jalankan} jalan, ${l.lulus} lulus`).join("<br>") : "Belum ada eksekusi tercatat"}</div>
        <div class="v-tag">Kolom eksekusi menunjukkan server (PHP CLI) atau browser (fallback)</div>
      </div>`;
  },

  exportCsv() {
    const rows = this.filtered();
    const kkm = this.rekap.meta.kkm;
    const head = ["No", "NISN", "Nama Siswa", "Kelas", "Nilai UKK", ...this.kodeSkenario, "Tugas Terkirim", "Tugas Dinilai", "Rata Nilai Tugas", "Skor Kuis Terbaik", "Status KKM"];
    const body = rows.map((s, i) => {
      const p = this.progres[s.nama];
      const selesai = String((p || {}).kode_selesai || "").split(",");
      return [
        i + 1, s.nisn, s.nama, s.kelas, s.nilai ?? "-",
        ...this.kodeSkenario.map((c) => (selesai.includes(c) ? "SELESAI" : "BELUM")),
        s.jumlah_tugas, s.tugas_dinilai, s.rata_tugas ?? "-", s.kuis_terbaik ?? "-",
        s.nilai !== null && Number(s.nilai) >= kkm ? "TUNTAS" : "PERLU BIMBINGAN",
      ];
    });
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rekap-nilai-rpl-smkn1mejayan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (window.SIRKUIT_toast) SIRKUIT_toast(`${rows.length} baris data nyata diekspor ke CSV.`, "success");
  },
};

if (typeof window !== "undefined") window.TeacherDashboard = TeacherDashboard;
