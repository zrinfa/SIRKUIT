<?php
/**
 * api/siswa.php - GET ?kelas=XI-RPL-1&limit=20&offset=0&q=nama
 * Endpoint baca yang menjadi contoh materi "daftar nilai siswa".
 * Siswa hanya menerima kelasnya sendiri; guru boleh memilih kelas.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['GET']);
$u = require_login();
batasi_kuota('/api/siswa.php', $u);

$kelas = trim((string) ($_GET['kelas'] ?? ''));
if ($u['peran'] !== 'guru') {
    $kelas = (string) ($u['kelas'] ?? '');
}
$pag = paginasi($_GET, 20, 100);
$q = trim((string) ($_GET['q'] ?? ''));

$sql = 'SELECT s.id, s.nisn, s.nama, s.kelas, n.nilai, n.paket_keahlian, n.is_published,
               IF(n.nilai >= ?, "TUNTAS", "PERLU BIMBINGAN") AS status_kkm
        FROM siswa s
        LEFT JOIN nilai_ukk n ON n.siswa_id = s.id';
$where = [];
$whereArgs = [];
if ($kelas !== '') {
    $where[] = 's.kelas = ?';
    $whereArgs[] = $kelas;
}
if ($q !== '') {
    $where[] = 's.nama LIKE ?';
    $whereArgs[] = '%' . $q . '%';
}
if ($where) {
    $sql .= ' WHERE ' . implode(' AND ', $where);
}
$sql .= ' ORDER BY s.id LIMIT ' . $pag['limit'] . ' OFFSET ' . $pag['offset'];

$kkm = (int) DB::setting('kkm', 75);
$st = DB::ajar()->prepare($sql);
$st->execute(array_merge([$kkm], $whereArgs));
$data = $st->fetchAll();

$cnt = DB::ajar()->prepare('SELECT COUNT(*) FROM siswa s' . ($where ? ' WHERE ' . implode(' AND ', $where) : ''));
$cnt->execute($whereArgs);
$total = (int) $cnt->fetchColumn();

cache_header(60, 'public');
json_out([
    'status' => 'success',
    'code' => 200,
    'message' => 'Data nilai siswa berhasil dimuat',
    'count' => count($data),
    'total' => $total,
    'server' => 'Apache/2.4 / PHP ' . PHP_VERSION,
    'sumber' => 'mysql (PDO prepared statement)',
    'meta' => ['kelas' => $kelas ?: 'semua', 'limit' => $pag['limit'], 'offset' => $pag['offset'], 'kkm' => $kkm],
    'data' => $data,
]);
