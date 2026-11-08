/* =====================================================================
 * SIRKUIT - js/task-cycle.js
 * Siklus tugas: guru membuat tugas dan menilainya, siswa mengerjakan pada
 * Lab Kueri atau Lab Uji lalu mengirim hasilnya sebagai jawaban.
 * Jawaban yang tersimpan adalah kode + keluaran + grid hasil (kolom dan
 * baris nyata dari MySQL), bukan tangkapan layar.
 * Endpoint: GET/POST/PUT/DELETE api/tasks.php, GET/POST/PUT api/submissions.php.
 * Classic script - mengekspos window.Tugas.
 * ===================================================================== */

(function () {
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const BAHASA_LABEL = { php: "PHP 8.2", sql: "SQL MySQL", js: "JavaScript" };

  const Tugas = {
    daftar: [],
    index: -1,
    kiriman: [],
    kelas: [],
    siap: false,
    bound: false,
    /** id tugas yang sedang dibuka pada form guru; 0 berarti form kosong. */
    editId: 0,

    /** Tugas yang sedang dikerjakan; dipakai bar kirim pada Lab Kueri dan Lab Uji. */
    konteks: null,

    q(sel) {
      return document.querySelector(sel);
    },

    async initView() {
      const t = this;
      if (!t.siap) {
        t.siap = true;
        t.bind();
        t.tampilkanLatihan();
        await t.muat();
        t.bacaKelas();
      } else {
        await t.muat();
      }
      t.render();
    },

    bind() {
      const t = this;
      if (t.bound) return;
      t.bound = true;
      t.q("#tugasMuat").addEventListener("click", async () => {
        await t.muat();
        t.render();
      });
      const form = t.q("#tugasForm");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        t.simpanTugas();
      });
      t.q("#tugasBahasa").addEventListener("change", () => t.tampilkanLatihan());
      t.q("#tugasArsip").addEventListener("click", () => t.arsipkan());
      t.q("#tugasBatalEdit").addEventListener("click", () => {
        t.editId = 0;
        t.formReset();
      });
    },

    async muat() {
      const t = this;
      const r = await Api.get("tasks.php", { limit: 100 });
      if (!r.ok) {
        t.stat(`Gagal memuat tugas: ${r.error || Api.pesanServer}`);
        window.SIRKUIT_toast(r.error || "tasks.php menolak permintaan.", "error");
        return;
      }
      t.daftar = r.data.data || [];
      t.peran = r.data.meta.peran;
      if (t.index >= t.daftar.length) t.index = -1;
      if (t.index < 0 && t.daftar.length) t.index = 0;
    },

    async bacaKelas() {
      const t = this;
      if (t.peran !== "guru") return;
      const r = await Api.get("grid.php", { tabel: "siswa", limit: 200 });
      if (!r.ok) return;
      const set = new Set((r.data.rows || []).map((x) => x.kelas).filter(Boolean));
      t.kelas = [...set].sort();
      const isi = t.q("#daftarKelas");
      if (isi) isi.innerHTML = t.kelas.map((k) => `<option value="${esc(k)}"></option>`).join("");
    },

    stat(teks) {
      const el = this.q("#tugasStat");
      if (el) el.textContent = teks;
    },

    /* ---------------- Daftar dan detail ---------------- */
    render() {
      const t = this;
      const guru = t.peran === "guru";
      t.q("#tugasGuru").classList.toggle("hidden", !guru);
      t.q("#tugasCaraSiswa").classList.toggle("hidden", guru);
      t.formLabel();

      if (!t.daftar.length) {
        t.q("#tugasList").innerHTML = `<li class="kosong">${guru ? "Belum ada tugas. Buat tugas pertama di kanan." : "Belum ada tugas aktif untuk kelas kamu."}</li>`;
        t.q("#tugasDetail").innerHTML = '<p class="muted">Belum ada tugas yang bisa dibuka.</p>';
        t.stat("0 tugas");
        return;
      }

      t.q("#tugasList").innerHTML = t.daftar
        .map((x, i) => {
          const kirim = !guru && x.submission_id ? (x.submission_nilai !== null && x.submission_nilai !== undefined ? `nilai ${x.submission_nilai}` : x.submission_lulus ? "terkirim, menunggu nilai" : "terkirim") : "";
          const ringkas = guru ? `${x.jumlah_kirim || 0} kiriman, ${x.belum_dinilai || 0} belum dinilai` : kirim;
          return `<li data-i="${i}" class="${i === t.index ? "sel" : ""}">
            <b>${esc(x.judul)}</b>
            <span class="c-dim">(${esc(BAHASA_LABEL[x.bahasa] || x.bahasa)})</span>
            <span class="tugas-meta">${esc(x.kelas)}${x.tenggat ? " batas " + esc(String(x.tenggat).slice(0, 16)) : ""}${x.status === "arsip" ? " arsip" : ""}</span>
            ${ringkas ? `<span class="tugas-status ${x.status === "arsip" ? "" : guru && +x.belum_dinilai > 0 ? "pending" : "rapi"}">${esc(ringkas)}</span>` : ""}
          </li>`;
        })
        .join("");
      Array.from(t.q("#tugasList").querySelectorAll("li[data-i]")).forEach((li) =>
        li.addEventListener("click", () => {
          t.index = +li.dataset.i;
          t.render();
        })
      );
      t.stat(`${t.daftar.length} tugas${t.peran === "guru" ? "" : " aktif"}`);
      t.renderDetail();
      if (guru) t.muatKiriman();
    },

    tugasAktif() {
      return this.index >= 0 ? this.daftar[this.index] : null;
    },

    renderDetail() {
      const t = this;
      const x = t.tugasAktif();
      const panel = t.q("#tugasDetail");
      if (!x) {
        panel.innerHTML = '<p class="muted">Pilih satu tugas dari daftar.</p>';
        t.q("#tugasJudul").textContent = "Detail Tugas";
        return;
      }
      t.q("#tugasJudul").textContent = x.judul;
      t.q("#tugasTag").textContent = `${BAHASA_LABEL[x.bahasa] || x.bahasa} · bobot ${x.bobot} · ${x.status}`;

      const guru = t.peran === "guru";
      const isi = [];
      isi.push(`<p class="tugas-instruksi">${esc(x.instruksi)}</p>`);
      isi.push(
        `<p class="cap">Kelas ${esc(x.kelas)} · dibuat ${esc(String(x.created_at || "").slice(0, 16))}${x.tenggat ? " · tenggat " + esc(String(x.tenggat).slice(0, 16)) : " · tanpa tenggat"}${x.exercise_id ? " · latihan bank nomor " + esc(x.exercise_id) : ""}</p>`
      );

      if (guru) {
        isi.push(`<p class="cap">${+x.jumlah_kirim || 0} siswa sudah mengirim, ${+x.jumlah_lulus || 0} lolos pemeriksaan otomatis, ${+x.belum_dinilai || 0} belum dinilai.</p>`);
        isi.push('<div class="row-gap wrap" style="margin-top:10px"><button class="btn btn-sm" id="tugasIsiForm">Ubah Tugas Ini</button><button class="btn btn-sm btn-danger" id="tugasArsip2">Arsipkan</button></div>');
      } else {
        const status = x.submission_id
          ? `<p class="c-ok">Jawaban terkirim ${esc(String(x.dikirim_at || "").slice(0, 16))}.${x.submission_nilai !== null && x.submission_nilai !== undefined ? " Nilai " + esc(x.submission_nilai) + "." : " Menunggu penilaian guru."}</p>`
          : '<p class="cap">Belum ada jawaban terkirim untuk tugas ini.</p>';
        isi.push(status);
        if (x.catatan_guru) isi.push(`<p class="muted">Catatan guru: ${esc(x.catatan_guru)}</p>`);
        const tujuan = x.bahasa === "sql" ? "grid" : "lab";
        const label = x.bahasa === "sql" ? "Kerjakan di Lab Kueri" : "Kerjakan di Lab Uji Kode";
        isi.push(`<div class="row-gap wrap" style="margin-top:12px"><button class="btn btn-primary" data-kerja="${tujuan}" data-id="${x.id}">${label}</button></div>`);
      }
      panel.innerHTML = isi.join("");

      const buka = panel.querySelector("[data-kerja]");
      if (buka) buka.addEventListener("click", () => t.mulai(x, buka.dataset.kerja));
      const ubah = t.q("#tugasIsiForm");
      if (ubah) ubah.addEventListener("click", () => t.isiForm(x));
      const arsip = t.q("#tugasArsip2");
      if (arsip) arsip.addEventListener("click", () => t.arsipkan());
    },

    /** Siswa memulai pengerjaan: simpan konteks lalu pindah ke ruang kerja. */
    mulai(x, tujuan) {
      const t = this;
      t.konteks = { id: x.id, judul: x.judul, bahasa: x.bahasa, exerciseId: x.exercise_id, lulus: false };
      t.perbaruiBar();
      if (window.SIRKUIT_navigate) window.SIRKUIT_navigate(tujuan);
      if (tujuan === "lab" && x.exercise_id && window.LabUji) LabUji.bukaLatihanServer(x.exercise_id);
      window.SIRKUIT_toast(`Tugas "${x.judul}" aktif. Hasil kerja kamu bisa dikirim sebagai jawaban.`, "info");
    },

    /** Bar "kirim sebagai jawaban" pada Lab Kueri dan Lab Uji. */
    perbaruiBar() {
      const t = this;
      [["#tugasBarGrid", "grid"], ["#tugasBarLab", "lab"]].forEach(([sel, mana]) => {
        const bar = t.q(sel);
        if (!bar) return;
        const cocok = t.konteks && ((mana === "grid" && t.konteks.bahasa === "sql") || (mana === "lab" && t.konteks.bahasa !== "sql"));
        if (!cocok || t.peran === "guru") {
          bar.classList.add("hidden");
          bar.innerHTML = "";
          return;
        }
        bar.classList.remove("hidden");
        bar.innerHTML = `<span>Sedang mengerjakan tugas <b>${esc(t.konteks.judul)}</b></span><span class="spacer"></span>
          <button class="btn btn-sm btn-primary" data-kirim>Kirim Sebagai Jawaban</button>
          <button class="btn btn-sm" data-batal>Batal</button>`;
        bar.querySelector("[data-kirim]").addEventListener("click", () => (mana === "grid" ? t.kirimGrid() : t.kirimLab()));
        bar.querySelector("[data-batal]").addEventListener("click", () => {
          t.konteks = null;
          t.perbaruiBar();
        });
      });
    },

    async kirimGrid() {
      const t = this;
      const g = window.DataGrid && window.DataGrid.gridHasil;
      if (!t.konteks || !g) return;
      if (!g.rows.length && !g.sql) {
        window.SIRKUIT_toast("Jalankan kueri lebih dahulu supaya hasilnya ikut terkirim.", "warn");
        return;
      }
      const r = await Api.post("submissions.php", {
        task_id: t.konteks.id,
        kode: g.sql,
        output: `${g.kolomList.length} kolom, ${g.rows.length} baris${g.terpengaruh !== null && g.terpengaruh !== undefined ? ", " + g.terpengaruh + " baris terpengaruh" : ""}`,
        hasil_grid: { kolom: g.kolomList, rows: g.rows.slice(0, 100), sql: g.sql, waktu_ms: g.waktuMs },
        status_http: g.error ? 500 : 200,
        lulus: !g.error,
      });
      t.lepas(r, "Jawaban SQL");
    },

    async kirimLab() {
      const t = this;
      if (!t.konteks || !window.LabUji) return;
      const b = LabUji.payloadJawaban();
      if (!b) {
        window.SIRKUIT_toast("Jalankan kode di Lab Uji terlebih dahulu.", "warn");
        return;
      }
      const r = await Api.post("submissions.php", Object.assign({ task_id: t.konteks.id }, b));
      t.lepas(r, "Jawaban");
    },

    lepas(r, nama) {
      const t = this;
      if (!r.ok) {
        window.SIRKUIT_toast(r.error || "Pengiriman jawaban ditolak server.", "error");
        return;
      }
      window.SIRKUIT_toast(`${nama} terkirim: ${r.data.message}`, r.data.terlambat ? "warn" : "success");
      t.konteks = null;
      t.perbaruiBar();
      if (window.SIRKUIT_navigate) window.SIRKUIT_navigate("tugas");
    },

    /* ---------------- Guru: buat, ubah, arsip ---------------- */
    formData() {
      const t = this;
      return {
        judul: t.q("#tugasJudulInput").value.trim(),
        instruksi: t.q("#tugasInstruksi").value.trim(),
        bahasa: t.q("#tugasBahasa").value,
        kelas: t.q("#tugasKelas").value.trim(),
        exercise_id: t.q("#tugasLatihan").value || null,
        tenggat: t.q("#tugasTenggat").value.trim(),
        bobot: Number(t.q("#tugasBobot").value || 1),
      };
    },

    async simpanTugas() {
      const t = this;
      const b = t.formData();
      const ubah = t.editId || 0;
      if (ubah) b.id = ubah;
      if (b.tenggat) b.tenggat = b.tenggat.replace("T", " ") + (b.tenggat.length === 16 ? ":00" : "");
      const r = ubah ? await Api.put("tasks.php", b) : await Api.post("tasks.php", b);
      if (!r.ok) {
        window.SIRKUIT_toast(r.error || "Tugas gagal disimpan.", "error");
        return;
      }
      window.SIRKUIT_toast(r.data.message, "success");
      t.editId = 0;
      t.index = ubah ? t.daftar.findIndex((x) => x.id === ubah) : -1;
      t.formReset();
      await t.muat();
      if (!ubah) t.index = t.daftar.findIndex((x) => x.id === r.data.id);
      t.render();
    },

    /** Label form mengikuti tugas yang sedang dibuka untuk diubah. */
    formLabel() {
      const t = this;
      t.q("#tugasFormJudul").textContent = t.editId ? "Ubah Tugas" : "Tambah Tugas";
      t.q("#tugasSubmitBtn").textContent = t.editId ? "Simpan Perubahan" : "Buat Tugas";
      const batal = t.q("#tugasBatalEdit");
      if (batal) batal.classList.toggle("hidden", !t.editId);
    },

    formReset() {
      const t = this;
      ["#tugasJudulInput", "#tugasInstruksi", "#tugasKelas", "#tugasTenggat"].forEach((s) => {
        const el = t.q(s);
        if (el) el.value = "";
      });
      t.q("#tugasBobot").value = "1";
      t.q("#tugasLatihan").value = "";
      t.formLabel();
    },

    isiForm(x) {
      const t = this;
      t.editId = x.id;
      t.q("#tugasJudulInput").value = x.judul;
      t.q("#tugasInstruksi").value = x.instruksi;
      t.q("#tugasBahasa").value = x.bahasa;
      t.q("#tugasKelas").value = x.kelas;
      t.q("#tugasBobot").value = x.bobot;
      t.q("#tugasTenggat").value = x.tenggat ? String(x.tenggat).replace(" ", "T").slice(0, 16) : "";
      t.q("#tugasLatihan").value = x.exercise_id || "";
      t.tampilkanLatihan();
      t.formLabel();
      t.q("#tugasForm").scrollIntoView({ behavior: "smooth", block: "center" });
    },

    async arsipkan() {
      const t = this;
      const x = t.tugasAktif();
      if (!x) return;
      const r = await Api.hapus("tasks.php", { id: x.id });
      if (!r.ok) {
        window.SIRKUIT_toast(r.error || "Tugas gagal diarsipkan.", "error");
        return;
      }
      window.SIRKUIT_toast("Tugas diarsipkan, siswa tidak dapat mengirim lagi.", "info");
      if (t.editId === x.id) {
        t.editId = 0;
        t.formReset();
      }
      t.index = -1;
      await t.muat();
      t.render();
    },

    /** Bank latihan dibaca dari MySQL agar tugas dapat menunjuk satu latihan. */
    async tampilkanLatihan() {
      const t = this;
      const pilih = t.q("#tugasLatihan");
      if (!pilih) return;
      const bahasa = t.q("#tugasBahasa").value;
      if (!pilih.dataset.bahasa || pilih.dataset.bahasa !== bahasa) {
        pilih.dataset.bahasa = bahasa;
        const r = await Api.get("exercises.php", { bahasa });
        const list = (r.ok && r.data.data) || [];
        pilih.innerHTML = '<option value="">(tanpa latihan bank)</option>' + list.map((e) => `<option value="${esc(e.id)}">${esc(e.judul)}</option>`).join("");
      }
    },

    /* ---------------- Guru: nilai kiriman ---------------- */
    async muatKiriman() {
      const t = this;
      const x = t.tugasAktif();
      const host = t.q("#tugasKiriman");
      if (!x) return;
      const r = await Api.get("submissions.php", { task_id: x.id, limit: 100 });
      if (!r.ok) {
        host.innerHTML = `<p class="c-err">${esc(r.error || "submissions.php menolak permintaan.")}</p>`;
        return;
      }
      t.kiriman = r.data.data || [];
      if (!t.kiriman.length) {
        host.innerHTML = '<p class="muted">Belum ada siswa kelas ini yang mengirim jawaban untuk tugas tersebut.</p>';
        return;
      }
      host.innerHTML = `<table class="rekap"><thead><tr>
        <th>Siswa</th><th>Kirim</th><th>Status</th><th>Pemeriksa</th><th>Nilai</th><th>Catatan</th><th>Aksi</th></tr></thead>
        <tbody>${t.kiriman
          .map(
            (s) => `<tr data-s="${s.id}">
            <td class="nama">${esc(s.nama)}<br><span class="mono-cell">${esc(s.nisn_nip)}</span></td>
            <td class="mono-cell">${esc(String(s.dikirim_at || "").slice(0, 16))}</td>
            <td>${esc(s.status_http)}</td>
            <td>${+s.lulus ? "lolos" : "belum lolos"} <button class="btn btn-sm" data-kode="${s.id}">Lihat kode</button></td>
            <td><input class="input input-sm angka" type="number" min="0" max="100" value="${s.nilai === null || s.nilai === undefined ? "" : esc(s.nilai)}" /></td>
            <td><input class="input catatan" type="text" value="${esc(s.catatan_guru || "")}" /></td>
            <td><button class="btn btn-sm btn-primary" data-nilai>Simpan</button></td>
          </tr>`
          )
          .join("")}</tbody>`;

      host.querySelectorAll("tr[data-s]").forEach((tr) => {
        const s = t.kiriman.find((x2) => String(x2.id) === tr.dataset.s);
        tr.querySelector("[data-nilai]").addEventListener("click", async () => {
          const nilai = tr.querySelector(".angka").value;
          const catatan = tr.querySelector(".catatan").value;
          const r2 = await Api.put("submissions.php", { id: s.id, nilai, catatan });
          if (!r2.ok) {
            window.SIRKUIT_toast(r2.error || "Penilaian ditolak server.", "error");
            return;
          }
          window.SIRKUIT_toast(`Nilai ${r2.data.nilai} tersimpan untuk ${s.nama}.`, "success");
          await t.muat();
          await t.muatKiriman();
        });
        tr.querySelector("[data-kode]").addEventListener("click", () => {
          const lama = host.querySelector("div.jawaban-terurai");
          if (lama && lama.dataset.s === String(s.id)) {
            lama.remove();
            return;
          }
          if (lama) lama.remove();
          const wadah = document.createElement("div");
          wadah.className = "jawaban-terurai";
          wadah.dataset.s = String(s.id);
          const pre = document.createElement("pre");
          pre.className = "kode-jawaban mono";
          pre.textContent = `-- kode jawaban ${s.nama} (${s.nisn_nip}) --\n${s.kode || "(kosong)"}\n\n-- keluaran --\n${s.output || "(kosong)"}`;
          wadah.appendChild(pre);
          host.appendChild(wadah);
          const g = s.hasil_grid;
          if (g && window.DataGrid) {
            const kotak = document.createElement("div");
            wadah.appendChild(kotak);
            DataGrid.buat(kotak, { mode: "hasil", judul: `Baris MySQL kiriman ${s.nama}` }).isi(
              {
                perintah: (/^\s*(\w+)/.exec(String(g.sql || "")) || [, ""])[1].toUpperCase(),
                sql: g.sql || "",
                kolom: (g.kolom || []).map((c) => (typeof c === "string" ? { nama: c } : c)),
                rows: g.rows || [],
                waktu_ms: g.waktu_ms || 0,
                server: "MySQL/MariaDB",
              },
              { judul: `Baris MySQL kiriman ${s.nama}` }
            );
          }
          wadah.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      });
    },
  };

  window.Tugas = Tugas;
})();
