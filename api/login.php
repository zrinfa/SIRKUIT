<?php
/**
 * api/login.php - POST {identitas, sandi, peran}
 * Titik masuk autentikasi. Siswa mengirim NISN atau email, guru mengirim NIP.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['POST']);
$b = body_json();

$identitas = trim((string) ($b['identitas'] ?? ''));
$sandi = (string) ($b['sandi'] ?? '');
$peran = (string) ($b['peran'] ?? 'siswa');

if ($identitas === '' || $sandi === '') {
    json_error('Isi NISN/NIP (atau email) dan kata sandi.', 422);
}

// Pembatas percobaan login: 8 kali per menit per IP.
$rl = rate_limit('login|' . client_ip());
if (!$rl['allowed']) {
    json_error('Terlalu banyak percobaan login. Tunggu ' . $rl['retry_after'] . ' detik.', 429, [
        'retry_after' => $rl['retry_after'],
    ]);
}

$hasil = login($identitas, $sandi, $peran);
if (is_string($hasil)) {
    json_error($hasil, 401);
}

json_out([
    'status' => 'success',
    'message' => 'Selamat datang, ' . $hasil['nama'] . '.',
    'user' => $hasil,
    'csrf' => csrf_token(),
    'sesi' => [
        'cookie' => 'SIRKUITSID=' . session_id(),
        'metode' => 'session_start() PHP + password_verify() MySQL',
    ],
]);
