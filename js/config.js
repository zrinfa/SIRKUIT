/* =====================================================================
 * SIRKUIT - Simulasi Interaktif Rangkaian Kueri dan Uji Integrasi Terpadu
 * Media Pembelajaran Simulasi Arsitektur Sistem & REST API Berbasis WebGL
 * Jurusan RPL / PPLG - SMKN 1 Mejayan (Jl. Imam Bonjol No. 7, Kab. Madiun)
 * js/config.js - Konfigurasi, konstanta kurikulum & seed data lengkap
 * ===================================================================== */

const SIRKUIT_CONFIG = {
  APP_NAME: "SIRKUIT",
  APP_TAGLINE: "Simulasi Interaktif Rangkaian Kueri dan Uji Integrasi Terpadu",
  APP_SUBTITLE:
    "Media Pembelajaran Simulasi Arsitektur Sistem & REST API Berbasis WebGL - Jurusan RPL SMKN 1 Mejayan",
  VERSION: "3.0.7",
  THREE_REVISION: "r160",

  PENYUSUN: {
    nama: "Fazrin Mauza Dwi Zuhudi",
    nim: "24050974090",
    prodi: "S1 Pendidikan Teknologi Informasi, Fakultas Teknik, Universitas Negeri Surabaya",
    mitra: "SMK Negeri 1 Mejayan - Kompetensi Keahlian Rekayasa Perangkat Lunak (RPL / PPLG)",
    alamatMitra: "Jl. Imam Bonjol No. 7, Kec. Mejayan, Kab. Madiun, Jawa Timur",
  },

  KURIKULUM: {
    acuan: "Keputusan Kepala BSKAP Kemendikbudristek No. 032/H/KR/2024 - Capaian Pembelajaran Kurikulum Merdeka",
    fase: "Fase F (Kelas XI & XII)",
    program: "Pengembangan Perangkat Lunak dan Gim (PPLG) / Konsentrasi Keahlian Rekayasa Perangkat Lunak (RPL)",
    elemen: "Pemrograman Web dan Perangkat Bergerak serta Basis Data",
    stdIndustri: "Skema Sertifikasi KKNI Level II Kompetensi Keahlian RPL & tuntutan DUDIKA",
  },

  KKM: 75,
  TOTAL_SOAL: 12,

  DEMO_ACCOUNTS: {
    siswa: {
      email: "fazrin.mauza@siswa.smkn1mejayan.sch.id",
      nisn_nip: "008492104",
      password: "sirkuit2027",
      full_name: "Fazrin Mauza Dwi Zuhudi",
      role: "siswa",
      kelas: "XI RPL 1",
    },
    guru: {
      email: "hendra.kusuma@smkn1mejayan.sch.id",
      nisn_nip: "198705122015071002",
      password: "guru123",
      full_name: "Bpk. Hendra Kusuma, S.Kom.",
      role: "guru",
      kelas: null,
    },
  },

  HTTP_METHODS: {
    GET: { warna: "#e2670a", label: "GET", deskripsi: "Ambil daftar nilai siswa" },
    POST: { warna: "#0c7a54", label: "POST", deskripsi: "Tambah data proyek siswa baru" },
    PUT: { warna: "#9a7b06", label: "PUT", deskripsi: "Perbarui nilai UKK RPL siswa" },
    DELETE: { warna: "#c22a44", label: "DELETE", deskripsi: "Hapus log sesi kedaluwarsa" },
  },

  ENDPOINTS: [
    { path: "/api/siswa.php?kelas=XI-RPL-1", metode: "GET", nama: "Daftar Nilai Siswa" },
    { path: "/api/nilai-ukk.php", metode: "GET", nama: "Hasil UKK RPL" },
    { path: "/api/proyek-siswa.php", metode: "POST", nama: "Tambah Proyek Siswa" },
    { path: "/api/jurnal-pkl.php", metode: "POST", nama: "Jurnal PKL" },
    { path: "/api/nilai-ukk.php", metode: "PUT", nama: "Perbarui Nilai UKK" },
    { path: "/api/prakerin-siswa.php", metode: "PUT", nama: "Perbarui Profil Prakerin" },
    { path: "/api/sesi-log.php", metode: "DELETE", nama: "Hapus Log Sesi Kedaluwarsa" },
    { path: "/api/auth.php", metode: "GET", nama: "Cek Session Login PHP" },
  ],

  NODES: [
    {
      id: "client",
      urutan: 1,
      nama: "CLIENT (Browser / Frontend UI)",
      fungsi:
        "Perangkat pengguna yang menjalankan halaman HTML dan form. Browser menyusun HTTP Request (fetch/AJAX), menyimpan token hasil login PHP pada localStorage atau Cookie sesi, lalu merender response JSON ke antarmuka.",
      protokol: "HTTPS / TLS 1.3",
      konfigurasi: [
        { kunci: "origin", label: "Origin Frontend", nilai: "http://localhost/pkl-rpl (XAMPP)", tipe: "teks" },
        { kunci: "auth_header", label: "Authorization Header", nilai: "Bearer <token_sesi_valid>", tipe: "select", opsi: ["Bearer <token_sesi_valid>", "Bearer token_expired_null", "Tanpa Header Authorization"] },
        { kunci: "base_url", label: "Endpoint Base URL", nilai: "/api/prakerin-siswa.php", tipe: "select", opsi: ["/api/prakerin-siswa.php", "/api/profil_prakerin_lama.php", "/api/nilai-siswa.php"] },
      ],
      metrik: { cpu: [12, 28], ram: [420, 680], koneksi: [1, 4], latency: [8, 24] },
    },
    {
      id: "gateway",
      urutan: 2,
      nama: "WEB SERVER (Apache)",
      fungsi:
        "Apache httpd sebagai pintu masuk seluruh trafik. mod_rewrite dan .htaccess memetakan URL ke skrip PHP, membatasi jumlah request per IP, menambahkan header cache, dan menolak payload yang terlalu besar sebelum request sampai ke skrip backend.",
      protokol: "Apache 2.4 - mod_rewrite | mod_headers | mod_qos",
      konfigurasi: [
        { kunci: "routing_table", label: "RewriteRule (.htaccess)", nilai: "^api/([a-z-]+)$ api/$1.php [L]", tipe: "teks" },
        { kunci: "rate_limit", label: "Kebijakan Rate Limiting", nilai: "token_bucket", tipe: "select", opsi: ["token_bucket", "fixed_window", "nonaktif"] },
        { kunci: "rate_per_min", label: "Kuota Request / Menit", nilai: "60", tipe: "select", opsi: ["60", "600", "0 (tanpa batas)"] },
        { kunci: "response_cache", label: "Cache Output (Cache-Control)", nilai: "DISABLED", tipe: "toggle", opsi: ["ENABLED", "DISABLED"] },
        { kunci: "cache_ttl", label: "Cache TTL", nilai: "60s", tipe: "select", opsi: ["60s", "300s", "0s"] },
        { kunci: "pagination", label: "Pagination LIMIT/OFFSET", nilai: "DISABLED", tipe: "toggle", opsi: ["ENABLED", "DISABLED"] },
      ],
      metrik: { cpu: [22, 41], ram: [180, 320], koneksi: [40, 120], latency: [4, 12] },
    },
    {
      id: "backend",
      urutan: 3,
      nama: "BACKEND PHP",
      fungsi:
        "Skrip PHP 8 yang mengeksekusi logika bisnis: session_start dan verifikasi token, validasi $_POST/body JSON, otorisasi peran (siswa/guru), lalu menyusun kueri MySQL memakai PDO prepared statement.",
      protokol: "PHP 8.2 - PDO MySQL (pdo_mysql) - session_start()",
      konfigurasi: [
        { kunci: "jwt_validation", label: "Validasi Session/Token", nilai: "AKTIF", tipe: "toggle", opsi: ["AKTIF", "NONAKTIF"] },
        { kunci: "jwt_issuer", label: "Sumber Token", nilai: "tabel session (session_start)", tipe: "teks" },
        { kunci: "sql_column", label: "Kolom Timestamp Kueri", nilai: "created_at", tipe: "select", opsi: ["created_at", "tgl_input", "updated_at"] },
        { kunci: "db_connect", label: "Mode Koneksi Database", nilai: "pdo_persistent", tipe: "select", opsi: ["pdo_persistent", "mysqli_direct"] },
      ],
      metrik: { cpu: [35, 58], ram: [512, 940], koneksi: [18, 60], latency: [14, 38] },
    },
    {
      id: "database",
      urutan: 4,
      nama: "DATABASE MySQL",
      fungsi:
        "Basis data MySQL/MariaDB pada XAMPP, Laragon, atau hosting sekolah. Dikelola lewat phpMyAdmin, dengan hak akses per user (GRANT), indeks BTREE, AUTO_INCREMENT, dan batas max_connections.",
      protokol: "MySQL 8 / MariaDB 10 - phpMyAdmin - GRANT per user",
      konfigurasi: [
        { kunci: "rls", label: "Hak Akses User MySQL (GRANT)", nilai: "ENABLED", tipe: "toggle", opsi: ["ENABLED", "DISABLED"] },
        { kunci: "pooler", label: "Persistent Connection (PDO)", nilai: "AKTIF (PDO persistent)", tipe: "toggle", opsi: ["AKTIF (PDO persistent)", "NONAKTIF"] },
        { kunci: "max_conn", label: "Batas max_connections", nilai: "500", tipe: "select", opsi: ["500", "151", "20"] },
        { kunci: "index_siswa", label: "Indeks Tabel siswa", nilai: "idx_siswa_kelas (BTREE)", tipe: "teks" },
      ],
      metrik: { cpu: [18, 34], ram: [760, 1400], koneksi: [8, 45], latency: [2, 9] },
    },
  ],

  PBL_STAGES: [
    { nomor: 1, nama: "Orientasi Siswa pada Masalah", singkatan: "Orientasi" },
    { nomor: 2, nama: "Mengorganisasikan Siswa untuk Belajar", singkatan: "Organisasi" },
    { nomor: 3, nama: "Membimbing Penyelidikan Individual/Kelompok", singkatan: "Penyelidikan" },
    { nomor: 4, nama: "Mengembangkan & Menyajikan Hasil Karya", singkatan: "Solusi" },
    { nomor: 5, nama: "Menganalisis & Mengevaluasi Proses Pemecahan", singkatan: "Evaluasi" },
  ],

  /* ================= PERANGKAT SIMULASI 4 SKENARIO PBL =================
     Berkas ini hanya menyimpan "perangkat keras" simulasi: node tempat paket
     berhenti, metrik yang berubah, endpoint awal, dan batas kuota. Gejala,
     konteks, temuan, refleksi, serta opsi solusi diambil dari MySQL lewat
     GET /api/scenarios.php, sehingga kunci jawaban tidak ikut terkirim ke
     akun siswa. */
  SCENARIOS: [
    {
      kode: "E401",
      judul: "Kasus 1 - Error 401 Unauthorized",
      status: 401,
      statusText: "Unauthorized",
      faultNode: "gateway",
      packetStopAt: "gateway",
      metodeAwal: "GET",
      endpointAwal: "/api/nilai-siswa.php",
      metricOverride: { gateway: { cpu: 62 }, backend: { cpu: 48, latency: 26 } },
    },
    {
      kode: "E404",
      judul: "Kasus 2 - Error 404 Not Found",
      status: 404,
      statusText: "Not Found",
      faultNode: "gateway",
      packetStopAt: "gateway",
      metodeAwal: "POST",
      endpointAwal: "/api/profil_prakerin_lama.php",
      metricOverride: { gateway: { cpu: 38 } },
    },
    {
      kode: "E429",
      judul: "Kasus 3 - Error 429 Too Many Requests",
      status: 429,
      statusText: "Too Many Requests",
      faultNode: "gateway",
      packetStopAt: "gateway",
      metodeAwal: "GET",
      endpointAwal: "/api/nilai-ukk.php",
      metricOverride: { gateway: { cpu: 98, ram: 1880, koneksi: 640, latency: 1240 } },
    },
    {
      kode: "E500",
      judul: "Kasus 4 - Error 500 Internal Server Error",
      status: 500,
      statusText: "Internal Server Error",
      faultNode: "database",
      packetStopAt: "database",
      metodeAwal: "POST",
      endpointAwal: "/api/jurnal-pkl.php",
      metricOverride: { database: { cpu: 96, koneksi: 19, latency: 1240 }, backend: { cpu: 81, latency: 1240 } },
    },
  ],

  /* Bank soal kuis tidak lagi dibundel di sini. GET /api/quiz.php mengirim soal
     tanpa kolom kunci; server yang menilai lewat tabel quiz_questions. */

  /* ================= MODUL MATERI (Bagian A) ================= */
  MODULE_CARDS: [
    {
      nomor: 1,
      judul: "Arsitektur Web Tiga Tingkat: Client, Web Server, PHP, MySQL",
      isi:
        "Aplikasi web yang dibangun siswa RPL memisahkan empat lapisan: (1) CLIENT - browser yang mengirim HTTP request lewat form HTML atau fetch() dan merender response; (2) WEB SERVER Apache - titik masuk tunggal yang melayani file, mencocokkan RewriteRule pada .htaccess, membatasi trafik, dan mengirim path ke skrip PHP; (3) BACKEND PHP - skrip php 8 yang menjalankan session_start(), memvalidasi sesi, memproses logika bisnis, lalu menyusun kueri; (4) DATABASE MySQL/MariaDB - tempat tabel relasional disimpan dan diakses lewat phpMyAdmin. Prinsipnya: pemisahan tanggung jawab, stateless pada lapisan web, dan resource-based pada endpoint.",
      poin: [
        "Client tidak pernah mengakses MySQL langsung - selalu melalui skrip PHP.",
        "Apache = satpam: melayani rute, membatasi koneksi, mencatat access log.",
        "PHP = otak: aturan bisnis, validasi sesi, hak akses peran siswa/guru.",
        "MySQL = lemari arsip: tabel relasional, indeks BTREE, dan hak akses GRANT.",
      ],
    },
    {
      nomor: 2,
      judul: "Dasar Pemrograman PHP: Variabel, Tipe Data, dan Kontrol",
      isi:
        "Skrip PHP ditulis di antara tag &lt;?php ... ?&gt; dan dijalankan di server, bukan di browser. Variabel selalu diawali tanda dollar ($nama = \"Fazrin\"), tipe data dasar meliputi string, int, float, boolean, array, dan null. Struktur kontrol memakai if/else, switch, for, foreach, dan while. Fungsi bawaan yang sering dipakai: count(), strlen(), date(), htmlspecialchars() untuk aman-tampilan, dan var_dump() untuk menelusuri isi variabel.",
      poin: [
        "echo menampilkan teks, var_dump menampilkan struktur array atau objek.",
        "PHP case-sensitive untuk nama variabel, case-insensitive untuk nama fungsi.",
        "Concatenation memakai titik (.), bukan tanda plus seperti JavaScript.",
        "Setiap variabel harus didefinisikan sebelum dipakai; kesalahan sintaks berujung 500.",
      ],
    },
    {
      nomor: 3,
      judul: "Form HTML, Metode GET/POST, dan Session PHP",
      isi:
        "Form HTML mengirim data ke skrip PHP melalui $_GET (memakai query string, terlihat di address bar, cocok untuk filter dan pagination) atau $_POST (data dibawa pada body request, cocok untuk login dan penyimpanan data). Setelah input divalidasi, pemanggilan session_start() membuat cookie PHPSESSID dan satu baris pada tabel sesi di MySQL. Selama token sesi cocok, request berikutnya dianggap pengguna yang sama; jika kosong atau kedaluwarsa, skrip membalas 401 Unauthorized.",
      poin: [
        "isset() dan empty() dipakai memeriksa field form sebelum diproses.",
        "Password disimpan memakai password_hash(), tidak pernah plaintext.",
        "session_destroy() menghapus akses; 401 berarti login ulang, 403 berarti tidak berhak.",
        "Header Authorization: Bearer &lt;token_sesi&gt; meniru cara kerja token pada API modern.",
      ],
    },
    {
      nomor: 4,
      judul: "Basis Data MySQL dengan phpMyAdmin: DDL, DML, dan JOIN",
      isi:
        "DDL (Data Definition Language) membentuk struktur: CREATE TABLE siswa (id CHAR(5) PRIMARY KEY, nama VARCHAR(100), kelas VARCHAR(12), created_at DATETIME). DML (Data Manipulation Language) mengisi isinya: INSERT, SELECT, UPDATE, DELETE. Filter memakai WHERE, pengurutan ORDER BY, dan pembatasan baris LIMIT n OFFSET m. Relasi antar tabel disambungkan dengan JOIN ON, dipercepat indeks BTREE, dan diamati lewat phpMyAdmin tab SQL. Kesalahan khas siswa: Unknown column (1054), Table doesn't exist (1146), dan Too many connections (1040).",
      poin: [
        "UPDATE atau DELETE tanpa WHERE mengubah atau menghapus seluruh baris tabel.",
        "Kolom created_at bertipe DATETIME diisi NOW(), bukan nama lain seperti tgl_input.",
        "LIMIT 20 membatasi payload; JOIN mengganti beberapa kueri kecil menjadi satu.",
        "max_connections default MariaDB 151; nilai terlalu kecil membuat antrean penuh.",
      ],
    },
    {
      nomor: 5,
      judul: "Koneksi Database dengan PDO dan Prepared Statement",
      isi:
        "PDO (PHP Data Objects) adalah lapisan koneksi database yang seragam. $pdo = new PDO('mysql:host=localhost;dbname=pkl_rpl', 'root', '', [PDO::ATTR_ERRMODE = PDO::ERRMODE_EXCEPTION]) membuka koneksi, lalu prepared statement memisahkan kueri dari data: $stmt = $pdo->prepare('SELECT * FROM nilai_ukk WHERE siswa_id = ?'); $stmt->execute([$siswa_id]). Cara ini mencegah SQL injection sekaligus membuat MySQL dapat memakai ulang rencana kueri. Mode PDO::ATTR_PERSISTENT memakai ulang koneksi yang sudah terbuka sehingga batas max_connections tidak cepat terlampaui.",
      poin: [
        "Placeholder ? atau :nama selalu di-binding, tidak pernah disisipkan dengan titik.",
        "SQL injection terjadi saat input user dirangkai langsung ke string kueri.",
        "ERRMODE_EXCEPTION membuat kegagalan kueri lekas terlihat, bukan diam-diam 500.",
        "Persistent connection menekan error 1040 Too many connections saat trafik lonjak.",
      ],
    },
    {
      nomor: 6,
      judul: "REST API dengan PHP: Endpoint, JSON, dan Kode Status",
      isi:
        "Endpoint REST dibuat dari satu file PHP per resource, misalnya api/nilai-siswa.php, dan rute bersih /api/nilai-siswa ditulis melalui .htaccess: RewriteRule ^api/([a-z-]+)$ api/$1.php [L]. Skrip membaca $_SERVER['REQUEST_METHOD'], mengatur header('Content-Type: application/json'), lalu membalik json_encode([status, code, data]). Kode status dipakai sesuai semantik: 200 OK dan 201 Created untuk sukses, 401 dan 403 untuk autentikasi/otorisasi, 404 untuk rute tidak ada, 429 untuk kuota habis, 500 untuk kegagalan server. Format body standar: { \"status\": \"success\", \"code\": 200, \"data\": [...] }.",
      poin: [
        "GET untuk membaca, POST membuat, PUT memperbarui, DELETE menghapus resource.",
        "Query string (?) untuk filter dan pagination, path parameter (/) untuk identitas.",
        "Header Retry-After dan X-RateLimit-Remaining adalah ciri khas kebijakan rate limit.",
        "Cache-Control max-age=60 pada Apache mengubah permintaan berulang menjadi satu kueri.",
      ],
    },
  ],

  /* ================= LAB UJI KODE (eksekusi kode siswa) ================= */
  /* Struktur ruang uji peramban. Nama tabel dan kolom disamakan persis dengan
     database ruang latihan pada sirkuit.sql (BAGIAN 2), supaya kueri yang benar
     di MySQL tetap benar bila dijalankan di ruang uji peramban. Panel struktur
     di Lab Uji memakai api/schema.php, jadi daftar ini hanya cadangan. */
  LAB_SCHEMA: [
    {
      tabel: "siswa",
      kolom: [
        { nama: "id", tipe: "char(5)", contoh: "25001" },
        { nama: "nisn", tipe: "char(9)", contoh: "008492104" },
        { nama: "nama", tipe: "varchar(120)", contoh: "Fazrin Mauza Dwi Zuhudi" },
        { nama: "kelas", tipe: "varchar(20)", contoh: "XI RPL 1" },
        { nama: "created_at", tipe: "datetime", contoh: "2027-01-10 04:21:00" },
      ],
    },
    {
      tabel: "nilai_ukk",
      kolom: [
        { nama: "id", tipe: "int", contoh: "1" },
        { nama: "siswa_id", tipe: "char(5)", contoh: "25010" },
        { nama: "nama", tipe: "varchar(120)", contoh: "Hafiz Ardiansyah" },
        { nama: "paket_keahlian", tipe: "varchar(30)", contoh: "RPL" },
        { nama: "nilai", tipe: "smallint", contoh: "68" },
        { nama: "is_published", tipe: "tinyint(1)", contoh: "true" },
        { nama: "created_at", tipe: "datetime", contoh: "2027-04-02 02:10:00" },
      ],
    },
    {
      tabel: "jurnal_pkl",
      kolom: [
        { nama: "id", tipe: "int", contoh: "1" },
        { nama: "siswa_id", tipe: "char(5)", contoh: "25001" },
        { nama: "hari", tipe: "varchar(12)", contoh: "Senin" },
        { nama: "isi", tipe: "text", contoh: "Membuat CRUD dengan PHP" },
        { nama: "created_at", tipe: "datetime", contoh: "2027-02-14 03:00:00" },
      ],
    },
    {
      tabel: "proyek",
      kolom: [
        { nama: "id", tipe: "int", contoh: "1" },
        { nama: "siswa_id", tipe: "char(5)", contoh: "25017" },
        { nama: "judul", tipe: "varchar(160)", contoh: "Sistem Informasi Prakerin" },
        { nama: "status", tipe: "enum", contoh: "draft" },
        { nama: "deadline", tipe: "date", contoh: "2027-04-30" },
        { nama: "created_at", tipe: "datetime", contoh: "2027-03-01 08:00:00" },
      ],
    },
    {
      tabel: "prakerin",
      kolom: [
        { nama: "id", tipe: "int", contoh: "1" },
        { nama: "siswa_id", tipe: "char(5)", contoh: "25003" },
        { nama: "paket", tipe: "varchar(60)", contoh: "Pengembangan Aplikasi Web" },
        { nama: "jam", tipe: "int", contoh: "96" },
        { nama: "catatan", tipe: "text", contoh: "Membuat endpoint REST API nilai siswa" },
        { nama: "updated_at", tipe: "datetime", contoh: "2027-01-20 01:00:00" },
      ],
    },
    {
      tabel: "sesi_login",
      kolom: [
        { nama: "id", tipe: "int", contoh: "1" },
        { nama: "siswa_id", tipe: "char(5)", contoh: "25005" },
        { nama: "token", tipe: "varchar(64)", contoh: "7f3c9b1e..." },
        { nama: "status", tipe: "enum", contoh: "aktif" },
        { nama: "ip", tipe: "varchar(45)", contoh: "10.10.2.14" },
        { nama: "dibuat_at", tipe: "datetime", contoh: "2026-11-01 09:00:00" },
        { nama: "kedaluwarsa_at", tipe: "datetime", contoh: "2026-11-01 21:00:00" },
      ],
    },
  ],

  // Kuota request per menjalankan kode saat sistem berada di mode E429.
  LAB_RATE_LIMIT: 6,

  /* DATA CONTOH untuk ruang uji browser, dipakai hanya saat runner PHP di server
     tidak tersedia. Dashboard guru dan Lab Uji server-side memakai baris nyata
     di MySQL, bukan daftar ini. */
  STUDENTS: [
    { id: "25001", nisn: "008492104", nama: "Fazrin Mauza Dwi Zuhudi", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "18:42", skor: 92 },
    { id: "25002", nisn: "008512001", nama: "Ahmad Rizky Fauzi", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "21:15", skor: 88 },
    { id: "25003", nisn: "008512045", nama: "Nabila Putri Ramadhani", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "19:03", skor: 95 },
    { id: "25004", nisn: "008513022", nama: "Dimas Aditya Pratama", kelas: "XI RPL 1", progres: ["E401", "E404", "E500"], waktu: "24:50", skor: 80 },
    { id: "25005", nisn: "008513078", nama: "Siti Nurhaliza Wijayanti", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "20:11", skor: 86 },
    { id: "25006", nisn: "008514009", nama: "Bagus Panuntun Wicaksono", kelas: "XI RPL 1", progres: ["E401", "E429"], waktu: "27:36", skor: 78 },
    { id: "25007", nisn: "008514102", nama: "Intan Permata Sari", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "17:58", skor: 90 },
    { id: "25008", nisn: "008514155", nama: "Rafi Akbar Setiawan", kelas: "XI RPL 1", progres: ["E404", "E429", "E500"], waktu: "23:07", skor: 82 },
    { id: "25009", nisn: "008515011", nama: "Alya Zahra Nurfitria", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "18:20", skor: 94 },
    { id: "25010", nisn: "008515088", nama: "Hafiz Ardiansyah", kelas: "XI RPL 1", progres: ["E401", "E404"], waktu: "31:45", skor: 68 },
    { id: "25011", nisn: "008515120", nama: "Zaky Maulana Yusuf", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "22:14", skor: 85 },
    { id: "25012", nisn: "008516033", nama: "Keisha Anindita Rahayu", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "19:49", skor: 89 },
    { id: "25013", nisn: "008516077", nama: "Reyhan Dafa Prakoso", kelas: "XI RPL 1", progres: ["E429", "E500"], waktu: "26:02", skor: 78 },
    { id: "25014", nisn: "008516144", nama: "Salma Aulia Rahman", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "20:55", skor: 83 },
    { id: "25015", nisn: "008517005", nama: "Farhan Adnan Maulana", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "25:31", skor: 80 },
    { id: "25016", nisn: "008517099", nama: "Tiara Salsabila Fitri", kelas: "XI RPL 1", progres: ["E401", "E404", "E429", "E500"], waktu: "21:40", skor: 85 },
    { id: "25017", nisn: "008521012", nama: "Gilang Saputra Ramadan", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "18:55", skor: 86 },
    { id: "25018", nisn: "008521087", nama: "Bilqis Anindya Kamila", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "17:26", skor: 91 },
    { id: "25019", nisn: "008522004", nama: "Rafaell Alfarizi Nugroho", kelas: "XI RPL 2", progres: ["E401", "E404", "E429"], waktu: "29:18", skor: 78 },
    { id: "25020", nisn: "008522066", nama: "Callista Dewi Anggraini", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "19:34", skor: 93 },
    { id: "25021", nisn: "008523015", nama: "Naufal Abizar Hakim", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "22:08", skor: 84 },
    { id: "25022", nisn: "008523090", nama: "Anisa Fitri Rahmawati", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "20:37", skor: 87 },
    { id: "25023", nisn: "008524008", nama: "Dwiki Cahya Nugraha", kelas: "XI RPL 2", progres: ["E404", "E500"], waktu: "30:12", skor: 72 },
    { id: "25024", nisn: "008524055", nama: "Kayla Syafa Ramadhani", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "18:09", skor: 95 },
    { id: "25025", nisn: "008525019", nama: "Arka Deva Mahendra", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "23:44", skor: 81 },
    { id: "25026", nisn: "008525071", nama: "Chelsea Mikayla Putri", kelas: "XI RPL 2", progres: ["E401", "E429", "E500"], waktu: "26:50", skor: 78 },
    { id: "25027", nisn: "008526002", nama: "Fahri Yusuf Alfarizi", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "21:27", skor: 85 },
    { id: "25028", nisn: "008526048", nama: "Karina Amelia Wijaya", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "19:16", skor: 90 },
    { id: "25029", nisn: "008527013", nama: "Cakra Bangga Pamungkas", kelas: "XI RPL 2", progres: ["E401", "E404"], waktu: "32:05", skor: 65 },
    { id: "25030", nisn: "008527080", nama: "Syifa Nadia Alawiyah", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "20:03", skor: 89 },
    { id: "25031", nisn: "008528006", nama: "Raditya Dika Prasetya", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "25:58", skor: 80 },
    { id: "25032", nisn: "008528052", nama: "Mahira Zaskia Ardila", kelas: "XI RPL 2", progres: ["E401", "E404", "E429", "E500"], waktu: "21:05", skor: 85 },
  ],

  /* ================= VALIDASI KELAYAKAN (Tabel 3.4) ================= */
  VALIDATION: {
    blackbox: { label: "Uji Fungsional Black-Box", nilai: "100% Lulus (9/9 Fitur Berfungsi Normal)" },
    materi: { label: "Validasi Ahli Materi (Guru Produktif RPL)", nilai: "92.5%", kategori: "Sangat Layak" },
    media: { label: "Validasi Ahli Media Pembelajaran", nilai: "90.0%", kategori: "Sangat Layak" },
  },
};

if (typeof window !== "undefined") window.SIRKUIT_CONFIG = SIRKUIT_CONFIG;
