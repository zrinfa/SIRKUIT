<?php
/**
 * api/scenarios.php
 * GET  : daftar skenario PBL beserta opsi penanganannya. Penanda opsi benar
 *        (kolom benar) hanya dikirim ke guru; siswa menerima opsi tanpa kunci
 *        sehingga jawaban tidak bisa dibaca dari respons jaringan.
 * POST : mencatat satu percobaan simulasi ke pbl_simulation_logs.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'POST']);
$u = require_login();
batasi_kuota('/api/scenarios.php', $u);

$kolomOpsi = $u['peran'] === 'guru' ? 'opsi, teks, benar' : 'opsi, teks';

if ($m === 'GET') {
    $kode = strtoupper(trim((string) ($_GET['kode'] ?? '')));
    $where = '';
    $args = [];
    if ($kode !== '') {
        $where = ' WHERE kode = ?';
        $args[] = $kode;
    }

    $st = DB::app()->prepare(
        'SELECT kode, judul, expected_status, fault_node, metode, endpoint, gejala, konteks, temuan, refleksi, metrik, urutan
         FROM pbl_scenarios' . $where . ' ORDER BY urutan, kode'
    );
    $st->execute($args);
    $skenario = $st->fetchAll();

    $kodeList = array_column($skenario, 'kode');
    $opsi = [];
    if ($kodeList) {
        $st = DB::app()->prepare(
            'SELECT kode, ' . $kolomOpsi . ' FROM pbl_solutions
             WHERE kode IN (' . implode(',', array_fill(0, count($kodeList), '?')) . ')
             ORDER BY kode, urutan'
        );
        $st->execute($kodeList);
        foreach ($st->fetchAll() as $r) {
            $opsi[$r['kode']][] = $r;
        }
    }
    foreach ($skenario as &$s) {
        $s['opsi'] = $opsi[$s['kode']] ?? [];
        if (is_string($s['metrik'] ?? null)) {
            $d = json_decode((string) $s['metrik'], true);
            $s['metrik'] = is_array($d) ? $d : null;
        }
    }
    unset($s);

    if ($kode !== '' && !$skenario) {
        json_error('Skenario ' . $kode . ' tidak terdaftar.', 404);
    }

    $st = DB::app()->prepare(
        'SELECT scenario_code kode, COUNT(*) percobaan, SUM(is_resolved = 1) terselesaikan,
                ROUND(AVG(latency_ms)) rata_latency
         FROM pbl_simulation_logs WHERE student_name = ? GROUP BY scenario_code'
    );
    $st->execute([(string) $u['nama']]);
    $sudah = [];
    foreach ($st->fetchAll() as $r) {
        $sudah[$r['kode']] = $r;
    }

    // Guru berhak melihat rekap percobaan seluruh kelas untuk dashboard.
    $progresKelas = [];
    if ($u['peran'] === 'guru') {
        $st = DB::app()->prepare(
            'SELECT student_name, kelas, COUNT(*) percobaan, SUM(is_resolved = 1) terselesaikan,
                    GROUP_CONCAT(DISTINCT scenario_code ORDER BY scenario_code SEPARATOR ",") kode_selesai,
                    ROUND(AVG(latency_ms)) rata_latency, MAX(created_at) terakhir
             FROM pbl_simulation_logs GROUP BY student_name, kelas ORDER BY kelas, student_name LIMIT 300'
        );
        $st->execute();
        $progresKelas = $st->fetchAll();
    }

    cache_header(60, 'private');
    json_out([
        'status' => 'success',
        'code' => 200,
        'message' => 'Skenario PBL dimuat',
        'count' => count($skenario),
        'kunci_ditampilkan' => $u['peran'] === 'guru',
        'data' => $skenario,
        'progress_saya' => $sudah,
        'progres_kelas' => $progresKelas,
    ]);
}

csrf_validasi();
$b = body_json();
$kode = strtoupper(trim((string) ($b['kode'] ?? '')));
if ($kode === '' || !preg_match('/^[A-Z0-9]{2,8}$/', $kode)) {
    json_error('Body harus berisi kode skenario, contoh {"kode":"E401"}.', 422);
}
$c = DB::app()->prepare('SELECT expected_status, metode FROM pbl_scenarios WHERE kode = ?');
$c->execute([$kode]);
$skenario = $c->fetch();
if (!$skenario) {
    json_error('Skenario ' . $kode . ' tidak ditemukan.', 404);
}

$status = (int) ($b['status_http'] ?? 0);
if ($status < 100 || $status > 599) {
    json_error('status_http harus kode HTTP tiga angka.', 422);
}
$pilihan = $b['selected_solution'] ?? null;
$pilihan = is_string($pilihan) && preg_match('/^[A-Z]$/', $pilihan) ? $pilihan : null;
$latency = $b['latency_ms'] ?? null;
$latency = is_numeric($latency) ? max(0, min(600000, (int) $latency)) : null;

$st = DB::app()->prepare(
    'INSERT INTO pbl_simulation_logs
     (user_id, student_name, kelas, scenario_code, http_method, status_code, is_resolved, selected_solution, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$st->execute([
    (int) $u['id'],
    (string) $u['nama'],
    (string) ($u['kelas'] ?? '-'),
    $kode,
    (string) ($b['metode'] ?? $skenario['metode']),
    $status,
    !empty($b['is_resolved']) ? 1 : 0,
    $pilihan,
    $latency,
]);

// Guru langsung tahu apakah pilihan yang dikirim cocok dengan kunci di server.
$tebak = null;
if ($pilihan !== null) {
    $c = DB::app()->prepare('SELECT benar FROM pbl_solutions WHERE kode = ? AND opsi = ?');
    $c->execute([$kode, $pilihan]);
    $baris = $c->fetch();
    $tebak = $baris ? (bool) $baris['benar'] : null;
}

DB::logAktivitas(
    $u['nama'],
    $u['kelas'],
    $u['peran'],
    'Menjalankan simulasi skenario ' . $kode . ' dengan status ' . $status . ' (POST /api/scenarios.php).'
);
json_out([
    'status' => 'success',
    'code' => 201,
    'message' => 'Percobaan tercatat ke pbl_simulation_logs.',
    'id' => (int) DB::app()->lastInsertId(),
    'expected_status' => (int) $skenario['expected_status'],
    'pilihan_tepat' => $tebak,
], 201, ['Cache-Control' => 'no-store']);
