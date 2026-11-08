<?php
/**
 * api/nilai-ukk.php
 * GET : daftar hasil UKK. Wajib menyertakan header Authorization: Bearer <token>
 *       yang masih sah; kalau tidak, server menjawab 401 (kasus E401 nyata).
 * PUT : {siswa_id, nilai} memperbarui satu baris memakai prepared statement.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'PUT']);
$u = require_login();
batasi_kuota('/api/nilai-ukk.php', $u);

if ($m === 'GET') {
    $sesi = sesi_aktif(token_bearer());
    if (!$sesi) {
        json_error('Sesi berakhir, silakan login kembali.', 401, [
            'penyebab' => 'Token sesi tidak sah pada cek session_start()',
            'solusi' => 'Ambil token baru dari POST /api/auth.php lalu kirim ulang dengan header Authorization.',
        ]);
    }
    $kelas = trim((string) ($_GET['kelas'] ?? ''));
    if ($u['peran'] !== 'guru') {
        $kelas = (string) ($u['kelas'] ?? '');
    }
    $kkm = (int) DB::setting('kkm', 75);
    $where = 'n.is_published = 1';
    $args = [$kkm];
    if ($kelas !== '') {
        $where .= ' AND s.kelas = ?';
        $args[] = $kelas;
    }
    $st = DB::ajar()->prepare(
        'SELECT s.id, s.nisn, s.nama, s.kelas, n.nilai, n.paket_keahlian,
                IF(n.nilai >= ?, "TUNTAS", "PERLU BIMBINGAN") AS status_kkm, n.created_at
         FROM nilai_ukk n JOIN siswa s ON s.id = n.siswa_id
         WHERE ' . $where . ' ORDER BY n.nilai DESC LIMIT 100'
    );
    $st->execute($args);
    $rows = $st->fetchAll();
    cache_header(60, 'public');
    json_out([
        'status' => 'success',
        'code' => 200,
        'message' => 'Hasil UKK RPL dimuat',
        'count' => count($rows),
        'sumber' => 'mysql (PDO prepared statement)',
        'data' => $rows,
    ]);
}

csrf_validasi();
$b = body_json();
$siswaId = (string) ($b['siswa_id'] ?? '');
$nilai = $b['nilai'] ?? null;
if ($siswaId === '' || !is_numeric($nilai)) {
    json_error('Body harus berisi siswa_id dan nilai numerik.', 422);
}
$nilai = (int) $nilai;
if ($nilai < 0 || $nilai > 100) {
    json_error('Nilai harus berada pada rentang 0 sampai 100.', 422);
}
if ($u['peran'] !== 'guru' && $siswaId !== (string) $u['nisn_nip'] && $siswaId !== (string) $u['id']) {
    json_error('Siswa hanya boleh memperbarui nilai miliknya sendiri.', 403);
}

$st = DB::ajar()->prepare('UPDATE nilai_ukk SET nilai = ?, is_published = 1 WHERE siswa_id = ?');
$st->execute([$nilai, $siswaId]);
if ($st->rowCount() === 0) {
    json_error('Baris siswa_id tidak ditemukan; UPDATE tidak mengubah apa pun.', 404);
}

DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Memperbarui nilai UKK siswa ' . $siswaId . ' menjadi ' . $nilai . ' (PUT /api/nilai-ukk.php).');
json_out(['status' => 'success', 'code' => 200, 'message' => 'Nilai UKK diperbarui lewat PDO prepared statement.', 'siswa_id' => $siswaId, 'nilai' => $nilai], 200, ['Cache-Control' => 'no-store']);
