<?php
/**
 * api/sandbox-query.php - POST {sql: "..."}
 * Menjalankan SATU statement MySQL milik siswa pada database ruang latihan
 * (schema sandbox, user sandbox). Inilah yang membuat "kueri siswa" benar-benar
 * dieksekusi MySQL: salah kolom membalas 1054, salah tabel membalas 1146.
 *
 * Aturan aman dan eksekusinya ada di lib/sandbox_sql.php, file yang sama juga
 * dipakai api/lab-run.php saat menilai latihan SQL.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';
require_once __DIR__ . '/../lib/sandbox_sql.php';

require_method(['POST']);
$u = require_login();
csrf_validasi();
batasi_kuota('/api/sandbox-query.php', $u);

$b = body_json();
$sql = trim((string) ($b['sql'] ?? ''));
if ($sql === '') {
    json_error('Body harus berisi {"sql":"SELECT ..."}.', 422);
}

$sql = (string) preg_replace('/;\s*$/', '', $sql);
if (str_contains((string) $sql, ';')) {
    json_error('Hanya satu statement per permintaan. Titik koma kedua ditemukan.', 400);
}

$tolak = SandboxSql::validasi((string) $sql);
if ($tolak !== null) {
    json_error($tolak['pesan'], $tolak['http']);
}

$hasil = SandboxSql::eksekusi((string) $sql);

if ($hasil['error'] !== null) {
    DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Kueri SQL gagal (' . ($hasil['kode'] ?? 'PDO') . '): ' . mb_substr((string) $hasil['sql'], 0, 120));
    json_out([
        'status' => 'error',
        'message' => $hasil['error'],
        'kode_mysql' => (int) ($hasil['kode'] ?? 0),
        'pesan_guru' => SandboxSql::pesanGuru($hasil['kode']),
        'sql' => $hasil['sql'],
        'waktu_ms' => $hasil['waktu_ms'],
    ], 200);
}

DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Menjalankan kueri SQL ' . $hasil['perintah'] . ' di ruang latihan (' . $hasil['waktu_ms'] . ' ms).');

json_out([
    'status' => 'success',
    'code' => 200,
    'perintah' => $hasil['perintah'],
    'sql' => $hasil['sql'],
    'kolom' => $hasil['kolom'],
    'rows' => $hasil['baris'],
    'terpengaruh' => $hasil['terpengaruh'],
    'waktu_ms' => $hasil['waktu_ms'],
    'server' => 'MySQL/MariaDB via PDO ' . PHP_VERSION,
]);
