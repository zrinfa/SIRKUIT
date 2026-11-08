<?php
/**
 * api/lab-run.php
 * POST {exercise_id, kode, bahasa: 'php'} -> jalankan PHP siswa di server.
 * POST {exercise_id, kode, bahasa: 'sql'} -> jalankan statement SQL siswa
 *                                            pada MySQL ruang latihan.
 * POST {exercise_id, bahasa, jejak}       -> nilai jejak eksekusi dari sandbox
 *                                            peramban (untuk latihan js, dan
 *                                            untuk PHP bila hosting memblokir
 *                                            proc_open).
 *
 * Keluaran: output konsol, header yang dikirim header(), daftar kueri MySQL
 * beserta baris hasil dan error aslinya, daftar request HTTP + status, dan
 * hasil penilaian Checker server.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';
require_once __DIR__ . '/../lib/runner.php';
require_once __DIR__ . '/../lib/checker.php';
require_once __DIR__ . '/../lib/sandbox_sql.php';

$m = require_method(['POST']);
$u = require_login();
batasi_kuota('/api/lab-run.php', $u);
csrf_validasi();

$b = body_json();
$bahasa = strtolower(trim((string) ($b['bahasa'] ?? 'php')));
if (!in_array($bahasa, ['php', 'js', 'sql'], true)) {
    json_error('Bahasa harus php, js, atau sql.', 422);
}
$exerciseId = (int) ($b['exercise_id'] ?? 0);
if ($exerciseId > 0) {
    $st = DB::app()->prepare('SELECT id, bahasa, mode, judul, cek FROM lab_exercises WHERE id = ? AND aktif = 1');
    $st->execute([$exerciseId]);
    $latihan = $st->fetch();
    if (!$latihan) {
        json_error('Latihan tidak ditemukan atau sudah dinonaktifkan.', 404);
    }
    $bahasa = (string) $latihan['bahasa'];
    $mode = (string) $latihan['mode'];
    $cekJson = $latihan['cek'];
} else {
    $mode = strtoupper(trim((string) ($b['mode'] ?? 'NORMAL')));
    $cekJson = $b['cek'] ?? null;
    if (is_array($cekJson)) {
        $cekJson = json_encode($cekJson, JSON_UNESCAPED_UNICODE);
    }
}

$token = '';
$sid = session_id();
$csrf = (string) ($_SESSION['csrf'] ?? '');
// Anak proses akan memanggil endpoint kita sendiri dengan cookie sesi ini.
// Session file harus dilepas lebih dulu, kalau tidak request itu menunggu
// parent selesai dan keduanya macet sampai timeout.
session_write_close();

$jejak = $b['jejak'] ?? null;
if (is_array($jejak)) {
    $trace = normalisasi_jejak($jejak);
    $jalankan = 'browser';
} elseif ($bahasa === 'sql') {
    $trace = jejak_sql((string) ($b['kode'] ?? ''), $mode, $u);
    $jalankan = 'server';
} else {
    if ($bahasa !== 'php') {
        json_out([
            'status' => 'error',
            'code' => 415,
            'message' => 'Latihan ' . $bahasa . ' dijalankan di sandbox peramban, lalu jejaknya dilaporkan kembali ke endpoint ini.',
            'jalankan' => 'browser',
        ], 415);
    }
    if (!Runner::tersedia()) {
        json_out([
            'status' => 'error',
            'code' => 503,
            'message' => Runner::alasanTidakTersedia(),
            'jalankan' => 'browser',
            'solusi' => 'Latihan PHP dijalankan pada ruang isolasi peramban dan dinilai dari jejak yang dilaporkan ke endpoint ini. Latihan SQL tetap dieksekusi MySQL di server.',
        ], 503);
    }
    $kode = (string) ($b['kode'] ?? '');
    if (strlen($kode) > 20000) {
        json_error('Kode terlalu panjang (maksimal 20.000 karakter).', 422);
    }
    if (trim($kode) === '') {
        json_error('Tidak ada kode untuk dijalankan.', 422);
    }
    if (isset($b['pakai_token'])) {
        $token = (string) $b['pakai_token'];
    } elseif ($mode === 'E401') {
        $token = 'token_expired_null';
    }

    $trace = Runner::jalankan([
        'kode' => $kode,
        'bahasa' => $bahasa,
        'mode' => $mode,
        'user' => $u,
        'token' => $token,
        'sid' => $sid,
        'csrf' => $csrf,
        'api_basis' => basis_url(),
    ]);
    $jalankan = 'server';
}

/* Kasus 401 bergantung pada baris siswa di ruang latihan, jadi guru selalu
   mendapat penolakan 409 pada POST /api/auth.php. Dijelaskan di konsol supaya
   guru tidak mengira kerangkanya yang salah. */
if ($bahasa === 'php' && $u['peran'] !== 'siswa') {
    foreach (($trace['calls'] ?? []) as $c) {
        if (str_contains((string) ($c['path'] ?? ''), '/api/auth.php') && (int) ($c['status'] ?? 0) >= 400) {
            $trace['peringatan'][] = 'Token sesi dibuat dari baris siswa di tabel ruang latihan. Latihan kasus 401 dijalankan dengan akun siswa; sebagai guru, gunakan tab Solusi.';
            break;
        }
    }
}

$nilai = $cekJson ? Checker::evaluasi((string) $cekJson, $trace) : null;
$lulus = $nilai['passed'] ?? false;

$st = DB::app()->prepare(
    'INSERT INTO lab_runs (user_id, exercise_id, bahasa, kode, output, jejak, lulus, eksekusi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
$st->execute([
    (int) $u['id'],
    $exerciseId > 0 ? $exerciseId : null,
    $bahasa,
    (string) ($b['kode'] ?? ''),
    (string) ($trace['output'] ?? ''),
    json_encode($trace, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    $lulus ? 1 : 0,
    $jalankan,
]);

json_out([
    'status' => 'success',
    'code' => 200,
    'jalankan' => $jalankan,
    'lulus' => $lulus,
    'penilaian' => $nilai,
    'output' => (string) ($trace['output'] ?? ''),
    'header' => $trace['header'] ?? [],
    'queries' => $trace['queries'] ?? [],
    'calls' => $trace['calls'] ?? [],
    'fatal' => $trace['fatal'] ?? null,
    'peringatan' => $trace['peringatan'] ?? [],
    'dihentikan' => (bool) ($trace['dihentikan'] ?? false),
    'durasi_ms' => (int) ($trace['durasi_ms'] ?? 0),
    'koneksi_dipakai' => (int) ($trace['koneksi_dipakai'] ?? 0),
    'basis_data' => $trace['basis_data'] ?? null,
    'pemroses' => $trace['pemroses'] ?? null,
    'mode' => $mode,
    'id_run' => (int) DB::app()->lastInsertId(),
], 200, ['Cache-Control' => 'no-store']);

/**
 * Menjalankan seluruh statement SQL siswa pada MySQL ruang latihan lalu
 * menyusunnya menjadi jejak yang bisa dinilai Checker. Baris hasil ikut
 * dibawa supaya grid Lab Uji menampilkan data sungguhan, bukan angka simulasi.
 */
function jejak_sql(string $kode, string $mode, array $u): array
{
    if (strlen($kode) > 20000) {
        json_error('Kode terlalu panjang (maksimal 20.000 karakter).', 422);
    }
    $statement = SandboxSql::pisah($kode);
    if ($statement === []) {
        json_error('Tidak ada statement SQL untuk dijalankan.', 422);
    }
    if (count($statement) > SandboxSql::MAKS_STATEMENT) {
        json_error('Maksimal ' . SandboxSql::MAKS_STATEMENT . ' statement dalam satu kali jalan.', 422);
    }

    $queries = [];
    $teks = [];
    $total_ms = 0;
    foreach ($statement as $i => $s) {
        $nomor = $i + 1;
        $tolak = SandboxSql::validasi($s);
        if ($tolak !== null) {
            $queries[] = ['sql' => $s, 'rows' => 0, 'terpengaruh' => 0, 'waktu_ms' => 0, 'error' => $tolak['pesan'], 'kode' => null, 'kolom' => [], 'data' => []];
            $teks[] = $nomor . '. ' . $tolak['pesan'];
            continue;
        }
        $h = SandboxSql::eksekusi($s);
        $total_ms += $h['waktu_ms'];
        $queries[] = [
            'sql' => $h['sql'],
            'rows' => $h['jumlah'],
            'terpengaruh' => $h['terpengaruh'],
            'waktu_ms' => $h['waktu_ms'],
            'error' => $h['error'],
            'kode' => $h['kode'],
            'kolom' => array_map(static fn (array $c): string => (string) $c['nama'], $h['kolom']),
            'data' => $h['error'] === null ? SandboxSql::potongBaris($h['baris']) : [],
        ];
        $teks[] = $h['error'] === null
            ? $nomor . '. ' . $h['perintah'] . ': ' . ($h['jumlah'] > 0 ? $h['jumlah'] . ' baris kembali' : $h['terpengaruh'] . ' baris terpengaruh') . ', ' . $h['waktu_ms'] . ' ms'
            : $nomor . '. ' . $h['perintah'] . ' ditolak MySQL: ' . $h['error'];
    }

    DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Menjalankan ' . count($statement) . ' statement SQL Lab Uji di MySQL (' . $total_ms . ' ms).');
    $basis = (string) DB::sandbox()->query('SELECT DATABASE()')->fetchColumn();

    return [
        'output' => implode("\n", $teks),
        'header' => [],
        'queries' => $queries,
        'calls' => [],
        'fatal' => null,
        'peringatan' => [],
        'dihentikan' => false,
        'koneksi_dipakai' => 1,
        'durasi_ms' => $total_ms,
        'mode' => $mode,
        'basis_data' => $basis,
        'pemroses' => 'MySQL/MariaDB lewat PDO (PHP ' . PHP_VERSION . ')',
        'jalankan' => 'server',
    ];
}

/** Alamat server yang dipakai anak proses ketika http_get() dipanggil. */
function basis_url(): string
{
    $https = ($_SERVER['HTTPS'] ?? '') !== '' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $skema = $https ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    if (!preg_match('/:\d+$/', $host)) {
        $port = (int) ($_SERVER['SERVER_PORT'] ?? 80);
        if (($skema === 'http' && $port !== 80) || ($skema === 'https' && $port !== 443)) {
            $host .= ':' . $port;
        }
    }
    $dasar = preg_replace('#/api/?$#', '', str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/lab-run.php')));
    return $skema . '://' . $host . $dasar;
}

/** Jejak dari peramban dibersihkan agar hanya berisi data yang dibutuhkan. */
function normalisasi_jejak(array $j): array
{
    $out = [
        'output' => (string) ($j['output'] ?? ''),
        'queries' => [], 'calls' => [], 'header' => [], 'peringatan' => [],
        'fatal' => isset($j['fatal']) && trim((string) $j['fatal']) !== '' ? (string) $j['fatal'] : null,
        'dihentikan' => (bool) ($j['dihentikan'] ?? false),
        'koneksi_dipakai' => (int) ($j['koneksi_dipakai'] ?? 0),
        'durasi_ms' => (int) ($j['durasi_ms'] ?? 0),
        'mode' => strtoupper((string) ($j['mode'] ?? 'NORMAL')),
        'jalankan' => 'browser',
    ];
    foreach ((array) ($j['queries'] ?? []) as $q) {
        if (!is_array($q)) {
            continue;
        }
        $rekam = [
            'sql' => substr((string) ($q['sql'] ?? ''), 0, 4000),
            'rows' => (int) ($q['rows'] ?? 0),
            'terpengaruh' => (int) ($q['terpengaruh'] ?? 0),
            'error' => isset($q['error']) ? substr((string) $q['error'], 0, 800) : null,
            'kode' => isset($q['kode']) ? (int) $q['kode'] : null,
            'waktu_ms' => (int) ($q['waktu_ms'] ?? 0),
        ];
        // Baris nyata ikut dilaporkan agar grid Lab Uji menampilkan data MySQL
        // sungguhan, bukan angka hasil simulasi peramban.
        if (isset($q['kolom']) && is_array($q['kolom'])) {
            $rekam['kolom'] = array_slice(array_map('strval', $q['kolom']), 0, 40);
        }
        if (isset($q['data']) && is_array($q['data'])) {
            $rekam['data'] = array_slice($q['data'], 0, 40);
        }
        $out['queries'][] = $rekam;
    }
    foreach ((array) ($j['calls'] ?? []) as $c) {
        if (!is_array($c)) {
            continue;
        }
        $out['calls'][] = [
            'method' => strtoupper(substr((string) ($c['method'] ?? 'GET'), 0, 8)),
            'path' => substr((string) ($c['path'] ?? ''), 0, 300),
            'status' => (int) ($c['status'] ?? 0),
            'from_cache' => (bool) ($c['from_cache'] ?? false),
        ];
    }
    foreach ((array) ($j['header'] ?? []) as $h) {
        $out['header'][] = substr((string) $h, 0, 300);
    }
    return $out;
}
