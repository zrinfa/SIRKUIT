<?php
/**
 * api/grid.php - GET ?tabel=siswa&limit=20&offset=0&order=id&dir=ASC&kolom=nama&q=fa
 * Menyediakan data untuk panel "Tabel MySQL" dan grid hasil kueri.
 * Hanya tabel materi ajar yang boleh dibaca; nama kolom dan arah sort
 * divalidasi terhadap information_schema, bukan diambil mentah dari URL.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['GET']);
$u = require_login();
batasi_kuota('/api/grid.php', $u);

$tabel = strtolower(trim((string) ($_GET['tabel'] ?? 'siswa')));
if (!in_array($tabel, DB::TABEL_AJAR, true)) {
    json_error('Tabel tidak dikenal. Pilihan: ' . implode(', ', DB::TABEL_AJAR) . '.', 400, ['tabel_boleh' => DB::TABEL_AJAR]);
}
if (!DB::tabelExist($tabel)) {
    json_error('Tabel ' . $tabel . ' belum ada di database. Impor sirkuit.sql lewat phpMyAdmin.', 404);
}

$struktur = DB::struktur($tabel);
$namaKolom = array_column($struktur, 'kolom');

$pag = paginasi($_GET, 20, 200);
// Nama kolom MySQL boleh ditulis siswa dengan huruf besar-kecil bebas,
// tetapi yang dipakai tetap nama asli dari information_schema.
$cariKolom = static function (array $kolom, string $nama): ?string {
    foreach ($kolom as $kandidat) {
        if (strcasecmp((string) $kandidat, $nama) === 0) {
            return (string) $kandidat;
        }
    }
    return null;
};

$order = trim((string) ($_GET['order'] ?? ''));
if ($order !== '') {
    $cocok = $cariKolom($namaKolom, $order);
    if ($cocok === null) {
        json_error('Kolom urut "' . $order . '" tidak ada pada tabel ' . $tabel . '.', 422, ['kolom' => $namaKolom]);
    }
    $order = $cocok;
}
$dir = strtoupper(trim((string) ($_GET['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';

$kolomQ = trim((string) ($_GET['kolom'] ?? ''));
$q = trim((string) ($_GET['q'] ?? ''));
$where = [];
$args = [];
if ($q !== '') {
    if ($kolomQ === '') {
        $kolomQ = $namaKolom[0];
    }
    $cocok = $cariKolom($namaKolom, $kolomQ);
    if ($cocok === null) {
        json_error('Kolom filter "' . $kolomQ . '" tidak ada pada tabel ' . $tabel . '.', 422, ['kolom' => $namaKolom]);
    }
    $where[] = '`' . $cocok . '` LIKE ?';
    $args[] = '%' . $q . '%';
}

$sql = 'SELECT * FROM `' . $tabel . '`'
    . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
    . ($order !== '' ? ' ORDER BY `' . $order . '` ' . $dir : ' ORDER BY 1')
    . ' LIMIT ' . $pag['limit'] . ' OFFSET ' . $pag['offset'];

$mulai = microtime(true);
$st = DB::ajar()->prepare($sql);
$st->execute($args);
$rows = $st->fetchAll();
$elapsed = (int) round((microtime(true) - $mulai) * 1000);

$cnt = DB::ajar()->prepare('SELECT COUNT(*) FROM `' . $tabel . '`' . ($where ? ' WHERE ' . implode(' AND ', $where) : ''));
$cnt->execute($args);
$total = (int) $cnt->fetchColumn();

cache_header(0);
json_out([
    'status' => 'success',
    'code' => 200,
    'tabel' => $tabel,
    'struktur' => $struktur,
    'kolom' => array_values($namaKolom),
    'rows' => $rows,
    'total' => $total,
    'limit' => $pag['limit'],
    'offset' => $pag['offset'],
    'waktu_ms' => $elapsed,
    'sql' => $sql,
    'sumber' => 'mysql (information_schema + prepared statement)',
]);
