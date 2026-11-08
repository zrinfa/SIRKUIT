<?php
/**
 * api/proyek-siswa.php
 * GET  : daftar proyek kelas siswa (atau semua kelas untuk guru).
 * POST : {judul, status, deadline} menambah proyek milik siswa yang login.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'POST']);
$u = require_login();
batasi_kuota('/api/proyek-siswa.php', $u);

if ($m === 'GET') {
    $kelas = trim((string) ($_GET['kelas'] ?? ''));
    if ($u['peran'] !== 'guru') {
        $kelas = (string) ($u['kelas'] ?? '');
    }
    $args = [];
    $where = '';
    if ($kelas !== '') {
        $where = 'WHERE s.kelas = ?';
        $args[] = $kelas;
    }
    $st = DB::ajar()->prepare(
        'SELECT p.id, p.siswa_id, s.nama, s.kelas, p.judul, p.status, p.deadline, p.created_at
         FROM proyek p JOIN siswa s ON s.id = p.siswa_id ' . $where . ' ORDER BY p.created_at DESC LIMIT 100'
    );
    $st->execute($args);
    cache_header(60, 'public');
    json_out(['status' => 'success', 'code' => 200, 'count' => $st->rowCount(), 'data' => $st->fetchAll()]);
}

csrf_validasi();
$b = body_json();
$judul = trim((string) ($b['judul'] ?? ''));
$status = (string) ($b['status'] ?? 'draft');
$deadline = trim((string) ($b['deadline'] ?? ''));
if ($judul === '') {
    json_error('Kolom judul wajib diisi.', 422);
}
if (!in_array($status, ['draft', 'review', 'publikasi', 'revision'], true)) {
    json_error('Status harus salah satu dari draft, review, publikasi, revision.', 422);
}
if ($deadline !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) {
    json_error('Format deadline harus YYYY-MM-DD.', 422);
}
$siswaSaya = siswa_milik_user($u);
if (!$siswaSaya) {
    json_error('Akun siswa ini belum tertaut dengan tabel siswa.', 409);
}

$ins = DB::ajar()->prepare('INSERT INTO proyek (siswa_id, judul, status, deadline) VALUES (?, ?, ?, ?)');
$ins->execute([$siswaSaya['id'], $judul, $status, $deadline !== '' ? $deadline : null]);
$id = (int) DB::ajar()->lastInsertId();

DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Menambah proyek "' . $judul . '" (POST /api/proyek-siswa.php).');
json_out(['status' => 'success', 'code' => 201, 'message' => 'Proyek siswa baru tersimpan.', 'row' => ['id' => $id, 'judul' => $judul, 'status' => $status]], 201, ['Cache-Control' => 'no-store']);
