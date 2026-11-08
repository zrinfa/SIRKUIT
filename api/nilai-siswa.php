<?php
/**
 * api/nilai-siswa.php - GET
 * Route yang dipakai Kasus 1 (401 Unauthorized) pada modul dan Lab Uji.
 * Server menjawab 401 kalau header Authorization tidak membawa token sah pada
 * tabel sesi_login; kalau sah, nilai siswa sekelas dikirim sebagai JSON.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['GET']);
$u = require_login();
batasi_kuota('/api/nilai-siswa.php', $u);

$sesi = sesi_aktif(token_bearer());
if (!$sesi) {
    json_error('Sesi berakhir, silakan login kembali.', 401, [
        'penyebab' => 'Token pada header Authorization kosong, kedaluwarsa, atau tidak ditemukan di tabel sesi_login.',
        'solusi' => 'Panggil refresh_session() (POST /api/auth.php) lalu kirim ulang dengan header Authorization: Bearer <token>.',
    ]);
}

$kelas = trim((string) ($_GET['kelas'] ?? ''));
if ($u['peran'] !== 'guru') {
    $kelas = (string) ($sesi['kelas'] ?? $u['kelas'] ?? '');
}
$kkm = (int) DB::setting('kkm', 75);

$sql = 'SELECT s.id, s.nisn, s.nama, s.kelas, n.nilai, n.paket_keahlian,
               IF(n.nilai >= ?, "TUNTAS", "PERLU BIMBINGAN") AS status_kkm
        FROM siswa s LEFT JOIN nilai_ukk n ON n.siswa_id = s.id';
$args = [$kkm];
if ($kelas !== '') {
    $sql .= ' WHERE s.kelas = ?';
    $args[] = $kelas;
}
$sql .= ' ORDER BY n.nilai DESC LIMIT 100';

$st = DB::ajar()->prepare($sql);
$st->execute($args);
$rows = $st->fetchAll();

cache_header(60, 'private');
json_out([
    'status' => 'success',
    'code' => 200,
    'message' => 'Daftar nilai siswa dimuat setelah token sesi diverifikasi.',
    'count' => count($rows),
    'server' => 'Apache/2.4 / PHP ' . PHP_VERSION,
    'sumber' => 'mysql (PDO prepared statement)',
    'meta' => ['kelas' => $kelas ?: 'semua', 'kkm' => $kkm, 'token' => substr((string) $sesi['token'], 0, 8) . '...'],
    'data' => $rows,
]);
