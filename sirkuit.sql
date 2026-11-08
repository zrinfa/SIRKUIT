-- ============================================================================
-- SIRKUIT - Simulasi Interaktif Rangkaian Kueri dan Uji Integrasi Terpadu
-- Media Pembelajaran PHP 8.2 + MySQL/MariaDB - RPL/PPLG SMKN 1 Mejayan
-- Penyusun: Fazrin Mauza Dwi Zuhudi (NIM 24050974090), PTI FT UNESA
--
-- Berkas ini berisi dua bagian yang diimpor ke dua database berbeda:
--
--   BAGIAN 1  database aplikasi   : akun, tugas, kuis, log, bank latihan
--   BAGIAN 2  database ruang latihan : siswa, nilai_ukk, jurnal_pkl, proyek,
--                                   prakerin, sesi_login (materi ajar)
--
-- Pisahkan keduanya karena user MySQL yang dipakai Lab Uji hanya boleh
-- menyentuh tabel materi ajar. Dengan begitu kode PHP atau SQL siswa tidak
-- dapat membaca tabel users maupun task_submissions, sekalipun kredensialnya
-- terbaca. Di cPanel: Databases > MySQL Databases, buat dua database, buat
-- dua user, lalu impor tiap bagian pada database yang sesuai. Cara paling
-- mudah: buka https://domain-sekolah-anda/install.php setelah semua berkas
-- terunggah; halaman itu membaca berkas ini, memisahkan kedua bagian, dan
-- menjalankannya ke database yang dipilihkan guru.
--
-- Berkas ini sengaja tidak memakai CREATE DATABASE / USE supaya bisa diimpor
-- ke nama database apa pun yang dibuat panel hosting.
-- ============================================================================

-- ============================================================================
-- SIRKUIT BAGIAN 1 dari 2 - DATABASE APLIKASI
-- ============================================================================
-- Impor bagian ini ke database aplikasi (misal namauser_sirkuit).
-- Isi bagian ini berisi akun, tugas, kuis, log, dan daftar latihan.
-- Tidak ada materi ajar di sini, jadi salinannya tidak bocor ke ruang latihan siswa.
--
-- Jalankan lewat phpMyAdmin (pilih database tujuan lebih dulu, lalu Import)
-- atau:  mysql -u PEMAKAI -p NAMA_DB < bagian-ini.sql
--
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================ 1. AUTENTIKASI ==============================
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nisn_nip VARCHAR(20) NOT NULL,
  nama VARCHAR(120) NOT NULL,
  email VARCHAR(150) NULL,
  peran ENUM('siswa','guru') NOT NULL DEFAULT 'siswa',
  kelas VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_nisn_nip (nisn_nip),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_peran (peran, kelas)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================= 3. PBL DAN SIMULASI ============================
CREATE TABLE IF NOT EXISTS pbl_scenarios (
  kode VARCHAR(8) NOT NULL,
  judul VARCHAR(200) NOT NULL,
  expected_status SMALLINT NOT NULL,
  fault_node VARCHAR(20) NOT NULL,
  metode VARCHAR(10) NOT NULL,
  endpoint VARCHAR(160) NOT NULL,
  gejala TEXT NOT NULL,
  konteks TEXT NOT NULL,
  temuan TEXT NOT NULL,
  refleksi TEXT NOT NULL,
  metrik JSON NULL,
  urutan TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pbl_solutions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kode VARCHAR(8) NOT NULL,
  opsi CHAR(1) NOT NULL,
  teks TEXT NOT NULL,
  benar TINYINT(1) NOT NULL DEFAULT 0,
  urutan TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_solutions (kode, opsi),
  CONSTRAINT fk_solution_skenario FOREIGN KEY (kode) REFERENCES pbl_scenarios (kode) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pbl_simulation_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  student_name VARCHAR(120) NOT NULL,
  kelas VARCHAR(20) NOT NULL,
  scenario_code VARCHAR(8) NOT NULL,
  http_method VARCHAR(10) NOT NULL,
  status_code SMALLINT NOT NULL,
  is_resolved TINYINT(1) NOT NULL DEFAULT 0,
  selected_solution CHAR(1) NULL,
  latency_ms INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pbllog_siswa (student_name, kelas),
  KEY idx_pbllog_waktu (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================== 4. LAB UJI ===================================
CREATE TABLE IF NOT EXISTS lab_exercises (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  bahasa ENUM('php','js','sql') NOT NULL,
  mode VARCHAR(8) NOT NULL DEFAULT 'NORMAL',
  judul VARCHAR(200) NOT NULL,
  tujuan TEXT NOT NULL,
  petunjuk TEXT NOT NULL,
  kerangka MEDIUMTEXT NOT NULL,
  solusi MEDIUMTEXT NULL,
  cek JSON NOT NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  dibuat_oleh INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lab_bahasa (bahasa, aktif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  exercise_id INT UNSIGNED NULL,
  bahasa ENUM('php','js','sql') NOT NULL,
  kode MEDIUMTEXT NOT NULL,
  output MEDIUMTEXT NULL,
  jejak JSON NULL,
  lulus TINYINT(1) NOT NULL DEFAULT 0,
  eksekusi ENUM('server','browser') NOT NULL DEFAULT 'server',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_runs_user (user_id, created_at),
  CONSTRAINT fk_runs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================== 5. TUGAS =====================================
CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  guru_id INT UNSIGNED NOT NULL,
  judul VARCHAR(200) NOT NULL,
  instruksi TEXT NOT NULL,
  bahasa ENUM('php','js','sql') NOT NULL DEFAULT 'php',
  kelas VARCHAR(20) NOT NULL,
  exercise_id INT UNSIGNED NULL,
  tenggat DATETIME NULL,
  bobot TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('aktif','arsip') NOT NULL DEFAULT 'aktif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_kelas (kelas, status),
  CONSTRAINT fk_tasks_guru FOREIGN KEY (guru_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_exercise FOREIGN KEY (exercise_id) REFERENCES lab_exercises (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jawaban siswa: kode, keluaran, dan grid hasil disimpan sebagai bukti kerja,
-- sehingga tidak perlu screenshot dan tidak ada berkas yang diunggah.
CREATE TABLE IF NOT EXISTS task_submissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id INT UNSIGNED NOT NULL,
  siswa_id INT UNSIGNED NOT NULL,
  kode MEDIUMTEXT NOT NULL,
  output MEDIUMTEXT NULL,
  hasil_grid JSON NULL,
  jejak JSON NULL,
  status_http SMALLINT NULL,
  lulus TINYINT(1) NOT NULL DEFAULT 0,
  nilai SMALLINT NULL,
  catatan_guru TEXT NULL,
  dikirim_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dinilai_pada DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_submission (task_id, siswa_id),
  KEY idx_submission_siswa (siswa_id, dikirim_at),
  CONSTRAINT fk_submission_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_siswa FOREIGN KEY (siswa_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================= 6. KUIS, LOG, KONFIGURASI ========================
-- Bank soal kuis. Kunci jawaban disimpan di server: peramban hanya menerima
-- soal tanpa kunci lewat api/quiz.php, jadi jawaban tidak bisa dibaca dari bundel JS.
CREATE TABLE IF NOT EXISTS quiz_questions (
  id SMALLINT UNSIGNED NOT NULL,
  topik VARCHAR(120) NOT NULL,
  soal TEXT NOT NULL,
  opsi JSON NOT NULL,
  kunci TINYINT UNSIGNED NOT NULL,
  pembahasan TEXT NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  student_name VARCHAR(120) NOT NULL,
  kelas VARCHAR(20) NOT NULL,
  skor SMALLINT NOT NULL,
  benar TINYINT UNSIGNED NOT NULL,
  total TINYINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quiz_siswa (student_name, kelas),
  KEY idx_quiz_waktu (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama VARCHAR(120) NOT NULL,
  kelas VARCHAR(20) NULL,
  peran ENUM('siswa','guru','sistem') NOT NULL DEFAULT 'siswa',
  aktivitas TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_waktu (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  kunci VARCHAR(40) NOT NULL,
  nilai VARCHAR(200) NOT NULL,
  keterangan VARCHAR(200) NULL,
  PRIMARY KEY (kunci)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bucket token-bucket nyata untuk menjelaskan 429: server benar-benar menolak
-- saat siswa mengirim request identik melebihi kuota per menit.
CREATE TABLE IF NOT EXISTS rate_buckets (
  bucket_key VARCHAR(120) NOT NULL,
  jumlah INT UNSIGNED NOT NULL DEFAULT 1,
  window_mulai DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bucket_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================= DATA SEED =================================
-- Akun demo: siswa 008492104 / 'sirkuit2027', guru 198705122015071002 / 'guru123'.
INSERT INTO users (nisn_nip, nama, email, peran, kelas, password_hash) VALUES
  ('008492104', 'Fazrin Mauza Dwi Zuhudi', 'fazrin.mauza@siswa.smkn1mejayan.sch.id', 'siswa', 'XI RPL 1', '$2y$12$51DFgIrvgL0l8NIT9TQhtu87CNZ3bbteWXmFjAmpVaPWwecQLw1j6'),
  ('198705122015071002', 'Bpk. Hendra Kusuma, S.Kom.', 'hendra.kusuma@smkn1mejayan.sch.id', 'guru', NULL, '$2y$12$XC73WsXEaiTxHywWmXBFVesZo6wUFcaqNSn.rpcbU8XRxWyVq3OMC');

INSERT INTO pbl_scenarios (kode, judul, expected_status, fault_node, metode, endpoint, gejala, konteks, temuan, refleksi, metrik) VALUES
  ('E401', 'Kasus 1 - Error 401 Unauthorized: Session Login PHP Belum Valid', 401, 'gateway', 'GET', '/api/nilai-siswa.php', 'Halaman rapor siswa memanggil GET /api/nilai-siswa.php tetapi ditolak Apache dengan status 401. Halaman kosong dan muncul notifikasi ''Sesi berakhir, silakan login kembali''.', 'Senin 07.45 WIB - Laboratorium RPL 2. Siswa XI RPL 1 membuka dashboard rapor digital buatan mereka sendiri (PHP + MySQL di XAMPP) setelah rilis v2.3. Sebagian akun berhasil masuk, beberapa lainnya menerima error 401 saat memuat nilai.', 'Pada Request Header, properti Authorization berisi "Bearer token_expired_null" sehingga cek session di awal skrip PHP (session_start + pencocokan token pada tabel session) gagal. Rute dan tabel database normal, jadi masalah ada pada kredensial sesi, bukan pada .htaccess atau MySQL.', 'Error 401 adalah kegagalan lapisan autentikasi, bukan jaringan atau storage. Token yang kedaluwarsa atau bernilai null ditolak ketika skrip PHP mencocokkan token dengan tabel session sebelum kueri dijalankan. Perbaikan standar: ambil token baru lewat login/refresh, kirim pada header Authorization, dan biarkan validasi session AKTIF. Data tidak pernah menyentuh MySQL karena request berhenti di gerbang autentikasi.', '{"gateway":{"cpu":62},"backend":{"cpu":48,"latency":26}}'),
  ('E404', 'Kasus 2 - Error 404 Not Found: Rute .htaccess Tidak Cocok', 404, 'gateway', 'POST', '/api/profil_prakerin_lama.php', 'Siswa mengirim pembaruan profil prakerin melalui POST /api/profil_prakerin_lama.php, namun paket terhenti di Apache Web Server dengan status 404 Not Found. Form prakerin tidak pernah tersimpan.', 'Masa pengisian logbook Prakerin XI RPL 2. Setelah rute API dirapikan memakai RewriteRule di .htaccess, sebagian halaman klien masih memanggil nama file skrip versi lama yang sudah dihapus dari folder api/.', 'Pada 3D Node Hotspot Inspector (Web Server Apache), daftar RewriteRule yang terdaftar adalah ^api/([a-z-]+)$ api/$1.php dengan skrip /api/prakerin-siswa.php, sedangkan /api/profil_prakerin_lama.php tidak ada. Apache mengembalikan 404 sebelum skrip PHP dijalankan.', '404 Not Found berarti resource tidak dikenali di sisi server, bukan masalah kapasitas storage atau protokol transfer. REST API bersifat resource-based: path adalah bagian dari kontrak API. Solusinya menyelaraskan action form / fetch() klien dengan RewriteRule Apache (/api/prakerin-siswa.php). Paket berhenti tepat di Web Server, bukti kegagalan terjadi sebelum logika PHP berjalan.', '{"gateway":{"cpu":38}}'),
  ('E429', 'Kasus 3 - Error 429 Too Many Requests: Lonjakan Trafik dan Rate Limit', 429, 'gateway', 'GET', '/api/nilai-ukk.php', 'Saat pengumuman hasil UKK RPL serentak, ratusan request GET /api/nilai-ukk.php membanjiri Apache dalam 1 detik. Beban web server melonjak ke 98% CPU, antrean paket menumpuk di pipa 3D, dan sistem mengembalikan 429 Too Many Requests (Rate Limit Exceeded).', 'Hari pengumuman hasil Uji Kompetensi Keahlian (UKK). 32 siswa dan alumni membuka halaman hasil pada menit yang sama tanpa cache output, sehingga seluruh request menghantam batas rate limit Apache.', 'Header respons menunjukkan Retry-After: 60 dan X-RateLimit-Remaining: 0, sedangkan Cache-Control output pada Web Server masih DISABLED. Payload nilai-ukk juga dikirim penuh (tanpa LIMIT/OFFSET).', '429 adalah sinyal overload yang dilindungi kebijakan rate limiting, jadi solusinya mengurangi request yang mencapai sumber daya, bukan menghapus sumber dayanya. Cache output TTL 60s mengubah ratusan permintaan identik menjadi satu kueri MySQL sementara sisanya dijawab Apache (latency turun dari 1240 ms ke 38 ms). Token Bucket meratakan lonjakan trafik dan pagination memperkecil payload. Menghapus tabel atau mematikan autentikasi justru merusak integritas dan keamanan data.', '{"gateway":{"cpu":98,"ram":1880,"koneksi":640,"latency":1240}}'),
  ('E500', 'Kasus 4 - Error 500 Internal Server Error: Kueri Salah Kolom dan Koneksi Penuh', 500, 'database', 'POST', '/api/jurnal-pkl.php', 'Paket POST /api/jurnal-pkl.php berhasil melewati Apache dan skrip PHP, tetapi gagal ketika kueri INSERT dijalankan ke MySQL dengan status 500 Internal Server Error (Unknown Column & Too Many Connections).', 'Siswa XI RPL 1 mengunggah jurnal PKL harian bersamaan dengan dibukanya dashboard guru. Setiap request membuka koneksi mysqli baru sehingga melampaui max_connections, dan INSERT memakai nama kolom yang tidak ada pada skema.', 'Pada Node Inspector (Database MySQL) terlihat koneksi langsung (mysqli tanpa persistent) melampaui batas maksimum (max_connections = 20) dan kueri SQL memanggil kolom tgl_input, padahal skema memakai created_at.', '500 Internal Server Error menandakan kegagalan di sisi server, dan di sini ada dua penyebab sekaligus: koneksi penuh (setiap request membuka koneksi baru hingga melewati max_connections, error MySQL 1040 Too many connections) dan rujukan kolom tidak sah (kueri menulis tgl_input, skema memakai created_at, error 1054 Unknown column). PDO dengan ATTR_PERSISTENT memakai ulang koneksi yang sudah ada sehingga antrian koneksi singkat tidak membebani MySQL, dan perbaikan nama kolom membuat INSERT sah terhadap skema. Mengubah CSS atau memblokir IP tidak menyentuh akar masalah.', '{"database":{"cpu":96,"koneksi":19,"latency":1240},"backend":{"cpu":81,"latency":1240}}');

INSERT INTO pbl_solutions (kode, opsi, teks, benar, urutan) VALUES
  ('E401', 'a', 'Mengubah metode HTTP dari GET menjadi DELETE tanpa mengubah header.', 0, 1),
  ('E401', 'b', 'Mengirim ulang Authorization: Bearer <token_sesi_valid> hasil login PHP dan memastikan validasi session di skrip tetap AKTIF.', 1, 2),
  ('E401', 'c', 'Menghapus indeks tabel siswa pada database MySQL.', 0, 3),
  ('E404', 'a', 'Menyelaraskan URL pada form client dengan rute yang terdaftar di .htaccess, yaitu /api/prakerin-siswa.php.', 1, 1),
  ('E404', 'b', 'Menaikkan kapasitas penyimpanan harddisk pada laptop Client.', 0, 2),
  ('E404', 'c', 'Mematikan protokol HTTPS menjadi FTP biasa.', 0, 3),
  ('E429', 'a', 'Menghapus seluruh tabel database agar ukuran respons menjadi 0 byte.', 0, 1),
  ('E429', 'b', 'Meminta semua siswa mematikan autentikasi session.', 0, 2),
  ('E429', 'c', 'Mengaktifkan cache output (Cache-Control TTL 60s), kebijakan Token Bucket pada mod_qos, dan pagination LIMIT/OFFSET pada kueri.', 1, 3),
  ('E500', 'a', 'Memakai PDO dengan persistent connection, menaikkan max_connections, dan memperbaiki kueri ke kolom created_at.', 1, 1),
  ('E500', 'b', 'Mengganti warna tampilan antarmuka CSS di browser Client.', 0, 2),
  ('E500', 'c', 'Memblokir alamat IP milik server di firewall.', 0, 3);

-- 12 soal kuis HOTS. Opsi disimpan sebagai JSON dan kunci tidak pernah dikirim ke peramban.
INSERT INTO quiz_questions (id, topik, soal, opsi, kunci, pembahasan) VALUES
  (1, 'Letak error pada topologi (PBL)', 'Pada simulasi 3D, paket data [GET] /api/nilai-siswa.php bergerak dari Client, namun pecah menjadi partikel merah tepat di node WEB SERVER dengan badge 401 Unauthorized. Komponen mana yang PALING TEPAT diselidiki pertama kali?', '["DATABASE MySQL - karena data nilai disimpan pada tabel nilai_ukk.","CLIENT dan BACKEND PHP (lapisan autentikasi sesi) - karena 401 adalah kegagalan validasi token, bukan kegagalan penyimpanan data.","RewriteRule pada .htaccess - karena path endpoint pasti salah ketik.","Jaringan LAN laboratorium - karena bandwidth tidak cukup."]', 1, 'Status 401 Unauthorized dihasilkan saat verifikasi kredensial gagal. Pada arsitektur tiga tingkat, token sesi diperiksa oleh skrip PHP setelah Apache mencocokkan rute. Jika penyebabnya routing, status yang muncul adalah 404, bukan 401. MySQL tidak pernah tersentuh karena request berhenti sebelum kueri PDO dieksekusi.'),
  (2, 'Analisis HTTP Header', 'Perhatikan Request Header berikut: { "Authorization": "Bearer token_expired_null", "Cookie": "PHPSESSID=" }. Apa penyebab paling logis permintaan ditolak?', '["Header Accept tidak mendukung format JSON.","Metode HTTP tidak tercantum pada header.","Token sesi kosong atau kedaluwarsa sehingga server tidak dapat mengenali identitas pengguna.","Header Authorization seharusnya berisi password plaintext siswa."]', 2, 'Nilai token_expired_null dan cookie PHPSESSID yang kosong menandakan sesi tidak aktif. Skrip PHP memanggil session_start() lalu mencocokkan token dengan baris pada tabel sesi; jika tidak cocok, request ditolak 401 dan klien harus login ulang. Accept: application/json justru benar, dan metode HTTP dibawa pada request line, bukan pada header.'),
  (3, 'Kode status HTTP', 'Client mengirim POST /api/profil_prakerin_lama.php dan menerima 404 Not Found. Tindakan perbaikan yang paling tepat secara arsitektur REST API adalah…', '["Menambah kapasitas RAM laptop client agar request tidak gagal.","Mengubah metode POST menjadi GET agar paket lebih kecil.","Mengaktifkan Cache-Control max-age=60 pada Apache.","Menyelaraskan path endpoint pada klien dengan RewriteRule .htaccess sehingga memanggil /api/prakerin-siswa.php."]', 3, '404 Not Found berarti file atau rute yang diminta tidak dikenali server. Dalam REST, path adalah kontrak API: klien dan .htaccess harus memakai rute yang sama. Cache (opsi C) hanya mengurangi beban, dan mengubah metode (opsi B) tidak menyelesaikan ketidakcocokan rute.'),
  (4, 'Rate limiting dan bottleneck', 'Respons API berisi header: Retry-After: 60, X-RateLimit-Limit: 60, X-RateLimit-Remaining: 0. Kesimpulan yang benar adalah…', '["Server menolak request karena token sesi tidak valid.","Klien melebihi kuota 60 request per menit dan harus menunggu 60 detik sebelum mencoba lagi (429 Too Many Requests).","Database MySQL mengalami error 1040 Too many connections.","Apache tidak menemukan file PHP pada document root."]', 1, 'Kombinasi header X-RateLimit-* dan Retry-After adalah ciri khas kebijakan rate limiting (HTTP 429). Klien kehabisan kuota dalam jendela waktu dan diberi tahu kapan boleh mengirim ulang. Ini berbeda dengan 401 (token), 500 atau 1040 (kegagalan server/database), serta 404 (rute tidak ada).'),
  (5, 'Optimasi beban (429)', 'Saat pengumuman hasil UKK serentak, Apache mencapai CPU 98% dan mengembalikan 429 karena Cache-Control masih DISABLED. Solusi arsitektural PALING tepat adalah…', '["Menghapus seluruh tabel database agar ukuran respons menjadi 0 byte.","Memerintahkan seluruh siswa mematikan autentikasi sesi.","Mengaktifkan cache output TTL 60 detik, kebijakan Token Bucket pada mod_qos, dan pagination LIMIT/OFFSET.","Memperbesar kapasitas GPU pada komputer client siswa."]', 2, 'Cache-Control max-age=60 menjawab lonjakan request identik dari cache Apache, sehingga beban PHP dan MySQL turun drastis dan latency membaik (1240 ms menjadi 38 ms). Token Bucket meratakan trafik dan LIMIT/OFFSET memperkecil payload. Menghapus tabel merusak data; mematikan autentikasi merusak keamanan.'),
  (6, 'Error 500 dan MySQL', 'Paket POST /api/jurnal-pkl.php lolos Apache, lolos validasi sesi PHP, lalu gagal dengan 500 Internal Server Error. SQL trace menunjukkan: INSERT INTO jurnal_pkl (siswa_id, isi, tgl_input) VALUES (...). Apa akar masalahnya?', '["Kolom tgl_input tidak ada pada skema (seharusnya created_at DATETIME, error 1054) dan setiap request membuka koneksi baru hingga melewati max_connections (error 1040).","Token sesi siswa belum disalin ke header request.","RewriteRule belum memuat endpoint /api/jurnal-pkl.php.","Browser client tidak mendukung WebGL 2.0."]', 0, 'Karena request sudah melewati Apache dan validasi PHP (buktinya paket berhenti dekat node database), penyebabnya kegagalan eksekusi kueri: rujukan kolom tidak sah (tgl_input versus created_at) dan koneksi penuh. PDO dengan ATTR_PERSISTENT memakai ulang koneksi sehingga batas max_connections tidak terlampaui.'),
  (7, 'Fungsi komponen arsitektur', 'Dalam arsitektur web tiga tingkat, manakah pembagian peran yang BENAR?', '["Client menyimpan logika bisnis; PHP hanya meneruskan request ke database.","Apache memverifikasi sesi dan menjalankan logika bisnis; client mengatur indeks tabel.","Client mengirim request dan menampilkan response; Apache merutekan serta menyaring trafik; PHP mengeksekusi logika bisnis dan validasi sesi; MySQL menyimpan data dengan indeks serta hak akses GRANT.","MySQL bertugas melakukan autentikasi pengguna dan merender antarmuka WebGL."]', 2, 'Pemisahan tanggung jawab adalah fondasi arsitektur bertingkat: presentation (browser), edge dan routing (Apache), business logic serta authorization (PHP), persistence (MySQL). Opsi lain menukar-nukar peran antar lapisan.'),
  (8, 'Analisis JSON payload', 'Response berikut diterima client: { "status": "error", "code": 500, "message": "Too many connections", "error_details": { "max_connections": 20, "koneksi_aktif": 21 } }. Interpretasi yang paling tepat adalah…', '["Kirim ulang request yang sama terus-menerus sampai berhasil.","Server menolak karena payload JSON terlalu besar; kecil saja ukurannya.","Jumlah koneksi aktif ke MySQL (21) melebihi batas (20), jadi yang dibutuhkan adalah koneksi persisten atau pooling, bukan retry tanpa jeda.","Client harus mengganti Authorization header dengan password guru."]', 2, 'error_details.koneksi_aktif (21) lebih besar dari max_connections (20) adalah diagnosis langsung koneksi penuh (error 1040). Retry tanpa jeda justru memperparah antrean. Solusinya PDO ATTR_PERSISTENT atau connection pool di sisi MySQL, menaikkan max_connections, dan memperbaiki kueri.'),
  (9, 'Metode HTTP dan semantik REST', 'Guru akan memperbarui nilai UKK siswa Arini (id 107) dari 72 menjadi 88. Metode HTTP plus endpoint yang PALING sesuai semantik REST adalah…', '["GET /api/nilai-ukk.php?nilai=88","PUT /api/nilai-ukk.php (body JSON: { \\"siswa_id\\": 107, \\"nilai\\": 88 })","DELETE /api/nilai-ukk.php/107","POST /api/nilai-ukk.php/baru-hapus-yang-lama"]', 1, 'PUT berarti memperbarui resource yang identitasnya sudah diketahui dan bersifat idempoten; skrip PHP membaca $_SERVER[''REQUEST_METHOD''] = ''PUT'' lalu menjalankan UPDATE dengan WHERE. GET untuk membaca, POST untuk membuat resource baru, DELETE untuk menghapus. Simulasi 3D menandai paket PUT dengan warna oranye.'),
  (10, 'Evaluasi proses PBL', 'Setelah memilih solusi, kanvas 3D berubah menjadi 200 OK dengan latency 38 ms. Langkah sintaks PBL (Arends) yang PALING tepat dilakukan siswa berikutnya adalah…', '["Langsung menutup aplikasi karena masalah sudah selesai.","Mengulang semua skenario dari Tahap 1 dengan solusi yang salah.","Menganalisis dan mengevaluasi proses pemecahan: mencatat mengapa konfigurasi terpilih memperbaiki aliran paket, lalu memverifikasi dengan mengirim request ulang.","Menghapus klausa WHERE pada kueri UPDATE agar nilai semua kelas terlihat."]', 2, 'Tahap 5 sintaks PBL adalah menganalisis dan mengevaluasi proses pemecahan masalah. Refleksi teknis (misalnya cache menurunkan CPU 98% menjadi 24% dan latency 1240 ms menjadi 38 ms) mengonsolidasikan transfer belajar ke kasus baru. Menghapus WHERE pada UPDATE adalah kesalahan yang merusak seluruh baris data.'),
  (11, 'Pemrosesan form PHP (GET, POST, dan validasi)', 'Sebuah form login memakai method="POST" dan skrip api/auth.php membaca $user = $_POST[''username'']; $pass = $_POST[''password''];. Siswa lain mengirim username bertuliskan <script>alert(1)</script> dan teks itu muncul apa adanya di halaman hasil. Tindakan paling tepat adalah…', '["Mengubah method POST menjadi GET agar datanya tidak dikirim melalui body.","Menyaring keluaran dengan htmlspecialchars() saat menampilkan dan memvalidasi masukan dengan isset() serta preg_match() sebelum diproses.","Memperkecil kolom VARCHAR tabel MySQL agar input panjang ditolak.","Menonaktifkan session_start() supaya cookie tidak ikut terkirim."]', 1, 'Teks yang muncul apa adanya adalah celah cross-site scripting. PHP menampilkan data dari $_POST, jadi keluaran wajib di-escape dengan htmlspecialchars() dan masukan divalidasi lebih dulu. GET justru menampilkan data di address bar (paling tidak tepat untuk password), kolom VARCHAR tidak berhubungan, dan sesi tetap diperlukan.'),
  (12, 'PDO prepared statement dan SQL injection', 'Terdapat dua skrip PHP. Skrip A: $sql = "SELECT * FROM siswa WHERE id = ''" . $_GET[''id''] . "''"; $pdo->query($sql). Skrip B: $stmt = $pdo->prepare("SELECT * FROM siswa WHERE id = ?"); $stmt->execute([$_GET[''id'']]). Analisis yang BENAR adalah…', '["Skrip A lebih aman karena tanda kutip mencegah perintah SQL tambahan.","Skrip B rawan error karena placeholder ? belum diisi nilainya.","Keduanya setara keamanannya selama memakai PDO, bukan mysqli.","Skrip A rawan SQL injection karena input user dirangkai langsung ke string kueri, sedangkan skrip B memisahkan kueri dan data lewat binding parameter."]', 3, 'Pengisian value: '' OR ''1''=''1 membuat kueri skrip A berubah makna dan seluruh baris terkuras. Prepared statement memisahkan rencana kueri dari parameter, sehingga nilai hanya diperlakukan sebagai data, sekaligus dapat memakai ulang rencana kueri. Driver (PDO atau mysqli) tidak otomatis membuat perangkaian string menjadi aman.');



-- Progres penyelesaian 4 skenario per siswa (sumber KPI dashboard guru).
INSERT INTO pbl_simulation_logs (user_id, student_name, kelas, scenario_code, http_method, status_code, is_resolved, selected_solution, latency_ms) VALUES
  (NULL, 'Fazrin Mauza Dwi Zuhudi', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 41),
  (NULL, 'Fazrin Mauza Dwi Zuhudi', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 41),
  (NULL, 'Fazrin Mauza Dwi Zuhudi', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 41),
  (NULL, 'Fazrin Mauza Dwi Zuhudi', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 41),
  (NULL, 'Ahmad Rizky Fauzi', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 55),
  (NULL, 'Ahmad Rizky Fauzi', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 55),
  (NULL, 'Ahmad Rizky Fauzi', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 55),
  (NULL, 'Ahmad Rizky Fauzi', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 55),
  (NULL, 'Nabila Putri Ramadhani', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 40),
  (NULL, 'Nabila Putri Ramadhani', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 40),
  (NULL, 'Nabila Putri Ramadhani', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 40),
  (NULL, 'Nabila Putri Ramadhani', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 40),
  (NULL, 'Dimas Aditya Pratama', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 38),
  (NULL, 'Dimas Aditya Pratama', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 38),
  (NULL, 'Dimas Aditya Pratama', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 38),
  (NULL, 'Siti Nurhaliza Wijayanti', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 42),
  (NULL, 'Siti Nurhaliza Wijayanti', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 42),
  (NULL, 'Siti Nurhaliza Wijayanti', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 42),
  (NULL, 'Siti Nurhaliza Wijayanti', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 42),
  (NULL, 'Bagus Panuntun Wicaksono', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 42),
  (NULL, 'Bagus Panuntun Wicaksono', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 42),
  (NULL, 'Intan Permata Sari', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 56),
  (NULL, 'Intan Permata Sari', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 56),
  (NULL, 'Intan Permata Sari', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 56),
  (NULL, 'Intan Permata Sari', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 56),
  (NULL, 'Rafi Akbar Setiawan', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 57),
  (NULL, 'Rafi Akbar Setiawan', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 57),
  (NULL, 'Rafi Akbar Setiawan', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 57),
  (NULL, 'Alya Zahra Nurfitria', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 38),
  (NULL, 'Alya Zahra Nurfitria', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 38),
  (NULL, 'Alya Zahra Nurfitria', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 38),
  (NULL, 'Alya Zahra Nurfitria', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 38),
  (NULL, 'Hafiz Ardiansyah', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 54),
  (NULL, 'Hafiz Ardiansyah', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 54),
  (NULL, 'Zaky Maulana Yusuf', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 56),
  (NULL, 'Zaky Maulana Yusuf', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 56),
  (NULL, 'Zaky Maulana Yusuf', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 56),
  (NULL, 'Zaky Maulana Yusuf', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 56),
  (NULL, 'Keisha Anindita Rahayu', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 40),
  (NULL, 'Keisha Anindita Rahayu', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 40),
  (NULL, 'Keisha Anindita Rahayu', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 40),
  (NULL, 'Keisha Anindita Rahayu', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 40),
  (NULL, 'Reyhan Dafa Prakoso', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 57),
  (NULL, 'Reyhan Dafa Prakoso', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 57),
  (NULL, 'Salma Aulia Rahman', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 56),
  (NULL, 'Salma Aulia Rahman', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 56),
  (NULL, 'Salma Aulia Rahman', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 56),
  (NULL, 'Salma Aulia Rahman', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 56),
  (NULL, 'Farhan Adnan Maulana', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 38),
  (NULL, 'Farhan Adnan Maulana', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 38),
  (NULL, 'Farhan Adnan Maulana', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 38),
  (NULL, 'Farhan Adnan Maulana', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 38),
  (NULL, 'Tiara Salsabila Fitri', 'XI RPL 1', 'E401', 'GET', 200, 1, 'b', 39),
  (NULL, 'Tiara Salsabila Fitri', 'XI RPL 1', 'E404', 'GET', 200, 1, 'b', 39),
  (NULL, 'Tiara Salsabila Fitri', 'XI RPL 1', 'E429', 'GET', 200, 1, 'b', 39),
  (NULL, 'Tiara Salsabila Fitri', 'XI RPL 1', 'E500', 'GET', 200, 1, 'b', 39),
  (NULL, 'Gilang Saputra Ramadan', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 40),
  (NULL, 'Gilang Saputra Ramadan', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 40),
  (NULL, 'Gilang Saputra Ramadan', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 40),
  (NULL, 'Gilang Saputra Ramadan', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 40),
  (NULL, 'Bilqis Anindya Kamila', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 39),
  (NULL, 'Bilqis Anindya Kamila', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 39),
  (NULL, 'Bilqis Anindya Kamila', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 39),
  (NULL, 'Bilqis Anindya Kamila', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 39),
  (NULL, 'Rafaell Alfarizi Nugroho', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 42),
  (NULL, 'Rafaell Alfarizi Nugroho', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 42),
  (NULL, 'Rafaell Alfarizi Nugroho', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 42),
  (NULL, 'Callista Dewi Anggraini', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 41),
  (NULL, 'Callista Dewi Anggraini', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 41),
  (NULL, 'Callista Dewi Anggraini', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 41),
  (NULL, 'Callista Dewi Anggraini', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 41),
  (NULL, 'Naufal Abizar Hakim', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 57),
  (NULL, 'Naufal Abizar Hakim', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 57),
  (NULL, 'Naufal Abizar Hakim', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 57),
  (NULL, 'Naufal Abizar Hakim', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 57),
  (NULL, 'Anisa Fitri Rahmawati', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 39),
  (NULL, 'Anisa Fitri Rahmawati', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 39),
  (NULL, 'Anisa Fitri Rahmawati', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 39),
  (NULL, 'Anisa Fitri Rahmawati', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 39),
  (NULL, 'Dwiki Cahya Nugraha', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 57),
  (NULL, 'Dwiki Cahya Nugraha', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 57),
  (NULL, 'Kayla Syafa Ramadhani', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 39),
  (NULL, 'Kayla Syafa Ramadhani', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 39),
  (NULL, 'Kayla Syafa Ramadhani', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 39),
  (NULL, 'Kayla Syafa Ramadhani', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 39),
  (NULL, 'Arka Deva Mahendra', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 56),
  (NULL, 'Arka Deva Mahendra', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 56),
  (NULL, 'Arka Deva Mahendra', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 56),
  (NULL, 'Arka Deva Mahendra', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 56),
  (NULL, 'Chelsea Mikayla Putri', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 39),
  (NULL, 'Chelsea Mikayla Putri', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 39),
  (NULL, 'Chelsea Mikayla Putri', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 39),
  (NULL, 'Fahri Yusuf Alfarizi', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 38),
  (NULL, 'Fahri Yusuf Alfarizi', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 38),
  (NULL, 'Fahri Yusuf Alfarizi', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 38),
  (NULL, 'Fahri Yusuf Alfarizi', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 38),
  (NULL, 'Karina Amelia Wijaya', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 38),
  (NULL, 'Karina Amelia Wijaya', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 38),
  (NULL, 'Karina Amelia Wijaya', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 38),
  (NULL, 'Karina Amelia Wijaya', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 38),
  (NULL, 'Cakra Bangga Pamungkas', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 40),
  (NULL, 'Cakra Bangga Pamungkas', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 40),
  (NULL, 'Syifa Nadia Alawiyah', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 38),
  (NULL, 'Syifa Nadia Alawiyah', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 38),
  (NULL, 'Syifa Nadia Alawiyah', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 38),
  (NULL, 'Syifa Nadia Alawiyah', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 38),
  (NULL, 'Raditya Dika Prasetya', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 39),
  (NULL, 'Raditya Dika Prasetya', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 39),
  (NULL, 'Raditya Dika Prasetya', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 39),
  (NULL, 'Raditya Dika Prasetya', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 39),
  (NULL, 'Mahira Zaskia Ardila', 'XI RPL 2', 'E401', 'GET', 200, 1, 'b', 38),
  (NULL, 'Mahira Zaskia Ardila', 'XI RPL 2', 'E404', 'GET', 200, 1, 'b', 38),
  (NULL, 'Mahira Zaskia Ardila', 'XI RPL 2', 'E429', 'GET', 200, 1, 'b', 38),
  (NULL, 'Mahira Zaskia Ardila', 'XI RPL 2', 'E500', 'GET', 200, 1, 'b', 38);

-- 9 latihan Lab Uji; kolom cek berisi aturan deklaratif penilai server.
INSERT INTO lab_exercises (bahasa, mode, judul, tujuan, petunjuk, kerangka, solusi, cek, aktif, dibuat_oleh) VALUES
  ('php', 'NORMAL', 'Respons JSON pertama dari skrip PHP', 'Membaca data sesi lewat superglobal <code>$_SESSION</code>, menyusun array asosiatif PHP, lalu mengirimnya ke browser dengan <code>json_encode()</code>.', 'Tag <code>&lt;?php</code> boleh ditulis atau tidak, ruang uji membersihkannya otomatis. Array asosiatif ditulis <code>["kunci" =&gt; nilai]</code>. Semua teks yang dicetak <code>echo</code> muncul pada panel Output Konsol, dan <code>header()</code> ditampilkan sebagai baris <i>Header yang dikirim PHP</i>.', '<?php
header("Content-Type: application/json");

$nama = $_SESSION[''nama''];
$data = [
    "status" => "ok",
    "nama_siswa" => $nama,
    "role" => $_SESSION[''role''],
    "diakses_lewat" => $_SERVER[''SERVER_SOFTWARE''],
];

// TODO: kirim $data ke klien sebagai JSON
echo "ganti baris ini";', '<?php
header("Content-Type: application/json");

$nama = $_SESSION[''nama''];
$data = [
    "status" => "ok",
    "nama_siswa" => $nama,
    "role" => $_SESSION[''role''],
    "diakses_lewat" => $_SERVER[''SERVER_SOFTWARE''],
];

echo json_encode($data);', '{"fail_if_fatal":true,"output_not":[{"re":"ganti baris ini","pesan":"Kerangka belum diubah. Ganti echo terakhir menjadi json_encode()."}],"output_all":[{"re":["\\"status\\"","\\"nama_siswa\\""],"pesan_lulus":"json_encode() mengubah array PHP menjadi objek JSON. Inilah yang dikirim skrip PHP ke browser.","pesan":"Output belum memuat kunci status dan nama_siswa. Cetak array $data dengan echo json_encode($data);"}]}', 1, 2),
  ('php', 'NORMAL', 'SELECT ke MySQL dengan PDO prepared statement', 'Menjalankan kueri MySQL dari PHP memakai <code>$pdo->prepare()</code> dan <code>$stmt->execute()</code>, lalu membaca hasilnya dengan <code>foreach</code>.', 'Placeholder <code>?</code> pada SQL harus diisi lewat array parameter, contoh <code>$stmt->execute([75])</code>. <code>fetchAll()</code> mengembalikan array of array, sehingga tiap baris dibaca sebagai <code>$row[''nama'']</code>.', '<?php
$pdo = new PDO("mysql:host=localhost;dbname=pkl_rpl;charset=utf8mb4", "root", "");
$sql = "SELECT nama, nilai FROM nilai_ukk WHERE nilai >= ? AND is_published = true ORDER BY nilai DESC";
$stmt = $pdo->prepare($sql);
$stmt->execute();  // TODO: kirim batas KKM 75 sebagai parameter

foreach ($stmt->fetchAll() as $row) {
    echo $row[''nama''] . " -> " . $row[''nilai''] . PHP_EOL;
}', '<?php
$pdo = new PDO("mysql:host=localhost;dbname=pkl_rpl;charset=utf8mb4", "root", "");
$sql = "SELECT nama, nilai FROM nilai_ukk WHERE nilai >= ? AND is_published = true ORDER BY nilai DESC";
$stmt = $pdo->prepare($sql);
$stmt->execute([75]);

foreach ($stmt->fetchAll() as $row) {
    echo $row[''nama''] . " -> " . $row[''nilai''] . PHP_EOL;
}', '{"fail_if_fatal":true,"no_failed_query":true,"query_all":[{"re":["where","order\\\\s+by","nilai\\\\s*>=\\\\s*75"],"pesan_lulus":"Prepared statement dengan binding parameter berjalan benar; placeholder ? terganti nilai 75.","pesan":"Isi parameter placeholder dengan $stmt->execute([75]); agar kueri memakai WHERE nilai >= 75 dan ORDER BY."}]}', 1, 2),
  ('php', 'NORMAL', 'Bereskan error MySQL 1054 Unknown column', 'Meniru penyebab error 500 pada simulasi 3D: PHP mengirim INSERT dengan kolom yang tidak ada pada skema, lalu memperbaikinya sambil menangkap exception.', 'Kolom sah <code>jurnal_pkl</code> adalah id, siswa_id, isi, hari, created_at. Ganti <code>tgl_input</code> menjadi <code>created_at</code>. Blok <code>try</code> dan <code>catch (Exception $e)</code> menahan kueri gagal agar tidak menjadi fatal error.', '<?php
$dsn = "mysql:host=localhost;dbname=pkl_rpl;charset=utf8mb4";
$pdo = new PDO($dsn, "root", "", [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

try {
    $stmt = $pdo->prepare("INSERT INTO jurnal_pkl (siswa_id, isi, tgl_input) VALUES (?, ?, NOW())");
    $stmt->execute(["25001", "Catatan harian dari Lab Uji PHP"]);
    echo "jurnal tersimpan\\n";
} catch (Exception $e) {
    echo "GAGAL: " . $e->getMessage() . "\\n";
}', '<?php
$dsn = "mysql:host=localhost;dbname=pkl_rpl;charset=utf8mb4";
$pdo = new PDO($dsn, "root", "", [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

try {
    $stmt = $pdo->prepare("INSERT INTO jurnal_pkl (siswa_id, isi, created_at) VALUES (?, ?, NOW())");
    $stmt->execute(["25001", "Catatan harian dari Lab Uji PHP"]);
    echo "jurnal tersimpan\\n";
} catch (Exception $e) {
    echo "GAGAL: " . $e->getMessage() . "\\n";
}', '{"fail_if_fatal":false,"no_failed_query":true,"query_any":[{"re":["insert\\\\s+into\\\\s+jurnal_pkl"],"pesan":"Belum ada INSERT ke jurnal_pkl yang berhasil."}],"output_any":[{"re":["jurnal tersimpan"],"pesan":"Pastikan blok try selesai hingga echo \\"jurnal tersimpan\\"."}],"pesan_lulus":"INSERT memakai created_at sehingga MySQL menerima record baru tanpa error 1054."}', 1, 2),
  ('php', 'E500', 'Atasi error 1040 Too many connections', 'Memahami batas <code>max_connections</code> MySQL ketika PHP membuka koneksi baru untuk tiap query, lalu mengatasinya dengan koneksi persisten.', 'Mode ini hanya menoleransi 2 kali tulis dengan koneksi biasa. Tambahkan opsi persisten saat membuat PDO: <code>new PDO($dsn, $user, $pass, [PDO::ATTR_PERSISTENT =&gt; true])</code>.', '<?php
$dsn = "mysql:host=localhost;dbname=pkl_rpl;charset=utf8mb4";
// TODO: tambahkan opsi koneksi persisten pada baris berikut
$pdo = new PDO($dsn, "root", "");

for ($i = 1; $i <= 4; $i++) {
    $stmt = $pdo->prepare("INSERT INTO jurnal_pkl (siswa_id, isi, created_at) VALUES (?, ?, NOW())");
    $stmt->execute(["25001", "Entri jurnal ke-" . $i]);
    echo "baris $i tersimpan\\n";
}', '<?php
$dsn = "mysql:host=localhost;dbname=pkl_rpl;charset=utf8mb4";
$pdo = new PDO($dsn, "root", "", [PDO::ATTR_PERSISTENT => true]);

for ($i = 1; $i <= 4; $i++) {
    $stmt = $pdo->prepare("INSERT INTO jurnal_pkl (siswa_id, isi, created_at) VALUES (?, ?, NOW())");
    $stmt->execute(["25001", "Entri jurnal ke-" . $i]);
    echo "baris $i tersimpan\\n";
}', '{"fail_if_fatal":false,"no_failed_query":true,"query_count":[{"re":"insert\\\\s+into\\\\s+jurnal_pkl","min":4,"pesan_lulus":"Empat INSERT lolos tanpa menambah koneksi baru karena pool persisten dipakai ulang.","pesan":"Keempat INSERT harus berhasil. Pakai new PDO($dsn, $user, $pass, [PDO::ATTR_PERSISTENT => true])."}]}', 1, 2),
  ('php', 'E401', 'Perbaiki 401 Unauthorized dari sisi PHP', 'Menyadari request ditolak Apache karena token sesi kedaluwarsa, lalu mengirim ulang dengan header <code>Authorization</code> yang valid.', 'Token bawaan mode ini adalah <code>Bearer token_expired_null</code>. Panggil <code>refresh_session()</code> lalu kirim ulang, atau kirim header sendiri: <code>http_get($path, ["headers" => ["Authorization" => "Bearer " . token_sesi()]])</code>.', '<?php
echo "token awal: " . token_sesi() . "\\n";

// TODO: perbarui sesi PHP sebelum memanggil endpoint
$res = http_get("/api/nilai-siswa.php");
echo "status: " . $res["status"] . "\\n";', '<?php
echo "token awal: " . token_sesi() . "\\n";

refresh_session();
$res = http_get("/api/nilai-siswa.php");
echo "status: " . $res["status"] . "\\n";
echo "jumlah baris: " . count($res["data"]["data"] ?? []) . "\\n";', '{"fail_if_fatal":true,"call_no_status":[{"status":401,"pesan":"Masih ada request ditolak 401. Panggil refresh_session() lebih dulu, lalu kirim header Authorization Bearer token_sesi()."}],"call_any":[{"status":200,"pesan_lulus":"Sesi PHP diperbarui sehingga Apache menerima request dengan status 200.","pesan":"Belum ada request yang berhasil. Perbaiki sesi lalu panggil http_get() kembali."}]}', 1, 2),
  ('js', 'NORMAL', 'GET daftar siswa dari JavaScript', 'Memanggil endpoint PHP dengan metode GET dari sisi klien, lalu membaca properti status dan jumlah data pada response JSON.', 'Gunakan <code>api.get(path)</code>. Contoh path <code>/api/siswa.php?kelas=XI+RPL+1</code>. Cetak <code>res.status</code> dan <code>res.data.length</code> dengan <code>console.log()</code>.', '// TODO: ambil data siswa kelas XI RPL 1 lewat api.get(), lalu tampilkan
// status HTTP dan jumlah baris pada response JSON.
console.log("ganti baris ini");', 'const res = await api.get("/api/siswa.php?kelas=XI+RPL+1");

console.log("status:", res.status);
console.log("jumlah data:", res.data.length);', '{"fail_if_fatal":false,"call_any":[{"method":"GET","status":200,"path_prefix":"/api/siswa.php","pesan_lulus":"GET /api/siswa.php dijawab skrip PHP dengan 200 OK dan data siswa.","pesan":"Belum ada panggilan api.get() ke /api/siswa.php yang mengembalikan status 200."}]}', 1, 2),
  ('js', 'E429', 'Menghindari 429 Too Many Requests', 'Memahami rate limiting mod_qos pada Apache dan menguranginya memakai cache <code>Cache-Control</code> serta pagination.', 'Mode ini memberi kuota 6 request per eksekusi. Memanggil endpoint yang sama berulang kali akan berbalas 429. Solusinya: kirim opsi cache <code>api.get(path, { cache: true })</code> dan batasi payload dengan <code>?limit=10</code>.', '// TODO: panggil /api/nilai-ukk.php sebanyak 8 kali tanpa memicu 429.
// Kuota ruang latihan hanya 6 request per eksekusi.
const path = "/api/nilai-ukk.php";

for (let i = 0; i < 8; i++) {
  const res = await api.get(path);
  console.log(i, res.status);
}', 'const path = "/api/nilai-ukk.php?limit=10";

for (let i = 0; i < 8; i++) {
  const res = await api.get(path, { cache: true });
  console.log(i, res.status, res.fromCache ? "dari cache Apache" : "dari database");
}', '{"fail_if_fatal":false,"call_no_status":[{"status":429,"pesan":"Ada request ditolak 429. Gunakan cache: true agar request identik dilayani cache Apache."}],"call_any":[{"from_cache":true,"pesan_lulus":"Tidak ada 429. Sebagian response dilayani cache Apache sehingga beban PHP dan MySQL turun.","pesan":"Belum berhasil. Aktifkan cache: true pada api.get() dan batasi payload dengan ?limit=."}]}', 1, 2),
  ('sql', 'NORMAL', 'Kueri MySQL dengan filter, sorting, dan limit', 'Menulis SELECT dengan WHERE, ORDER BY, dan LIMIT untuk mengambil data terbaca dari tabel <code>nilai_ukk</code>.', 'Tulis satu atau lebih statement MySQL diakhiri titik koma. Kolom tersedia: siswa_id, nama, paket_keahlian, nilai, is_published, created_at. Agregat yang didukung: <code>count(*)</code>, <code>avg(col)</code>, <code>max(col)</code>, <code>min(col)</code>.', '-- TODO: tampilkan 5 nilai UKK tertinggi yang sudah dipublikasikan,
-- lalu hitung rata-rata nilai seluruh siswa.
SELECT nama, nilai
FROM nilai_ukk
WHERE is_published = true;', '-- 5 nilai tertinggi yang sudah dipublikasikan
SELECT nama, nilai
FROM nilai_ukk
WHERE is_published = true
ORDER BY nilai DESC
LIMIT 5;

-- rata-rata nilai seluruh siswa
SELECT avg(nilai) AS rata_rata FROM nilai_ukk;', '{"fail_if_fatal":false,"no_failed_query":true,"query_all":[{"re":["order\\\\s+by","limit\\\\s+\\\\d+"],"pesan":"Kombinasikan ORDER BY dengan LIMIT."},{"re":["avg\\\\(|count\\\\(|max\\\\(|min\\\\("],"pesan":"Tambahkan fungsi agregat AVG/COUNT/MAX/MIN."}],"pesan_lulus":"SELECT dengan WHERE, ORDER BY, LIMIT, dan fungsi agregat berjalan benar di MySQL."}', 1, 2),
  ('sql', 'NORMAL', 'INSERT, UPDATE, dan DELETE yang aman', 'Memperbaiki kueri yang memakai kolom tidak ada pada skema, lalu melatih UPDATE dan DELETE dengan WHERE agar tidak menghapus seluruh tabel.', 'Statement pertama gagal karena kolom <code>tgl_input</code> tidak ada; ubah menjadi <code>created_at</code>. Ruang uji MySQL menolak <code>UPDATE</code> dan <code>DELETE</code> tanpa <code>WHERE</code>. Fungsi waktu yang sah adalah <code>NOW()</code>.', '-- perbaiki kolom pada INSERT berikut, lalu tambahkan UPDATE dan DELETE yang memakai WHERE
INSERT INTO jurnal_pkl (siswa_id, isi, tgl_input)
VALUES (''25001'', ''Catatan harian hasil Lab Uji'', NOW());

-- UPDATE nilai_ukk SET nilai = 88 WHERE siswa_id = ''25010'';
-- DELETE FROM jurnal_pkl WHERE isi = ''Catatan harian hasil Lab Uji'';', '-- INSERT yang sah memakai kolom created_at
INSERT INTO jurnal_pkl (siswa_id, isi, created_at)
VALUES (''25001'', ''Catatan harian hasil Lab Uji'', NOW());

UPDATE nilai_ukk SET nilai = 88 WHERE siswa_id = ''25010'';

DELETE FROM jurnal_pkl WHERE isi = ''Catatan harian hasil Lab Uji'';', '{"fail_if_fatal":false,"no_failed_query":true,"query_all":[{"re":["insert\\\\s+into\\\\s+jurnal_pkl"],"pesan":"INSERT INTO jurnal_pkl belum berhasil."},{"re":["update\\\\s+nilai_ukk","where"],"pesan":"UPDATE nilai_ukk harus disertai WHERE."},{"re":["delete\\\\s+from","where"],"pesan":"DELETE FROM harus disertai WHERE."}],"pesan_lulus":"INSERT memakai created_at, sedangkan UPDATE dan DELETE terlindungi klausa WHERE."}', 1, 2);

-- Lima tugas contoh dari akun guru demo (id users 2): tiga latihan kode, satu laporan kelas, dan satu tugas SQL yang dijawab lewat grid Lab Kueri.
INSERT INTO tasks (guru_id, judul, instruksi, bahasa, kelas, exercise_id, tenggat, bobot) VALUES
  (2, 'Tugas 1: Respons JSON dari skrip PHP', 'Kerjakan latihan nomor 1. Ganti echo terakhir pada kerangka supaya skrip mengirim array $data sebagai JSON, lalu kirimkan. Sertakan keluaran konsol sebagai bukti.', 'php', 'XI RPL 1', 1, DATE_ADD(NOW(), INTERVAL 7 DAY), 2),
  (2, 'Tugas 2: SELECT dengan prepared statement', 'Kerjakan latihan nomor 2. Ambil siswa dengan nilai >= 75 memakai placeholder ? dan ORDER BY. Kumpulkan kode beserta grid hasil kueri.', 'php', 'XI RPL 1', 2, DATE_ADD(NOW(), INTERVAL 7 DAY), 3),
  (2, 'Tugas 3: Perbaiki error 1054 Unknown column', 'Kerjakan latihan nomor 3. Ganti rujukan kolom tgl_input menjadi created_at sehingga INSERT jurnal_pkl diterima MySQL.', 'php', 'XI RPL 2', 3, DATE_ADD(NOW(), INTERVAL 10 DAY), 3),
  (2, 'Tugas 4: Kueri laporan kelas', 'Kerjakan latihan nomor 8. Buat SELECT laporan nilai dengan WHERE, ORDER BY, LIMIT, dan satu fungsi agregat.', 'sql', 'XI RPL 2', 8, DATE_ADD(NOW(), INTERVAL 10 DAY), 2),
  (2, 'Tugas 5: Grid laporan nilai tertinggi', 'Jalankan satu kueri JOIN yang menampilkan nisn, nama, dan nilai 5 siswa XI RPL 1 dengan nilai terbesar. Kirim grid hasilnya sebagai jawaban.', 'sql', 'XI RPL 1', 8, DATE_ADD(NOW(), INTERVAL 28 DAY), 5);

INSERT INTO activity_logs (nama, kelas, peran, aktivitas, created_at) VALUES
  ('Nabila Putri Ramadhani', 'XI RPL 1', 'siswa', 'Login sebagai Siswa RPL (XI RPL 1)', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Fazrin Mauza Dwi Zuhudi', 'XI RPL 1', 'siswa', 'Menyelesaikan Kasus 1 (Error 401 Unauthorized) -> Status 200 OK', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Ahmad Rizky Fauzi', 'XI RPL 1', 'siswa', 'Menyelesaikan Kasus 3 (Error 429 Rate Limit) -> Status 200 OK', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Bpk. Hendra Kusuma, S.Kom.', 'Guru', 'siswa', 'Membuka Dashboard Monitoring Guru', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Cakra Bangga Pamungkas', 'XI RPL 2', 'siswa', 'Mengirim GET /api/nilai-siswa.php -> Status 401 (Authorization: Bearer token_expired_null)', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Callista Dewi Anggraini', 'XI RPL 2', 'siswa', 'Menyelesaikan Kasus 4 (Error 500 Database Pooler) -> Status 200 OK', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Intan Permata Sari', 'XI RPL 1', 'siswa', 'Mengumpulkan Kuis Evaluasi Diagnostik -> Skor 90 (TUNTAS)', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Rafaell Alfarizi Nugroho', 'XI RPL 2', 'siswa', 'Mengirim PUT /api/nilai-ukk.php -> Status 200 OK (latency 42 ms)', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Kayla Syafa Ramadhani', 'XI RPL 2', 'siswa', 'Mengumpulkan Kuis Evaluasi Diagnostik -> Skor 95 (TUNTAS)', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('Hafiz Ardiansyah', 'XI RPL 1', 'siswa', 'Mengumpulkan Kuis Evaluasi Diagnostik -> Skor 68 (BELUM TUNTAS - remedial ditugaskan guru)', DATE_SUB(NOW(), INTERVAL 6 HOUR));

INSERT INTO app_settings (kunci, nilai, keterangan) VALUES
  ('kkm', '75', 'KKM minimal yang dipakai penentu TUNTAS'),
  ('rate_limit_per_menit', '40', 'Kuota request per siswa per endpoint per menit; melampaui ini api/ menjawab 429'),
  ('target_ketuntasan', '85', 'Persentase siswa di atas KKM pada Tabel 3.4'),
  ('grid_baris_maks', '200', 'Jumlah baris maksimum yang dikembalikan api/grid.php dan api/sandbox-query.php'),
  ('versi_app', '3.0.7', 'Versi SIRKUIT');


SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================================
-- SIRKUIT BAGIAN 2 dari 2 - DATABASE RUANG LATIHAN
-- ============================================================================
-- Impor bagian ini ke database ruang latihan (misal namauser_sirkuit_sbx).
-- Tabel di sinilah yang dibaca dan ditulis siswa lewat PDO, MySQLi, dan
-- kueri SQL pada Lab Uji. User MySQL untuk database ini hanya diberi hak
-- SELECT/INSERT/UPDATE/DELETE pada tabel-tabel berikut, tanpa GRANT OPTION.
--
-- Jalankan lewat phpMyAdmin (pilih database tujuan lebih dulu, lalu Import)
-- atau:  mysql -u PEMAKAI -p NAMA_DB < bagian-ini.sql
--
-- Pemberian hak akses, dijalankan sebagai user MySQL yang punya hak GRANT
-- (misalnya pemakai utama cPanel) sesudah tabel selesai dibuat:
--
--   CREATE USER 'namauser_sbx'@'localhost' IDENTIFIED BY 'password-kuat';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON namauser_sirkuit_sbx.* TO 'namauser_sbx'@'localhost';
--   FLUSH PRIVILEGES;
--
-- Jangan memberi CREATE, DROP, atau GRANT OPTION kepada user ini. Lab Uji dan
-- panel grid memakai user tersebut untuk menjalankan kode siswa, jadi hak
-- seluas itu hanya membuka peluang tabel materi ajar dihapus dari skrip siswa.
-- Struktur tabel dibuat sekali saja, oleh install.php atau phpMyAdmin, memakai
-- user lain yang boleh melakukan CREATE.
--
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ======================= 2. TABEL MATERI AJAR =============================
-- Tabel inilah yang dibaca siswa lewat PDO/MySQLi dan kueri SQL di Lab Uji.
CREATE TABLE IF NOT EXISTS siswa (
  id CHAR(5) NOT NULL,
  nisn CHAR(9) NOT NULL,
  nama VARCHAR(120) NOT NULL,
  kelas VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_siswa_nisn (nisn),
  KEY idx_siswa_kelas (kelas)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nilai_ukk (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  siswa_id CHAR(5) NOT NULL,
  nama VARCHAR(120) NOT NULL,
  paket_keahlian VARCHAR(30) NOT NULL DEFAULT 'RPL',
  nilai SMALLINT NOT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nilai_siswa (siswa_id),
  KEY idx_nilai_publik (is_published, nilai),
  CONSTRAINT fk_nilai_siswa FOREIGN KEY (siswa_id) REFERENCES siswa (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kolom hari dan created_at dipakai pada skenario 500 (salah kolom = 1054).
CREATE TABLE IF NOT EXISTS jurnal_pkl (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  siswa_id CHAR(5) NOT NULL,
  hari VARCHAR(12) NULL,
  isi TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_jurnal_siswa (siswa_id, created_at),
  CONSTRAINT fk_jurnal_siswa FOREIGN KEY (siswa_id) REFERENCES siswa (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proyek (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  siswa_id CHAR(5) NOT NULL,
  judul VARCHAR(160) NOT NULL,
  status ENUM('draft','review','publikasi','revision') NOT NULL DEFAULT 'draft',
  deadline DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_proyek_siswa (siswa_id),
  KEY idx_proyek_status (status),
  CONSTRAINT fk_proyek_siswa FOREIGN KEY (siswa_id) REFERENCES siswa (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prakerin (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  siswa_id CHAR(5) NOT NULL,
  paket VARCHAR(60) NULL,
  jam INT UNSIGNED NOT NULL DEFAULT 0,
  catatan TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prakerin_siswa (siswa_id),
  CONSTRAINT fk_prakerin_siswa FOREIGN KEY (siswa_id) REFERENCES siswa (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel sesi dipakai untuk menjelaskan 401: token kedaluwarsa ditolak PHP.
CREATE TABLE IF NOT EXISTS sesi_login (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  siswa_id CHAR(5) NOT NULL,
  token VARCHAR(64) NOT NULL,
  status ENUM('aktif','kedaluwarsa','dicabut') NOT NULL DEFAULT 'aktif',
  ip VARCHAR(45) NULL,
  dibuat_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kedaluwarsa_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_sesi_token (token),
  KEY idx_sesi_status (status, kedaluwarsa_at),
  CONSTRAINT fk_sesi_siswa FOREIGN KEY (siswa_id) REFERENCES siswa (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 32 siswa XI RPL 1 dan XI RPL 2 (Tabel 3.4 proposal).
INSERT INTO siswa (id, nisn, nama, kelas) VALUES
  ('25001', '008492104', 'Fazrin Mauza Dwi Zuhudi', 'XI RPL 1'),
  ('25002', '008512001', 'Ahmad Rizky Fauzi', 'XI RPL 1'),
  ('25003', '008512045', 'Nabila Putri Ramadhani', 'XI RPL 1'),
  ('25004', '008513022', 'Dimas Aditya Pratama', 'XI RPL 1'),
  ('25005', '008513078', 'Siti Nurhaliza Wijayanti', 'XI RPL 1'),
  ('25006', '008514009', 'Bagus Panuntun Wicaksono', 'XI RPL 1'),
  ('25007', '008514102', 'Intan Permata Sari', 'XI RPL 1'),
  ('25008', '008514155', 'Rafi Akbar Setiawan', 'XI RPL 1'),
  ('25009', '008515011', 'Alya Zahra Nurfitria', 'XI RPL 1'),
  ('25010', '008515088', 'Hafiz Ardiansyah', 'XI RPL 1'),
  ('25011', '008515120', 'Zaky Maulana Yusuf', 'XI RPL 1'),
  ('25012', '008516033', 'Keisha Anindita Rahayu', 'XI RPL 1'),
  ('25013', '008516077', 'Reyhan Dafa Prakoso', 'XI RPL 1'),
  ('25014', '008516144', 'Salma Aulia Rahman', 'XI RPL 1'),
  ('25015', '008517005', 'Farhan Adnan Maulana', 'XI RPL 1'),
  ('25016', '008517099', 'Tiara Salsabila Fitri', 'XI RPL 1'),
  ('25017', '008521012', 'Gilang Saputra Ramadan', 'XI RPL 2'),
  ('25018', '008521087', 'Bilqis Anindya Kamila', 'XI RPL 2'),
  ('25019', '008522004', 'Rafaell Alfarizi Nugroho', 'XI RPL 2'),
  ('25020', '008522066', 'Callista Dewi Anggraini', 'XI RPL 2'),
  ('25021', '008523015', 'Naufal Abizar Hakim', 'XI RPL 2'),
  ('25022', '008523090', 'Anisa Fitri Rahmawati', 'XI RPL 2'),
  ('25023', '008524008', 'Dwiki Cahya Nugraha', 'XI RPL 2'),
  ('25024', '008524055', 'Kayla Syafa Ramadhani', 'XI RPL 2'),
  ('25025', '008525019', 'Arka Deva Mahendra', 'XI RPL 2'),
  ('25026', '008525071', 'Chelsea Mikayla Putri', 'XI RPL 2'),
  ('25027', '008526002', 'Fahri Yusuf Alfarizi', 'XI RPL 2'),
  ('25028', '008526048', 'Karina Amelia Wijaya', 'XI RPL 2'),
  ('25029', '008527013', 'Cakra Bangga Pamungkas', 'XI RPL 2'),
  ('25030', '008527080', 'Syifa Nadia Alawiyah', 'XI RPL 2'),
  ('25031', '008528006', 'Raditya Dika Prasetya', 'XI RPL 2'),
  ('25032', '008528052', 'Mahira Zaskia Ardila', 'XI RPL 2');

INSERT INTO nilai_ukk (siswa_id, nama, paket_keahlian, nilai, is_published) VALUES
  ('25001', 'Fazrin Mauza Dwi Zuhudi', 'RPL', 92, 1),
  ('25002', 'Ahmad Rizky Fauzi', 'RPL', 88, 1),
  ('25003', 'Nabila Putri Ramadhani', 'RPL', 95, 1),
  ('25004', 'Dimas Aditya Pratama', 'RPL', 80, 1),
  ('25005', 'Siti Nurhaliza Wijayanti', 'RPL', 86, 1),
  ('25006', 'Bagus Panuntun Wicaksono', 'RPL', 78, 1),
  ('25007', 'Intan Permata Sari', 'RPL', 90, 1),
  ('25008', 'Rafi Akbar Setiawan', 'RPL', 82, 1),
  ('25009', 'Alya Zahra Nurfitria', 'RPL', 94, 1),
  ('25010', 'Hafiz Ardiansyah', 'RPL', 68, 0),
  ('25011', 'Zaky Maulana Yusuf', 'RPL', 85, 1),
  ('25012', 'Keisha Anindita Rahayu', 'RPL', 89, 1),
  ('25013', 'Reyhan Dafa Prakoso', 'RPL', 78, 1),
  ('25014', 'Salma Aulia Rahman', 'RPL', 83, 1),
  ('25015', 'Farhan Adnan Maulana', 'RPL', 80, 1),
  ('25016', 'Tiara Salsabila Fitri', 'RPL', 85, 1),
  ('25017', 'Gilang Saputra Ramadan', 'RPL', 86, 1),
  ('25018', 'Bilqis Anindya Kamila', 'RPL', 91, 1),
  ('25019', 'Rafaell Alfarizi Nugroho', 'RPL', 78, 1),
  ('25020', 'Callista Dewi Anggraini', 'RPL', 93, 1),
  ('25021', 'Naufal Abizar Hakim', 'RPL', 84, 1),
  ('25022', 'Anisa Fitri Rahmawati', 'RPL', 87, 1),
  ('25023', 'Dwiki Cahya Nugraha', 'RPL', 72, 1),
  ('25024', 'Kayla Syafa Ramadhani', 'RPL', 95, 1),
  ('25025', 'Arka Deva Mahendra', 'RPL', 81, 1),
  ('25026', 'Chelsea Mikayla Putri', 'RPL', 78, 1),
  ('25027', 'Fahri Yusuf Alfarizi', 'RPL', 85, 1),
  ('25028', 'Karina Amelia Wijaya', 'RPL', 90, 1),
  ('25029', 'Cakra Bangga Pamungkas', 'RPL', 65, 0),
  ('25030', 'Syifa Nadia Alawiyah', 'RPL', 89, 1),
  ('25031', 'Raditya Dika Prasetya', 'RPL', 80, 1),
  ('25032', 'Mahira Zaskia Ardila', 'RPL', 85, 1);

INSERT INTO jurnal_pkl (siswa_id, hari, isi, created_at) VALUES
  ('25001', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 0 DAY)),
  ('25002', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 3 DAY)),
  ('25002', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 4 DAY)),
  ('25003', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 6 DAY)),
  ('25003', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 7 DAY)),
  ('25003', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 8 DAY)),
  ('25004', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 9 DAY)),
  ('25005', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 12 DAY)),
  ('25005', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 13 DAY)),
  ('25006', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 15 DAY)),
  ('25006', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 16 DAY)),
  ('25006', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 17 DAY)),
  ('25007', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 18 DAY)),
  ('25008', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 21 DAY)),
  ('25008', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 22 DAY)),
  ('25009', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 24 DAY)),
  ('25009', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 25 DAY)),
  ('25009', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 26 DAY)),
  ('25010', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 27 DAY)),
  ('25011', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 30 DAY)),
  ('25011', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 31 DAY)),
  ('25012', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 33 DAY)),
  ('25012', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 34 DAY)),
  ('25012', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 35 DAY)),
  ('25013', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 36 DAY)),
  ('25014', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 39 DAY)),
  ('25014', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 0 DAY)),
  ('25015', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 2 DAY)),
  ('25015', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 3 DAY)),
  ('25015', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 4 DAY)),
  ('25016', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 5 DAY)),
  ('25017', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 8 DAY)),
  ('25017', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 9 DAY)),
  ('25018', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 11 DAY)),
  ('25018', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 12 DAY)),
  ('25018', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 13 DAY)),
  ('25019', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 14 DAY)),
  ('25020', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 17 DAY)),
  ('25020', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 18 DAY)),
  ('25021', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 20 DAY)),
  ('25021', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 21 DAY)),
  ('25021', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 22 DAY)),
  ('25022', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 23 DAY)),
  ('25023', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 26 DAY)),
  ('25023', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 27 DAY)),
  ('25024', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 29 DAY)),
  ('25024', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 30 DAY)),
  ('25024', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 31 DAY)),
  ('25025', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 32 DAY)),
  ('25026', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 35 DAY)),
  ('25026', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 36 DAY)),
  ('25027', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 38 DAY)),
  ('25027', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 39 DAY)),
  ('25027', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 0 DAY)),
  ('25028', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 1 DAY)),
  ('25029', 'Kamis', 'Mengemas respons api/siswa.php dengan json_encode.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 4 DAY)),
  ('25029', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 5 DAY)),
  ('25030', 'Jumat', 'Menambahkan validasi session_start di awal skrip.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 7 DAY)),
  ('25030', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 8 DAY)),
  ('25030', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 9 DAY)),
  ('25031', 'Senin', 'Membuat CRUD siswa dengan form HTML dan PDO prepared statement.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 10 DAY)),
  ('25032', 'Selasa', 'Menyambungkan halaman rapor ke endpoint api/nilai-ukk.php.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 13 DAY)),
  ('25032', 'Rabu', 'Memperbaiki header Location setelah INSERT jurnal.', DATE_SUB('2027-03-01 08:00:00', INTERVAL 14 DAY));

INSERT INTO proyek (siswa_id, judul, status, deadline) VALUES
  ('25001', 'Sistem Informasi Prakerin', 'draft', DATE_ADD('2027-04-01', INTERVAL 0 DAY)),
  ('25003', 'Rapor Digital RPL', 'review', DATE_ADD('2027-04-01', INTERVAL 1 DAY)),
  ('25005', 'Jurnal PKL Daring', 'publikasi', DATE_ADD('2027-04-01', INTERVAL 2 DAY)),
  ('25007', 'Portal Nilai UKK', 'revision', DATE_ADD('2027-04-01', INTERVAL 3 DAY)),
  ('25009', 'Absensi QR Kelas', 'draft', DATE_ADD('2027-04-01', INTERVAL 4 DAY)),
  ('25011', 'Sistem Informasi Prakerin', 'review', DATE_ADD('2027-04-01', INTERVAL 5 DAY)),
  ('25013', 'Rapor Digital RPL', 'publikasi', DATE_ADD('2027-04-01', INTERVAL 6 DAY)),
  ('25015', 'Jurnal PKL Daring', 'revision', DATE_ADD('2027-04-01', INTERVAL 7 DAY)),
  ('25017', 'Portal Nilai UKK', 'draft', DATE_ADD('2027-04-01', INTERVAL 8 DAY)),
  ('25019', 'Absensi QR Kelas', 'review', DATE_ADD('2027-04-01', INTERVAL 0 DAY)),
  ('25021', 'Sistem Informasi Prakerin', 'publikasi', DATE_ADD('2027-04-01', INTERVAL 1 DAY)),
  ('25023', 'Rapor Digital RPL', 'revision', DATE_ADD('2027-04-01', INTERVAL 2 DAY)),
  ('25025', 'Jurnal PKL Daring', 'draft', DATE_ADD('2027-04-01', INTERVAL 3 DAY)),
  ('25027', 'Portal Nilai UKK', 'review', DATE_ADD('2027-04-01', INTERVAL 4 DAY)),
  ('25029', 'Absensi QR Kelas', 'publikasi', DATE_ADD('2027-04-01', INTERVAL 5 DAY)),
  ('25031', 'Sistem Informasi Prakerin', 'revision', DATE_ADD('2027-04-01', INTERVAL 6 DAY));

INSERT INTO prakerin (siswa_id, paket, jam, catatan) VALUES
  ('25001', 'Rekayasa Perangkat Lunak', 40, 'Logbook minggu ke-1'),
  ('25002', 'Rekayasa Perangkat Lunak', 43, 'Logbook minggu ke-2'),
  ('25003', 'Rekayasa Perangkat Lunak', 46, 'Logbook minggu ke-3'),
  ('25004', 'Rekayasa Perangkat Lunak', 49, 'Logbook minggu ke-4'),
  ('25005', 'Rekayasa Perangkat Lunak', 52, 'Logbook minggu ke-5'),
  ('25006', 'Rekayasa Perangkat Lunak', 55, 'Logbook minggu ke-6'),
  ('25007', 'Rekayasa Perangkat Lunak', 58, 'Logbook minggu ke-7'),
  ('25008', 'Rekayasa Perangkat Lunak', 61, 'Logbook minggu ke-8'),
  ('25009', 'Rekayasa Perangkat Lunak', 64, 'Logbook minggu ke-1'),
  ('25010', 'Rekayasa Perangkat Lunak', 67, 'Logbook minggu ke-2'),
  ('25011', 'Rekayasa Perangkat Lunak', 70, 'Logbook minggu ke-3'),
  ('25012', 'Rekayasa Perangkat Lunak', 73, 'Logbook minggu ke-4'),
  ('25013', 'Rekayasa Perangkat Lunak', 76, 'Logbook minggu ke-5'),
  ('25014', 'Rekayasa Perangkat Lunak', 79, 'Logbook minggu ke-6'),
  ('25015', 'Rekayasa Perangkat Lunak', 82, 'Logbook minggu ke-7'),
  ('25016', 'Rekayasa Perangkat Lunak', 85, 'Logbook minggu ke-8'),
  ('25017', 'Rekayasa Perangkat Lunak', 88, 'Logbook minggu ke-1'),
  ('25018', 'Rekayasa Perangkat Lunak', 91, 'Logbook minggu ke-2'),
  ('25019', 'Rekayasa Perangkat Lunak', 94, 'Logbook minggu ke-3'),
  ('25020', 'Rekayasa Perangkat Lunak', 97, 'Logbook minggu ke-4');

-- Baris berstatus kedaluwarsa menjadi sasaran DELETE api/sesi-log.php.
INSERT INTO sesi_login (siswa_id, token, status, ip, dibuat_at, kedaluwarsa_at) VALUES
  ('25001', 'tok_25001_1000', 'aktif', '10.10.1.20', DATE_SUB(NOW(), INTERVAL 0 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY)),
  ('25002', 'tok_25002_1001', 'aktif', '10.10.2.21', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY)),
  ('25003', 'tok_25003_1002', 'kedaluwarsa', '10.10.3.22', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ('25004', 'tok_25004_1003', 'aktif', '10.10.1.23', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY)),
  ('25005', 'tok_25005_1004', 'aktif', '10.10.2.24', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY)),
  ('25006', 'tok_25006_1005', 'kedaluwarsa', '10.10.3.25', DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ('25007', 'tok_25007_1006', 'aktif', '10.10.1.26', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY)),
  ('25008', 'tok_25008_1007', 'aktif', '10.10.2.27', DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY)),
  ('25009', 'tok_25009_1008', 'kedaluwarsa', '10.10.3.28', DATE_SUB(NOW(), INTERVAL 16 HOUR), DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ('25010', 'tok_25010_1009', 'aktif', '10.10.1.29', DATE_SUB(NOW(), INTERVAL 18 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY)),
  ('25011', 'tok_25011_1010', 'aktif', '10.10.2.30', DATE_SUB(NOW(), INTERVAL 20 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY)),
  ('25012', 'tok_25012_1011', 'kedaluwarsa', '10.10.3.31', DATE_SUB(NOW(), INTERVAL 22 HOUR), DATE_SUB(NOW(), INTERVAL 2 DAY));



-- Rekap kelas untuk grid dan dashboard. Hanya memakai tabel ruang latihan.
CREATE OR REPLACE VIEW v_rekap_kelas AS
SELECT s.id AS siswa_id, s.nisn, s.nama, s.kelas,
       COALESCE(n.nilai, 0) AS nilai_ukk,
       IF(COALESCE(n.nilai, 0) >= 75, 'TUNTAS', 'PERLU BIMBINGAN') AS status_kkm,
       (SELECT COUNT(*) FROM jurnal_pkl j WHERE j.siswa_id = s.id) AS jurnal_terisi,
       (SELECT COUNT(*) FROM proyek p WHERE p.siswa_id = s.id) AS proyek_terisi,
       (SELECT COUNT(*) FROM sesi_login e WHERE e.siswa_id = s.id AND e.status = 'aktif') AS sesi_aktif
FROM siswa s
LEFT JOIN nilai_ukk n ON n.siswa_id = s.id;

-- Struktur kolom tabel materi ajar, dibaca panel Tabel dan Grid.
CREATE OR REPLACE VIEW v_struktur_tabel AS
SELECT TABLE_NAME AS tabel, COLUMN_NAME AS kolom, COLUMN_TYPE AS tipe,
       COLUMN_KEY AS kunci, IS_NULLABLE AS boleh_null, COLUMN_DEFAULT AS nilai_default
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('siswa','nilai_ukk','jurnal_pkl','proyek','prakerin','sesi_login')
ORDER BY TABLE_NAME, ORDINAL_POSITION;


SET FOREIGN_KEY_CHECKS = 1;
