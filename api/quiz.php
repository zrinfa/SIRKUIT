<?php
/**
 * api/quiz.php
 * GET  : 12 soal kuis TANPA kunci jawaban. Kunci tetap di database, jadi
 *        membundel soal di berkas JS tidak lagi membocorkan jawabannya.
 * POST : {jawaban: {1: 2, 2: 0, ...}} dinilai server, hasilnya disimpan ke
 *        quiz_attempts, dan pembahasan tiap nomor dikirim setelah siswa
 *        mengumpulkan jawaban.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'POST']);
$u = require_login();
batasi_kuota('/api/quiz.php', $u);

if ($m === 'GET') {
    $st = DB::app()->query(
        'SELECT id, topik, soal, opsi FROM quiz_questions ORDER BY id'
    );
    $soal = [];
    foreach ($st->fetchAll() as $q) {
        $opsi = json_decode((string) $q['opsi'], true);
        $soal[] = [
            'id' => (int) $q['id'],
            'topik' => (string) $q['topik'],
            'soal' => (string) $q['soal'],
            'opsi' => is_array($opsi) ? array_values($opsi) : [],
        ];
    }

    $riwayat = DB::app()->prepare(
        'SELECT skor, benar, total, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
    );
    $riwayat->execute([(int) $u['id']]);

    cache_header(300, 'private');
    json_out([
        'status' => 'success',
        'code' => 200,
        'message' => 'Soal kuis dimuat tanpa kunci jawaban',
        'count' => count($soal),
        'sumber' => 'mysql (tabel quiz_questions)',
        'data' => $soal,
        'riwayat' => $riwayat->fetchAll(),
    ]);
}

csrf_validasi();
$b = body_json();
$jawaban = $b['jawaban'] ?? null;
if (!is_array($jawaban) || $jawaban === []) {
    json_error('Body harus berisi {"jawaban":{"1":0,"2":3,...}}.', 422);
}

$st = DB::app()->query('SELECT id, kunci, pembahasan, opsi FROM quiz_questions ORDER BY id');
$bank = $st->fetchAll();

$benar = 0;
$periksa = [];
foreach ($bank as $q) {
    $dipilih = $jawaban[(string) $q['id']] ?? $jawaban[$q['id']] ?? null;
    $dipilih = $dipilih === null ? null : (int) $dipilih;
    $sah = $dipilih === (int) $q['kunci'];
    if ($sah) {
        $benar++;
    }
    $opsi = json_decode((string) $q['opsi'], true) ?: [];
    $periksa[] = [
        'id' => (int) $q['id'],
        'dipilih' => $dipilih,
        'benar' => $sah,
        'opsi_benar' => (int) $q['kunci'],
        'teks_benar' => $opsi[(int) $q['kunci']] ?? null,
        'pembahasan' => (string) $q['pembahasan'],
    ];
}

$total = count($bank);
$skor = $total ? (int) round($benar / $total * 100) : 0;

$ins = DB::app()->prepare(
    'INSERT INTO quiz_attempts (user_id, student_name, kelas, skor, benar, total) VALUES (?, ?, ?, ?, ?, ?)'
);
$ins->execute([(int) $u['id'], $u['nama'], (string) ($u['kelas'] ?? ''), $skor, $benar, $total]);

$kkm = (int) DB::setting('kkm', 75);
DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Menyelesaikan kuis: ' . $benar . '/' . $total . ' (skor ' . $skor . ').');

json_out([
    'status' => 'success',
    'code' => 201,
    'message' => 'Jawaban dinilai server. Skor ' . $skor . ' dari 100.',
    'skor' => $skor,
    'benar' => $benar,
    'total' => $total,
    'kkm' => $kkm,
    'status_kkm' => $skor >= $kkm ? 'TUNTAS' : 'PERLU BIMBINGAN',
    'id_attempt' => (int) DB::app()->lastInsertId(),
    'periksa' => $periksa,
], 201, ['Cache-Control' => 'no-store']);
