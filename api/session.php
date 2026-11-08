<?php
/**
 * api/session.php - GET
 * Mengembalikan kondisi sesi sekarang. Halaman index.php dan seluruh view
 * memakai endpoint ini untuk menentukan peran dan tombol yang boleh muncul.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['GET']);
$u = user();

if (!$u) {
    json_out([
        'status' => 'success',
        'login' => false,
        'user' => null,
        'csrf' => csrf_token(),
        'pengaturan' => [
            'kkm' => (int) DB::setting('kkm', 75),
            'kuota_rate' => (int) DB::setting('rate_limit_per_menit', 60),
            'versi' => config()['app']['versi'],
        ],
    ], 200, ['Cache-Control' => 'no-store']);
}

json_out([
    'status' => 'success',
    'login' => true,
    'user' => $u,
    'csrf' => csrf_token(),
    'pengaturan' => [
        'kkm' => (int) DB::setting('kkm', 75),
        'kuota_rate' => (int) DB::setting('rate_limit_per_menit', 60),
        'versi' => config()['app']['versi'],
        'runner' => config()['runner']['aktif'] ? 'server' : 'browser',
        'tabel_ajar' => DB::TABEL_AJAR,
    ],
], 200, ['Cache-Control' => 'no-store']);
