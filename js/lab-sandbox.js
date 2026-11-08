/* =====================================================================
 * SIRKUIT - js/lab-sandbox.js
 * Runtime terisolasi untuk Lab Uji Kode. File ini dibaca sebagai teks,
 * lalu diinjeksikan ke iframe kosong (srcdoc) sehingga kode siswa berjalan
 * di luar dokumen utama. Komunikasi hanya lewat postMessage.
 * ===================================================================== */
(function () {
  "use strict";

  const send = (msg) => {
    msg.__sirkuitLab = true;
    parent.postMessage(msg, "*");
  };

  const TABEL = {};
  let ROUTES = [];
  let RATE_LIMIT = 6;
  let state = null;

  /* ---------------- Konsol yang diteruskan ke halaman induk ---------------- */
  function formatArg(a) {
    if (typeof a === "string") return a;
    if (a instanceof Error) return a.name + ": " + a.message;
    try {
      return JSON.stringify(a, null, 2);
    } catch (e) {
      return String(a);
    }
  }
  function emit(level, args) {
    const text = args.map(formatArg).join(" ");
    if (state) state.messages.push({ level, text });
    send({ type: "output", level, text });
  }
  const labConsole = {
    log: (...a) => emit("log", a),
    info: (...a) => emit("info", a),
    debug: (...a) => emit("info", a),
    warn: (...a) => emit("warn", a),
    error: (...a) => emit("error", a),
    table: (d) => emit("log", [d]),
  };

  window.onerror = (m) => {
    emit("error", ["Uncaught " + m]);
    if (state) state.fatal = String(m);
  };
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    emit("error", ["Uncaught (in promise) " + (r && r.message ? r.message : r)]);
    if (state) state.fatal = String(r);
  });

  /* ---------------- Utilitas ---------------- */
  const clean = (p) => String(p || "").split("?")[0].replace(/\/+$/, "");
  const queryOf = (p) => {
    const i = String(p || "").indexOf("?");
    const out = {};
    if (i < 0) return out;
    String(p)
      .slice(i + 1)
      .split("&")
      .forEach((kv) => {
        if (!kv) return;
        const [k, ...rest] = kv.split("=");
        out[decodeURIComponent(k)] = decodeURIComponent(rest.join("=") || "");
      });
    return out;
  };
  const nowIso = () => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds());
  };
  const rid = (p) => p + "_" + Math.random().toString(36).slice(2, 8);
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Math.min(Number(ms) || 0, 3000))));

  /* ---------------- Mesin SQL mini ---------------- */
  function stripComments(sql) {
    return sql
      .split("\n")
      .map((l) => l.replace(/--.*$/, "").replace(/\/\*[^]*?\*\//g, ""))
      .join("\n")
      .replace(/`/g, "");
  }

  function splitStatements(sql) {
    const out = [];
    let cur = "";
    let quote = null;
    for (let i = 0; i < sql.length; i += 1) {
      const ch = sql[i];
      if (quote) {
        cur += ch;
        if (ch === quote) {
          if (sql[i + 1] === quote) {
            cur += sql[++i];
            continue;
          }
          quote = null;
        }
        continue;
      }
      if (ch === "'") {
        quote = ch;
        cur += ch;
        continue;
      }
      if (ch === ";") {
        if (cur.trim()) out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function parseLiteral(tok) {
    const t = String(tok).trim();
    if (/^'.*'$/s.test(t)) return t.slice(1, -1).replace(/''/g, "'");
    if (/^(-?\d+\.?\d*)$/.test(t)) return parseFloat(t);
    const low = t.toLowerCase();
    if (low === "true") return true;
    if (low === "false") return false;
    if (low === "null") return null;
    if (low === "now()" || low === "current_timestamp" || low === "sysdate()") return nowIso();
    if (low === "current_date" || low === "curdate()") return nowIso().slice(0, 10);
    throw new Error('nilai "' + t + '" tidak dikenali (pakai angka, teks dengan kutip, true/false/null, atau now())');
  }

  function splitTopLevel(str, sep) {
    const out = [];
    let cur = "";
    let depth = 0;
    let quote = null;
    const isWord = (c) => /[A-Za-z0-9_]/.test(c || "");
    for (let i = 0; i < str.length; i += 1) {
      const ch = str[i];
      if (quote) {
        cur += ch;
        if (ch === quote) {
          if (str[i + 1] === quote) {
            cur += str[++i];
            continue;
          }
          quote = null;
        }
        continue;
      }
      if (ch === "'") {
        quote = ch;
        cur += ch;
        continue;
      }
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (depth === 0 && str.slice(i).toLowerCase().startsWith(sep)) {
        const after = str[i + sep.length] || "";
        // separator ber-spasi (" and ", " or ") selalu memotong; koma dan lainnya perlu batas kata
        if (sep === "," || /^\s/.test(sep) || (!isWord(cur.slice(-1)) && !isWord(after))) {
          out.push(cur);
          cur = "";
          i += sep.length - 1;
          continue;
        }
      }
      cur += ch;
    }
    out.push(cur);
    return out.filter((s, idx) => idx === out.length - 1 || s.trim() !== "");
  }

  function tableOf(name) {
    const key = String(name || "").replace(/public\./i, "").trim().toLowerCase();
    if (!TABEL[key]) throw new Error("ERROR 1146 (42S02): Table 'pkl_rpl." + key + "' doesn't exist. Tabel tersedia: " + Object.keys(TABEL).join(", "));
    return { nama: key, def: TABEL[key] };
  }

  function hasColumn(tbl, col) {
    return tbl.def.kolom.some((k) => k.nama.toLowerCase() === String(col).toLowerCase());
  }

  function columnOf(tbl, ref) {
    const name = String(ref).replace(/^[a-z_]+\./i, "").trim();
    if (!hasColumn(tbl, name)) throw new Error("ERROR 1054 (42S22): Unknown column '" + name + "' in 'field list'. Kolom tersedia: " + tbl.def.kolom.map((k) => k.nama).join(", "));
    return name;
  }

  function evalCondition(tbl, row, condText) {
    const c = condText.trim().replace(/\s+/g, " ");
    let m;
    if ((m = /^([A-Za-z_][\w.]*)\s+is\s+null$/i.exec(c))) return row[columnOf(tbl, m[1])] === null || row[columnOf(tbl, m[1])] === undefined;
    if ((m = /^([A-Za-z_][\w.]*)\s+is\s+not\s+null$/i.exec(c))) return !(row[columnOf(tbl, m[1])] === null || row[columnOf(tbl, m[1])] === undefined);
    if ((m = /^([A-Za-z_][\w.]*)\s+not\s+in\s*\((.*)\)$/i.exec(c))) return !splitTopLevel(m[2], ",").map(parseLiteral).includes(row[columnOf(tbl, m[1])]);
    if ((m = /^([A-Za-z_][\w.]*)\s+in\s*\((.*)\)$/i.exec(c))) return splitTopLevel(m[2], ",").map(parseLiteral).includes(row[columnOf(tbl, m[1])]);
    if ((m = /^([A-Za-z_][\w.]*)\s+not\s+like\s+'([^']*)'$/i.exec(c))) return !likeTo(row[columnOf(tbl, m[1])], m[2]);
    if ((m = /^([A-Za-z_][\w.]*)\s+like\s+'([^']*)'$/i.exec(c))) return likeTo(row[columnOf(tbl, m[1])], m[2]);
    if ((m = /^([A-Za-z_][\w.]*)\s*(>=|<=|!=|<>)\s*(.+)$/i.exec(c))) {
      const a = row[columnOf(tbl, m[1])];
      const b = parseLiteral(m[3]);
      if (m[2] === ">=") return a >= b;
      if (m[2] === "<=") return a <= b;
      return !(a === b || (typeof a === "boolean" && (a ? 1 : 0) === b));
    }
    if ((m = /^([A-Za-z_][\w.]*)\s*(=|>|<)\s*(.+)$/i.exec(c))) {
      const a = row[columnOf(tbl, m[1])];
      const b = parseLiteral(m[3]);
      const same = typeof a === "boolean" && typeof b === "number" ? (a ? 1 : 0) === b : typeof b === "boolean" && typeof a === "number" ? (b ? 1 : 0) === a : a === b;
      return m[2] === "=" ? same : m[2] === ">" ? a > b : a < b;
    }
    throw new Error('kondisi WHERE tidak dikenali: "' + condText.trim() + '"');
  }

  function likeTo(value, pattern) {
    const rx = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
    return rx.test(String(value));
  }

  function matches(tbl, row, where) {
    if (!where || !where.trim()) return true;
    const orParts = splitTopLevel(where, " or ").filter((s) => s.trim());
    return orParts.some((orGroup) => splitTopLevel(orGroup, " and ").filter((s) => s.trim()).every((cond) => evalCondition(tbl, row, cond)));
  }

  function execSelect(text) {
    const m = /^select\s+([\s\S]+?)\s+from\s+([A-Za-z_][\w.]*)([\s\S]*)$/i.exec(text.trim());
    if (!m) throw new Error("statement SELECT tidak dapat dibaca");
    const table = tableOf(m[2]);
    const rest = m[3] || "";
    const whereM = /\bwhere\b([\s\S]*?)(?=\bgroup\s+by\b|\border\s+by\b|\blimit\b|\boffset\b|$)/i.exec(rest);
    const orderM = /\border\s+by\s+([A-Za-z_][\w.]*)(\s+(asc|desc))?/i.exec(rest);
    const limitKomma = /\blimit\s+(\d+)\s*,\s*(\d+)/i.exec(rest);
    const limitKet = /\blimit\s+(\d+)/i.exec(rest);
    const offsetKet = /\boffset\s+(\d+)/i.exec(rest);
    let rows = table.def.rows.filter((r) => matches(table, r, whereM ? whereM[1] : ""));

    if (orderM) {
      const col = columnOf(table, orderM[1]);
      const dir = (orderM[3] || "asc").toLowerCase() === "desc" ? -1 : 1;
      rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * dir);
    }
    const totalBefore = rows.length;
    const skip = limitKomma ? parseInt(limitKomma[1], 10) : offsetKet ? parseInt(offsetKet[1], 10) : 0;
    const take = limitKomma ? parseInt(limitKomma[2], 10) : limitKet ? parseInt(limitKet[1], 10) : null;
    rows = take === null ? rows.slice(skip) : rows.slice(skip, skip + take);

    const items = splitTopLevel(m[1], ",").map((s) => s.trim()).filter(Boolean);
    const isAgg = items.some((it) => /\b(count|sum|avg|min|max)\s*\(/i.test(it));
    if (isAgg) {
      const cols = [];
      const out = {};
      items.forEach((it, idx) => {
        const am = /^(count|sum|avg|min|max)\s*\(\s*(\*|[A-Za-z_][\w.]*)\s*\)(\s+as\s+([A-Za-z_]\w*))?$/i.exec(it);
        if (!am) throw new Error('fungsi agregat tidak dikenali: "' + it + '"');
        const fn = am[1].toLowerCase();
        const arg = am[2].trim();
        const label = (am[4] || fn + "(" + arg + ")").toLowerCase();
        let val;
        if (fn === "count") val = arg === "*" ? totalBefore : rows.filter((r) => r[columnOf(table, arg)] != null).length;
        else {
          const col = columnOf(table, arg);
          const nums = rows.map((r) => Number(r[col])).filter((n) => !Number.isNaN(n));
          if (fn === "sum") val = nums.reduce((a, b) => a + b, 0);
          if (fn === "avg") val = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
          if (fn === "min") val = nums.length ? Math.min(...nums) : null;
          if (fn === "max") val = nums.length ? Math.max(...nums) : null;
        }
        cols.push(label);
        out[label] = val;
      });
      return { columns: cols, rows: [out] };
    }

    let picked;
    if (items.length === 1 && items[0] === "*") {
      picked = rows.map((r) => Object.assign({}, r));
      return { columns: table.def.kolom.map((k) => k.nama), rows: picked };
    }
    const cols = [];
    picked = rows.map((r) => {
      const o = {};
      items.forEach((it) => {
        const am = /^([A-Za-z_][\w.]*)(\s+as\s+([A-Za-z_]\w*))?$/i.exec(it);
        if (!am) throw new Error('kolom tidak dikenali: "' + it + '"');
        const col = columnOf(table, am[1]);
        const label = am[3] ? am[3].toLowerCase() : col;
        if (!cols.includes(label)) cols.push(label);
        o[label] = r[col];
      });
      return o;
    });
    return { columns: cols, rows: picked };
  }

  function execInsert(text) {
    const m = /^insert\s+into\s+([A-Za-z_][\w.]*)\s*\(([^)]*)\)\s*values\s*([\s\S]+?)(\s+returning\s+(.+))?$/i.exec(text.trim());
    if (!m) throw new Error("statement INSERT tidak dapat dibaca (format: INSERT INTO tabel (kolom) VALUES (nilai))");
    const table = tableOf(m[1]);
    const cols = splitTopLevel(m[2], ",").map((c) => columnOf(table, c));
    const groups = splitTopLevel(m[3], "),").map((g) => g.replace(/^\s*\(/, "").replace(/\)\s*$/, ""));
    const created = [];
    groups.forEach((g) => {
      const vals = splitTopLevel(g, ",").map(parseLiteral);
      if (vals.length !== cols.length) throw new Error("jumlah nilai tidak cocok dengan jumlah kolom");
      const row = {};
      table.def.kolom.forEach((k) => {
        row[k.nama] = k.nama === "id" && !cols.includes("id") ? rid(table.nama) : k.nama === "created_at" && !cols.includes("created_at") ? nowIso() : null;
      });
      cols.forEach((c, i) => {
        row[c] = vals[i];
      });
      table.def.rows.push(row);
      created.push(Object.assign({}, row));
    });
    return { columns: table.def.kolom.map((k) => k.nama), rows: created, affected: created.length };
  }

  function execUpdate(text) {
    const m = /^update\s+([A-Za-z_][\w.]*)\s+set\s+([\s\S]+?)(\s+where\s+([\s\S]+))?$/i.exec(text.trim());
    if (!m) throw new Error("statement UPDATE tidak dapat dibaca");
    const table = tableOf(m[1]);
    const where = m[4] || "";
    if (!where.trim()) throw new Error("UPDATE tanpa WHERE ditolak: ruang uji mewajibkan filter baris agar nilai siswa lain tidak berubah");
    const assignments = splitTopLevel(m[2], ",").map((a) => {
      const am = /^([A-Za-z_][\w.]*)\s*=\s*([\s\S]+)$/i.exec(a.trim());
      if (!am) throw new Error('assignment tidak dikenali: "' + a.trim() + '"');
      return [columnOf(table, am[1]), parseLiteral(am[2])];
    });
    let n = 0;
    const changed = [];
    table.def.rows.forEach((r) => {
      if (matches(table, r, where)) {
        assignments.forEach(([c, v]) => {
          r[c] = v;
        });
        n += 1;
        changed.push(Object.assign({}, r));
      }
    });
    return { columns: table.def.kolom.map((k) => k.nama), rows: changed, affected: n };
  }

  function execDelete(text) {
    const m = /^delete\s+from\s+([A-Za-z_][\w.]*)\s*(where\s+([\s\S]+))?$/i.exec(text.trim());
    if (!m) throw new Error("statement DELETE tidak dapat dibaca");
    const table = tableOf(m[1]);
    const where = m[3] || "";
    if (!where.trim()) throw new Error("DELETE tanpa WHERE ditolak di ruang uji");
    const keep = [];
    let n = 0;
    table.def.rows.forEach((r) => {
      if (matches(table, r, where)) n += 1;
      else keep.push(r);
    });
    table.def.rows = keep;
    return { columns: table.def.kolom.map((k) => k.nama), rows: [], affected: n };
  }

  function runStatement(sql) {
    const t = sql.trim().replace(/\s+/g, " ");
    try {
      if (/^select\b/i.test(t)) return Object.assign({ sql, error: null }, execSelect(sql));
      if (/^insert\b/i.test(t)) return Object.assign({ sql, error: null }, execInsert(sql));
      if (/^update\b/i.test(t)) return Object.assign({ sql, error: null }, execUpdate(sql));
      if (/^delete\b/i.test(t)) return Object.assign({ sql, error: null }, execDelete(sql));
      if (/^(begin|commit|rollback|set|show)\b/i.test(t)) return { sql, columns: [], rows: [], affected: 0, error: null };
      throw new Error("Statement tidak didukung ruang uji MySQL: gunakan SELECT, INSERT, UPDATE, atau DELETE (DDL dibuat lewat phpMyAdmin)");
    } catch (err) {
      return { sql, columns: [], rows: [], error: err.message };
    }
  }

  const db = {
    query(sqlText) {
      const results = splitStatements(stripComments(String(sqlText || ""))).map(runStatement);
      results.forEach((r) => state.queries.push(r));
      return Promise.resolve(results.length === 1 ? results[0] : results);
    },
  };

  /* ---------------- Simulasi HTTP request melalui arsitektur 4 node ---------------- */
  const STATUS_TEXT = { 200: "OK", 201: "Created", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 429: "Too Many Requests", 500: "Internal Server Error" };

  function tokenValid(hdr) {
    const h = String(hdr || "");
    return /^Bearer\s+[\w.-]{20,}$/.test(h) && !/expired|null/i.test(h);
  }

  function routeIndex(base) {
    return ROUTES.findIndex((r) => clean(r.path).toLowerCase() === base.toLowerCase());
  }

  const norm = (v) => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]/g, "");

  function rowsForGet(base, q, table) {
    let rows = table.def.rows.map((r) => Object.assign({}, r));
    if (q.kelas) rows = rows.filter((r) => norm(r.kelas) === norm(q.kelas));
    if (q.role) rows = rows.filter((r) => norm(r.role) === norm(q.role));
    if (q.siswa_id) rows = rows.filter((r) => String(r.siswa_id) === String(q.siswa_id));
    if (q.nilai_min) rows = rows.filter((r) => Number(r.nilai) >= Number(q.nilai_min));
    const limit = Math.max(1, Math.min(parseInt(q.limit || q.per_page || "0", 10) || rows.length, 100));
    const offset = parseInt(q.offset || q.page || "0", 10) > 0 ? (parseInt(q.page, 10) - 1) * limit : 0;
    rows = rows.slice(offset, offset + limit);
    return rows;
  }

  function endpointTable(base) {
    const p = base.toLowerCase();
    if (p.includes("jurnal")) return "jurnal_pkl";
    if (p.includes("proyek")) return "proyek";
    if (p.includes("nilai-ukk") || p.includes("nilai-siswa")) return "nilai_ukk";
    if (p.includes("prakerin")) return "prakerin";
    if (p.includes("sesi")) return "sesi_login";
    return "siswa";
  }

  function perform(method, path, opts) {
    const base = clean(path);
    const q = queryOf(path);
    const route = ROUTES[routeIndex(base)] || null;
    const tableName = (route && route.tabel) || endpointTable(base);
    const table = tableOf(tableName);
    const payload = opts.body || opts.data || null;

    if (method === "GET") {
      if (base.toLowerCase().includes("auth")) {
        return { status: 200, message: "Sesi autentikasi aktif", data: { access_token: state.token.slice(0, 18) + "...", token_type: "bearer", expires_in: 3600 } };
      }
      const rows = rowsForGet(base, q, table);
      return { status: 200, message: "Hasil kueri MySQL dibaca melalui PDO", data: rows, count: rows.length };
    }

    if (method === "POST") {
      if (!payload || typeof payload !== "object") throw new Error("POST wajib membawa body JSON");
      const keys = Object.keys(payload);
      const unknown = keys.filter((k) => !hasColumn(table, k));
      if (unknown.length) {
        const err = new Error("ERROR 1054 (42S22): Unknown column '" + unknown[0] + "' in 'jurnal_pkl'. Kolom sah: " + table.def.kolom.map((k) => k.nama).join(", "));
        err.status = 500;
        throw err;
      }
      const row = {};
      table.def.kolom.forEach((k) => {
        row[k.nama] = k.nama === "id" ? rid(tableName) : k.nama === "created_at" ? nowIso() : null;
      });
      keys.forEach((k) => {
        row[k] = payload[k];
      });
      table.def.rows.push(row);
      return { status: 200, message: "Record berhasil disimpan ke tabel MySQL", data: row };
    }

    if (method === "PUT") {
      if (!payload || typeof payload !== "object") throw new Error("PUT wajib membawa body JSON");
      const keys = Object.keys(payload).filter((k) => k !== "siswa_id");
      const unknown = keys.filter((k) => !hasColumn(table, k));
      if (unknown.length) {
        const err = new Error("ERROR 1054 (42S22): Unknown column '" + unknown[0] + "' in 'field list'. Kolom sah: " + table.def.kolom.map((k) => k.nama).join(", ") + " (pakai created_at, bukan tgl_input)");
        err.status = 500;
        throw err;
      }
      const id = payload.siswa_id || q.siswa_id;
      let n = 0;
      table.def.rows.forEach((r) => {
        if (!id || String(r.siswa_id) === String(id)) {
          keys.forEach((k) => {
            r[k] = payload[k];
          });
          n += 1;
        }
      });
      return { status: 200, message: "Record diperbarui", data: { affected: n, siswa_id: id || null } };
    }

    if (method === "DELETE") {
      const before = table.def.rows.length;
      const cutoff = payload && payload.filter && payload.filter.expired_before ? new Date(payload.filter.expired_before).getTime() : Date.now() - 90 * 86400000;
      table.def.rows = table.def.rows.filter((r) => {
        const ts = Date.parse(String(r.created_at || 0));
        return !(Number.isFinite(ts) && ts < cutoff);
      });
      return { status: 200, message: "Log sesi kedaluwarsa dihapus", data: { deleted_count: before - table.def.rows.length } };
    }

    throw new Error("metode HTTP " + method + " tidak didukung");
  }

  function request(method, path, opts) {
    opts = opts || {};
    const id = (state.reqSeq += 1);
    const started = performance.now();
    const base = clean(path);
    const cacheKey = method + " " + base + " " + JSON.stringify(opts.params || {}) + " " + JSON.stringify(opts.query || {});
    const headers = Object.assign({ "Content-Type": "application/json", Accept: "application/json", Authorization: state.token }, opts.headers || {});
    const auth = headers.Authorization || headers.authorization;

    const record = { method, path: base, full: String(path), status: 0, latencyMs: 0, fromCache: false, note: "" };

    // Tahap Client -> Gateway: rate limiting
    const servedFromCache = Boolean(opts.cache) && state.cache.has(cacheKey);
    if (servedFromCache) {
      const hit = state.cache.get(cacheKey);
      record.status = hit.status;
      record.fromCache = true;
      record.note = "dilayani cache Apache (Cache-Control max-age=60)";
      record.latencyMs = 12;
      state.calls.push(record);
      send({ type: "trace", step: "gateway-cache", text: method + " " + base + " dilayani dari cache gateway", record });
      return Object.assign({}, hit, { fromCache: true, latencyMs: 12, headers: Object.assign({}, hit.headers, { "X-Cache": "HIT" }) });
    }

    if (state.mode === "E429") {
      state.quota += 1;
      if (state.quota > RATE_LIMIT) {
        record.status = 429;
        record.note = "kuota habis";
        record.latencyMs = Math.round(performance.now() - started) + 6;
        state.calls.push(record);
        const res = {
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          latencyMs: record.latencyMs,
          fromCache: false,
          headers: { "Retry-After": "60", "X-RateLimit-Limit": String(RATE_LIMIT), "X-RateLimit-Remaining": "0" },
          data: { status: "error", code: 429, message: "rate limit exceeded", hint: "Aktifkan cache output (opsi cache: true) dan batasi payload dengan ?limit=" },
        };
        return res;
      }
    }

    // Tahap Backend -> Database: koneksi MySQL penuh bila PHP membuka koneksi baru tiap query
    const mutating = method === "POST" || method === "PUT" || method === "DELETE";
    if (state.mode === "E500" && mutating && opts.pool !== "persistent") {
      state.writes += 1;
      if (state.writes > 2) {
        record.status = 500;
        record.note = "koneksi MySQL penuh";
        record.latencyMs = Math.round(performance.now() - started) + 1180;
        state.calls.push(record);
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          latencyMs: record.latencyMs,
          fromCache: false,
          headers: {},
          data: {
            status: "error",
            code: 500,
            message: "ERROR 1040 (HY000): Too many connections (max_connections = 20, aktif = 21)",
            hint: "Pakai koneksi persisten PDO dengan opsi { pool: \"persistent\" } pada api.post/put/del, atau binding PDO::ATTR_PERSISTENT",
          },
        };
      }
    }

    // Tahap Gateway -> Backend: autentikasi
    if (!tokenValid(auth)) {
      record.status = 401;
      record.note = "token sesi tidak valid";
      record.latencyMs = Math.round(performance.now() - started) + 14;
      state.calls.push(record);
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        latencyMs: record.latencyMs,
        fromCache: false,
        headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
        data: { status: "error", code: 401, message: "token sesi tidak valid atau kedaluwarsa", token_dipakai: String(auth).slice(0, 40), hint: "Panggil api.refreshSession() / refresh_session() lalu kirim header Authorization: Bearer <token sesi valid>" },
      };
    }

    // Tahap Gateway: pencocokan routing table
    if (routeIndex(base) < 0) {
      record.status = 404;
      record.note = "rute tidak terdaftar";
      record.latencyMs = Math.round(performance.now() - started) + 9;
      state.calls.push(record);
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        latencyMs: record.latencyMs,
        fromCache: false,
        headers: {},
        data: { status: "error", code: 404, message: "route " + method + " " + base + " tidak terdaftar", rute_tersedia: ROUTES.map((r) => r.metode + " " + r.path), hint: "Ganti path dengan rute pada RewriteRule .htaccess" },
      };
    }

    try {
      const out = perform(method, path, opts);
      record.status = out.status;
      record.latencyMs = Math.round(performance.now() - started) + 24 + (id % 5) * 3;
      const res = {
        ok: true,
        status: out.status,
        statusText: STATUS_TEXT[out.status] || "OK",
        latencyMs: record.latencyMs,
        fromCache: false,
        headers: { "Content-Type": "application/json", "X-Request-Id": rid("req"), "X-RateLimit-Remaining": state.mode === "E429" ? String(Math.max(0, RATE_LIMIT - state.quota)) : "60" },
        data: out.data,
        count: out.count,
        message: out.message,
      };
      state.calls.push(record);
      if (opts.cache) state.cache.set(cacheKey, res);
      return res;
    } catch (err) {
      record.status = err.status || 500;
      record.note = err.message;
      record.latencyMs = Math.round(performance.now() - started) + 18;
      state.calls.push(record);
      return {
        ok: false,
        status: record.status,
        statusText: STATUS_TEXT[record.status] || "Internal Server Error",
        latencyMs: record.latencyMs,
        fromCache: false,
        headers: {},
        data: { status: "error", code: record.status, message: err.message },
        error: err.message,
      };
    }
  }

  const api = {
    get: (p, o) => request("GET", p, o),
    post: (p, b, o) => request("POST", p, Object.assign({}, o, { body: b })),
    put: (p, b, o) => request("PUT", p, Object.assign({}, o, { body: b })),
    del: (p, b, o) => request("DELETE", p, Object.assign({}, o, { body: b })),
    delete: (p, b, o) => request("DELETE", p, Object.assign({}, o, { body: b })),
    request: (method, p, o) => request(String(method || "GET").toUpperCase(), p, o),
    refreshSession: () => {
      state.token = "Bearer eyJhbGciOiJIUzI1NiJ9." + Math.random().toString(36).slice(2, 12) + ".sirkuit_signature_valid";
      emit("info", ["Sesi diperbarui. Token sekarang dipakai untuk request berikutnya."]);
      return Promise.resolve({ ok: true, access_token: state.token.replace("Bearer ", "") });
    },
    setToken: (t) => {
      state.token = String(t || "").startsWith("Bearer") ? String(t) : "Bearer " + t;
      return state.token;
    },
    token: () => state.token,
    endpoints: () => ROUTES.map((r) => Object.assign({}, r)),
    rateLimitRemaining: () => (state.mode === "E429" ? Math.max(0, RATE_LIMIT - state.quota) : RATE_LIMIT),
  };

  /* ---------------- Inisialisasi & eksekusi ---------------- */
  function resetState(mode) {
    state = {
      mode,
      calls: [],
      queries: [],
      messages: [],
      cache: new Map(),
      quota: 0,
      writes: 0,
      reqSeq: 0,
      headers: [],
      fatal: null,
      token:
        mode === "E401"
          ? "Bearer token_expired_null"
          : "Bearer " + Math.random().toString(36).slice(2, 12) + ".sirkuit_sesi_valid_" + Math.random().toString(36).slice(2, 10),
    };
  }

  function printQueries(list) {
    list.forEach((r, i) => {
      const ringkas = r.sql.replace(/\s+/g, " ");
      const label = "[" + (i + 1) + "] " + ringkas.slice(0, 90) + (ringkas.length > 90 ? " [lanjut...]" : "");
      if (r.error) {
        emit("error", [label]);
        emit("error", ["   ERROR: " + r.error]);
        return;
      }
      emit("info", [label]);
      if (r.columns.length) {
        emit("log", ["   " + r.columns.join(" | ")]);
        r.rows.slice(0, 8).forEach((row) => emit("log", ["   " + r.columns.map((c) => JSON.stringify(row[c])).join(" | ")]));
        if (r.rows.length > 8) emit("dim", ["   ... " + (r.rows.length - 8) + " baris lainnya"]);
      }
      emit("ok", ["   " + (r.affected != null ? r.affected + " row(s) affected" : r.rows.length + " row(s) returned") + " dalam " + (6 + r.sql.length % 30) + " ms"]);
    });
  }

  /* ---------------- Jembatan runtime PHP (js/php-mini.js dimuat lebih dulu) ---------------- */
  function sqlLiteral(v, H) {
    if (v === null || v === undefined) return "NULL";
    if (v === true) return "1";
    if (v === false) return "0";
    if (typeof v === "number") return String(v);
    if (H && H.isPhpArray(v)) return "'" + String(H.toStr(v)).replace(/'/g, "''") + "'";
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  function bindSql(sqlText, params, H) {
    const list = params && H && H.isPhpArray(params) ? H.entriesOf(params).map(([, v]) => v) : Array.isArray(params) ? params : params === undefined || params === null ? [] : [params];
    if (!list.length) return sqlText;
    let idx = 0;
    let out = "";
    for (let i = 0; i < sqlText.length; i += 1) {
      const ch = sqlText[i];
      if (ch === "?") {
        if (idx >= list.length) throw new Error("Jumlah parameter (\$stmt->execute) kurang dari placeholder ? pada kueri");
        out += sqlLiteral(list[idx], H);
        idx += 1;
        continue;
      }
      const named = /^:[a-zA-Z_]\w*/.exec(sqlText.slice(i));
      if (named) {
        const key = named[0].slice(1);
        let found;
        if (params && H && H.isPhpArray(params)) {
          const hit = H.entriesOf(params).find(([k]) => k === key || k === ":" + key);
          found = hit ? hit[1] : undefined;
        } else if (params && typeof params === "object") {
          found = params[key];
        }
        if (found === undefined) throw new Error("Parameter :" + key + " tidak dikirim pada $stmt->execute()");
        out += sqlLiteral(found, H);
        i += named[0].length - 1;
        continue;
      }
      out += ch;
    }
    return out;
  }

  function runSqlForPhp(sqlText, H) {
    const results = splitStatements(stripComments(String(sqlText || ""))).map((st) => {
      const r = runStatement(st);
      state.queries.push(r);
      if (r.error) {
        const kode = /1054/.test(r.error) ? "42S22" : /1146/.test(r.error) ? "42S02" : /1040/.test(r.error) ? "HY000" : "42000";
        throw new Error("SQLSTATE[" + kode + "]: " + r.error);
      }
      return r;
    });
    if (!results.length) throw new Error("Tidak ada statement SQL untuk dijalankan");
    return results.length === 1 ? results[0] : Object.assign({}, results[results.length - 1], { all: results });
  }

  function phpStatement(sqlText, H, persistent) {
    const stmt = H.phpObject("PDOStatement", { sql: sqlText });
    let rows = [];
    let cursor = 0;
    let affected = 0;
    const jalankan = (params) => {
      if (state.mode === "E500" && !persistent && /\b(insert|update|delete)\b/i.test(sqlText)) {
        state.writes += 1;
        if (state.writes > 2) {
          state.queries.push({ sql: sqlText, columns: [], rows: [], error: "ERROR 1040 (HY000): Too many connections (max_connections=20)" });
          throw new Error('SQLSTATE[HY000]: Error 1040 (HY000): Too many connections. Aktifkan koneksi persisten: new PDO($dsn, $user, $pass, [PDO::ATTR_PERSISTENT => true]) atau http_post(..., ["pool" => "persistent"])');
        }
      }
      const r = runSqlForPhp(bindSql(sqlText, params, H), H);
      rows = (r.rows || []).map((row) => H.phpFromJs(row));
      affected = r.affected != null ? r.affected : rows.length;
      cursor = 0;
      return true;
    };
    stmt.methods.execute = (args) => jalankan(args[0]);
    stmt.methods.fetchall = () => { const arr = H.makeArray(); rows.forEach((r, i) => H.setKey(arr, i, r)); return arr; };
    stmt.methods.fetch = () => {
      if (cursor >= rows.length) return false;
      const r = rows[cursor];
      cursor += 1;
      return r;
    };
    stmt.methods.fetchallcolumns = () => {
      const arr = H.makeArray();
      rows.forEach((r, i) => { const first = H.entriesOf(r)[0]; H.setKey(arr, i, first ? first[1] : null); });
      return arr;
    };
    stmt.methods.fetchcolumn = () => { const r = rows[0]; return r ? H.entriesOf(r)[0][1] : false; };
    stmt.methods.rowcount = () => affected;
    stmt.methods.numrows = () => rows.length;
    stmt.methods.closecursor = () => true;
    stmt.methods.bindparam = () => true;
    stmt.methods.errorinfo = () => { const a = H.makeArray(); return a; };
    stmt.getters.num_rows = () => rows.length;
    return stmt;
  }

  function phpPdo(H, args) {
    const opts = args[3];
    const persistent = Boolean(opts && H.isPhpArray(opts) && H.entriesOf(opts).some(([k, v]) => {
      if (!H.truthy(v)) return false;
      const key = String(k).toLowerCase();
      return key.indexOf("persistent") >= 0 || key === "attr_persistent" || key === "12";
    }));
    const o = H.phpObject("PDO", { dsn: H.toStr(args[0]), errorMode: "exception" });
    o.methods.prepare = (a) => phpStatement(H.toStr(a[0]), H, persistent);
    o.methods.query = (a) => { const st = phpStatement(H.toStr(a[0]), H, persistent); st.methods.execute([], H); return st; };
    o.methods.exec = (a) => { const r = runSqlForPhp(H.toStr(a[0]), H); return r.affected != null ? r.affected : (r.rows || []).length; };
    o.methods.lastinsertid = () => "";
    o.methods.begintransaction = () => true;
    o.methods.commit = () => true;
    o.methods.rollback = () => true;
    o.methods.getattribute = () => null;
    o.methods.errorinfo = () => H.makeArray();
    return o;
  }

  function phpMysqliResult(r, H) {
    const rows = (r.rows || []).map((row) => H.phpFromJs(row));
    let cursor = 0;
    const o = H.phpObject("mysqli_result", { num_rows: rows.length });
    o.getters.num_rows = () => rows.length;
    o.methods.fetch_assoc = () => { if (cursor >= rows.length) return null; const x = rows[cursor]; cursor += 1; return x; };
    o.methods.fetch_assoc_all = () => { const arr = H.makeArray(); rows.forEach((x, i) => H.setKey(arr, i, x)); return arr; };
    o.methods.fetch_all = () => { const arr = H.makeArray(); rows.forEach((x, i) => H.setKey(arr, i, x)); return arr; };
    o.methods.num_rows = () => rows.length;
    return o;
  }

  function phpMysqli(H) {
    const o = H.phpObject("MySQLi", { error: "", connect_errno: 0, errno: 0 });
    o.methods.query = (a) => {
      try {
        const r = runSqlForPhp(H.toStr(a[0]), H);
        return phpMysqliResult(r, H);
      } catch (err) {
        o.props.error = err.message;
        o.props.errno = 1054;
        return false;
      }
    };
    o.methods.real_escape_string = (a) => H.toStr(a[0]).replace(/'/g, "\\'");
    o.methods.prepare = (a) => { const st = phpMysqliResult({ rows: [] }, H); st.phpClass = "mysqli_stmt"; st.methods.execute = () => true; st.methods.get_result = () => phpMysqliResult({ rows: [] }, H); return st; };
    o.methods.close = () => true;
    o.methods.select_db = () => true;
    return o;
  }

  function phpException(H, args) {
    const o = H.phpObject("Exception", { message: H.toStr(args[0]), code: args[1] === undefined ? 0 : H.toNum(args[1]) });
    o.methods.getmessage = () => o.props.message;
    o.methods.getcode = () => o.props.code;
    o.phpError = { message: o.props.message };
    return o;
  }

  function phpHttpResponse(res, H) {
    const arr = H.makeArray();
    H.setKey(arr, "ok", res.ok === true);
    H.setKey(arr, "status", res.status);
    H.setKey(arr, "statusText", res.statusText || "");
    H.setKey(arr, "latencyMs", res.latencyMs || 0);
    H.setKey(arr, "fromCache", res.fromCache === true);
    H.setKey(arr, "count", res.count === undefined ? null : res.count);
    H.setKey(arr, "message", res.message || (res.data && res.data.message) || "");
    H.setKey(arr, "data", H.phpFromJs(res.data === undefined ? null : res.data));
    return arr;
  }

  function phpHttpDeps(H) {
    const optsFrom = (o) => {
      if (!o || !H.isPhpArray(o)) return {};
      const js = {};
      H.entriesOf(o).forEach(([k, v]) => { js[k] = H.isPhpArray(v) ? Object.fromEntries(H.entriesOf(v).map(([hk, hv]) => [hk, H.toStr(hv)])) : H.jsFromPhp(v); });
      return js;
    };
    const kirim = (method, path, body, opts) => {
      const o = optsFrom(opts || null);
      if (body !== undefined && body !== null) o.body = H.jsFromPhp(body);
      if (state.mode === "E500" && o.persistent === true) o.pool = "persistent";
      return phpHttpResponse(request(method, H.toStr(path), o), H);
    };
    return {
      http_get: (a) => kirim("GET", a[0], null, a[1]),
      http_post: (a) => kirim("POST", a[0], a[1], a[2]),
      http_put: (a) => kirim("PUT", a[0], a[1], a[2]),
      http_delete: (a) => kirim("DELETE", a[0], a[1], a[2]),
      http_request: (a) => kirim(String(H.toStr(a[0]) || "GET").toUpperCase(), a[1], a[2], a[3]),
      refresh_session: () => {
        state.token = "Bearer " + Math.random().toString(36).slice(2, 12) + ".sirkuit_sesi_valid_" + Math.random().toString(36).slice(2, 10);
        emit("info", ["Sesi PHP diperbarui, token berikutnya dipakai untuk request selanjutnya."]);
        return state.token.replace("Bearer ", "");
      },
      token_sesi: () => state.token.replace("Bearer ", ""),
      endpoint_sedia: () => H.phpFromJs(ROUTES.map((r) => ({ metode: r.metode, path: r.path, nama: r.nama }))),
      kuota_sisa: () => (state.mode === "E429" ? Math.max(0, RATE_LIMIT - state.quota) : RATE_LIMIT),
      jalankan_sql: (a) => { const r = runSqlForPhp(H.toStr(a[0]), H); return H.phpFromJs({ columns: r.columns, rows: r.rows, affected: r.affected === undefined ? null : r.affected }); },
      header: (a) => {
        const teks = H.toStr(a[0]);
        state.headers.push(teks);
        emit("dim", ["PHP mengirim header: " + teks]);
        return null;
      },
      http_response_code: (a) => {
        const kode = a.length ? H.toNum(a[0]) : 200;
        state.headers.push("HTTP/1.1 " + kode);
        emit("dim", ["http_response_code(): status response berubah menjadi " + kode]);
        return kode;
      },
      session_start: () => {
        emit("info", ["session_start(): sesi PHP aktif, PHPSESSID dikirim lewat cookie browser."]);
        return true;
      },
      session_destroy: () => {
        state.token = "Bearer token_expired_null";
        emit("warn", ["session_destroy(): data sesi dihapus sehingga request berikutnya berbalas 401."]);
        return true;
      },
      setcookie: (a) => {
        state.headers.push("Set-Cookie: " + H.toStr(a[0]));
        emit("dim", ["setcookie(): cookie \"" + H.toStr(a[0]) + "\" dijadwalkan Apache."]);
        return true;
      },
    };
  }

  const PHP_CONST = {
    "pdo::fetch_assoc": 2,
    "pdo::fetch_num": 1,
    "pdo::fetch_both": 3,
    "pdo::attr_errmode": 3,
    "pdo::attr_persistent": 12,
    "pdo::errmode_exception": 2,
    "pdo::errmode_warning": 1,
    "mysqli::assoc": 1,
    "null": null,
    "true": true,
    "false": false,
  };

  function phpSuperglobal(H, obj) {
    const arr = H.makeArray();
    Object.entries(obj).forEach(([k, v]) => H.setKey(arr, k, H.phpFromJs(v)));
    return arr;
  }

  function runPhp(code) {
    if (!window.PhpMini) {
      emit("error", ["Runtime PHP tidak tersedia. Muat ulang halaman (js/php-mini.js tidak ditemukan)."]);
      state.fatal = "Runtime PHP tidak tersedia";
      return;
    }
    let buffer = "";
    const flush = (force) => {
      if (force) {
        const sisa = buffer.split("\n");
        buffer = "";
        sisa.forEach((line) => { if (line !== "") emit("log", [line]); });
        return;
      }
      const parts = buffer.split("\n");
      if (parts.length === 1) return;
      buffer = parts.pop();
      parts.forEach((line) => { if (line !== "") emit("log", [line]); });
    };
    const deps = {
      write: (text) => { buffer += text; flush(false); },
      warn: (text) => emit("warn", [text]),
      constants: { PHP_VERSION: "8.2.0", PHP_EOL: "\n", MYSQLI_ASSOC: 1, PDO_ATTR_PERSISTENT: 12, NULL: null },
      construct: (cls, args, H) => {
        const k = String(cls).toLowerCase();
        if (k === "pdo") return phpPdo(H, args);
        if (k === "mysqli") return phpMysqli(H);
        if (k === "exception" || k === "pdoexception" || k === "mysqli_sql_exception" || k === "runtime_exception" || k === "domain_exception") return phpException(H, args);
        throw new Error("Kelas " + cls + " tidak tersedia di ruang uji PHP. Yang tersedia: PDO, MySQLi, Exception.");
      },
      staticMember: (cls, name, H) => {
        const key = (String(cls) + "::" + String(name)).toLowerCase();
        if (key in PHP_CONST) return PHP_CONST[key];
        if (String(name).toLowerCase() === "class") return String(cls);
        throw new Error("Konstanta " + cls + "::" + name + " belum dikenali. Contoh sah: PDO::FETCH_ASSOC, PDO::ATTR_PERSISTENT, PDO::ERRMODE_EXCEPTION.");
      },
      phpFunction: {},
    };
    deps.globals = (H) => ({
      _SERVER: phpSuperglobal(H, { REQUEST_METHOD: "GET", HTTP_HOST: "localhost", REQUEST_URI: "/pkl-rpl/api/nilai-siswa.php", SERVER_SOFTWARE: "Apache/2.4 XAMPP" }),
      _GET: phpSuperglobal(H, {}),
      _POST: phpSuperglobal(H, {}),
      _SESSION: phpSuperglobal(H, { siswa_id: "25001", nama: "Fazrin Mauza Dwi Zuhudi", role: "siswa" }),
      _ENV: phpSuperglobal(H, {}),
    });
    const interp = window.PhpMini.run(code, deps);
    deps.phpFunction = phpHttpDeps(interp.H);
    try {
      interp.execTop();
    } catch (err) {
      flush(true);
      const msg = String((err && err.message) || err);
      if (err && err.kind === "exit") return;
      emit("error", ["Fatal error (PHP 8.2 / proses.php): " + msg]);
      state.fatal = msg;
      return;
    }
    flush(true);
  }

  async function execute(payload) {
    resetState(payload.mode || "NORMAL");
    const checkerSource = payload.cek || null;
    const language = payload.language || "js";
    const code = String(payload.code || "");

    const bahasaLabel = language === "sql" ? "SQL MySQL/MariaDB" : language === "php" ? "PHP 8.2 (subset)" : "JavaScript (fetch API)";
    emit("dim", ["Mode sistem: " + state.mode + " | Bahasa: " + bahasaLabel]);

    if (language === "sql") {
      const results = splitStatements(stripComments(code)).map(runStatement);
      state.queries = results;
      printQueries(results);
    } else if (language === "php") {
      runPhp(code);
    } else {
      let fn;
      try {
        // eslint-disable-next-line no-new-func
        fn = new Function("api", "db", "console", "sleep", '"use strict"; return (async () => {\n' + code + "\n})();");
      } catch (err) {
        emit("error", ["SyntaxError: " + err.message]);
        state.fatal = "SyntaxError: " + err.message;
      }
      if (fn) {
        const returned = await fn(api, db, labConsole, sleep);
        if (returned !== undefined) emit("ok", ["nilai kembali: " + formatArg(returned)]);
      }
    }

    const trace = {
      mode: state.mode,
      language,
      calls: state.calls,
      queries: state.queries,
      messages: state.messages,
      headers: state.headers,
      fatal: state.fatal,
    };

    let hasil = null;
    if (checkerSource) {
      try {
        // eslint-disable-next-line no-new-func
        const checker = new Function("t", "return (" + checkerSource + ")(t);");
        const r = checker(trace);
        hasil = typeof r === "boolean" ? { passed: r, pesan: r ? "Latihan selesai." : "Belum sesuai sasaran latihan." } : r;
      } catch (err) {
        hasil = { passed: false, pesan: "Pemeriksa jawaban error: " + err.message };
      }
    }
    send({ type: "done", trace, hasil });
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data || {};
    if (d.__sirkuitLab !== true) return;
    if (d.type === "init") {
      (d.tables || []).forEach((t) => {
        TABEL[t.nama] = t;
      });
      ROUTES = d.endpoints || [];
      RATE_LIMIT = d.rateLimit || 6;
      resetState(d.mode || "NORMAL");
      send({ type: "ready" });
      return;
    }
    if (d.type === "run") {
      execute(d).catch((err) => {
        emit("error", [String(err && err.stack ? err.message : err)]);
        send({ type: "done", trace: { mode: state.mode, language: d.language, calls: state.calls, queries: state.queries, messages: state.messages, fatal: String(err && err.message) }, hasil: null });
      });
      return;
    }
    if (d.type === "reset") {
      resetState(d.mode || "NORMAL");
      send({ type: "ready" });
    }
  });

  send({ type: "hello" });
})();
