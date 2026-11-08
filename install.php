<?php
/**
 * SIRKUIT - install.php
 * Pengimpor sirkuit.sql lewat peramban untuk hosting cPanel/shared hosting.
 *
 * Cara kerja: membaca sirkuit.sql di samping berkas ini, memotongnya menjadi
 * BAGIAN 1 (database aplikasi) dan BAGIAN 2 (database ruang latihan), lalu
 * menjalankan tiap bagian ke database yang dipilih. Pemisahan memakai
 * mysqli::multi_query sehingga titik koma di dalam string SQL (misalnya kode
 * PHP pada bank latihan) tidak memecah statement secara salah.
 *
 * Setelah impor berhasil, berkas lib/config.php ditulisi otomatis bila folder
 * lib masih bisa ditulis. Hapus install.php dari server sesudah dipakai.
 */

declare(strict_types=1);

if (!extension_loaded('mysqli')) {
    die('Ekstensi mysqli belum aktif. Aktifkan lewat cPanel > Select PHP Version > Extensions.');
}

// PHP 8.1 mengubah mysqli menjadi pelempar exception. Mode laporan dimatikan
// supaya error bisa diperiksa per statement lewat ->errno.
mysqli_report(MYSQLI_REPORT_OFF);

$berkasSql = __DIR__ . '/sirkuit.sql';
$berkasConfig = __DIR__ . '/lib/config.php';
$penanda = 'SIRKUIT BAGIAN 2';

/** Konfigurasi saat ini, dipakai sebagai nilai awal formulir. */
function konfigurasi_lama(string $berkas): array
{
    if (!is_file($berkas)) {
        return [];
    }
    $c = @include $berkas;
    return is_array($c) ? $c : [];
}

/** Nama tabel yang dibuat sebuah bagian SQL; dipakai untuk mengosongkan basis. */
function daftar_tabel(string $isi): array
{
    preg_match_all('/CREATE TABLE IF NOT EXISTS\s+`?([a-z_]+)`?/i', $isi, $m);
    return array_values(array_unique($m[1]));
}

/** Hapus tabel buatan bagian SQL ini supaya impor bisa dijalankan ulang. */
function kosongkan(mysqli $db, string $isi): void
{
    $db->query('SET FOREIGN_KEY_CHECKS = 0');
    foreach (array_reverse(daftar_tabel($isi)) as $t) {
        $db->query('DROP TABLE IF EXISTS `' . $t . '`');
    }
    $db->query('SET FOREIGN_KEY_CHECKS = 1');
}

/**
 * Impor satu bagian SQL ke satu database.
 * @return array{0:bool,1:string} [berhasil, pesan]
 */
function impor(mysqli $db, string $isi): array
{
    if (!$db->multi_query($isi)) {
        return [false, 'Statement pertama gagal: ' . $db->error];
    }
    $langkah = 0;
    do {
        $langkah++;
        if ($hasil = $db->store_result()) {
            $hasil->free();
        }
        if ($db->errno !== 0) {
            return [false, 'Gagal pada statement ke-' . $langkah . ': ' . $db->error];
        }
    } while ($db->more_results() && $db->next_result());

    return $db->errno === 0 ? [true, $langkah . ' statement berjalan.'] : [false, $db->error];
}

function potong_sql(string $isi, string $penanda): array
{
    $posisi = strpos($isi, $penanda);
    if ($posisi === false) {
        return [null, null];
    }
    // Cari batas blok komentar "-- ====" tepat sebelum judul BAGIAN 2.
    $awal = strrpos(substr($isi, 0, $posisi), '-- ====');
    $bagian1 = rtrim(substr($isi, 0, $awal === false ? $posisi : $awal));
    $bagian2 = rtrim(substr($isi, $awal === false ? $posisi : $awal));
    return [$bagian1, $bagian2];
}

$lama = konfigurasi_lama($berkasConfig);
$dbLama = $lama['db'] ?? [];
$sudahTerpasang = is_file($berkasConfig) && !empty($dbLama['app_name']);

$pesan = [];
$gagal = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($sudahTerpasang && !isset($_POST['paksa'])) {
        $pesan[] = ['ok' => false, 'teks' => 'SIRKUIT tercatat sudah terpasang. Centang "Jalankan ulang" hanya bila ingin menimpa data.'];
        $gagal = true;
    } else {
        $host = trim((string) ($_POST['host'] ?? 'localhost'));
        $port = (int) ($_POST['port'] ?? 3306);
        $app = [
            'nama' => trim((string) ($_POST['app_nama'] ?? '')),
            'user' => trim((string) ($_POST['app_user'] ?? '')),
            'pass' => (string) ($_POST['app_pass'] ?? ''),
        ];
        $sbox = [
            'nama' => trim((string) ($_POST['sbox_nama'] ?? '')),
            'user' => trim((string) ($_POST['sbox_user'] ?? '')),
            'pass' => (string) ($_POST['sbox_pass'] ?? ''),
            'buat_user' => trim((string) ($_POST['sbox_admin_user'] ?? '')),
            'buat_pass' => (string) ($_POST['sbox_admin_pass'] ?? ''),
        ];

        foreach (['app' => $app, 'sbox' => $sbox] as $label => $v) {
            if ($v['nama'] === '' || $v['user'] === '') {
                $pesan[] = ['ok' => false, 'teks' => 'Nama database dan user untuk ' . $label . ' wajib diisi.'];
                $gagal = true;
            }
        }
        if ($sbox['buat_user'] === '') {
            $pesan[] = ['ok' => false, 'teks' => 'User pembuat tabel ruang latihan wajib diisi. Selama impor berjalan, user itu perlu hak CREATE pada database ruang latihan.'];
            $gagal = true;
        }
        if (!is_file($berkasSql)) {
            $pesan[] = ['ok' => false, 'teks' => 'sirkuit.sql tidak ditemukan di folder yang sama dengan install.php.'];
            $gagal = true;
        }

        if (!$gagal) {
            [$bagian1, $bagian2] = potong_sql((string) file_get_contents($berkasSql), $penanda);
            if ($bagian1 === null) {
                $pesan[] = ['ok' => false, 'teks' => 'Penanda "' . $penanda . '" tidak ada di sirkuit.sql. Berkas mungkin terpotong.'];
                $gagal = true;
            }
        }

        if (!$gagal) {
            $koneksiApp = @new mysqli($host, $app['user'], $app['pass'], $app['nama'], $port);
            $koneksiSbox = @new mysqli($host, $sbox['buat_user'], $sbox['buat_pass'], $sbox['nama'], $port);
            if ($koneksiApp->connect_errno || $koneksiSbox->connect_errno) {
                $pesan[] = ['ok' => false, 'teks' => 'Koneksi gagal: ' . ($koneksiApp->connect_error ?: $koneksiSbox->connect_error) .
                    '. Periksa nama database, user, dan password di cPanel > MySQL Databases.'];
                $gagal = true;
            } else {
                $koneksiApp->set_charset('utf8mb4');
                $koneksiSbox->set_charset('utf8mb4');
                if (isset($_POST['paksa'])) {
                    kosongkan($koneksiApp, (string) $bagian1);
                    kosongkan($koneksiSbox, (string) $bagian2);
                    $pesan[] = ['ok' => true, 'teks' => 'Tabel lama dibuang lebih dulu sesuai pilihan "Jalankan ulang".'];
                }
                [$ok1, $t1] = impor($koneksiApp, (string) $bagian1);
                [$ok2, $t2] = impor($koneksiSbox, (string) $bagian2);
                $pesan[] = ['ok' => $ok1, 'teks' => $app['nama'] . ' (database aplikasi): ' . $t1];
                $pesan[] = ['ok' => $ok2, 'teks' => $sbox['nama'] . ' (ruang latihan): ' . $t2];
                $gagal = !($ok1 && $ok2);

                if (!$gagal) {
                    $konfig = [
                        'app' => ['nama' => 'SIRKUIT', 'versi' => '3.0.0', 'timezone' => 'Asia/Jakarta', 'debug' => false],
                        'db' => [
                            'host' => $host, 'port' => $port, 'charset' => 'utf8mb4',
                            'app_name' => $app['nama'], 'app_user' => $app['user'], 'app_pass' => $app['pass'],
                            'sandbox_name' => $sbox['nama'], 'sandbox_user' => $sbox['user'], 'sandbox_pass' => $sbox['pass'],
                        ],
                        'session' => ['name' => 'SIRKUITSID', 'lifetime' => 7200, 'secure' => str_starts_with($_SERVER['HTTP_REFERER'] ?? '', 'https')],
                        'runner' => [
                            'aktif' => false, 'php_bin' => PHP_BINARY ?: '/usr/bin/php', 'timeout_detik' => 5,
                            'memori_mb' => 64, 'direktori_run' => sys_get_temp_dir() . '/sirkuit-run', 'basis_url' => '',
                            'fungsi_diblok' => 'exec,shell_exec,system,passthru,popen,proc_open,pcntl_fork,pcntl_exec,dl,assert,create_function,'
                                . 'call_user_func,call_user_func_array,file_put_contents,unlink,rmdir,mkdir,rename,copy,scandir,opendir,glob,'
                                . 'curl_init,curl_exec,curl_multi_exec,fsockopen,stream_socket_client,stream_socket_server,getenv,putenv,'
                                . 'highlight_file,show_source,readfile,mail,error_reporting,ini_set,ini_alter',
                        ],
                        'rate' => ['_window_detik' => 60, 'kuota_default' => 40],
                    ];
                    $tulis = "<?php\n// Ditulis otomatis oleh install.php pada " . date('c') . ".\n"
                        . "// JANGAN mengunggah berkas ini ke repo: berisi kredensial database.\n"
                        . "return " . var_export($konfig, true) . ";\n";
                    if (is_dir(__DIR__ . '/lib') && @file_put_contents($berkasConfig, $tulis) !== false) {
                        @chmod($berkasConfig, 0640);
                        $pesan[] = ['ok' => true, 'teks' => 'lib/config.php berhasil ditulisi. Silakan hapus install.php dari server.'];
                    } else {
                        $pesan[] = ['ok' => true, 'teks' => 'Impor selesai, tetapi lib/config.php tidak bisa ditulis. Salin lib/config.sample.php menjadi lib/config.php lalu isi kredensial di atas.'];
                    }
                }
            }
        }
    }
}
?>
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Pasang SIRKUIT</title>
<style>
  :root { --muka: #fffaf2; --kartu: #ffffff; --garis: #f0e2cf; --teks: #2a2118; --kuning: #b45309; --hijau: #15803d; --merah: #b91c1c; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 20px; background: var(--muka); color: var(--teks); font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 780px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .sub { color: #6b5c4b; margin: 0 0 24px; }
  form, .kartu { background: var(--kartu); border: 1px solid var(--garis); border-radius: 10px; padding: 20px 22px; margin-bottom: 18px; }
  fieldset { border: 0; padding: 0; margin: 0 0 18px; }
  legend { font-weight: 650; padding: 0; margin-bottom: 10px; }
  label { display: block; margin-bottom: 10px; }
  label span { display: inline-block; width: 150px; font-weight: 550; color: #4a3f33; }
  input { width: 300px; max-width: 100%; padding: 7px 10px; border: 1px solid var(--garis); border-radius: 6px; font: inherit; background: #fff; }
  button { background: var(--kuning); color: #fff; border: 0; border-radius: 6px; padding: 10px 20px; font: inherit; font-weight: 650; cursor: pointer; }
  ul.has { list-style: none; padding: 0; margin: 0; }
  ul.has li { padding: 8px 12px; border-left: 4px solid var(--garis); background: #fff; border-radius: 0 6px 6px 0; margin-bottom: 8px; }
  li.o { border-left-color: var(--hijau); }
  li.x { border-left-color: var(--merah); }
  .kecil { font-size: 13px; color: #6b5c4b; }
</style>
</head>
<body>
<main>
  <h1>Pasang SIRKUIT</h1>
  <p class="sub">Mengimpor <code>sirkuit.sql</code> ke dua database: aplikasi dan ruang latihan.</p>

  <?php if ($pesan !== []): ?>
    <ul class="has">
      <?php foreach ($pesan as $p): ?>
        <li class="<?= $p['ok'] ? 'o' : 'x' ?>"><?= htmlspecialchars($p['teks']) ?></li>
      <?php endforeach; ?>
    </ul>
    <?php if (!$gagal): ?>
      <div class="kartu">
        <strong>Langkah berikutnya.</strong>
        <ol class="kecil">
          <li>Hapus <code>install.php</code> dari server.</li>
          <li>Buka halaman login SIRKUIT dan masuk dengan akun demo.</li>
          <li>Lab Uji memakai sandbox peramban. Eksekusi PHP di server hanya dinyalakan bila hosting mengizinkan <code>proc_open</code>; lihat <code>runner.aktif</code> pada <code>lib/config.php</code>.</li>
        </ol>
      </div>
    <?php endif; ?>
  <?php endif; ?>

  <form method="post">
    <fieldset>
      <legend>Koneksi MySQL</legend>
      <label><span>Host</span><input name="host" value="<?= htmlspecialchars((string) ($dbLama['host'] ?? 'localhost')) ?>"></label>
      <label><span>Port</span><input name="port" value="<?= (int) ($dbLama['port'] ?? 3306) ?>"></label>
    </fieldset>

    <fieldset>
      <legend>Database aplikasi</legend>
      <label><span>Nama database</span><input name="app_nama" value="<?= htmlspecialchars((string) ($dbLama['app_name'] ?? '')) ?>" placeholder="namauser_sirkuit_app"></label>
      <label><span>User MySQL</span><input name="app_user" value="<?= htmlspecialchars((string) ($dbLama['app_user'] ?? '')) ?>"></label>
      <label><span>Password</span><input name="app_pass" type="password" value="<?= htmlspecialchars((string) ($dbLama['app_pass'] ?? '')) ?>"></label>
    </fieldset>

    <fieldset>
      <legend>Database ruang latihan</legend>
      <label><span>Nama database</span><input name="sbox_nama" value="<?= htmlspecialchars((string) ($dbLama['sandbox_name'] ?? '')) ?>" placeholder="namauser_sirkuit_sandbox"></label>
      <label><span>User pembuat tabel</span><input name="sbox_admin_user" value="<?= htmlspecialchars((string) ($_POST['sbox_admin_user'] ?? ($dbLama['sandbox_user'] ?? ''))) ?>"></label>
      <label><span>Password pembuat</span><input name="sbox_admin_pass" type="password" value="<?= htmlspecialchars((string) ($_POST['sbox_admin_pass'] ?? '')) ?>"></label>
      <label><span>User ruang latihan</span><input name="sbox_user" value="<?= htmlspecialchars((string) ($dbLama['sandbox_user'] ?? '')) ?>"></label>
      <label><span>Password latihan</span><input name="sbox_pass" type="password" value="<?= htmlspecialchars((string) ($dbLama['sandbox_pass'] ?? '')) ?>"></label>
      <p class="kecil">Beri hak CREATE sementara pada user ruang latihan agar struktur tabel dapat dibuat. Sesudah impor selesai, cabut hak itu di cPanel &gt; MySQL Databases dan sisakan SELECT, INSERT, UPDATE, DELETE. Dengan pembatasan itu kode PHP atau SQL siswa tidak dapat membaca tabel akun dan nilai tugas meskipun kredensialnya terbaca.</p>
    </fieldset>

    <?php if ($sudahTerpasang): ?>
      <label><span></span><input type="checkbox" name="paksa" value="1" style="width:auto"> Jalankan ulang (menimpa struktur dan data yang ada)</label>
    <?php endif; ?>

    <button type="submit">Impor sirkuit.sql</button>
  </form>

  <p class="kecil">Berkas ini hanya untuk sekali pakai saat pemasangan. Hapus setelah database terisi.</p>
</main>
</body>
</html>
