/* =====================================================================
 * SIRKUIT - js/main.js (ES Module)
 * Router SPA, autentikasi session_start PHP, notifikasi, init scene 3D.
 * Semua data lewat js/api.js menuju api/*.php di host yang sama.
 * ===================================================================== */

const App = {
  view: "login",
  scene: null,
  pblReady: false,
  session: null,
};

const $m = (sel) => document.querySelector(sel);
const $$m = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- Notifikasi ---------------- */
window.SIRKUIT_toast = function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  $m("#toastRoot").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  }, 4600);
};

/* ---------------- Tema ---------------- */
/* Tema awal sudah dipasang skrip inline di <head> supaya tidak ada kedipan.
   Fungsi ini dipakai tombol pengalih dan ikut memberi tahu scene 3D. */
function terapkanTema(tema) {
  document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem("sirkuit_tema", tema);
  } catch (e) {
    /* mode privat: tema tetap berlaku selama sesi halaman ini */
  }
  const btn = $m("#btnTema");
  if (btn) btn.textContent = tema === "dark" ? "Tema Terang" : "Tema Gelap";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "dark" ? "#0d131a" : "#182230");
  window.dispatchEvent(new CustomEvent("sirkuit:tema", { detail: tema }));
}

/* ---------------- Router multi-peran ---------------- */
const ROLE_ALLOWED = {
  siswa: ["tugas", "grid", "workspace", "lab", "modul"],
  guru: ["dashboard", "tugas", "grid", "workspace", "lab", "modul"],
};

const VIEW_LABEL = {
  workspace: "Alur Request Saya",
  "workspace-inspect": "Inspeksi JSON",
  tugas: "Tugas",
  grid: "Lab Kueri",
  lab: "Lab Uji Kode",
  modul: "Modul dan Kuis",
  dashboard: "Dashboard Guru",
};

function navigate(view, opts = {}) {
  if (view === "LOGIN") view = "login";
  const s = App.session;
  if (view !== "login" && !s) view = "login";
  const allowed = ROLE_ALLOWED[s ? s.peran : ""] || [];
  const target = view === "workspace-inspect" ? "workspace" : view;
  if (s && view !== "login" && !allowed.includes(target)) {
    window.SIRKUIT_toast(`Halaman ${VIEW_LABEL[view] || view} belum tersedia untuk peran ${s.peran}.`, "error");
    return;
  }
  App.view = view;
  $$m("main > section").forEach((sec) => sec.classList.add("hidden"));
  $m("#view-" + target).classList.remove("hidden");
  $m("#topbar").classList.toggle("hidden", !App.session);
  $$m("#mainNav .nav-btn").forEach((b) => {
    const t = b.dataset.view === "workspace-inspect" ? "workspace" : b.dataset.view;
    b.classList.toggle("active", b.dataset.view === view);
    b.classList.toggle("hidden", !!s && !allowed.includes(t));
  });

  if (target === "workspace") {
    ensureScene().then(() => {
      App.scene?.resize();
      if (view === "workspace-inspect") {
        if (PBLSimulator.state.scenarioCode === "NORMAL") PBLSimulator.loadScenario("E429");
        PBLSimulator.selectNode(PBLSimulator.state.inspectNode || "gateway", false);
        setTimeout(() => $m("#jsonViewerPanel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      }
      syncStageTag();
    });
  }
  if (target === "lab") LabUji.init();
  if (target === "grid") DataGrid.initView();
  if (target === "tugas") Tugas.initView();
  if (target === "workspace") PBLSimulator.muatSkenario();
  if (target === "modul" && !QuizEngine.soal.length) QuizEngine.muatSoal();
  if (target === "dashboard") TeacherDashboard.render();
  if (target === "modul" && opts.scrollToQuiz) setTimeout(() => $m("#quizCard")?.scrollIntoView({ behavior: "smooth" }), 50);
  window.scrollTo({ top: 0 });
}
window.SIRKUIT_navigate = (v) => navigate(v);

function syncStageTag() {
  const tag = $m("#pblStageTag");
  if (tag) tag.textContent = "Tahap " + PBLSimulator.state.stage + " PBL";
}

/* ---------------- Scene 3D (lazy, dengan fallback non-WebGL) ---------------- */
let scenePromise = null;
async function ensureScene() {
  if (scenePromise) return scenePromise;
  scenePromise = (async () => {
    try {
      const mod = await import("./scene3d.js");
      const Scene3DEngine = mod.default;
      const engine = new Scene3DEngine();
      engine.init($m("#canvasShell"));
      engine.renderer.domElement.id = "sceneCanvas";
      engine.onFps = (fps) => {
        $m("#fpsVal").textContent = fps;
      };
      App.scene = engine;
      if (!App.pblReady) {
        PBLSimulator.init(engine);
        App.pblReady = true;
      } else {
        engine.onNodeClick = (id) => PBLSimulator.selectNode(id);
      }
      window.SIRKUIT_scene = engine;
    } catch (err) {
      console.error("[SIRKUIT] WebGL tidak tersedia:", err);
      $m("#glReadout").textContent = "WebGL tidak tersedia. Panel JSON dan studi kasus tetap berfungsi.";
      if (!App.pblReady) {
        PBLSimulator.init(null);
        App.pblReady = true;
      }
    }
  })();
  return scenePromise;
}

/* ---------------- Autentikasi ---------------- */
function renderAuthed() {
  const s = App.session;
  if (!s) {
    $m("#userChip").textContent = "Belum login";
    return;
  }
  $m("#userChip").innerHTML = `<b>${s.nama}</b> | ${s.peran === "guru" ? "Guru Produktif RPL" : s.kelas + " NISN " + s.nisn_nip}`;
}

function updateConnBadge() {
  const teks = Api.statusLabel();
  $m("#connText").textContent = teks;
  $m("#connBadge").classList.toggle("offline", !Api.sehat);
  const loginBadge = $m("#loginConnBadge");
  if (loginBadge) {
    loginBadge.textContent = Api.sehat
      ? `Backend PHP 8.2 + MySQL siap · versi ${Api.setting.versi} · KKM ${Api.setting.kkm}`
      : Api.pesanServer;
  }
}

async function handleLogin(identity, password) {
  const btn = $m("#loginForm button[type=submit]");
  const peran = ($m(".role-tab.active") || {}).dataset?.role || "siswa";
  btn.disabled = true;
  const res = await Api.login(identity, password, peran);
  btn.disabled = false;
  updateConnBadge();
  if (!res.ok) {
    $m("#loginError").textContent = res.error;
    $m("#loginError").classList.remove("hidden");
    return;
  }
  App.session = Api.user;
  $m("#loginError").classList.add("hidden");
  renderAuthed();
  window.SIRKUIT_toast(`Selamat datang, ${Api.user.nama}. Sesi dibuat session_start() PHP di server.`, "success");
  navigate(Api.user.peran === "guru" ? "dashboard" : "tugas");
}

function doLogout() {
  Api.logout().then(() => {
    App.session = null;
    renderAuthed();
    updateConnBadge();
    navigate("login");
    window.SIRKUIT_toast("Sesi diakhiri dengan session_destroy(). Kembali ke halaman login.", "info");
  });
}

document.addEventListener("sirkuit:unauth", () => {
  if (!App.session) return;
  App.session = null;
  Api.user = null;
  renderAuthed();
  navigate("login");
  window.SIRKUIT_toast("Sesi berakhir di server (401). Login ulang untuk melanjutkan.", "error");
});

/* ---------------- Boot ---------------- */
async function boot() {
  terapkanTema(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  $m("#btnTema").addEventListener("click", () => {
    terapkanTema(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  await Api.sesi();
  updateConnBadge();
  App.session = Api.user;
  renderAuthed();

  $$m(".role-tab").forEach((t) =>
    t.addEventListener("click", () => {
      $$m(".role-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      $m("#idLabel").textContent = t.dataset.role === "guru" ? "Email / NIP" : "Email / NISN";
    })
  );

  $m("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleLogin($m("#loginId").value, $m("#loginPass").value);
  });
  $m("#demoSiswa").addEventListener("click", () => {
    $$m(".role-tab").forEach((x) => x.classList.toggle("active", x.dataset.role === "siswa"));
    $m("#idLabel").textContent = "Email / NISN";
    handleLogin(SIRKUIT_CONFIG.DEMO_ACCOUNTS.siswa.nisn_nip, SIRKUIT_CONFIG.DEMO_ACCOUNTS.siswa.password);
  });
  $m("#demoGuru").addEventListener("click", () => {
    $$m(".role-tab").forEach((x) => x.classList.toggle("active", x.dataset.role === "guru"));
    $m("#idLabel").textContent = "Email / NIP";
    handleLogin(SIRKUIT_CONFIG.DEMO_ACCOUNTS.guru.nisn_nip, SIRKUIT_CONFIG.DEMO_ACCOUNTS.guru.password);
  });
  $m("#btnLogout").addEventListener("click", doLogout);
  $m("#btnCekSesi").addEventListener("click", async () => {
    const r = await Api.get("auth.php");
    window.SIRKUIT_toast(
      r.ok ? `GET /api/auth.php -> ${r.status} OK: ${r.data.message}` : `GET /api/auth.php -> ${r.status}: ${r.error || r.data.message}`,
      r.ok ? "success" : "error"
    );
    updateConnBadge();
  });

  $$("#mainNav .nav-btn").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.view)));

  QuizEngine.init();
  setInterval(syncStageTag, 900);

  if (!App.session) navigate("login");
  else navigate(App.session.peran === "guru" ? "dashboard" : "tugas");

  window.addEventListener("resize", () => App.scene?.resize());
  setInterval(() => {
    if (App.session) Api.sesi().then(updateConnBadge);
  }, 5 * 60 * 1000);
}

boot().catch((err) => {
  console.error(err);
  window.SIRKUIT_toast("Gagal menginisialisasi aplikasi: " + err.message, "error");
});
