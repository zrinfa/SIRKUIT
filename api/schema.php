<?php
/**
 * api/schema.php - GET struktur seluruh tabel materi ajar sekaligus.
 *
 * Petunjuk skema yang dibaca siswa di Lab Uji dan Lab Kueri diambil dari
 * information_schema database ruang latihan, bukan dari daftar statis di
 * peramban, jadi petunjuk tidak mungkin berbeda dengan tabel yang sebenarnya.
 * Satu permintaan menggantikan enam panggilan grid.php?tabel=...
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['GET']);
$u = require_login();
batasi_kuota('/api/schema.php', $u);

$st = DB::ajar()->prepare(
    'SELECT table_name AS tabel, column_name AS kolom, column_type AS tipe,
            column_key AS kunci, is_nullable AS boleh_null, extra
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
     ORDER BY table_name, ordinal_position'
);
$st->execute();
$perTabel = [];
foreach ($st->fetchAll() as $b) {
    $perTabel[(string) $b['tabel']][] = [
        'kolom' => (string) $b['kolom'],
        'tipe' => (string) $b['tipe'],
        'kunci' => (string) ($b['kunci'] ?? ''),
        'boleh_null' => (string) ($b['boleh_null'] ?? ''),
        'extra' => (string) ($b['extra'] ?? ''),
    ];
}

$namaDb = (string) DB::ajar()->query('SELECT DATABASE()')->fetchColumn();
$data = [];
foreach (DB::TABEL_AJAR as $t) {
    $data[] = ['tabel' => $t, 'kolom' => $perTabel[$t] ?? []];
}

json_out([
    'status' => 'success',
    'code' => 200,
    'message' => 'Struktur tabel materi ajar berhasil dimuat',
    'count' => count($data),
    'meta' => ['basis_data' => $namaDb, 'peran' => $u['peran']],
    'data' => $data,
]);
