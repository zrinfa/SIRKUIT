/* =====================================================================
 * SIRKUIT - js/quiz-engine.js
 * Engine Modul Materi & Kuis Evaluasi Diagnostik.
 * Soal dan kunci berada di MySQL (tabel quiz_questions); peramban hanya
 * menerima soal tanpa kunci lewat GET /api/quiz.php, lalu jawaban dinilai
 * server lewat POST /api/quiz.php dan dibahas per nomor.
 * Classic script - mengekspos window.QuizEngine.
 * ===================================================================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const QuizEngine = {
  soal: [],
  answers: {},
  submitted: false,
  sedangMuat: false,

  init() {
    this.renderModules();
    if (Api.user) this.muatSoal();
    $("#btnSubmitQuiz").addEventListener("click", () => this.submit());
    $("#btnRetryQuiz").addEventListener("click", () => this.reset());
  },

  sessionName() {
    return Api.user ? Api.user.nama : "Tamu";
  },
  sessionKelas() {
    if (!Api.user) return "XI RPL 1";
    return Api.user.peran === "guru" ? "Guru" : Api.user.kelas || "XI RPL 1";
  },

  renderModules() {
    $("#moduleGrid").innerHTML = SIRKUIT_CONFIG.MODULE_CARDS.map(
      (m) => `
      <div class="module-card panel">
        <div class="mc-num">${m.nomor}</div>
        <h4>${m.judul}</h4>
        <p>${m.isi}</p>
        <ul>${m.poin.map((p) => `<li>${p}</li>`).join("")}</ul>
      </div>`
    ).join("");
  },

  async muatSoal() {
    if (this.sedangMuat || !Api.user || this.soal.length) return;
    this.sedangMuat = true;
    $("#quizList").innerHTML = '<p class="muted">Memuat soal dari tabel <span class="mono">quiz_questions</span> lewat GET /api/quiz.php...</p>';
    const r = await Api.get("quiz.php");
    this.sedangMuat = false;
    if (!r.ok) {
      $("#quizList").innerHTML = `<p class="form-error">Soal gagal dimuat (HTTP ${r.status}): ${r.error || r.data?.message || "periksa koneksi ke server PHP"}</p>`;
      return;
    }
    this.soal = r.data.data || [];
    this.renderQuiz();
  },

  renderQuiz() {
    const letters = ["A", "B", "C", "D"];
    $("#quizList").innerHTML = this.soal
      .map(
        (q, qi) => `
      <div class="quiz-q" data-q="${q.id}">
        <div class="q-head">
          <div class="q-num">${qi + 1}</div>
          <div>
            <div class="q-topic">${q.topik}</div>
            <div class="q-text">${q.soal}</div>
          </div>
        </div>
        <div class="q-opts">
          ${(q.opsi || []).map((o, oi) => `<button class="q-opt" data-q="${q.id}" data-o="${oi}"><span class="q-letter">${letters[oi]}.</span><span>${o}</span></button>`).join("")}
        </div>
        <div class="q-explain hidden" id="explain_${q.id}"></div>
      </div>`
      )
      .join("");
    this.bindOptions();
  },

  bindOptions() {
    $$(".q-opt").forEach((btn) => {
      btn.onclick = () => {
        if (this.submitted) return;
        const qid = btn.dataset.q;
        this.answers[qid] = parseInt(btn.dataset.o, 10);
        $$('.q-opt[data-q="' + qid + '"]').forEach((b) => b.classList.remove("sel"));
        btn.classList.add("sel");
      };
    });
  },

  async submit() {
    if (this.submitted || !this.soal.length) return;
    const unanswered = this.soal.filter((q) => this.answers[q.id] === undefined);
    if (unanswered.length) {
      const nomor = unanswered.map((q) => this.soal.indexOf(q) + 1).join(", ");
      if (window.SIRKUIT_toast) SIRKUIT_toast(`Masih ada ${unanswered.length} nomor yang belum dijawab (nomor ${nomor}). Lengkapi seluruh jawaban sebelum mengumpulkan.`, "error");
      const first = $('.quiz-q[data-q="' + unanswered[0].id + '"]');
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const btn = $("#btnSubmitQuiz");
    btn.disabled = true;
    btn.textContent = "Menilai di server...";
    const r = await Api.post("quiz.php", { jawaban: this.answers });
    btn.textContent = "Kumpulkan Jawaban";
    if (!r.ok) {
      btn.disabled = false;
      if (window.SIRKUIT_toast) SIRKUIT_toast(`Penilaian gagal (HTTP ${r.status}): ${r.error || "coba lagi"}`, "error");
      return;
    }

    const hasil = r.data;
    const kkm = hasil.kkm || Api.setting.kkm;
    const passed = hasil.status_kkm === "TUNTAS";
    this.submitted = true;
    const letters = ["A", "B", "C", "D"];

    (hasil.periksa || []).forEach((p) => {
      const q = this.soal.find((x) => String(x.id) === String(p.id));
      if (!q) return;
      $$('.q-opt[data-q="' + p.id + '"]').forEach((b) => {
        b.classList.remove("sel");
        const oi = parseInt(b.dataset.o, 10);
        if (oi === p.opsi_benar) b.classList.add("key-correct");
        else if (oi === p.dipilih) b.classList.add("key-wrong");
        b.style.cursor = "default";
      });
      const ex = $("#explain_" + p.id);
      ex.innerHTML =
        `<b>Pembahasan No. ${this.soal.indexOf(q) + 1}</b> - Jawaban Anda: <b>${letters[p.dipilih] ?? "-"}</b>, ` +
        `Kunci: <b>${letters[p.opsi_benar] ?? "-"}</b> (${p.teks_benar || ""})<br>${p.pembahasan}`;
      ex.classList.remove("hidden");
    });

    $("#btnRetryQuiz").classList.remove("hidden");
    const root = $("#quizResult");
    root.className = "quiz-result panel " + (passed ? "pass" : "fail");
    root.innerHTML = `
      <div class="score-big">${hasil.skor}</div>
      <div class="verdict">${passed ? "TUNTAS KKM" : "BELUM TUNTAS - REMEDIAL"}</div>
      <div class="kkm-note">
        Benar ${hasil.benar} dari ${hasil.total} soal, KKM ${kkm}
        ${passed
          ? "Skor Anda memenuhi target Ketercapaian Belajar Siswa (Tabel 3.4) dan sudah tercatat di Dashboard Guru."
          : "Nilai Anda di bawah KKM. Pelajari kembali Bagian A, ulangi skenario PBL dan latihan Lab Uji, lalu kerjakan remedial."}
      </div>
      <div style="margin-top:14px;font-size:12px;color:var(--text-low)">Kunci jawaban tidak pernah dikirim ke peramban: POST /api/quiz.php membandingkan <span class="mono">jawaban</span> dengan kolom <span class="mono">kunci</span> di MySQL, lalu INSERT ke tabel <span class="mono">quiz_attempts</span>.</div>`;
    root.scrollIntoView({ behavior: "smooth", block: "center" });
    if (window.SIRKUIT_toast) SIRKUIT_toast(`Penilaian server: ${hasil.skor} ${passed ? ">= " + kkm + " - TUNTAS" : "< " + kkm + " - remedial ditugaskan"}.`, passed ? "success" : "error");
  },

  reset() {
    this.answers = {};
    this.submitted = false;
    this.renderQuiz();
    $("#quizResult").className = "quiz-result panel hidden";
    $("#quizResult").innerHTML = "";
    $("#btnSubmitQuiz").disabled = false;
    $("#btnRetryQuiz").classList.add("hidden");
    $("#view-modul").scrollTo?.({ top: 0 });
  },
};

if (typeof window !== "undefined") window.QuizEngine = QuizEngine;
