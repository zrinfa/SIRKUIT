/* =====================================================================
 * SIRKUIT - js/data-grid.js
 * Grid hasil kueri MySQL. Dua sumber data:
 *   mode "tabel" -> GET  api/grid.php        (menjelajah tabel materi ajar)
 *   mode "hasil" -> POST api/sandbox-query.php (hasil kueri siswa sendiri)
 * Grid yang sama dipakai Lab Uji dan panel "Tabel dan Grid". Tombol Unduh PNG
 * menggambar tabel ke canvas lalu menyimpannya sebagai gambar berjelas
 * watermark nama, NISN, kelas, waktu, dan teks SQL, sehingga jawaban tugas
 * berupa berkas hasil kerja sendiri, bukan tangkapan layar milik orang lain.
 * Classic script - mengekspos window.DataGrid.
 * ===================================================================== */

(function () {
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function warna(token, cadangan) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return v || cadangan;
  }

  function teksSel(p) {
    if (p === null || p === undefined) return null;
    if (typeof p === "object") return JSON.stringify(p);
    return String(p);
  }

  function ringkasTeks(s, maks) {
    const t = String(s);
    return t.length <= maks ? t : t.slice(0, maks - 1) + "...";
  }

  function pilihan(list, aktif) {
    return list.map((v) => `<option value="${esc(v)}" ${String(v) === String(aktif) ? "selected" : ""}>${esc(v)}</option>`).join("");
  }

  const Grid = {
    /* ---------- DOM ---------- */
    render() {
      const g = this;
      const gTabel = g.mode === "tabel";
      const daftarTabel = (Api.setting.tabel_ajar || ["siswa", "nilai_ukk", "jurnal_pkl", "proyek", "prakerin", "sesi_login"]);
      g.el.innerHTML = `
        <div class="panel grid-panel">
          <div class="panel-head">
            <h3>${esc(g.judul)}</h3>
            <span class="tag" data-r="stat">Menyiapkan grid...</span>
          </div>
          <div class="panel-body grid-toolbar">
            ${gTabel ? `<label class="cap" for="${g.id}Tabel">Tabel</label>
            <select class="input" id="${g.id}Tabel" data-r="tabel">${pilihan(daftarTabel, g.tabel)}</select>` : ""}
            ${gTabel ? `<label class="cap" for="${g.id}Kolom">Kolom</label>
            <select class="input" data-r="kolom" id="${g.id}Kolom"></select>
            <input class="input" data-r="q" id="${g.id}Q" placeholder="nilai yang dicari" />
            <button class="btn btn-sm" data-r="cari">Terapkan</button>
            <button class="btn btn-sm" data-r="reset">Reset</button>` : ""}
            <span class="spacer"></span>
            <button class="btn btn-sm btn-primary" data-r="png">Unduh PNG</button>
          </div>
          <div class="table-shell"><table class="rekap"><thead></thead><tbody></tbody></table></div>
          <pre class="grid-sql mono hidden" data-r="sql"></pre>
          <div class="panel-body grid-foot">
            <span class="cap" data-r="page"></span>
            ${gTabel ? `<select class="input input-sm" data-r="limit">${pilihan([20, 50, 100], g.limit)}</select>
            <button class="btn btn-sm" data-r="prev">Sebelumnya</button>
            <button class="btn btn-sm" data-r="next">Berikutnya</button>
            <span class="spacer"></span>` : ""}
            <span class="cap" data-r="sumber"></span>
          </div>
        </div>`;

      const q = (nama) => g.el.querySelector(`[data-r="${nama}"]`);
      g.$stat = q("stat");
      g.$kolom = q("kolom");
      g.$q = q("q");
      g.$page = q("page");
      g.$sql = q("sql");
      g.$sumber = q("sumber");

      const klik = (nama, fn) => {
        const el = q(nama);
        if (el) el.addEventListener("click", fn);
      };
      if (gTabel) {
        q("tabel").addEventListener("change", (e) => {
          g.tabel = e.target.value;
          g.order = "";
          g.q = "";
          g.offset = 0;
          g.$kolom = [];
          g.muat();
        });
        q("limit").addEventListener("change", (e) => {
          g.limit = parseInt(e.target.value, 10);
          g.offset = 0;
          g.muat();
        });
        q("cari").addEventListener("click", () => {
          g.q = g.$q.value.trim();
          g.kolom = g.$kolom.value;
          g.offset = 0;
          g.muat();
        });
        q("q").addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            q("cari").click();
          }
        });
        q("reset").addEventListener("click", () => {
          g.$q.value = "";
          g.q = "";
          g.order = "";
          g.offset = 0;
          g.muat();
        });
        q("prev").addEventListener("click", () => {
          g.offset = Math.max(0, g.offset - g.limit);
          g.muat();
        });
        q("next").addEventListener("click", () => {
          if (g.offset + g.limit < g.total) {
            g.offset += g.limit;
            g.muat();
          }
        });
      }
      q("png").addEventListener("click", () => g.unduhPng());

      if (g.mode === "tabel" && !g.rows.length) g.muat();
      else g.tampilkan();
    },

    /** Isi grid dari objek hasil (balinan api/sandbox-query.php atau Lab Uji). */
    isi(hasil, opsi = {}) {
      const g = this;
      const r = hasil || {};
      g.mode = "hasil";
      g.error = "";
      g.perintah = r.perintah || "";
      g.kolomList = (r.kolom || []).map((c) => c.nama || c).filter(Boolean);
      g.struktur = r.kolom || [];
      g.rows = r.rows || [];
      g.total = g.rows.length;
      g.sql = r.sql || r.query || "";
      g.waktuMs = r.waktu_ms || 0;
      // "baris terpengaruh" hanya bermakna untuk INSERT/UPDATE/DELETE.
      g.terpengaruh = ["SELECT", "SHOW", "DESCRIBE", "EXPLAIN"].includes(String(g.perintah).toUpperCase()) ? null : r.terpengaruh;
      g.sumber = opsi.sumber || r.server || "MySQL/MariaDB";
      if (!g.kolomList.length && r.terpengaruh !== undefined && r.terpengaruh !== null) {
        g.kolomList = ["hasil"];
        g.rows = [{ hasil: `${r.terpengaruh} baris terpengaruh oleh ${r.perintah || "perintah"}` }];
        g.total = g.rows.length;
      }
      if (opsi.judul) g.judul = opsi.judul;
      if (!g.el.isConnected) return;
      g.render();
    },

    /** Kosongkan grid, misalnya ketika kueri siswa ditolak MySQL. */
    kosong(pesan) {
      this.mode = "hasil";
      this.kolomList = [];
      this.rows = [];
      this.total = 0;
      this.terpengaruh = null;
      this.waktuMs = 0;
      this.perintah = "";
      this.error = pesan || "";
      this.render();
    },

    /* ---------- Pengambilan data ---------- */
    async muat() {
      const g = this;
      if (g.mode !== "tabel") return;
      if (g.$stat) g.$stat.textContent = "Mengambil baris dari MySQL...";
      const params = { tabel: g.tabel, limit: g.limit, offset: g.offset };
      if (g.order) Object.assign(params, { order: g.order, dir: g.dir });
      if (g.q) Object.assign(params, { kolom: g.kolom, q: g.q });
      const r = await Api.get("grid.php", params);
      if (!r.ok) {
        g.rows = [];
        g.kolomList = [];
        g.error = r.error || (r.data && r.data.message) || "grid.php menolak permintaan.";
        g.tampilkan();
        window.SIRKUIT_toast(g.error, "error");
        return;
      }
      const d = r.data;
      g.error = "";
      g.kolomList = d.kolom || [];
      g.struktur = d.struktur || [];
      g.rows = d.rows || [];
      g.total = d.total || 0;
      g.sql = d.sql || "";
      g.waktuMs = d.waktu_ms || 0;
      g.sumber = d.sumber || "mysql";
      g.tampilkan();
    },

    tampilkan() {
      const g = this;
      if (!g.el.isConnected) return;
      const thead = g.el.querySelector("thead");
      const kosong = !g.kolomList.length;

      thead.innerHTML = kosong
        ? '<tr><th class="grid-kosong">Kolom</th></tr>'
        : "<tr>" + g.kolomList.map((k) => `<th data-k="${esc(k)}">${esc(k)}<span class="sort-arah">${g.order === k ? (g.dir === "DESC" ? " ↓" : " ↑") : ""}</span></th>`).join("") + "</tr>";
      thead.querySelectorAll("th[data-k]").forEach((th) =>
        th.addEventListener("click", () => {
          const k = th.dataset.k;
          if (g.order === k) g.dir = g.dir === "ASC" ? "DESC" : "ASC";
          else {
            g.order = k;
            g.dir = "ASC";
          }
          if (g.mode === "tabel") {
            g.offset = 0;
            g.muat();
          } else {
            g.rows = g.rows.slice().sort((a, b) => {
              const x = teksSel(a[k]);
              const y = teksSel(b[k]);
              const nx = Number(x);
              const ny = Number(y);
              const numerik = x !== null && y !== null && x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny);
              const c = numerik ? nx - ny : String(x === null ? "" : x).localeCompare(String(y === null ? "" : y));
              return g.dir === "DESC" ? -c : c;
            });
            g.tampilkan();
          }
        })
      );

      if (g.$kolom && g.$kolom.options.length !== g.kolomList.length) {
        g.$kolom.innerHTML = g.kolomList.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join("");
        if (g.kolom && !g.kolomList.includes(g.kolom)) g.kolom = g.kolomList[0];
        if (g.kolom) g.$kolom.value = g.kolom;
      }
      if (g.$schema) {
        g.$schema.textContent = (g.struktur || [])
          .map((k) => {
            const nama = String(k.kolom || k.nama || "");
            const tipe = String(k.tipe || "");
            const kunci = k.kunci === "PRI" ? "kunci utama" : k.kunci === "MUL" ? "indeks" : "";
            return (nama + "  " + tipe + "  " + kunci).replace(/\s+$/g, "");
          })
          .join("\n");
      }
      g.renderBody();
      g.meta();
    },

    renderBody() {
      const g = this;
      const tbody = g.el.querySelector("tbody");
      if (!g.kolomList.length) {
        tbody.innerHTML = `<tr><td class="grid-kosong">${esc(g.error || "Belum ada baris. Jalankan kueri atau pilih tabel.")}</td></tr>`;
        return;
      }
      if (!g.rows.length) {
        tbody.innerHTML = `<tr><td class="grid-kosong" colspan="${g.kolomList.length}">MySQL mengembalikan 0 baris untuk kueri ini.</td></tr>`;
        return;
      }
      tbody.innerHTML = g.rows
        .map(
          (row) =>
            "<tr>" +
            g.kolomList
              .map((k) => {
                const v = teksSel(row[k]);
                return v === null ? '<td class="c-null">NULL</td>' : `<td class="mono-cell">${esc(ringkasTeks(v, 60))}</td>`;
              })
              .join("") +
            "</tr>"
        )
        .join("");
    },

    meta() {
      const g = this;
      if (!g.$stat) return;
      if (g.error) {
        g.$stat.textContent = g.error.slice(0, 90);
        g.$stat.classList.add("err");
      } else {
        g.$stat.classList.remove("err");
        const akhir = g.mode === "tabel" ? ` baris ${g.offset + 1}-${Math.min(g.total, g.offset + g.limit)} dari ${g.total}` : ` ${g.rows.length} baris`;
        g.$stat.textContent = `${g.kolomList.length} kolom,${akhir}${g.waktuMs ? ", " + g.waktuMs + " ms" : ""}${g.terpengaruh !== null && g.terpengaruh !== undefined ? ", " + g.terpengaruh + " baris terpengaruh" : ""}`;
      }
      if (g.$page) {
        g.$page.textContent = g.mode === "tabel" ? `Halaman ${Math.floor(g.offset / g.limit) + 1} dari ${Math.max(1, Math.ceil(g.total / g.limit))}` : `Hasil kueri siswa, dibaca langsung dari MySQL`;
      }
      if (g.$sumber) g.$sumber.textContent = g.sumber ? "Sumber: " + g.sumber : "";
      if (g.$sql) {
        g.$sql.textContent = g.sql;
        g.$sql.classList.toggle("hidden", !g.sql);
      }
    },

    /* ---------- Ekspor PNG berwatermark ---------- */
    unduhPng() {
      const g = this;
      if (!g.kolomList.length || !g.rows.length) {
        window.SIRKUIT_toast("Grid masih kosong, belum ada hasil yang bisa diunduh.", "warn");
        return;
      }
      const u = Api.user || {};
      const skala = 2;
      const kolom = g.kolomList;
      const fontIsi = "12px 'JetBrains Mono', ui-monospace, monospace";
      const fontKepala = "bold 12px 'JetBrains Mono', ui-monospace, monospace";
      const ukur = document.createElement("canvas").getContext("2d");
      const pad = 20;
      const rowH = 24;
      const headH = 28;
      const lebarMin = 58;
      const lebarMaks = 300;

      ukur.font = fontKepala;
      const lebar = kolom.map((k) => Math.max(ukur.measureText(k).width, rowH));
      ukur.font = fontIsi;
      kolom.forEach((k, i) => {
        g.rows.forEach((r) => {
          const t = teksSel(r[k]);
          if (t !== null) lebar[i] = Math.max(lebar[i], ukur.measureText(ringkasTeks(t, 60)).width);
        });
      });
      const lebarKolom = lebar.map((w) => Math.min(lebarMaks, Math.max(lebarMin, Math.ceil(w) + 18)));
      const lebarTabel = lebarKolom.reduce((a, b) => a + b, 0);

      const judul = g.mode === "tabel" ? `Tabel MySQL: ${g.tabel}` : "Hasil kueri MySQL siswa";
      const identitas = `Nama: ${u.nama || "-"} | ${u.peran === "guru" ? "NIP" : "NISN"}: ${u.nisn_nip || "-"} | ${u.peran === "guru" ? "Peran: Guru Produktif RPL" : "Kelas: " + (u.kelas || "-")}`;
      const nowa = new Date();
      const capWaktu = `Waktu: ${nowa.toLocaleString("id-ID", { hour12: false })}`;
      const barisInfo = g.mode === "tabel" ? `Baris tampil: ${g.rows.length} dari total ${g.total} | Filter: ${g.q ? g.kolom + " LIKE '%" + g.q + "%'" : "tidak ada"} | Urut: ${g.order || "-"} ${g.dir}` : `Baris hasil: ${g.rows.length} | ${g.waktuMs || 0} ms`;
      const sqlTeks = g.sql || "(tidak ada teks SQL)";
      const lebarCanvas = Math.max(760, lebarTabel + pad * 2);

      const potong = (teks, maksPx) => {
        ukur.font = fontIsi;
        const kata = String(teks).split(/\s+/);
        const baris = [];
        let kini = "";
        kata.forEach((w) => {
          const coba = kini ? kini + " " + w : w;
          if (ukur.measureText(coba).width > maksPx && kini) {
            baris.push(kini);
            kini = w;
          } else kini = coba;
        });
        if (kini) baris.push(kini);
        return baris;
      };
      const barisSql = potong(sqlTeks, lebarCanvas - pad * 2).slice(0, 6);

      const tinggiKepala = 20 + 18 * 4 + 10 + barisSql.length * 17 + 18;
      const tinggiKaki = 46;
      const tinggiCanvas = tinggiKepala + headH + g.rows.length * rowH + tinggiKaki;

      const cv = document.createElement("canvas");
      cv.width = Math.ceil(lebarCanvas * skala);
      cv.height = Math.ceil(tinggiCanvas * skala);
      const c = cv.getContext("2d");
      c.scale(skala, skala);

      const bg = warna("--panel", "#ffffff");
      const bgRaised = warna("--bg-raised", "#fffdf8");
      const teksHi = warna("--text-hi", "#211b13");
      const teksMid = warna("--text-mid", "#5c5346");
      const garis = warna("--border", "#e0d8ca");
      const garisKuat = warna("--border-strong", "#c6bca9");
      const aksen = "rgb(" + warna("--primary-rgb", "226, 106, 10") + ")";

      c.fillStyle = bg;
      c.fillRect(0, 0, lebarCanvas, tinggiCanvas);

      c.fillStyle = aksen;
      c.fillRect(0, 0, lebarCanvas, 4);
      c.fillStyle = teksHi;
      c.font = "bold 15px 'Plus Jakarta Sans', system-ui, sans-serif";
      c.fillText("SIRKUIT - " + judul, pad, 30);
      c.font = fontIsi;
      c.fillStyle = teksMid;
      [identitas, capWaktu, barisInfo].forEach((t, i) => c.fillText(t, pad, 52 + i * 18));
      c.fillStyle = teksHi;
      c.fillText("SQL:", pad, 52 + 3 * 18);
      c.fillStyle = teksMid;
      barisSql.forEach((t, i) => c.fillText(t, pad, 52 + 3 * 18 + 17 + i * 17));

      const yTabel = tinggiKepala;
      const xMulai = pad;

      c.fillStyle = bgRaised;
      c.fillRect(xMulai, yTabel, lebarTabel, headH);
      c.font = fontKepala;
      c.fillStyle = teksHi;
      let x = xMulai;
      kolom.forEach((k, i) => {
        c.fillText(ringkasTeks(k, Math.floor(lebarKolom[i] / 7)), x + 9, yTabel + 18);
        x += lebarKolom[i];
      });
      c.strokeStyle = garisKuat;
      c.beginPath();
      c.moveTo(xMulai, yTabel + headH + 0.5);
      c.lineTo(xMulai + lebarTabel, yTabel + headH + 0.5);
      c.stroke();

      c.save();
      c.beginPath();
      c.rect(xMulai, yTabel + headH, lebarTabel, g.rows.length * rowH);
      c.clip();
      c.font = "bold 46px 'Plus Jakarta Sans', system-ui, sans-serif";
      c.fillStyle = "rgba(128, 108, 78, 0.07)";
      c.translate(lebarCanvas / 2, yTabel + g.rows.length * rowH / 2);
      c.rotate(-Math.PI / 7);
      for (let i = -4; i <= 4; i++) {
        c.fillText(`${u.nama || "SIRKUIT"}  ${u.nisn_nip || ""}`, -320, i * 78);
      }
      c.restore();

      c.font = fontIsi;
      g.rows.forEach((row, ri) => {
        const y = yTabel + headH + ri * rowH;
        if (ri % 2 === 1) {
          c.fillStyle = warna("--panel-in", "#f2ede3");
          c.fillRect(xMulai, y, lebarTabel, rowH);
        }
        let xi = xMulai;
        g.kolomList.forEach((k, ci) => {
          const t = teksSel(row[k]);
          c.fillStyle = t === null ? garisKuat : teksMid;
          c.fillText(t === null ? "NULL" : ringkasTeks(t, Math.floor(lebarKolom[ci] / 7)), xi + 9, y + 16);
          xi += lebarKolom[ci];
        });
        c.strokeStyle = garis;
        c.beginPath();
        c.moveTo(xMulai, y + rowH + 0.5);
        c.lineTo(xMulai + lebarTabel, y + rowH + 0.5);
        c.stroke();
      });

      const yKaki = yTabel + headH + g.rows.length * rowH + 16;
      c.fillStyle = aksen;
      c.fillRect(xMulai, yKaki - 6, lebarTabel, 2);
      c.font = fontIsi;
      c.fillStyle = teksMid;
      c.fillText(`Bukti kerja siswa SIRKUIT. Grid ini digambar dari balinan ${g.mode === "tabel" ? "api/grid.php" : "api/sandbox-query.php"}, bukan tangkapan layar.`, pad, yKaki + 14);
      c.fillText("SMKN 1 Mejayan - RPL", pad, yKaki + 32);

      cv.toBlob((blob) => {
        if (!blob) {
          window.SIRKUIT_toast("Peramban gagal membuat gambar PNG.", "error");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stem = (u.nisn_nip || "siswa") + "-" + (g.mode === "tabel" ? g.tabel : "kueri") + "-" + nowa.toISOString().slice(0, 19).replace(/[:T]/g, "");
        a.href = url;
        a.download = "sirkuit-" + stem + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        window.SIRKUIT_toast("Hasil grid diunduh sebagai PNG berwatermark nama, NISN, kelas, waktu, dan SQL.", "success");
      }, "image/png");
    },
  };

  window.DataGrid = {
    /** Membuat grid di dalam elemen. opsi: {judul, tabel, mode, limit, schema} */
    buat(el, opsi = {}) {
      const target = typeof el === "string" ? document.querySelector(el) : el;
      if (!target) return null;
      const g = Object.create(Grid);
      g.el = target;
      g.id = "dg" + Math.random().toString(36).slice(2, 7);
      g.mode = opsi.mode || "tabel";
      g.tabel = opsi.tabel || "siswa";
      g.judul = opsi.judul || (g.mode === "tabel" ? "Tabel MySQL" : "Hasil kueri");
      g.limit = opsi.limit || 20;
      g.offset = 0;
      g.order = "";
      g.dir = "ASC";
      g.kolom = "";
      g.q = "";
      g.rows = [];
      g.kolomList = [];
      g.struktur = [];
      g.total = 0;
      g.sql = "";
      g.waktuMs = 0;
      g.terpengaruh = null;
      g.perintah = "";
      g.sumber = "";
      g.error = "";
      g.$schema = typeof opsi.schema === "string" ? document.querySelector(opsi.schema) : opsi.schema || null;
      g.render();
      return g;
    },

    /** Panel "Tabel dan Grid": kueri SQL siswa dieksekusi MySQL sungguhan, hasilnya di grid. */
    initView() {
      const D = window.DataGrid;
      const elHasil = document.querySelector("#gridHasil");
      const elTabel = document.querySelector("#gridTabel");
      if (!elHasil || !elTabel) return;
      if (!D.gridHasil) {
        D.gridHasil = D.buat(elHasil, { mode: "hasil", judul: "Hasil kueri saya" });
        D.gridTabel = D.buat(elTabel, { mode: "tabel", tabel: "siswa", judul: "Tabel MySQL ruang latihan", schema: "#gridStruktur" });
        D.bindKueri();
      } else {
        D.gridTabel.muat();
      }
    },

    bindKueri() {
      const D = window.DataGrid;
      const kotak = document.querySelector("#gqSql");
      const error = document.querySelector("#gqError");
      const tombol = document.querySelector("#gqRun");
      const jalankan = async () => {
        const sql = kotak.value.trim();
        error.classList.add("hidden");
        error.innerHTML = "";
        if (!sql) {
          window.SIRKUIT_toast("Tulis satu statement SQL terlebih dahulu.", "warn");
          return;
        }
        const asal = tombol.textContent;
        tombol.disabled = true;
        tombol.textContent = "MySQL memproses...";
        const r = await Api.post("sandbox-query.php", { sql });
        tombol.disabled = false;
        tombol.textContent = asal;
        if (!r.ok) {
          const d = r.data || {};
          D.gridHasil.kosong("Kueri ditolak MySQL, lihat pesan di atas editor.");
          const kode = d.kode_mysql ? ` (kode MySQL ${d.kode_mysql})` : "";
          error.innerHTML =
            `<b>${esc(d.message || r.error || "Kueri ditolak.")}${esc(kode)}</b>` +
            (d.pesan_guru ? `<br>${esc(d.pesan_guru)}` : "");
          error.classList.remove("hidden");
          return;
        }
        D.gridHasil.isi(r.data, { judul: `Hasil kueri ${r.data.perintah || ""}` });
        const sisa = document.querySelector("#gqSisa");
        if (sisa && Api.kuotaSisa !== null && Api.kuotaSisa !== undefined) {
          sisa.textContent = `Kuota API tersisa ${Api.kuotaSisa} request menit ini`;
        }
      };
      tombol.addEventListener("click", jalankan);
      kotak.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          jalankan();
        }
      });
      document.querySelectorAll("[data-sql]").forEach((b) =>
        b.addEventListener("click", () => {
          kotak.value = b.dataset.sql;
          jalankan();
        })
      );
    },
  };
})();
