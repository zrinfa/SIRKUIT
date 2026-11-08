<?php
/**
 * api/exercises.php
 * GET  : daftar latihan Lab Uji (kerangka saja; solusi hanya untuk guru).
 * POST : guru membuat atau mengubah latihan. Aturan penilaian (kolom cek)
 *        disimpan sebagai JSON deklaratif dan hanya dibaca Checker di server,
 *        jadi siswa tidak pernah menerima kriteria dalam bentuk kode.
 * DELETE: guru menonaktifkan latihan.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';
require_once __DIR__ . '/../lib/runner.php';

$m = require_method(['GET', 'POST', 'DELETE']);
$u = require_login();
batasi_kuota('/api/exercises.php', $u);

if ($m === 'GET') {
    $bahasa = strtolower(trim((string) ($_GET['bahasa'] ?? '')));
    $where = 'aktif = 1';
    $args = [];
    if (in_array($bahasa, ['php', 'js', 'sql'], true)) {
        $where .= ' AND bahasa = ?';
        $args[] = $bahasa;
    }
    $kolom = $u['peran'] === 'guru'
        ? 'id, bahasa, mode, judul, tujuan, petunjuk, kerangka, solusi, cek, aktif, dibuat_oleh, created_at'
        : 'id, bahasa, mode, judul, tujuan, petunjuk, kerangka, aktif, created_at';
    $st = DB::app()->prepare('SELECT ' . $kolom . ' FROM lab_exercises WHERE ' . $where . ' ORDER BY id ASC');
    $st->execute($args);
    $rows = $st->fetchAll();

    json_out([
        'status' => 'success',
        'code' => 200,
        'count' => count($rows),
        'runner' => Runner::tersedia() ? 'server' : 'browser',
        'catatan_runner' => Runner::tersedia() ? null : Runner::alasanTidakTersedia(),
        'data' => $rows,
    ]);
}

if ($m === 'DELETE') {
    require_peran('guru');
    csrf_validasi();
    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        json_error('Parameter id wajib diisi untuk menghapus latihan.', 422);
    }
    $st = DB::app()->prepare('UPDATE lab_exercises SET aktif = 0 WHERE id = ?');
    $st->execute([$id]);
    if ($st->rowCount() === 0) {
        json_error('Latihan dengan id ' . $id . ' tidak ditemukan.', 404);
    }
    DB::logAktivitas($u['nama'], $u['kelas'], 'guru', 'Menonaktifkan latihan Lab Uji id ' . $id . '.');
    json_out(['status' => 'success', 'code' => 200, 'message' => 'Latihan dinonaktifkan.', 'id' => $id], 200, ['Cache-Control' => 'no-store']);
}

require_peran('guru');
csrf_validasi();
$b = body_json();

$wajib = ['judul', 'bahasa', 'kerangka', 'tujuan'];
foreach ($wajib as $k) {
    if (trim((string) ($b[$k] ?? '')) === '') {
        json_error('Kolom ' . $k . ' wajib diisi.', 422);
    }
}
$bahasa = strtolower(trim((string) $b['bahasa']));
if (!in_array($bahasa, ['php', 'js', 'sql'], true)) {
    json_error('Bahasa harus php, js, atau sql.', 422);
}
$cek = $b['cek'] ?? null;
if (is_string($cek)) {
    $cek = json_decode($cek, true);
}
if (!is_array($cek)) {
    json_error('Aturan penilaian harus berupa JSON, contoh {"output_any":[{"re":"halo","pesan":"..."}]}.', 422);
}
$mode = strtoupper(trim((string) ($b['mode'] ?? 'NORMAL')));
if (!preg_match('/^[A-Z0-9]{2,8}$/', $mode)) {
    $mode = 'NORMAL';
}
$cekJson = json_encode($cek, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$id = (int) ($b['id'] ?? 0);

if ($id > 0) {
    $st = DB::app()->prepare(
        'UPDATE lab_exercises SET bahasa = ?, mode = ?, judul = ?, tujuan = ?, petunjuk = ?,
                kerangka = ?, solusi = ?, cek = ?, aktif = 1 WHERE id = ?'
    );
    $st->execute([
        $bahasa, $mode, (string) $b['judul'], (string) $b['tujuan'], (string) ($b['petunjuk'] ?? ''),
        (string) $b['kerangka'], $b['solusi'] ?? null, $cekJson, $id,
    ]);
    if ($st->rowCount() === 0) {
        json_error('Latihan id ' . $id . ' tidak ditemukan.', 404);
    }
    $pesan = 'Latihan id ' . $id . ' diperbarui.';
} else {
    $st = DB::app()->prepare(
        'INSERT INTO lab_exercises (bahasa, mode, judul, tujuan, petunjuk, kerangka, solusi, cek, aktif, dibuat_oleh)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
    );
    $st->execute([
        $bahasa, $mode, (string) $b['judul'], (string) $b['tujuan'], (string) ($b['petunjuk'] ?? ''),
        (string) $b['kerangka'], $b['solusi'] ?? null, $cekJson, (int) $u['id'],
    ]);
    $id = (int) DB::app()->lastInsertId();
    $pesan = 'Latihan baru id ' . $id . ' tersimpan.';
}

DB::logAktivitas($u['nama'], $u['kelas'], 'guru', 'Menyimpan latihan Lab Uji id ' . $id . ' (' . $bahasa . '/' . $mode . ').');
json_out(['status' => 'success', 'code' => 200, 'message' => $pesan, 'id' => $id], 200, ['Cache-Control' => 'no-store']);
