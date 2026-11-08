<?php
/**
 * api/prakerin-siswa.php
 * GET : profil prakerin milik siswa yang login.
 * PUT : {paket, jam, catatan} memperbarui profil (upsert).
 * Rute ini didaftarkan pada .htaccess; memanggil /api/profil_prakerin_lama.php
 * akan dibalas Apache dengan 404, sesuai kasus E404 pada modul.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'PUT']);
$u = require_login();
batasi_kuota('/api/prakerin-siswa.php', $u);

$siswaSaya = siswa_milik_user($u);
if (!$siswaSaya) {
    json_error('Akun siswa ini belum tertaut dengan tabel siswa.', 409);
}

if ($m === 'GET') {
    $st = DB::ajar()->prepare('SELECT siswa_id, paket, jam, catatan, updated_at FROM prakerin WHERE siswa_id = ?');
    $st->execute([$siswaSaya['id']]);
    $row = $st->fetch() ?: ['siswa_id' => $siswaSaya['id'], 'paket' => null, 'jam' => 0, 'catatan' => null, 'updated_at' => null];
    json_out(['status' => 'success', 'code' => 200, 'endpoint' => '/api/prakerin-siswa.php', 'data' => $row]);
}

csrf_validasi();
$b = body_json();
$paket = trim((string) ($b['paket'] ?? ''));
$jam = (int) ($b['jam'] ?? 0);
$catatan = trim((string) ($b['catatan'] ?? ''));
if ($paket === '' || $jam < 0 || $jam > 1200) {
    json_error('Body harus berisi paket dan jam antara 0 sampai 1200.', 422);
}

$up = DB::ajar()->prepare(
    'INSERT INTO prakerin (siswa_id, paket, jam, catatan) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE paket = VALUES(paket), jam = VALUES(jam), catatan = VALUES(catatan)'
);
$up->execute([$siswaSaya['id'], $paket, $jam, $catatan !== '' ? $catatan : null]);

DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Memperbarui profil prakerin (PUT /api/prakerin-siswa.php).');
json_out(['status' => 'success', 'code' => 200, 'message' => 'Profil prakerin tersimpan lewat RewriteRule Apache + PDO.', 'data' => ['siswa_id' => $siswaSaya['id'], 'paket' => $paket, 'jam' => $jam]], 200, ['Cache-Control' => 'no-store']);
