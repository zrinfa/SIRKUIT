/* =====================================================================
 * SIRKUIT - js/php-mini.js
 * Interpreter subset PHP 8 untuk Lab Uji Kode. Dimuat sebagai teks oleh
 * js/lab-uji.js lalu diinjeksikan ke iframe sandbox bersama lab-sandbox.js.
 * Dipilih agar siswa dapat menjalankan kode PHP sungguhan tanpa server,
 * tanpa risiko remote code execution di sisi sekolah.
 * ===================================================================== */
(function () {
  "use strict";

  /* ---------------- Tokenizer ---------------- */
  const OPS = ["<=>", "===", "!==", "**", "->", "::", "=>", "++", "--", "==", "!=", "<>", "<=", ">=", "&&", "||", "??", "+=", "-=", "*=", "/=", ".=", "%=",
    "+", "-", "*", "/", "%", ".", "<", ">", "!", "?", ":", "=", ";", ",", "(", ")", "[", "]", "{", "}", "&", "|", "^", "~", "@"];

  function tokenize(src) {
    const out = [];
    let i = 0;
    const push = (k, v, extra) => out.push(Object.assign({ k, v }, extra || {}));
    while (i < src.length) {
      const ch = src[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i += 1; continue; }
      if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
      if (ch === "#") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
      if (ch === "/" && src[i + 1] === "*") {
        i += 2;
        while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '"') {
        const quote = ch;
        let val = "";
        let esc = false;
        i += 1;
        while (i < src.length) {
          const c = src[i];
          if (esc) {
            val += c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c;
            esc = false;
            i += 1;
            continue;
          }
          if (quote === '"' && c === "\\") { esc = true; i += 1; continue; }
          if (quote === "'" && c === "\\") {
            if (src[i + 1] === "'" || src[i + 1] === "\\") { val += src[i + 1]; i += 2; continue; }
            val += c; i += 1; continue;
          }
          if (c === quote) { i += 1; break; }
          val += c;
          i += 1;
        }
        push("str", val, { interp: quote === '"' });
        continue;
      }
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
        let num = "";
        while (i < src.length && /[0-9.eE+\-]/.test(src[i]) && !(/[+\-]/.test(src[i]) && !/[eE]/.test(num.slice(-1)))) { num += src[i]; i += 1; }
        push("num", Number(num));
        continue;
      }
      if (ch === "$") {
        let name = "";
        i += 1;
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) { name += src[i]; i += 1; }
        push("var", name);
        continue;
      }
      if (/[A-Za-z_\\]/.test(ch)) {
        let name = "";
        while (i < src.length && /[A-Za-z0-9_\\]/.test(src[i])) { name += src[i]; i += 1; }
        push("name", name.toLowerCase(), { display: name });
        continue;
      }
      const three = src.slice(i, i + 3);
      const two = src.slice(i, i + 2);
      const op = OPS.indexOf(three) >= 0 ? three : OPS.indexOf(two) >= 0 ? two : OPS.indexOf(ch) >= 0 ? ch : null;
      if (op === null) throw new Error('karakter tidak dikenali pada baris: "' + src.slice(i, i + 20) + '"');
      push("op", op);
      i += op.length;
    }
    push("eof", null);
    return out;
  }

  /* ---------------- Parser ---------------- */

  function parser(tokens) {
    let p = 0;
    const peek = (o) => tokens[p + (o || 0)];
    const isOp = (v, o) => peek(o) && peek(o).k === "op" && peek(o).v === v;
    const isName = (v, o) => peek(o) && peek(o).k === "name" && peek(o).v === v;
    const eat = (v) => {
      if (!isOp(v)) throw new Error('sintaks PHP: diharapkan "' + v + '", menemukan "' + (peek() ? String(peek().v) : "akhir kode") + '"');
      p += 1;
    };
    const eatName = (v) => {
      if (!isName(v)) throw new Error('sintaks PHP: diharapkan "' + v + '"');
      p += 1;
    };

    function program() {
      const body = [];
      while (peek().k !== "eof") body.push(statement());
      return { s: "block", body };
    }

    function blockOf() {
      if (isOp("{")) {
        p += 1;
        const body = [];
        while (!isOp("}") && peek().k !== "eof") body.push(statement());
        eat("}");
        return body;
      }
      return [statement()];
    }

    function statement() {
      if (isName("if")) {
        p += 1;
        const branches = [];
        eat("(");
        const cond = expression();
        eat(")");
        branches.push({ cond, body: blockOf() });
        while (isName("elseif") || isName("else")) {
          if (isName("elseif")) {
            p += 1;
            eat("(");
            const c2 = expression();
            eat(")");
            branches.push({ cond: c2, body: blockOf() });
          } else {
            p += 1;
            return { s: "if", branches, alt: blockOf() };
          }
        }
        return { s: "if", branches };
      }
      if (isName("while")) {
        p += 1;
        eat("(");
        const cond = expression();
        eat(")");
        return { s: "while", cond, body: blockOf() };
      }
      if (isName("for")) {
        p += 1;
        eat("(");
        const init = isOp(";") ? null : expression();
        eat(";");
        const cond = isOp(";") ? null : expression();
        eat(";");
        const upd = isOp(")") ? null : expression();
        eat(")");
        return { s: "for", init, cond, upd, body: blockOf() };
      }
      if (isName("switch")) {
        p += 1;
        eat("(");
        const subject = expression();
        eat(")");
        eat("{");
        const cases = [];
        let arus = null;
        while (!isOp("}") && peek().k !== "eof") {
          if (isName("case")) {
            p += 1;
            const test = expression();
            eat(":");
            arus = { test, body: [] };
            cases.push(arus);
          } else if (isName("default")) {
            p += 1;
            eat(":");
            arus = { test: null, body: [] };
            cases.push(arus);
          } else {
            if (!arus) throw new Error("switch: statement harus berada di dalam case atau default");
            arus.body.push(statement());
          }
        }
        eat("}");
        return { s: "switch", subject, cases };
      }
      if (isName("foreach")) {
        p += 1;
        eat("(");
        const src = expression();
        eatName("as");
        let keyVar = null;
        let valVar = null;
        if (peek().k === "var") {
          const first = peek().v;
          if (tokens[p + 1] && tokens[p + 1].k === "op" && tokens[p + 1].v === "=>") {
            keyVar = first;
            p += 2;
            if (peek().k !== "var") throw new Error("foreach: variabel nilai setelah => tidak lengkap");
            valVar = peek().v;
            p += 1;
          } else {
            valVar = first;
            p += 1;
          }
        }
        eat(")");
        return { s: "foreach", src, keyVar, valVar, body: blockOf() };
      }
      if (isName("function")) {
        p += 1;
        const name = peek().display || peek().v;
        if (peek().k !== "name") throw new Error("function: nama fungsi tidak lengkap");
        p += 1;
        eat("(");
        const params = [];
        while (!isOp(")")) {
          if (peek().k !== "var") throw new Error("function: parameter harus diawali $");
          params.push(peek().v);
          p += 1;
          if (isOp(",")) p += 1;
          else break;
        }
        eat(")");
        return { s: "fn", name, params, body: blockOf() };
      }
      if (isName("return")) {
        p += 1;
        const e = isOp(";") ? null : expression();
        if (isOp(";")) p += 1;
        return { s: "return", e };
      }
      if (isName("break") || isName("continue")) {
        const k = peek().v;
        p += 1;
        if (isOp(";")) p += 1;
        return { s: k };
      }
      if (isName("echo")) {
        p += 1;
        const args = [expression()];
        while (isOp(",")) { p += 1; args.push(expression()); }
        if (isOp(";")) p += 1;
        return { s: "echo", args };
      }
      if (isName("print")) {
        p += 1;
        const e = expression();
        if (isOp(";")) p += 1;
        return { s: "echo", args: [e] };
      }
      if (isName("unset")) {
        p += 1;
        eat("(");
        const targets = [assignmentExpr()];
        while (isOp(",")) { p += 1; targets.push(assignmentExpr()); }
        eat(")");
        if (isOp(";")) p += 1;
        return { s: "unset", targets };
      }
      if (isName("global")) {
        p += 1;
        const names = [];
        while (peek().k === "var") { names.push(peek().v); p += 1; if (isOp(",")) p += 1; else break; }
        if (isOp(";")) p += 1;
        return { s: "global", names };
      }
      if (isName("try")) {
        p += 1;
        const body = blockOf();
        let catchVar = null;
        let catchBody = [];
        let finallyBody = null;
        if (isName("catch")) {
          p += 1;
          eat("(");
          while (peek().k === "name") p += 1;
          while (isOp("|")) { p += 1; if (peek().k === "name") p += 1; }
          if (peek().k === "var") { catchVar = peek().v; p += 1; }
          eat(")");
          catchBody = blockOf();
        }
        if (isName("finally")) { p += 1; finallyBody = blockOf(); }
        return { s: "try", body, catchVar, catchBody, finallyBody };
      }
      if (isName("throw")) {
        p += 1;
        const e = expression();
        if (isOp(";")) p += 1;
        return { s: "throw", e };
      }
      if (isOp("{")) return { s: "block", body: blockOf() };
      if (isOp(";")) { p += 1; return { s: "noop" }; }
      const e = expression();
      if (isOp(";")) p += 1;
      return { s: "expr", e };
    }

    function expression() {
      return assignmentExpr();
    }

    function assignmentExpr() {
      const left = ternary();
      const opTok = peek();
      if (opTok && opTok.k === "op" && ["=", "+=", "-=", "*=", "/=", "%=", ".="].includes(opTok.v)) {
        p += 1;
        const right = assignmentExpr();
        if (!["var", "index", "prop", "append"].includes(left.s)) throw new Error("sisi kiri assignment bukan variabel yang sah");
        return { s: "assign", op: opTok.v, target: left, e: right };
      }
      return left;
    }

    function ternary() {
      const cond = nullish();
      if (isOp("?")) {
        p += 1;
        let a = null;
        if (!isOp(":")) a = assignmentExpr();
        eat(":");
        const b = assignmentExpr();
        return { s: "tern", cond, a, b };
      }
      return cond;
    }

    function nullish() {
      let left = orExpr();
      while (isOp("??")) { p += 1; left = { s: "nullish", l: left, r: orExpr() }; }
      return left;
    }

    function orExpr() {
      let left = andExpr();
      while (isOp("||") || isName("or")) { p += 1; left = { s: "bin", op: "||", l: left, r: andExpr() }; }
      return left;
    }

    function andExpr() {
      let left = bitOr();
      while (isOp("&&") || isName("and")) { p += 1; left = { s: "bin", op: "&&", l: left, r: bitOr() }; }
      return left;
    }

    function bitOr() {
      let left = equality();
      while (isOp("|") || isOp("^") || isOp("&")) { const op = peek().v; p += 1; left = { s: "bin", op, l: left, r: equality() }; }
      return left;
    }

    function equality() {
      let left = compare();
      for (;;) {
        const t = peek();
        if (t && t.k === "op" && ["==", "!=", "===", "!==", "<>"].includes(t.v)) {
          p += 1;
          left = { s: "bin", op: t.v, l: left, r: compare() };
        } else break;
      }
      return left;
    }

    function compare() {
      let left = additive();
      while (isOp("<") || isOp(">") || isOp("<=") || isOp(">=") || isOp("<=>")) {
        const op = peek().v;
        p += 1;
        left = { s: "bin", op, l: left, r: additive() };
      }
      return left;
    }

    function additive() {
      let left = multiplicative();
      while (isOp("+") || isOp("-") || isOp(".")) {
        const op = peek().v;
        p += 1;
        left = { s: "bin", op, l: left, r: multiplicative() };
      }
      return left;
    }

    function multiplicative() {
      let left = unary();
      while (isOp("*") || isOp("/") || isOp("%") || isOp("**")) {
        const op = peek().v;
        p += 1;
        left = { s: "bin", op, l: left, r: unary() };
      }
      return left;
    }

    function unary() {
      if (isOp("!")) { p += 1; return { s: "un", op: "!", e: unary() }; }
      if (isOp("-")) { p += 1; return { s: "un", op: "-", e: unary() }; }
      if (isOp("+")) { p += 1; return unary(); }
      if (isOp("~")) { p += 1; return { s: "un", op: "~", e: unary() }; }
      if (isOp("@")) { p += 1; return unary(); }
      if (isOp("++") || isOp("--")) { p += 1; return { s: "incdec", op: peek(-1).v, e: unary(), pre: true }; }
      return postfix();
    }

    function postfix() {
      let e = primary();
      for (;;) {
        if (isOp("[")) {
          p += 1;
          if (isOp("]")) { p += 1; e = { s: "append", target: e }; continue; }
          const sub = expression();
          eat("]");
          e = { s: "index", base: e, sub };
          continue;
        }
        if (isOp("(") && (e.s === "name" || e.s === "prop" || e.s === "classprop")) {
          p += 1;
          const args = [];
          while (!isOp(")")) { args.push(assignmentExpr()); if (isOp(",")) p += 1; else break; }
          eat(")");
          e = e.s === "prop" ? { s: "meth", obj: e.obj, name: e.name, args } : e.s === "classprop" ? { s: "static", cls: e.cls, name: e.name, args } : { s: "call", name: e.name, args };
          continue;
        }
        if (isOp("->")) {
          p += 1;
          const nm = peek().v;
          if (peek().k !== "name" && peek().k !== "var") throw new Error("-> menunggu nama properti atau metode");
          p += 1;
          e = { s: "prop", obj: e, name: nm };
          continue;
        }
        if (isOp("::")) {
          p += 1;
          const nm = peek().v;
          p += 1;
          e = { s: "classprop", cls: e.display || e.name || String(nm).toLowerCase(), name: nm };
          continue;
        }
        if (isOp("++") || isOp("--")) { const op = peek().v; p += 1; e = { s: "incdec", op, e, pre: false }; continue; }
        break;
      }
      return e;
    }

    function primary() {
      const t = peek();
      if (!t || t.k === "eof") throw new Error("kode berakhir di tengah ekspresi");
      if (t.k === "num") { p += 1; return { s: "lit", v: t.v }; }
      if (t.k === "str") { p += 1; return { s: "str", v: t.v, interp: t.interp }; }
      if (t.k === "var") { p += 1; return { s: "var", name: t.v }; }
      if (isOp("(")) { p += 1; const e = expression(); eat(")"); return e; }
      if (isOp("[")) {
        p += 1;
        const items = [];
        while (!isOp("]")) {
          const first = assignmentExpr();
          if (isOp("=>")) { p += 1; items.push({ key: first, val: assignmentExpr() }); }
          else items.push({ key: null, val: first });
          if (isOp(",")) p += 1;
          else break;
        }
        eat("]");
        return { s: "arr", items };
      }
      if (isOp("++") || isOp("--")) { const op = t.v; p += 1; return { s: "incdec", op, e: unary(), pre: true }; }
      if (t.k === "name") {
        p += 1;
        if (t.v === "true") return { s: "lit", v: true };
        if (t.v === "false") return { s: "lit", v: false };
        if (t.v === "null") return { s: "lit", v: null };
        if (t.v === "array") {
          if (isOp("(")) {
            p += 1;
            const items = [];
            while (!isOp(")")) {
              const first = assignmentExpr();
              if (isOp("=>")) { p += 1; items.push({ key: first, val: assignmentExpr() }); }
              else items.push({ key: null, val: first });
              if (isOp(",")) p += 1;
              else break;
            }
            eat(")");
            return { s: "arr", items };
          }
          return { s: "name", name: "array" };
        }
        if (t.v === "new") {
          const clsTok = peek();
          if (clsTok.k !== "name") throw new Error("new menunggu nama kelas");
          p += 1;
          const args = [];
          if (isOp("(")) {
            p += 1;
            while (!isOp(")")) { args.push(assignmentExpr()); if (isOp(",")) p += 1; else break; }
            eat(")");
          }
          return { s: "new", cls: clsTok.display || clsTok.v, args };
        }
        if (t.v === "exit" || t.v === "die") return { s: "call", name: t.v, args: isOp("(") ? argumentList() : [] };
        return { s: "name", name: t.v, display: t.display };
      }
      throw new Error('tidak dapat membaca "' + String(t.v) + '" pada ekspresi');
    }

    function argumentList() {
      const args = [];
      eat("(");
      while (!isOp(")")) { args.push(assignmentExpr()); if (isOp(",")) p += 1; else break; }
      eat(")");
      return args;
    }

    return program();
  }

  /* ---------------- Nilai PHP ---------------- */
  const ARR = Symbol("phpArray");

  function phpArray(entries) {
    const o = Object.create(null);
    o[ARR] = entries;
    return o;
  }
  function isPhpArray(v) {
    return v !== null && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, ARR);
  }
  function entriesOf(v) {
    if (!isPhpArray(v)) return [];
    const list = [];
    Object.keys(v[ARR]).forEach((k) => list.push([k, v[ARR][k]]));
    return list;
  }
  function makeArray() {
    return phpArray(Object.create(null));
  }

  function truthy(v) {
    if (v === null || v === undefined || v === false) return false;
    if (v === true) return true;
    if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
    if (typeof v === "string") return v !== "" && v !== "0";
    if (isPhpArray(v)) return entriesOf(v).length > 0;
    return true;
  }

  function toStr(v) {
    if (v === null || v === undefined) return "";
    if (v === true) return "1";
    if (v === false) return "";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === "string") return v;
    if (isPhpArray(v)) return "Array";
    if (v && v.__phpObject) return "Object";
    return String(v);
  }

  function toNum(v) {
    if (typeof v === "number") return v;
    if (v === true) return 1;
    if (v === false || v === null || v === undefined) return 0;
    if (isPhpArray(v)) return entriesOf(v).length ? 1 : 0;
    const s = String(v).trim();
    const n = Number(s);
    if (!Number.isNaN(n) && s !== "") return n;
    const m = /^[-+]?\d*\.?\d+/.exec(s);
    return m ? Number(m[0]) : 0;
  }

  function looseEq(a, b) {
    if (typeof a === "number" || typeof b === "number") {
      if (typeof a === "string" && !/^[+-]?(\d+\.?\d*|\.\d+)/.test(a.trim())) return false;
      if (typeof b === "string" && !/^[+-]?(\d+\.?\d*|\.\d+)/.test(b.trim())) return false;
      return toNum(a) === toNum(b);
    }
    if (typeof a === "boolean" || typeof b === "boolean") return truthy(a) === truthy(b);
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    if (isPhpArray(a) && isPhpArray(b)) {
      const ea = entriesOf(a);
      const eb = entriesOf(b);
      return ea.length === eb.length && ea.every(([k, v], i) => eb[i][0] === k && looseEq(v, eb[i][1]));
    }
    return toStr(a) === toStr(b);
  }

  function strictEq(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (isPhpArray(a) && isPhpArray(b)) {
      const ea = entriesOf(a);
      const eb = entriesOf(b);
      return ea.length === eb.length && ea.every(([k, v], i) => eb[i][0] === k && strictEq(v, eb[i][1]));
    }
    return false;
  }

  function cmp(a, b) {
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    const x = toNum(a);
    const y = toNum(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function keyOf(v) {
    if (typeof v === "number") return String(Number.isInteger(v) ? v : v);
    if (typeof v === "boolean") return v ? "1" : "";
    return toStr(v);
  }

  function resolveInterp(env, name, key) {
    let v = env.get(name);
    if (key !== null && v && isPhpArray(v)) v = Object.prototype.hasOwnProperty.call(v[ARR], key) ? v[ARR][key] : null;
    return v === undefined || v === null ? "" : toStr(v);
  }

  function interped(raw, env) {
    let outStr = "";
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch !== "$") { outStr += ch; i += 1; continue; }
      const braced = raw[i + 1] === "{";
      let j = braced ? i + 2 : i + 1;
      const nameMatch = /^\w+/.exec(raw.slice(j));
      if (!nameMatch) { outStr += ch; i += 1; continue; }
      const name = nameMatch[0];
      j += name.length;
      let key = null;
      if (raw[j] === "[") {
        const km = /^\[(?:'([^']*)'|"([^"]*)"|(\d+))\]/.exec(raw.slice(j));
        if (km) { key = km[1] || km[2] || km[3]; j += km[0].length; }
      }
      if (braced && raw[j] === "}") j += 1;
      outStr += resolveInterp(env, name, key);
      i = j;
    }
    return outStr;
  }

  /* ---------------- Error PHP ---------------- */
  class PhpError extends Error {
    constructor(message, code) {
      super(message);
      this.phpCode = code || 0;
      this.isPhp = true;
    }
  }
  class Signal {
    constructor(kind, value) {
      this.kind = kind;
      this.value = value;
    }
  }

  /* ---------------- Runtime ---------------- */
  function run(code, deps) {
    const src = String(code || "")
      .replace(/<\?=/g, " echo ")
      .replace(/<\?php|<\?php /g, " ")
      .replace(/\?>/g, " ");
    const out = (s) => deps.write(toStr(s));
    const envs = [];
    const functions = Object.create(null);
    let steps = 0;

    const ENV = {
      declare(name, value) { envs[envs.length - 1][name] = value === undefined ? null : value; },
      get(name) {
        for (let i = envs.length - 1; i >= 0; i -= 1) if (Object.prototype.hasOwnProperty.call(envs[i], name)) return envs[i][name];
        return null;
      },
      set(name, value) {
        const top = envs[envs.length - 1];
        if (top.__refs && top.__refs[name]) { envs[0][name] = value; return value; }
        if (top.__local) { top[name] = value; return value; }
        for (let i = envs.length - 1; i >= 0; i -= 1) if (Object.prototype.hasOwnProperty.call(envs[i], name)) { envs[i][name] = value; return value; }
        top[name] = value;
        return value;
      },
      has(name) {
        for (let i = envs.length - 1; i >= 0; i -= 1) if (Object.prototype.hasOwnProperty.call(envs[i], name)) return true;
        return false;
      },
      push(scope) { envs.push(scope || Object.create(null)); },
      pushLocal() { const s = Object.create(null); s.__local = true; envs.push(s); },
      pop() { envs.pop(); },
    };

    function tick() {
      steps += 1;
      if (steps > 200000) throw new PhpError("Eksekusi dihentikan: lebih dari 200.000 langkah, kemungkinan loop tanpa batas (periksa kondisi while/for).");
    }

    function phpFromJs(v, depth) {
      const d = depth || 0;
      if (d > 6) return toStr(v);
      if (v === null || v === undefined) return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      if (Array.isArray(v)) {
        const arr = makeArray();
        v.forEach((x, i) => { arr[ARR][String(i)] = phpFromJs(x, d + 1); });
        return arr;
      }
      if (typeof v === "object") {
        const arr = makeArray();
        Object.keys(v).forEach((k) => { arr[ARR][k] = phpFromJs(v[k], d + 1); });
        return arr;
      }
      return null;
    }

    function jsFromPhp(v) {
      if (isPhpArray(v)) {
        const list = entriesOf(v);
        const numeric = list.length > 0 && list.every(([k], i) => k === String(i));
        if (numeric) return list.map(([, x]) => jsFromPhp(x));
        const o = {};
        list.forEach(([k, x]) => { o[k] = jsFromPhp(x); });
        return o;
      }
      if (v && v.__phpObject) return v;
      return v;
    }

    function describe(v) {
      if (isPhpArray(v)) {
        const list = entriesOf(v);
        if (!list.length) return "array(0)";
        return "array(" + list.length + ") {\n" + list.map(([k, x]) => '  ["' + k + '"] => ' + describe(x)).join("\n") + "\n}";
      }
      if (typeof v === "string") return 'string(' + v.length + ') "' + v + '"';
      if (typeof v === "number") return Number.isInteger(v) ? "int(" + v + ")" : "float(" + v + ")";
      if (v === true) return "bool(true)";
      if (v === false) return "bool(false)";
      if (v === null || v === undefined) return "NULL";
      return "object";
    }

    /* ---- eval ---- */
    function evalNode(n) {
      tick();
      switch (n.s) {
        case "lit": return n.v;
        case "str": return n.interp ? interped(n.v, ENV) : n.v;
        case "var": return ENV.get(n.name);
        case "name": {
          const up = (n.display || n.name).toUpperCase();
          if (up === "PHP_VERSION") return "8.2.0";
          if (up === "PHP_EOL") return "\n";
          if (deps.constants && up in deps.constants) return deps.constants[up];
          const v = ENV.get(n.name);
          if (v !== null || ENV.has(n.name)) return v;
          if (functions[n.name]) return n.name;
          throw new PhpError("Undefined constant " + up + " (pakai kutip untuk teks, atau periksa ejaan konstanta)");
        }
        case "arr": {
          const arr = makeArray();
          let auto = 0;
          n.items.forEach((it) => {
            if (it.key === null) { arr[ARR][String(auto)] = evalNode(it.val); auto += 1; }
            else arr[ARR][keyOf(evalNode(it.key))] = evalNode(it.val);
          });
          return arr;
        }
        case "index": {
          const base = evalNode(n.base);
          if (isPhpArray(base)) {
            const k = keyOf(evalNode(n.sub));
            return Object.prototype.hasOwnProperty.call(base[ARR], k) ? base[ARR][k] : null;
          }
          if (typeof base === "string") { const i = toNum(evalNode(n.sub)); return base[i] === undefined ? "" : base[i]; }
          if (base && base.__phpObject) return memberOf(base, keyOf(evalNode(n.sub)));
          return null;
        }
        case "prop": return memberOf(evalNode(n.obj), n.name);
        case "classprop": return deps.staticMember ? deps.staticMember(n.cls, n.name, H) : null;
        case "un": {
          const v = evalNode(n.e);
          if (n.op === "!") return !truthy(v);
          if (n.op === "-") return -toNum(v);
          if (n.op === "~") return ~toNum(v);
          return v;
        }
        case "incdec": {
          const cur = toNum(evalNode(n.e));
          const next = n.op === "++" ? cur + 1 : cur - 1;
          assignTo(n.e, next);
          return n.pre ? next : cur;
        }
        case "bin": return binary(n.op, n.l, n.r);
        case "nullish": {
          const l = evalNode(n.l);
          return l === null || l === undefined ? evalNode(n.r) : l;
        }
        case "tern": return truthy(evalNode(n.cond)) ? evalNode(n.a || { s: "lit", v: true }) : evalNode(n.b);
        case "assign": {
          const value = n.op === "=" ? evalNode(n.e) : binary(n.op, { s: "raw", v: n.target }, n.e, true);
          assignTo(n.target, value);
          return value;
        }
        case "append": {
          const base = evalNode(n.target);
          if (!isPhpArray(base)) throw new PhpError("Cannot use scalar sebagai array untuk append");
          let auto = 0;
          entriesOf(base).forEach(([k]) => { if (/^\d+$/.test(k)) auto = Math.max(auto, Number(k) + 1); });
          base[ARR][String(auto)] = evalNode(n.e);
          return base;
        }
        case "call": return callNamed(n.name, n.args);
        case "meth": return callMethod(n);
        case "new": {
          if (!deps.construct) throw new PhpError("Objek new " + n.cls + "() tidak tersedia di ruang uji PHP");
          return deps.construct(n.cls, n.args.map((a) => evalNode(a)), H);
        }
        case "static": throw new PhpError("Metode statis " + n.cls + "::" + n.name + "() tidak didukung ruang uji PHP; pakai instance (contoh: $pdo->prepare()).");
        case "raw": return evalNode(n.v);
        default: throw new PhpError("Node ekspresi tidak dikenali: " + n.s);
      }
    }

    function binary(op, ln, rn) {
      if (op === "&&") return truthy(evalNode(ln)) ? truthy(evalNode(rn)) : false;
      if (op === "||") { const a = truthy(evalNode(ln)); return a ? a : truthy(evalNode(rn)); }
      const l = evalNode(ln);
      const r = evalNode(rn);
      switch (op) {
        case "+": return numResult(toNum(l) + toNum(r));
        case "-": return numResult(toNum(l) - toNum(r));
        case "*": return numResult(toNum(l) * toNum(r));
        case "/": {
          const d = toNum(r);
          if (d === 0) throw new PhpError("Division by zero");
          return numResult(toNum(l) / d);
        }
        case "%": return Math.trunc(toNum(l)) % Math.trunc(toNum(r));
        case "**": return numResult(Math.pow(toNum(l), toNum(r)));
        case ".": return toStr(l) + toStr(r);
        case "==": return looseEq(l, r);
        case "!=": return !looseEq(l, r);
        case "<>": return !looseEq(l, r);
        case "===": return strictEq(l, r);
        case "!==": return !strictEq(l, r);
        case "<": return cmp(l, r) < 0;
        case ">": return cmp(l, r) > 0;
        case "<=": return cmp(l, r) <= 0;
        case ">=": return cmp(l, r) >= 0;
        case "<=>": return cmp(l, r);
        case "|": return toNum(l) | toNum(r);
        case "&": return toNum(l) & toNum(r);
        case "^": return toNum(l) ^ toNum(r);
        case "+=": return numResult(toNum(l) + toNum(r));
        case "-=": return numResult(toNum(l) - toNum(r));
        case "*=": return numResult(toNum(l) * toNum(r));
        case "/=": return numResult(toNum(l) / toNum(r));
        case "%=": return toNum(l) % toNum(r);
        case ".=": return toStr(l) + toStr(r);
        default: throw new PhpError("Operator " + op + " belum didukung");
      }
    }

    function numResult(v) {
      if (Number.isInteger(v)) return v;
      return Math.round(v * 1e10) / 1e10;
    }

    function assignTo(target, value) {
      if (target.s === "var") { ENV.set(target.name, value); return; }
      if (target.s === "index") {
        const base = evalNode(target.base);
        const k = keyOf(evalNode(target.sub));
        if (isPhpArray(base)) base[ARR][k] = value;
        else throw new PhpError("Tidak dapat mengisi indeks pada nilai non-array");
        return;
      }
      if (target.s === "prop") {
        const base = evalNode(target.obj);
        if (base && base.__phpObject) { base.props = base.props || {}; base.props[target.name] = value; return; }
        if (isPhpArray(base)) base[ARR][target.name] = value;
        return;
      }
      if (target.s === "append") {
        const base = evalNode(target.target);
        if (!isPhpArray(base)) throw new PhpError("append memerlukan array");
        let auto = 0;
        entriesOf(base).forEach(([k]) => { if (/^\d+$/.test(k)) auto = Math.max(auto, Number(k) + 1); });
        base[ARR][String(auto)] = value;
        return;
      }
      if (target.s === "raw") { assignTo(target.v, value); return; }
      throw new PhpError("Tidak dapat memberi nilai pada ekspresi ini");
    }

    function memberOf(obj, name) {
      if (obj === null || obj === undefined) throw new PhpError("Try to access member \"" + name + "\" of a non-object");
      if (obj.__phpObject) {
        const n = String(name).toLowerCase();
        if (obj.getters && Object.prototype.hasOwnProperty.call(obj.getters, n)) return obj.getters[n]();
        if (obj.props && Object.prototype.hasOwnProperty.call(obj.props, name)) return obj.props[name];
        return null;
      }
      if (isPhpArray(obj)) { const v = obj[ARR][name]; return v === undefined ? null : v; }
      if (typeof obj === "object") return obj[name] === undefined ? null : obj[name];
      return null;
    }

    function callMethod(n) {
      const obj = evalNode(n.obj);
      if (!obj || !obj.__phpObject || !obj.methods[String(n.name).toLowerCase()]) {
        const jenis = obj && obj.__phpObject ? obj.phpClass : typeof obj;
        throw new PhpError("Call to undefined method " + jenis + "::" + n.name + "()");
      }
      return obj.methods[String(n.name).toLowerCase()](n.args.map(evalNode), obj);
    }

    /* ---- fungsi bawaan ---- */
    function phpRegex(pattern, flags) {
      const m = /^([\/#~])([\s\S]*?)\1([a-zA-Z]*)$/.exec(toStr(pattern).trim());
      if (!m) throw new PhpError("preg_match(): pola wajib memakai delimiter, contoh '/^[0-9]{4}$/'");
      const bendera = m[3] + (typeof flags === "string" ? flags : "");
      const opsi = (bendera.includes("i") ? "i" : "") + (bendera.includes("m") ? "m" : "") + (bendera.includes("s") ? "s" : "");
      try {
        return new RegExp(m[2], opsi);
      } catch (err) {
        throw new PhpError("preg_match(): pola tidak sah untuk ruang uji PHP: " + err.message);
      }
    }

    const BUILTIN = {
      preg_match: (a) => (phpRegex(a[0], a[2]).test(toStr(a[1])) ? 1 : 0),
      preg_replace: (a) => { const re = phpRegex(a[0]); return toStr(a[2]).replace(new RegExp(re.source, re.flags + "g"), toStr(a[1])); },
      preg_quote: (a) => toStr(a[0]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      addslashes: (a) => toStr(a[0]).replace(/['"\\]/g, (c) => "\\" + c),
      strip_tags: (a) => toStr(a[0]).replace(/<[^>]*>/g, ""),
      str_split: (a) => { const r = makeArray(); const len = a.length > 1 ? Math.max(1, toNum(a[1])) : 1; const s = toStr(a[0]); let i = 0; for (let q = 0; q < s.length; q += len) { r[ARR][String(i)] = s.substr(q, len); i += 1; } return r; },
      array_key_exists: (a) => isPhpArray(a[1]) && Object.prototype.hasOwnProperty.call(a[1][ARR], keyOf(a[0])),
      array_sum: (a) => entriesOf(a[0] || makeArray()).reduce((t, [, v]) => t + toNum(v), 0),
      array_slice: (a) => { const r = makeArray(); const mulai = toNum(a[1] || 0); entriesOf(a[0] || makeArray()).slice(mulai, a.length > 2 ? mulai + toNum(a[2]) : undefined).forEach(([, v], i) => { r[ARR][String(i)] = v; }); return r; },
      count: (a) => (isPhpArray(a[0]) ? entriesOf(a[0]).length : typeof a[0] === "string" ? a[0].length : 0),
      sizeof: (a) => BUILTIN.count(a),
      strlen: (a) => toStr(a[0]).length,
      strpos: (a) => { const i = toStr(a[0]).indexOf(toStr(a[1])); return i < 0 ? false : i; },
      stripos: (a) => { const i = toStr(a[0]).toLowerCase().indexOf(toStr(a[1]).toLowerCase()); return i < 0 ? false : i; },
      substr: (a) => toStr(a[0]).substr(toNum(a[1]), a.length > 2 ? toNum(a[2]) : undefined),
      str_replace: (a) => toStr(a[0]).split(toStr(a[1])).join(toStr(a[2])),
      str_contains: (a) => toStr(a[0]).indexOf(toStr(a[1])) >= 0,
      str_starts_with: (a) => toStr(a[0]).startsWith(toStr(a[1])),
      str_ends_with: (a) => toStr(a[0]).endsWith(toStr(a[1])),
      strtolower: (a) => toStr(a[0]).toLowerCase(),
      strtoupper: (a) => toStr(a[0]).toUpperCase(),
      ucfirst: (a) => { const s = toStr(a[0]); return s.charAt(0).toUpperCase() + s.slice(1); },
      ucwords: (a) => toStr(a[0]).replace(/\b\w/g, (c) => c.toUpperCase()),
      trim: (a) => (a.length > 1 ? toStr(a[0]).replace(new RegExp("^[" + toStr(a[1]) + "]+|[" + toStr(a[1]) + "]+$", "g")) : toStr(a[0]).trim()),
      str_pad: (a) => { const s = toStr(a[0]); const len = toNum(a[1]); const pad = a.length > 2 ? toStr(a[2]) : " "; return s.length >= len ? s : pad.repeat(len - s.length) + s; },
      str_repeat: (a) => toStr(a[0]).repeat(Math.max(0, toNum(a[1]))),
      sprintf: (a) => { let idx = 1; return toStr(a[0]).replace(/%[sdvfxc%]/g, (m) => { if (m === "%%") return "%"; const v = a[idx]; idx += 1; if (v === undefined) return m; if (m === "%d") return String(Math.trunc(toNum(v))); if (m === "%f") return toNum(v).toFixed(2); return toStr(v); }); },
      number_format: (a) => { const n = toNum(a[0]); const dec = a.length > 1 ? toNum(a[1]) : 0; const parts = n.toFixed(dec).split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return parts.join("."); },
      implode: (a) => entriesOf(a[1] || makeArray()).map(([, v]) => toStr(v)).join(toStr(a[0])),
      explode: (a) => { const arr = makeArray(); toStr(a[1]).split(toStr(a[0])).forEach((x, i) => { arr[ARR][String(i)] = x; }); return arr; },
      array_keys: (a) => { const r = makeArray(); entriesOf(a[0] || makeArray()).forEach(([k], i) => { r[ARR][String(i)] = k; }); return r; },
      array_values: (a) => { const r = makeArray(); entriesOf(a[0] || makeArray()).forEach(([, v], i) => { r[ARR][String(i)] = v; }); return r; },
      array_push: (a) => { const arr = a[0]; if (!isPhpArray(arr)) throw new PhpError("array_push(): argumen pertama harus array"); let auto = 0; entriesOf(arr).forEach(([k]) => { if (/^\d+$/.test(k)) auto = Math.max(auto, Number(k) + 1); }); a.slice(1).forEach((v) => { arr[ARR][String(auto)] = v; auto += 1; }); return auto; },
      array_merge: (a) => { const r = makeArray(); let auto = 0; a.forEach((x) => entriesOf(x || makeArray()).forEach(([k, v]) => { if (/^\d+$/.test(k)) { r[ARR][String(auto)] = v; auto += 1; } else r[ARR][k] = v; })); return r; },
      array_search: (a) => { const found = entriesOf(a[1] || makeArray()).find(([, v]) => looseEq(v, a[0])); return found ? found[0] : false; },
      in_array: (a) => entriesOf(a[1] || makeArray()).some(([, v]) => (a[2] === true ? strictEq(v, a[0]) : looseEq(v, a[0]))),
      sort: (a) => { const arr = a[0]; if (!isPhpArray(arr)) return false; const vals = entriesOf(arr).map(([, v]) => v).sort(cmp); arr[ARR] = Object.create(null); vals.forEach((v, i) => { arr[ARR][String(i)] = v; }); return true; },
      max: (a) => { const list = isPhpArray(a[0]) && a.length === 1 ? entriesOf(a[0]).map(([, v]) => v) : a; return list.length ? list.reduce((m, v) => (cmp(v, m) > 0 ? v : m)) : false; },
      min: (a) => { const list = isPhpArray(a[0]) && a.length === 1 ? entriesOf(a[0]).map(([, v]) => v) : a; return list.length ? list.reduce((m, v) => (cmp(v, m) < 0 ? v : m)) : false; },
      abs: (a) => Math.abs(toNum(a[0])),
      round: (a) => { const p = a.length > 1 ? toNum(a[1]) : 0; const f = Math.pow(10, p); return Math.round(toNum(a[0]) * f) / f; },
      intval: (a) => Math.trunc(toNum(a[0])),
      floatval: (a) => toNum(a[0]),
      strval: (a) => toStr(a[0]),
      is_int: (a) => typeof a[0] === "number" && Number.isInteger(a[0]),
      is_float: (a) => typeof a[0] === "number" && !Number.isInteger(a[0]),
      is_numeric: (a) => /^[-+]?(\d+\.?\d*|\.\d+)$/.test(toStr(a[0]).trim()),
      is_string: (a) => typeof a[0] === "string",
      is_bool: (a) => typeof a[0] === "boolean",
      is_array: (a) => isPhpArray(a[0]),
      is_null: (a) => a[0] === null || a[0] === undefined,
      var_dump: (a) => { ENV.out(describe(a[0])); return null; },
      print_r: (a) => { ENV.out(isPhpArray(a[0]) ? printable(a[0]) : toStr(a[0])); return true; },
      htmlspecialchars: (a) => toStr(a[0]).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
      nl2br: (a) => toStr(a[0]).replace(/\n/g, "<br />\n"),
      date: (a) => formatDate(toStr(a[0] || "Y-m-d"), a[1] === undefined ? Date.now() : toNum(a[1]) * 1000),
      time: () => Math.floor(Date.now() / 1000),
      round2: (a) => BUILTIN.round(a),
      password_hash: (a) => "$2y$10$" + MiniHash.hash(toStr(a[0])),
      json_encode: (a) => JSON.stringify(jsFromPhp(a[0])),
      json_decode: (a) => { try { return phpFromJs(JSON.parse(toStr(a[0]))); } catch (e) { return null; } },
      str_word_count: (a) => toStr(a[0]).split(/\s+/).filter(Boolean).length,
      ucfirst_array: () => null,
    };

    function formatDate(fmt, ts) {
      const d = new Date(ts);
      const p2 = (n) => String(n).padStart(2, "0");
      const map = { Y: String(d.getFullYear()), m: p2(d.getMonth() + 1), d: p2(d.getDate()), H: p2(d.getHours()), i: p2(d.getMinutes()), s: p2(d.getSeconds()), j: String(d.getDate()), n: String(d.getMonth() + 1) };
      return String(fmt).replace(/[YmdHijn]/g, (c) => map[c]);
    }

    function printable(v, indent) {
      const pad = indent || "";
      if (isPhpArray(v)) {
        const list = entriesOf(v);
        return "Array\n" + pad + "(\n" + list.map(([k, x]) => pad + "    [" + k + "] => " + (isPhpArray(x) ? printable(x, pad + "    ") : toStr(x))).join("\n") + "\n" + pad + ")";
      }
      return toStr(v);
    }

    const MiniHash = { hash: (s) => { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(36) + "sirkuit"; } };

    ENV.out = (text) => deps.write(text);

    function callNamed(name, argNodes) {
      const lower = String(name).toLowerCase();
      if (lower === "isset") {
        return argNodes.some((a) => {
          if (a.s === "var") return ENV.has(a.name) && ENV.get(a.name) !== null && ENV.get(a.name) !== undefined;
          if (a.s === "index") {
            const base = evalNode(a.base);
            return isPhpArray(base) && Object.prototype.hasOwnProperty.call(base[ARR], keyOf(evalNode(a.sub))) && base[ARR][keyOf(evalNode(a.sub))] !== null;
          }
          const v = evalNode(a);
          return v !== null && v !== undefined && v !== false;
        });
      }
      if (lower === "empty") {
        const v = argNodes.length ? evalNode(argNodes[0]) : null;
        return !truthy(v);
      }
      if (lower === "compact" || lower === "extract") throw new PhpError("Fungsi " + lower + "() tidak tersedia di ruang uji PHP SIRKUIT");
      if (lower === "preg_match" && argNodes.length > 2) {
        const re = phpRegex(evalNode(argNodes[0]), argNodes.length > 3 ? toStr(evalNode(argNodes[3])) : "");
        const mm = toStr(evalNode(argNodes[1])).match(re);
        if (!mm) { assignTo(argNodes[2], makeArray()); return 0; }
        const arr = makeArray();
        mm.forEach((g, i) => { arr[ARR][String(i)] = g === undefined ? "" : g; });
        assignTo(argNodes[2], arr);
        return 1;
      }
      const args = argNodes.map(evalNode);
      if (lower === "echo") { args.forEach((a) => out(a)); return null; }
      if (lower === "print") { out(args[0]); return 1; }
      if (lower === "exit" || lower === "die") { if (args.length) out(args[0]); throw new Signal("exit", args[0]); }
      if (lower === "trigger_error") { deps.warn(toStr(args[0])); return null; }
      if (BUILTIN[lower]) return BUILTIN[lower](args);
      if (functions[lower]) {
        const fn = functions[lower];
        ENV.pushLocal();
        fn.params.forEach((prm, i) => ENV.declare(prm, args[i] === undefined ? null : args[i]));
        const r = execBlock(fn.body);
        ENV.pop();
        return r instanceof Signal && r.kind === "return" ? r.value : null;
      }
      if (deps.phpFunction && deps.phpFunction[lower]) return deps.phpFunction[lower](args, H);
      throw new PhpError("Call to undefined function " + lower + "() - fungsi ini belum tersedia di ruang uji");
    }

    /* ---- exec ---- */
    function execBlock(body) {
      for (let i = 0; i < body.length; i += 1) {
        const r = exec(body[i]);
        if (r instanceof Signal) return r;
      }
      return null;
    }

    function exec(n) {
      tick();
      switch (n.s) {
        case "expr": evalNode(n.e); return undefined;
        case "noop": return undefined;
        case "global": {
          const top = envs[envs.length - 1];
          top.__refs = top.__refs || Object.create(null);
          n.names.forEach((nm) => { top.__refs[nm] = true; });
          return undefined;
        }
        case "echo": n.args.forEach((a) => out(evalNode(a))); return undefined;
        case "block": return execBlock(n.body);
        case "assign": evalNode(n); return undefined;
        case "fn": functions[n.name.toLowerCase()] = { params: n.params, body: n.body, name: n.name }; return undefined;
        case "return": return new Signal("return", n.e === null ? null : evalNode(n.e));
        case "break": return new Signal("break");
        case "continue": return new Signal("continue");
        case "throw": { const v = evalNode(n.e); throw v && v.__phpObject && v.phpError ? v.phpError : new PhpError(toStr(v)); }
        case "unset": n.targets.forEach((t) => { if (t.s === "var") delete envs[envs.length - 1][t.name]; else if (t.s === "index") { const b = evalNode(t.base); if (isPhpArray(b)) delete b[ARR][keyOf(evalNode(t.sub))]; } }); return undefined;
        case "if": {
          for (let i = 0; i < n.branches.length; i += 1) {
            if (truthy(evalNode(n.branches[i].cond))) return execBlock(n.branches[i].body);
          }
          return n.alt ? execBlock(n.alt) : undefined;
        }
        case "while": {
          while (truthy(evalNode(n.cond))) {
            tick();
            const r = execBlock(n.body);
            if (r instanceof Signal) { if (r.kind === "continue") continue; if (r.kind === "break") break; return r; }
          }
          return undefined;
        }
        case "for": {
          if (n.init) evalNode(n.init);
          for (;;) {
            tick();
            if (n.cond && !truthy(evalNode(n.cond))) break;
            const r = execBlock(n.body);
            if (r instanceof Signal) { if (r.kind === "break") break; if (r.kind !== "continue") return r; }
            if (n.upd) evalNode(n.upd);
          }
          return undefined;
        }
        case "foreach": {
          const src = evalNode(n.src);
          const list = isPhpArray(src) ? entriesOf(src) : src && src.__phpObject && src.phpRows ? src.phpRows.map((r, i) => [String(i), r]) : [];
          for (let i = 0; i < list.length; i += 1) {
            tick();
            ENV.push(Object.create(null));
            if (n.keyVar) ENV.declare(n.keyVar, /^\d+$/.test(list[i][0]) ? Number(list[i][0]) : list[i][0]);
            ENV.declare(n.valVar, list[i][1]);
            const r = execBlock(n.body);
            ENV.pop();
            if (r instanceof Signal) { if (r.kind === "break") break; if (r.kind !== "continue") return r; }
          }
          return undefined;
        }
        case "switch": {
          const nilai = evalNode(n.subject);
          let mulai = n.cases.findIndex((c) => c.test !== null && looseEq(nilai, evalNode(c.test)));
          if (mulai < 0) mulai = n.cases.findIndex((c) => c.test === null);
          if (mulai < 0) return undefined;
          for (let i = mulai; i < n.cases.length; i += 1) {
            tick();
            const r = execBlock(n.cases[i].body);
            if (r instanceof Signal) { if (r.kind === "break") break; return r; }
          }
          return undefined;
        }
        case "try": {
          let thrown = null;
          let result;
          try {
            result = execBlock(n.body);
          } catch (err) {
            thrown = err;
          }
          if (thrown) {
            if (thrown instanceof Signal) { if (n.finallyBody) execBlock(n.finallyBody); return thrown; }
            if (!(thrown instanceof Error)) throw thrown;
            if (!n.catchVar && !n.catchBody.length) throw thrown;
            ENV.push(Object.create(null));
            if (n.catchVar) ENV.declare(n.catchVar, makeException(thrown));
            const caught = execBlock(n.catchBody);
            ENV.pop();
            if (n.finallyBody) execBlock(n.finallyBody);
            return caught instanceof Signal ? caught : undefined;
          }
          if (n.finallyBody) execBlock(n.finallyBody);
          return result;
        }
        default: {
          const v = evalNode(n);
          return v === undefined ? undefined : v;
        }
      }
    }

    const H = {
      phpFromJs,
      jsFromPhp,
      toStr,
      toNum,
      truthy,
      isPhpArray,
      entriesOf,
      makeArray,
      phpObject,
      keyOf,
      describe,
      PhpError,
      Signal,
      setKey: (arr, key, value) => { if (!isPhpArray(arr)) throw new PhpError("setKey memerlukan array PHP"); arr[ARR][keyOf(key)] = value; },
      pushValue: (arr, value) => {
        let auto = 0;
        entriesOf(arr).forEach(([k]) => { if (/^\d+$/.test(k)) auto = Math.max(auto, Number(k) + 1); });
        arr[ARR][String(auto)] = value;
      },
      runUserFunction: (name, args) => callNamed(name, args.map((a) => ({ s: "raw", v: a }))),
    };

    function makeException(err) {
      if (err && err.__phpObject) return err;
      const e = phpObject("Exception", {
        message: err.message,
        code: err.phpCode || 0,
      });
      e.methods.getmessage = () => err.message;
      e.methods.getcode = () => err.phpCode || 0;
      e.methods.__err = () => err;
      return e;
    }

    function phpObject(cls, props) {
      const o = { __phpObject: true, phpClass: cls, props: props || {}, methods: Object.create(null), getters: Object.create(null) };
      return o;
    }

    return {
      execTop() {
        ENV.push(Object.create(null));
        const globals = typeof deps.globals === "function" ? deps.globals(H) : deps.globals || {};
        Object.entries(globals).forEach(([k, v]) => ENV.declare(k, v));
        try {
          return execBlock(parser(tokenize(src)).body);
        } finally {
          ENV.pop();
        }
      },
      H,
    };
  }

  window.PhpMini = { run };
})();
