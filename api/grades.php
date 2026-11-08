<?php
/**
 * api/grades.php
 * GET ?kelas=XI+RPL+1&siswa_id=25001
 * Rekap nilai satu siswa atau satu kelas: hasil UKK (database ruang latihan),
 * nilai tugas (task_submissions), dan skor kuis (quiz_attempts). Tabel materi
 * ajar dibaca lewat DB::ajar() sehingga angka yang dilihat guru sama persis
 * dengan hasil kueri yang dijalankan siswa di Lab Uji.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['GET']);
$u = require_login();
batasi_kuota('/api/grades.php', $u);

$kkm = (int) DB::setting('kkm', 75);
$kelas = trim((string) ($_GET['kelas'] ?? ''));
$siswaId = trim((string) ($_GET['siswa_id'] ?? ''));

if ($u['peran'] !== 'guru') {
    $kelas = (string) ($u['kelas'] ?? '');
    $siswaId = (string) ($u['nisn_nip'] ?? '');
}

$where = [];
$args = [];
if ($kelas !== '') {
    $where[] = 's.kelas = ?';
    $args[] = $kelas;
}
if ($siswaId !== '') {
    $where[] = 's.nisn = ?';
    $args[] = $siswaId;
}
$sqlSiswa = 'SELECT s.id siswa_id, s.nisn, s.nama, s.kelas,
                    n.nilai, n.paket_keahlian, n.is_published,
                    IF(n.nilai >= ?, "TUNTAS", "PERLU BIMBINGAN") AS status_kkm
             FROM siswa s
             LEFT JOIN nilai_ukk n ON n.siswa_id = s.id';
if ($where) {
    $sqlSiswa .= ' WHERE ' . implode(' AND ', $where);
}
$sqlSiswa .= ' ORDER BY s.id LIMIT 200';

$st = DB::ajar()->prepare($sqlSiswa);
$st->execute(array_merge([$kkm], $args));
$ukk = $st->fetchAll();

$nisn = array_column($ukk, 'nisn');
$nama = array_values(array_unique(array_column($ukk, 'nama')));
$tugas = [];
$kuisPerSiswa = [];
if ($nisn) {
    $duduk = DB::app()->prepare(
        'SELECT w.nisn_nip, t.judul, t.bahasa, t.tenggat, sub.nilai, sub.lulus, sub.catatan_guru, sub.dikirim_at, sub.dinilai_pada
         FROM task_submissions sub
         JOIN users w ON w.id = sub.siswa_id
         JOIN tasks t ON t.id = sub.task_id
         WHERE w.nisn_nip IN (' . implode(',', array_fill(0, count($nisn), '?')) . ')
         ORDER BY sub.dikirim_at DESC LIMIT 500'
    );
    $duduk->execute($nisn);
    foreach ($duduk->fetchAll() as $r) {
        $tugas[$r['nisn_nip']][] = $r;
    }
    // quiz_attempts menyimpan nama siswa (kolom student_name), bukan NISN.
    if ($nama) {
        $kuis = DB::app()->prepare(
            'SELECT student_name, kelas, skor, benar, total, created_at
             FROM quiz_attempts WHERE student_name IN (' . implode(',', array_fill(0, count($nama), '?')) . ')
             ORDER BY created_at DESC LIMIT 500'
        );
        $kuis->execute($nama);
        foreach ($kuis->fetchAll() as $r) {
            $kuisPerSiswa[$r['student_name']][] = $r;
        }
    }
}

foreach ($ukk as &$baris) {
    $daftar = $tugas[$baris['nisn']] ?? [];
    $sudah = array_filter($daftar, static fn ($t) => $t['nilai'] !== null);
    $baris['jumlah_tugas'] = count($daftar);
    $baris['tugas_dinilai'] = count($sudah);
    $baris['rata_tugas'] = $sudah ? round(array_sum(array_column($sudah, 'nilai')) / count($sudah), 1) : null;
    $percobaan = $kuisPerSiswa[$baris['nama']] ?? [];
    $baris['kuis_terbaik'] = $percobaan ? max(array_column($percobaan, 'skor')) : null;
    $baris['jumlah_kuis'] = count($percobaan);
}
unset($baris);

$nilai = array_filter(array_column($ukk, 'nilai'), static fn ($v) => $v !== null);
$tuntas = count(array_filter($nilai, static fn ($v) => (int) $v >= $kkm));

json_out([
    'status' => 'success',
    'code' => 200,
    'message' => 'Rekap nilai berhasil dimuat',
    'count' => count($ukk),
    'meta' => [
        'kelas' => $kelas ?: 'semua',
        'kkm' => $kkm,
        'rata_nilai' => $nilai ? round(array_sum($nilai) / count($nilai), 1) : null,
        'tuntas' => $tuntas,
        'persen_tuntas' => $nilai ? round($tuntas / count($nilai) * 100, 1) : 0,
    ],
    'data' => $ukk,
], 200, ['Cache-Control' => 'no-store']);
