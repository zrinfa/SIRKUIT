/* =====================================================================
 * SIRKUIT - js/api.js
 * Satu-satunya pintu front-end ke backend PHP + MySQL.
 * Sesi dipakai lewat cookie SIRKUITSID (session_start di server) dan setiap
 * POST/PUT/DELETE wajib mengirim header X-CSRF-Token yang diberikan
 * api/session.php. Tidak ada kredensial database di sisi peramban.
 * ===================================================================== */

const Api = {
  /** Folder api/ relatif terhadap halaman, supaya aman dipasang di subdirektori cPanel. */
  base: new URL("api/", document.baseURI).pathname,
  csrf: "",
  user: null,
  setting: { kkm: 75, kuota_rate: 60, versi: "-", runner: "browser" },
  sehat: false,
  pesanServer: "",

  async minta(path, opts = {}) {
    const url = this.base + path + (opts.params ? "?" + new URLSearchParams(opts.params).toString() : "");
    const headers = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.csrf) headers["X-CSRF-Token"] = this.csrf;
    let res, teks;
    try {
      res = await fetch(url, {
        method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
        credentials: "same-origin",
        headers: Object.assign(headers, opts.headers || {}),
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
      teks = await res.text();
    } catch (err) {
      if (err && err.name === "AbortError") return { ok: false, status: 0, data: null, error: "Permintaan dibatalkan." };
      this.sehat = false;
      this.pesanServer = "Server tidak terjangkau: " + err.message;
      return { ok: false, status: 0, data: null, error: this.pesanServer };
    }

    let data = null;
    try {
      data = JSON.parse(teks);
    } catch (e) {
      // Balinan HTML (fatal PHP, rewrite salah, folder api/ diblokir) ikut dilaporkan.
      const potong = teks.replace(/<[^>]*>/g, " ").trim().slice(0, 180);
      this.pesanServer = "Respons server bukan JSON (HTTP " + res.status + "): " + potong;
      return { ok: false, status: res.status, data: null, error: this.pesanServer };
    }

    const bat = Number(res.headers.get("X-RateLimit-Remaining"));
    if (Number.isFinite(bat)) this.kuotaSisa = bat;
    this.pesanServer = data.message || "";

    if (res.status === 401 && !opts.senantikan) {
      document.dispatchEvent(new CustomEvent("sirkuit:unauth", { detail: data }));
    }
    if (res.ok && data.status !== "error") this.sehat = true;

    return {
      ok: res.ok && data.status !== "error",
      status: res.status,
      data,
      rows: data.data !== undefined ? data.data : null,
      error: data.status === "error" ? data.message : null,
      retryAfter: data.retry_after || Number(res.headers.get("Retry-After")) || 0,
    };
  },

  get(path, params) {
    return this.minta(path, { params });
  },
  post(path, body) {
    return this.minta(path, { method: "POST", body });
  },
  put(path, body) {
    return this.minta(path, { method: "PUT", body });
  },
  hapus(path, params) {
    return this.minta(path, { method: "DELETE", params });
  },

  /** Membaca sesi sekarang. Dipanggil sekali saat boot dan ulang setelah login. */
  async sesi() {
    const r = await this.minta("session.php", { senantikan: true });
    if (!r.ok) return null;
    this.csrf = r.data.csrf || "";
    this.user = r.data.user || null;
    Object.assign(this.setting, r.data.pengaturan || {});
    this.sehat = true;
    this.kuotaSisa = r.data.kuota_sisa !== undefined ? r.data.kuota_sisa : null;
    return this.user;
  },

  async login(identitas, sandi, peran) {
    const r = this.csrf;
    this.csrf = "";
    const res = await this.minta("login.php", { body: { identitas, sandi, peran } });
    if (!res.ok) {
      this.csrf = r;
      return { ok: false, error: res.error || res.data.message || "Login ditolak server." };
    }
    this.csrf = res.data.csrf;
    this.user = res.data.user;
    await this.sesi();
    return { ok: true, user: this.user, meta: res.data.sesi };
  },

  async logout() {
    const r = await this.minta("logout.php", { body: {} });
    this.user = null;
    this.csrf = "";
    await this.sesi();
    return r;
  },

  /** Status singkat untuk badge di topbar: PHP/MySQL yang menjawab, bukan cloud pihak ketiga. */
  statusLabel() {
    if (!this.sehat) return "Backend PHP tidak terjangkau: " + this.pesanServer;
    return (
      "Terhubung ke Apache + PHP " +
      (this.setting.versi ? "· SIRKUIT v" + this.setting.versi : "") +
      " · MySQL/MariaDB · kuota " + this.setting.kuota_rate + " request/menit"
    );
  },
};

if (typeof window !== "undefined") window.Api = Api;
