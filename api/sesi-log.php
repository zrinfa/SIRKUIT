<?php
/**
 * api/sesi-log.php
 * GET    : daftar log sesi beserta statusnya (khusus guru).
 * DELETE : menghapus log sesi. Klausa WHERE wajib; permintaan tanpa filter
 *          ditolak 400 agar siswa mengalami aturan "DELETE tanpa WHERE".
 *          Filter yang tersedia: ?kedaluwarsa=1 atau ?siswa_id=25001
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'DELETE']);
$u = require_peran('guru');
batasi_kuota('/api/sesi-log.php', $u);

if ($m === 'GET') {
    $st = DB::ajar()->prepare(
        'SELECT s.id, s.siswa_id, w.nama, w.kelas, s.status, s.ip, s.dibuat_at, s.kedaluwarsa_at,
                IF(s.kedaluwarsa_at < NOW(), 1, 0) AS lewat
         FROM sesi_login s JOIN siswa w ON w.id = s.siswa_id ORDER BY s.dibuat_at DESC LIMIT 100'
    );
    $st->execute();
    json_out(['status' => 'success', 'code' => 200, 'count' => $st->rowCount(), 'data' => $st->fetchAll()]);
}

csrf_validasi();
$kedaluwarsa = isset($_GET['kedaluwarsa']) && $_GET['kedaluwarsa'] !== '0';
$siswaId = trim((string) ($_GET['siswa_id'] ?? ''));

if (!$kedaluwarsa && $siswaId === '') {
    json_error('DELETE ditolak: tidak ada klausa WHERE. Gunakan ?kedaluwarsa=1 atau ?siswa_id=XXXXX.', 400, [
        'penyebab' => 'Perintah DELETE tanpa WHERE akan menghapus seluruh tabel sesi.',
        'solusi' => 'Tambahkan filter pada query string.',
    ]);
}

$where = [];
$args = [];
if ($kedaluwarsa) {
    $where[] = '(s.kedaluwarsa_at < NOW() OR s.status = "kedaluwarsa")';
}
if ($siswaId !== '') {
    $where[] = 's.siswa_id = ?';
    $args[] = $siswaId;
}
$sql = 'DELETE s FROM sesi_login s WHERE ' . implode(' AND ', $where);
$st = DB::ajar()->prepare($sql);
$st->execute($args);
$terhapus = $st->rowCount();

DB::logAktivitas($u['nama'], $u['kelas'], 'guru', 'Menghapus ' . $terhapus . ' log sesi (DELETE /api/sesi-log.php).');
json_out(['status' => 'success', 'code' => 200, 'message' => 'DELETE berjalan dengan klausa WHERE.', 'terhapus' => $terhapus], 200, ['Cache-Control' => 'no-store']);
