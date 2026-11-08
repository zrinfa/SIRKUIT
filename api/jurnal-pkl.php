<?php
/**
 * api/jurnal-pkl.php
 * GET  : daftar jurnal PKL milik siswa yang login.
 * POST : {isi, hari} menambah jurnal. Kolom waktu memakai created_at, bukan
 *        tgl_input; salah nama kolom akan dibalas MySQL 1054 Unknown column.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'POST']);
$u = require_login();
batasi_kuota('/api/jurnal-pkl.php', $u);

if ($m === 'GET') {
    $siswaSaya = siswa_milik_user($u);
    if (!$siswaSaya) {
        json_error('Akun siswa ini belum tertaut dengan tabel siswa.', 409);
    }
    $st = DB::ajar()->prepare(
        'SELECT id, siswa_id, hari, isi, created_at FROM jurnal_pkl WHERE siswa_id = ? ORDER BY created_at DESC LIMIT 50'
    );
    $st->execute([$siswaSaya['id']]);
    json_out(['status' => 'success', 'code' => 200, 'count' => $st->rowCount(), 'data' => $st->fetchAll()]);
}

csrf_validasi();
$b = body_json();
$isi = trim((string) ($b['isi'] ?? ''));
$hari = trim((string) ($b['hari'] ?? ''));
if ($isi === '') {
    json_error('Kolom isi jurnal wajib diisi.', 422);
}
$siswaId = (string) ($b['siswa_id'] ?? $u['nisn_nip']);
if ($u['peran'] !== 'guru') {
    $siswaId = (string) $u['nisn_nip'];
}
$st = DB::ajar()->prepare('SELECT id FROM siswa WHERE id = ? OR nisn = ?');
$st->execute([$siswaId, $siswaId]);
$siswa = $st->fetch();
if (!$siswa) {
    json_error('Data siswa tidak ditemukan di tabel siswa.', 404);
}

$ins = DB::ajar()->prepare('INSERT INTO jurnal_pkl (siswa_id, hari, isi, created_at) VALUES (?, ?, ?, NOW())');
$ins->execute([$siswa['id'], $hari !== '' ? $hari : null, $isi]);
$id = (int) DB::ajar()->lastInsertId();

DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Menambah jurnal PKL (POST /api/jurnal-pkl.php).');
json_out([
    'status' => 'success',
    'code' => 201,
    'message' => 'Jurnal tersimpan; INSERT memakai kolom created_at.',
    'row' => ['id' => $id, 'siswa_id' => $siswa['id'], 'hari' => $hari, 'isi' => $isi],
], 201, ['Cache-Control' => 'no-store']);
