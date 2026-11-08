<?php
/**
 * api/auth.php
 * GET  : memeriksa header Authorization terhadap tabel sesi MySQL.
 *          Token kosong/kedaluwarsa -> 401 Unauthorized (kasus E401 nyata).
 * POST : {aksi:"refresh"} membuat token sesi baru untuk user yang login.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'POST']);

if ($m === 'POST') {
    csrf_validasi();
    $u = require_login();
    $b = body_json();
    if (($b['aksi'] ?? '') !== 'refresh') {
        json_error('Aksi tidak dikenal. Gunakan {"aksi":"refresh"}.', 422);
    }
    $t = token_baru($u['id']);
    DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Memperbarui token sesi PHP (kasus 401).');
    json_out([
        'status' => 'success',
        'message' => 'Token sesi baru dibuat. Kirim ulang request dengan header Authorization: Bearer <token>.',
        'token' => $t['token'],
        'header' => 'Authorization: Bearer ' . $t['token'],
        'kedaluwarsa' => '72 jam',
    ], 201, ['Cache-Control' => 'no-store']);
}

$u = require_login();
$token = token_bearer();
$sesi = sesi_aktif($token);

if (!$sesi) {
    json_error('Sesi berakhir, silakan login kembali.', 401, [
        'penyebab' => $token === null ? 'Header Authorization tidak dikirim' : 'Token kedaluwarsa atau bernilai null',
        'token_diterima' => $token ?? '',
        'solusi' => 'Panggil refresh token (POST /api/auth.php) lalu kirim header Authorization: Bearer <token baru>.',
    ]);
}

json_out([
    'status' => 'success',
    'message' => 'Token sesi sah.',
    'sesi' => [
        'siswa_id' => $sesi['siswa_id'],
        'dibuat' => $sesi['dibuat_at'],
        'kedaluwarsa' => $sesi['kedaluwarsa_at'],
        'ip' => $sesi['ip'],
    ],
]);
