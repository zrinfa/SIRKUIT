# SIRKUIT

**Simulasi Interaktif Rangkaian Kueri dan Uji Integrasi Terpadu**
Media Pembelajaran Pemrograman PHP dan Kueri SQL MySQL untuk Jurusan Rekayasa Perangkat Lunak (RPL / PPLG), **SMKN 1 Mejayan**, Kab. Madiun, Jawa Timur

Disusun oleh **Fazrin Mauza Dwi Zuhudi (NIM 24050974090)**, S1 Pendidikan Teknologi Informasi, FT Universitas Negeri Surabaya, sebagai proyek PLP (Program Pengenalan Lapangan Persekolahan).

---

## 1. Ringkasan

SIRKUIT adalah aplikasi web **Apache + PHP 8.2 + MySQL/MariaDB** dengan antarmuka peramban tanpa build-tool. Fokus utamanya adalah siswa menulis dan menjalankan kode PHP serta kueri SQL sungguhan, lalu melihat hasilnya sebagai tabel data. Visualisasi 3D dipakai sebagai penjelas alur request, bukan sebagai objek utama belajar.

Isi aplikasi, disusun menurut urutan navigasi di `index.html`:

- **Tugas (`js/task-cycle.js`)**: guru menulis tugas beserta bahasa, kelas, tenggat, dan bobot (`api/tasks.php`); siswa membukanya di Lab Kueri atau Lab Uji Kode, menjalankan kodenya, lalu mengirim hasilnya (`api/submissions.php`); guru menilai dan memberi catatan. Yang tersimpan sebagai jawaban adalah kode, keluaran, dan grid baris dari MySQL, bukan tangkapan layar. Guru dapat mengirim ulang ke daftar nilai dan siswa yang sama dapat memperbaiki jawaban sebelum dinilai kembali.
- **Lab Kueri (`js/data-grid.js`)**: satu halaman tempat siswa menulis satu statement SQL MySQL, menjalankan `api/sandbox-query.php`, dan membaca baris yang benar-benar dikembalikan MySQL. Nama kolom salah membalas 1054, nama tabel salah membalas 1146. Grid yang sama (`api/grid.php`) dipakai untuk menjelajah tabel materi ajar dengan urut kolom, filter `LIKE`, dan paginasi. Tombol **Unduh PNG** menggambar grid ke canvas dan menyimpan gambarnya dengan watermark nama, NISN, kelas, waktu, serta teks SQL.
- **Lab Uji Kode (`js/lab-uji.js`)**: editor kode beserta bank latihan dari `lab_exercises`. Cara menjalankan dilihat dari pilihan bahasa: SQL dijalankan sungguhan pada database ruang latihan lewat `lib/sandbox_sql.php`; PHP dijalankan sebagai anak proses `php-cli` oleh `lib/runner.php` (maka `session_start()`, `$_SESSION`, dan `PDO::prepare()` berlaku seperti di hosting) dan jejaknya (keluaran, header, permintaan HTTP, kueri) dibaca `api/lab-run.php`; JavaScript dijalankan di iframe sandbox peramban, lalu jejak yang dilaporkan dinilai di server. Aturan penilaian disimpan di database sebagai JSON deklaratif (`lab_exercises.cek`) dan diperiksa `lib/checker.php`, sehingga `cek` dan `solusi` tidak pernah terkirim ke peramban siswa.
- **Modul materi + kuis diagnostik 12 soal HOTS**: bank soal di `quiz_questions`, penilaian otomatis terhadap KKM **75** dan pembahasan lengkap; kolom `kunci` tidak ikut terkirim ke siswa.
- **Alur Request Saya (Three.js WebGL r160)**: empat node arsitektur (Client, Apache HTTP Server, PHP 8.2, MySQL/MariaDB) dengan animasi paket GET/POST/PUT/DELETE dan tombol untuk menjalankan tiap tahap pipeline secara terpisah. Fungsinya menunjukkan ke siswa ke mana request mereka pergi dan di mana ia gagal; halaman ini penjelas konsep, bukan tempat mengumpulkan tugas.
- **Problem-Based Learning (Arends, 2012)**: stepper 5 tahap PBL dan 4 skenario troubleshooting (error **401, 404, 429, 500**, termasuk error MySQL 1054 dan 1040) pada halaman **Inspeksi JSON**. Teks skenario, opsi solusi, dan log percobaan diambil dari MySQL (`pbl_scenarios`, `pbl_solutions`, `pbl_simulation_logs`).
- **Dashboard Monitoring Guru**: KPI, rekap nilai UKK / tugas / kuis per siswa, log aktivitas, filter kelas, ekspor CSV. Semua angkanya dibaca dari MySQL, bukan dari data contoh di berkas JS.

Tampilan dirancang datar dan minim ornamen; tidak memakai ikon emoji maupun em dash. Tema bawaan adalah terang dengan aksen oranye-kuning, dan tombol **Tema Gelap** di kanan atas menyimpan pilihan pada `localStorage` (`sirkuit_tema`). Seluruh warna diambil dari variabel CSS di `css/styles.css`, sehingga penyesuaian cukup dilakukan pada blok `:root` (terang) dan `html[data-theme="dark"]` (gelap). Ruang kanvas 3D tetap memakai panggung gelap hangat agar objek dan berkas cahaya terbaca, di dalam panel bertema terang. Kontras teks sudah diukur terhadap WCAG AA (minimal 4,5:1 untuk teks biasa).

Bila memperbarui `css/` atau `js/` di server, ikut naikkan angka `?v=` pada `index.html` (contoh `?v=3.0.1`). `.htaccess` memberi masa berlaku aset statis satu hari, sehingga tanpa `?v=` yang baru, peramban guru dan siswa masih memakai berkas lama.

## 2. Arsitektur dan Basis Data

Sebelum menjalankan aplikasi, perlu dibedakan dua hal berikut.

| Bagian | Teknologi | Peran |
|---|---|---|
| Bahan ajar | PHP 8.2 (`session_start`, `password_hash`, PDO prepared statement, `header`, `json_encode`) + MySQL/MariaDB (phpMyAdmin, error 1054 / 1146 / 1040) + `.htaccess` mod_rewrite | Materi yang dipelajari dan disimulasikan siswa, sesuai Kurikulum Merdeka Fase F elemen Pemrograman Web dan Basis Data. |
| Infrastruktur aplikasi | hosting cPanel (Apache + PHP + MySQL) dengan dua database MySQL | Persistensi akun, tugas, jawaban, nilai kuis, progres simulasi, dan log aktivitas. |

Keduanya memakai teknologi yang sama. Kode PHP yang diajarkan dan kode PHP yang menjalankan aplikasi adalah bahasa yang sama, sehingga penjelasan di kelas dapat langsung dibuktikan pada aplikasi.

### Dua database yang dipisah

| Database | Isi | Hak akses pemakai MySQL |
|---|---|---|
| **aplikasi** (`sirkuit.sql` BAGIAN 1) | `users`, `pbl_scenarios`, `pbl_solutions`, `pbl_simulation_logs`, `lab_exercises`, `lab_runs`, `tasks`, `task_submissions`, `quiz_questions`, `quiz_attempts`, `activity_logs`, `app_settings`, `rate_buckets` | penuh, hanya dipakai `lib/db.php` melalui `DB::app()` |
| **ruang latihan** (`sirkuit.sql` BAGIAN 2) | `siswa`, `nilai_ukk`, `jurnal_pkl`, `proyek`, `prakerin`, `sesi_login` beserta view | hanya `SELECT / INSERT / UPDATE / DELETE`, tidak pernah diberi `GRANT` ke database aplikasi |

Pemisahan ini membuat kode SQL atau PHP yang ditulis siswa di Lab Kueri tidak dapat membaca tabel `users`, `tasks`, `task_submissions`, maupun `quiz_attempts`, walaupun kredensial database ruang latihan terbaca. Tabel materi ajar juga dibaca oleh antarmuka guru melalui `DB::ajar()`, jadi angka yang dilihat guru sama persis dengan hasil kueri yang dijalankan siswa.

## 3. Struktur Proyek

```
sirkuit-smkn1mejayan/
├── index.html                    # Shell SPA: Tugas, Lab Kueri, Lab Uji Kode, Modul & Kuis, Alur Request, Inspeksi JSON, Dashboard Guru
├── install.php                   # Pengimpor sirkuit.sql lewat peramban (hapus setelah dipakai)
├── sirkuit.sql                   # Skema + data awal, dua bagian untuk dua database
├── .htaccess                     # rute /api/nama -> /api/nama.php, blok lib/ storage/ *.sql, header keamanan
├── 403.html  404.html             # Halaman kesalahan Apache
├── api/                          # Endpoint REST PHP
│   ├── login.php logout.php session.php auth.php
│   ├── tasks.php submissions.php grades.php dashboard.php
│   ├── exercises.php lab-run.php sandbox-query.php grid.php schema.php
│   ├── quiz.php scenarios.php
│   ├── siswa.php nilai-ukk.php nilai-siswa.php jurnal-pkl.php
│   ├── proyek-siswa.php prakerin-siswa.php sesi-log.php
│   └── ...                       # endpoint materi ajar yang dipanggil siswa saat berlatih
├── lib/
│   ├── boot.php                  # bootstrap bersama: config, session, timezone, error handler
│   ├── config.sample.php         # salin menjadi config.php, isi kredensial MySQL cPanel
│   ├── db.php                    # PDO + prepared statement, DB::app(), DB::sandbox(), DB::ajar()
│   ├── auth.php                  # session_start, password_verify, guard peran, token 401
│   ├── http.php                  # respons JSON, rate limit (429), header cache, CSRF
│   ├── runner.php                # anak proses php-cli untuk kode PHP siswa (bila proc_open diizinkan)
│   ├── sandbox_sql.php           # satu sumber aturan SQL siswa: whitelist perintah, blacklist tabel aplikasi, eksekusi
│   └── checker.php               # pemeriksa jawaban latihan Lab Uji Kode dari aturan deklaratif lab_exercises.cek
├── css/styles.css                # tema terang dengan aksen oranye-kuning + mode gelap
├── js/
│   ├── api.js                    # satu-satunya lapisan data: fetch + cookie sesi + CSRF + tangani 401/429
│   ├── config.js                 # konstanta tampilan, data contoh cadangan, rig skenario 3D
│   ├── main.js                   # router SPA, auth multi-peran, toast
│   ├── task-cycle.js             # UI tugas guru/siswa: buat, kerjakan, kirim, nilai
│   ├── data-grid.js              # Lab Kueri: grid hasil api/grid.php dan api/sandbox-query.php + unduh PNG berwatermark
│   ├── lab-uji.js                # Lab Uji Kode: bank latihan, editor, eksekusi server atau sandbox, kirim jawaban
│   ├── lab-sandbox.js            # runtime iframe cadangan: mock HTTP + mesin SQL + jembatan PHP
│   ├── php-mini.js               # interpreter subset PHP 8.2 di browser, dipakai saat runner server mati
│   ├── quiz-engine.js            # modul materi + kuis dari api/quiz.php
│   ├── pbl-simulator.js          # 5 tahap PBL + skenario dari MySQL
│   ├── scene3d.js                # engine Three.js: node, pipa, paket data, runStep(), stopAll()
│   └── teacher-dashboard.js      # KPI, rekap, filter, CSV, log
└── storage/                      # sementara, tidak boleh diminta lewat URL
```

Three.js r160 dimuat lewat **import map CDN**, sehingga tidak ada `npm install` dan tidak ada bundler.

## 4. Pasang di Hosting cPanel

Prasyarat: PHP 8.2 atau lebih baru dengan ekstensi `pdo_mysql` dan `mysqli`, MySQL/MariaDB, `mod_rewrite` dan `mod_headers` (standar ada di cPanel).

1. **Unggah berkas.** Zip seluruh isi folder `sirkuit-smkn1mejayan/`, unggah ke `public_html/` (atau subdirektori, misalnya `public_html/sirkuit/`), lalu ekstrak. Bila dipasang di subdirektori, buka `.htaccess` dan aktifkan `RewriteBase /sirkuit/`.
2. **Buat dua database dan dua pemakai** di cPanel > *MySQL Databases*:
   - database aplikasi, misalnya `sekolah_sirkuit`, dengan pemakai `sekolah_sirkuit` (hak penuh ke database itu saja);
   - database ruang latihan, misalnya `sekolah_sirkuit_sbx`, dengan pemakai `sekolah_sirkuit_sbx` (**hanya** `SELECT, INSERT, UPDATE, DELETE` pada database itu).
3. **Salin konfigurasi.** Ganti nama `lib/config.sample.php` menjadi `lib/config.php` dan isi nama database, pemakai, dan kata sandi dari langkah 2. Jangan pernah mengunggah `config.php` ke repository publik. Bila langkah 4 memakai `install.php`, berkas ini akan ditulisi otomatis.
4. **Impor `sirkuit.sql`.** Pilih salah satu cara:
   - *Lewat peramban (paling mudah):* buka `https://domain-sekolah-anda/install.php`. Halaman membaca `sirkuit.sql`, memotongnya menjadi BAGIAN 1 dan BAGIAN 2, lalu menjalankan tiap bagian ke database yang dipilihkan. `install.php` memakai `mysqli::multi_query` sehingga titik koma di dalam string SQL (misalnya kode PHP pada bank latihan) tidak memecah statement secara keliru. Setelah selesai, **hapus `install.php` dari server**.
   - *Lewat phpMyAdmin:* pilih database aplikasi, Import BAGIAN 1; pilih database ruang latihan, Import BAGIAN 2. `sirkuit.sql` sengaja tidak memuat `CREATE DATABASE` atau `USE` agar dapat diimpor ke nama database apa pun.
   - *Lewat terminal:* `mysql -u sekolah_sirkuit -p sekolah_sirkuit < bagian1.sql` dan perintah yang sama untuk bagian 2.
5. **Aktifkan HTTPS** (cPanel > SSL/TLS Status > AutoSSL) dan pastikan `session.secure` pada `lib/config.php` bernilai `true`. Untuk uji di `http://localhost`, set `false`.
6. **Masuk dan ganti kata sandi demo.** Tabel `users` diisi akun demo (lihat bagian 5). Ganti kata sandinya sebelum kelas dimulai, atau hapus barisnya dan buat akun siswa melalui `api/tasks.php`/phpMyAdmin.

### Bila hosting membatasi eksekusi PHP di server

Sebagian shared hosting mematikan `proc_open`/`exec`. `lib/runner.php` memeriksa dua hal: sakelar `runner.aktif` di `lib/config.php` dan `function_exists('proc_open')`. Bila salah satu mati, `api/lab-run.php` membalas `"jalankan": "browser"` dan Lab Uji Kode otomatis pindah ke runtime iframe (`js/lab-sandbox.js` + `js/php-mini.js`) sehingga siswa tetap menulis `<?php`, `$_SESSION`, `PDO::prepare()`, `http_get()`, dan `json_encode()` serta melihat keluarannya; jejak eksekusi yang dilaporkan sandbox tetap dinilai di server oleh `lib/checker.php`, jadi posisi penilaian tidak berubah. Label sumber pada panel status Lab Uji Kode memberitahu siswa mode mana yang sedang dipakai.

Kueri SQL tidak bergantung pada `proc_open` dan tetap dieksekusi sungguhan di database ruang latihan selama `pdo_mysql` aktif. Dua pengaman waktu berlaku di kedua jalur: anak proses PHP server dibatasi `timeout_detik` (5 s) dan `memori_mb` (64 MB), sedangkan peramban punya penjaga 20 s; tombol **Hentikan** membatalkan permintaan dan membuang iframe sehingga ruang uji siap dipakai lagi.

## 5. Menjalankan Lokal (Pengembangan)

Perangkat ini memakai container rootless (podman) dengan Apache + PHP 8.2 dan MariaDB 11.4:

```bash
podman run -d --name sirkuit-db -e MARIADB_ROOT_PASSWORD=root_sirkuit_local \
  -p 13306:3306 docker.io/library/mariadb:11.4
podman run -d --name sirkuit-web -p 8080:80 \
  -v "$PWD/sirkuit-smkn1mejayan":/var/www/html:ro \
  localhost/sirkuit-php:8.2
```

Import ulang skema bila diperlukan (`sirkuit.sql` tidak memuat `USE`, jadi nama database diberikan sebagai argumen):

```bash
podman exec -i sirkuit-db mariadb -uroot -proot_sirkuit_local sirkuit_app < bagian1.sql
podman exec -i sirkuit-db mariadb -uroot -proot_sirkuit_local sirkuit_sandbox < bagian2.sql
```

Alternatif yang lebih sederhana: XAMPP atau LiteSpeed cPanel lokal. Karena `js/main.js` dan `js/scene3d.js` berupa ES module dan seluruh data memakai `fetch` dengan cookie sesi, aplikasi **tidak dapat dijalankan dari `file://`**; harus lewat HTTP.

### Akun demo (tombol 1 klik di halaman login)

| Peran | Identitas | Kata Sandi |
|---|---|---|
| Siswa RPL | NISN `008492104` atau `fazrin.mauza@siswa.smkn1mejayan.sch.id` | `sirkuit2027` |
| Guru Produktif | NIP `198705122015071002` atau `hendra.kusuma@smkn1mejayan.sch.id` | `guru123` |

## 6. Endpoint REST

Semua endpoint mengembalikan JSON `{status, code, message, ...}` dan dilindungi `require_login()` / `require_guru()`. Perubahan state (POST/PUT/DELETE) wajib membawa header `X-CSRF-Token` yang diberikan `api/session.php`. Satu pemakai dibatasi lajunya oleh `rate_buckets`; permintaan berlebih dijawab **429** dengan `Retry-After`, persis seperti skenario PBL Kasus 3.

| Endpoint | Fungsi |
|---|---|
| `POST /api/login.php`, `POST /api/logout.php`, `GET /api/session.php` | sesi PHP (`session_start`, `password_verify`), identitas dan peran pemakai |
| `GET /api/auth.php` | memeriksa header `Authorization` terhadap tabel sesi; token kosong atau kedaluwarsa menjawab **401** (Kasus 1 nyata) |
| `GET /api/exercises.php`, `POST /api/exercises.php` | daftar latihan Lab Uji Kode (kerangka untuk siswa, `solusi` dan `cek` hanya untuk guru); guru dapat menambah latihan |
| `POST /api/lab-run.php` | tiga jalur: bahasa `php` dijalankan sebagai anak proses `php-cli` oleh `lib/runner.php`, bahasa `sql` dieksekusi `lib/sandbox_sql.php` pada MySQL ruang latihan, dan latihan `js` (atau PHP saat runner dimatikan) dinilai dari `jejak` yang dilaporkan sandbox peramban. Semua jalur menyimpan `lab_runs` dan membalas hasil `lib/checker.php`. |
| `POST /api/sandbox-query.php` | menjalankan **satu** statement MySQL siswa pada database ruang latihan untuk panel Lab Kueri |
| `GET /api/grid.php` | baris hasil untuk panel tabel dan grid jawaban (`tabel`, `kolom`, `order`, `dir`, `q`, `limit`, `offset`) |
| `GET /api/schema.php` | struktur seluruh tabel ruang latihan dari `information_schema`, dipakai sebagai petunjuk skema di Lab Uji Kode dan Lab Kueri |
| `GET/POST /api/tasks.php`, `GET/POST /api/submissions.php` | siklus tugas: guru membuat, siswa mengirim kode + keluaran + grid, guru menilai. Kolom JSON `hasil_grid` dan `jejak` hanya dibuka untuk guru, jadi yang dinilai adalah baris MySQL yang benar-benar dilihat siswa. |
| `GET /api/quiz.php`, `POST /api/quiz.php` | 12 soal HOTS tanpa kolom `kunci`; penilaian dan pembahasan dihitung server |
| `GET/POST /api/scenarios.php` | skenario PBL dan opsi (kolom `benar` hanya ke guru), pencatatan `pbl_simulation_logs` |
| `GET /api/grades.php`, `GET /api/dashboard.php` | rekap nilai UKK/tugas/kuis per siswa dan KPI dashboard |
| `GET/POST/PUT/DELETE /api/{siswa,nilai-ukk,nilai-siswa,jurnal-pkl,proyek-siswa,prakerin-siswa,sesi-log}.php` | endpoint materi ajar yang dipakai siswa berlatih REST, termasuk pembuktian kasus 401 dan 404 |

## 7. Alur Uji untuk Dokumentasi (Bab III)

Navigasi utama: **Tugas**, **Lab Kueri**, **Lab Uji Kode**, **Modul dan Kuis**, **Alur Request Saya**, **Inspeksi JSON**, **Dashboard Guru**. Tombol Dashboard Guru hanya tampil untuk akun guru; siswa yang baru login mendarat di halaman Tugas, guru di Dashboard.

| Gambar | Langkah | Yang harus terlihat |
|---|---|---|
| 3.2 | Sebelum login | Form login Siswa/Guru, dua tombol akun demo satu klik, dan daftar fakta yang menempatkan PHP + MySQL sebagai materi sekaligus backend aplikasi. |
| 3.3 | Lab Uji Kode, latihan 1 "Respons JSON pertama dari skrip PHP", mode NORMAL, ganti `echo "ganti baris ini"` dengan `echo json_encode($data);` lalu Periksa Jawaban | Konsol memuat keluaran JSON nyata `{"status":"ok","nama_siswa":"Fazrin Mauza Dwi Zuhudi",...}`, header `Content-Type: application/json`, jejak HTTP, dan hasil pemeriksaan "TEPAT". |
| 3.3b | Lab Kueri, jalankan `SELECT s.nisn, s.nama, n.nilai FROM siswa s JOIN nilai_ukk n ON n.siswa_id = s.id ORDER BY n.nilai DESC` | Grid kolom dan baris nyata dari database ruang latihan beserta jumlah baris, waktu eksekusi, dan teks SQL di bawah tabel. |
| 3.3c | Lab Kueri, jalankan `SELECT nisn_salah FROM siswa` lalu klik **Unduh PNG** | Pesan galat memuat kode MySQL 1054 dan saran guru; berkas `sirkuit-<NISN>-kueri-<waktu>.png` terunduh dengan watermark nama, NISN, kelas, waktu, dan SQL. |
| 3.3d | Latihan dengan mode E401/E404/E429/E500 | Request siswa mendapat status yang sama dengan skenario Alur Request, beserta pesan error MySQL yang sesuai (1054, 1040). |
| 3.3e | Latihan 5 "Perbaiki 401 Unauthorized dari sisi PHP" dijalankan akun siswa, lalu dijalankan akun guru | Siswa: `refresh_session()` menjawab 201 dan request berikutnya 200 sehingga pemeriksaan "TEPAT". Guru: `POST /api/auth.php` menjawab 409 dan konsol menampilkan baris kuning bahwa token terikat pada baris siswa di ruang latihan, jadi guru diarahkan ke tab Solusi dan kegagalan tidak disalahpahami sebagai bug. |
| 3.4a | Akun guru, halaman Tugas: isi judul, instruksi, Bahasa = SQL MySQL, Kelas `XI RPL 1`, latihan bank nomor 8, tenggat, bobot, lalu Buat Tugas | Daftar bertambah satu baris dengan label `SQL MySQL` dan keterangan `0 kiriman, 0 belum dinilai`; form kembali ke "Tambah Tugas". |
| 3.4b | Akun siswa, Tugas 5 dipilih, tekan **Kerjakan di Lab Kueri**, jalankan kueri JOIN, tekan **Kirim Sebagai Jawaban** | Bar oranye "Sedang mengerjakan tugas ..." muncul di atas editor SQL, grid menjawab `4 kolom, 5 baris, 1 ms`, jawaban tersimpan dan daftar tugas berubah menjadi `terkirim, menunggu nilai`. |
| 3.4c | Akun guru, Tugas 5 dipilih, tabel Kiriman Siswa diisi nilai dan catatan lalu Simpan | Tabel memuat nama, NISN, waktu kirim, status HTTP, tombol Lihat kode yang membuka SQL, keluaran, dan grid baris MySQL persis yang dikirim siswa, serta kolom nilai 0-100; siswa yang sama membaca `Nilai 87` beserta catatan guru. |
| 3.4d | Siswa mengirim ulang jawaban yang sudah dinilai | Nilai dan catatan terhapus, baris `task_submissions` yang sama diperbarui (`pernah_kirim_sebelumnya = true`), bukan baris baru. |
| 3.5 | Alur Request Saya, mode normal, tekan `1. Client Menyusun Request` sampai `5. Response ke Client` | Paket melaju pada pipa request dan response, status tahap tampil di bawah kanvas. |
| 3.6 | Muat skenario 429, jalankan tiap tahap, pilih opsi solusi | Stepper PBL, problem card dari MySQL, Node Inspector, JSON Viewer; opsi keliru ditolak server, opsi tepat dicatat ke `pbl_simulation_logs`. |
| 3.7 | Login akun guru | KPI dari MySQL, tabel rekap nilai UKK / skenario PBL / tugas / kuis, filter kelas dan status KKM, Unduh CSV, log aktivitas. |
| 3.8 | Buka di lebar 390 px | Tidak ada scroll horizontal halaman (`scrollWidth = clientWidth`, terukur 382 = 382 pada iframe 390 px, baik pada akun guru maupun siswa); kolom Tugas menumpuk satu kolom, tabel kiriman dan stepper PBL menggulir di dalam shell-nya sendiri, pemilih Bahasa di Lab Uji Kode turun ke baris kedua tanpa terpotong, dan kueri tetap dapat dijalankan di ponsel. |

## 8. Optimisasi Perangkat Rendah

HUD kanan-atas kanvas menyediakan **Mode Tinggi** (pixelRatio penuh, shadow map, glow, sekitar 340 partikel) dan **Mode Ringan** (pixelRatio dibatasi 1.25, shadow map mati, sekitar 90 partikel) sesuai refleksi Bab III.B.6 proposal. Mode ringan juga mengurangi beban GPU saat simulasi dijalankan di laptop lab atau ponsel siswa.

## 9. Pengujian Black-Box

| # | Fitur | Verifikasi |
|---|---|---|
| 1 | Autentikasi multi-peran | Login siswa/guru, penolakan akses silang peran, 401 tanpa sesi |
| 2 | CSRF dan rate limit | POST tanpa `X-CSRF-Token` ditolak 403; permintaan berlebih menjawab 429 dengan `Retry-After` |
| 3 | Eksekusi nyata | Kueri SQL siswa dieksekusi di database ruang latihan (`lib/sandbox_sql.php`); PHP dieksekusi sebagai anak proses `php-cli` (`lib/runner.php`) dengan batas 5 s dan 64 MB |
| 3b | Grid hasil dan Unduh PNG | `api/grid.php` mengurutkan, menyaring, dan memagasi baris nyata; PNG hasil unduhan memuat watermark nama, NISN, kelas, waktu, dan teks SQL |
| 3c | Cadangan dan penghentian | `runner.aktif = false` membalas `"jalankan": "browser"` dan Lab Uji Kode pindah ke runtime iframe; tombol Hentikan dan penjaga 20 s menghentikan eksekusi tanpa merusak ruang uji |
| 4 | Isolasi basis data | Akun MySQL sandbox tidak dapat membaca `users`, `tasks`, `task_submissions`, `quiz_attempts` |
| 5 | Kunci jawaban tidak bocor | Respons `quiz.php` dan `scenarios.php` untuk siswa tidak memuat `kunci` maupun `benar`; respons `exercises.php` untuk siswa tidak memuat `cek` maupun `solusi` |
| 6 | Siklus tugas | Guru membuat, siswa mengirim, guru menilai; kirim ulang memperbarui baris yang sama; `hasil_grid` dan `jejak` hanya dibuka untuk guru |
| 7 | Alur Request dan PBL | Orbit/pan/zoom, raycast hotspot, 4 skenario, proses per langkah, tombol Hentikan |
| 8 | Modul dan kuis | 12 soal HOTS, skor otomatis vs KKM 75, pembahasan per soal |
| 9 | Dashboard guru | KPI, filter, ekspor CSV, log aktivitas, sinkron antar perangkat |

---

**Lisensi akademik**, dikembangkan untuk keperluan Proyek Pembelajaran di SMK (PLP UNESA dan SMKN 1 Mejayan), 2026/2027.
