<?php
/**
 * api/submissions.php
 * GET  : siswa melihat kirimannya sendiri; guru melihat kiriman satu tugas.
 * POST : {task_id, kode, output, jejak, hasil_grid, status_http, lulus}
 *        Siswa mengirim hasil Lab Uji sebagai jawaban. Karena tabel punya
 *        UNIQUE(task_id, siswa_id), pengiriman ulang memakai upsert sehingga
 *        siswa tetap punya satu jawaban terakhir per tugas.
 * PUT  : {id, nilai, catatan} guru menilai (guru).
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'POST', 'PUT']);
$u = require_login();
batasi_kuota('/api/submissions.php', $u);

if ($m === 'GET') {
    $pag = paginasi($_GET, 20, 100);
    if ($u['peran'] === 'guru') {
        $taskId = (int) ($_GET['task_id'] ?? 0);
        $st = DB::app()->prepare(
            'SELECT s.id, s.task_id, t.judul, s.siswa_id, w.nama, w.nisn_nip, s.kode, s.output, s.status_http,
                    s.lulus, s.nilai, s.catatan_guru, s.dikirim_at, s.dinilai_pada, s.hasil_grid, s.jejak
             FROM task_submissions s
             JOIN tasks t ON t.id = s.task_id
             JOIN users w ON w.id = s.siswa_id
             WHERE (? = 0 OR s.task_id = ?) AND t.guru_id = ?
             ORDER BY s.dikirim_at DESC
             LIMIT ' . $pag['limit'] . ' OFFSET ' . $pag['offset']
        );
        $st->execute([$taskId, $taskId, (int) $u['id']]);
    } else {
        $st = DB::app()->prepare(
            'SELECT s.id, s.task_id, t.judul, t.tenggat, s.kode, s.output, s.status_http, s.lulus,
                    s.nilai, s.catatan_guru, s.dikirim_at, s.dinilai_pada
             FROM task_submissions s
             JOIN tasks t ON t.id = s.task_id
             WHERE s.siswa_id = ?
             ORDER BY s.dikirim_at DESC
             LIMIT ' . $pag['limit'] . ' OFFSET ' . $pag['offset']
        );
        $st->execute([(int) $u['id']]);
    }
    $rows = $st->fetchAll();
    if ($u['peran'] === 'guru') {
        // Guru menilai dari baris MySQL yang dilihat siswa, jadi kolom JSON dibuka untuk guru.
        foreach ($rows as &$r) {
            foreach (['hasil_grid', 'jejak'] as $k) {
                if (isset($r[$k]) && is_string($r[$k]) && $r[$k] !== '') {
                    $r[$k] = json_decode($r[$k], true);
                }
            }
        }
        unset($r);
    }
    json_out([
        'status' => 'success',
        'code' => 200,
        'message' => 'Jawaban tugas berhasil dimuat',
        'count' => count($rows),
        'meta' => ['peran' => $u['peran'], 'limit' => $pag['limit'], 'offset' => $pag['offset']],
        'data' => $rows,
    ]);
}

csrf_validasi();
$b = body_json();

if ($m === 'PUT') {
    if ($u['peran'] !== 'guru') {
        json_error('Hanya guru yang dapat menilai jawaban.', 403);
    }
    $id = (int) ($b['id'] ?? 0);
    $nilai = $b['nilai'] ?? null;
    if ($nilai === null || !is_numeric($nilai)) {
        json_error('Body harus berisi nilai numerik.', 422);
    }
    $nilai = (int) $nilai;
    if ($nilai < 0 || $nilai > 100) {
        json_error('Nilai berada pada rentang 0 sampai 100.', 422);
    }
    $st = DB::app()->prepare(
        'UPDATE task_submissions s
         JOIN tasks t ON t.id = s.task_id
         SET s.nilai = ?, s.catatan_guru = ?, s.dinilai_pada = NOW()
         WHERE s.id = ? AND t.guru_id = ?'
    );
    $st->execute([$nilai, trim((string) ($b['catatan'] ?? '')), $id, (int) $u['id']]);
    if ($st->rowCount() === 0) {
        json_error('Jawaban tidak ditemukan atau tugas bukan milik akun ini.', 404);
    }
    DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Menilai jawaban id ' . $id . ' dengan nilai ' . $nilai . '.');
    json_out(['status' => 'success', 'code' => 200, 'message' => 'Nilai tersimpan.', 'id' => $id, 'nilai' => $nilai], 200, ['Cache-Control' => 'no-store']);
}

if ($u['peran'] !== 'siswa') {
    json_error('Hanya akun siswa yang dapat mengirim jawaban.', 403);
}

$taskId = (int) ($b['task_id'] ?? 0);
$kode = (string) ($b['kode'] ?? '');
if ($kode === '' || mb_strlen($kode) > 20000) {
    json_error('Kode jawaban wajib ada dan tidak lebih dari 20.000 karakter.', 422);
}

$t = DB::app()->prepare('SELECT id, kelas, bahasa, exercise_id, tenggat, bobot, status FROM tasks WHERE id = ?');
$t->execute([$taskId]);
$tugas = $t->fetch();
if (!$tugas || $tugas['status'] !== 'aktif') {
    json_error('Tugas tidak ditemukan atau sudah diarsipkan.', 404);
}
if ((string) $tugas['kelas'] !== (string) ($u['kelas'] ?? '')) {
    json_error('Tugas ini ditujukan untuk kelas ' . $tugas['kelas'] . ', bukan kelas akun kamu.', 403);
}
$terlambat = $tugas['tenggat'] !== null && strtotime((string) $tugas['tenggat']) < time();

$jejak = $b['jejak'] ?? null;
if ($jejak !== null && !is_array($jejak)) {
    json_error('jejak harus berupa objek hasil Lab Uji.', 422);
}
$grid = $b['hasil_grid'] ?? null;
if ($grid !== null && !is_array($grid)) {
    json_error('hasil_grid harus berupa objek daftar baris.', 422);
}

$st = DB::app()->prepare(
    'INSERT INTO task_submissions (task_id, siswa_id, kode, output, hasil_grid, jejak, status_http, lulus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       kode = VALUES(kode), output = VALUES(output), hasil_grid = VALUES(hasil_grid),
       jejak = VALUES(jejak), status_http = VALUES(status_http), lulus = VALUES(lulus),
       nilai = NULL, catatan_guru = NULL, dinilai_pada = NULL, dikirim_at = NOW()'
);
$st->execute([
    $taskId,
    (int) $u['id'],
    $kode,
    (string) ($b['output'] ?? ''),
    $grid === null ? null : json_encode($grid, JSON_UNESCAPED_UNICODE),
    $jejak === null ? null : json_encode($jejak, JSON_UNESCAPED_UNICODE),
    (int) ($b['status_http'] ?? 200),
    !empty($b['lulus']) ? 1 : 0,
]);

$c = DB::app()->prepare('SELECT id FROM task_submissions WHERE task_id = ? AND siswa_id = ?');
$c->execute([$taskId, (int) $u['id']]);
$id = (int) ($c->fetchColumn() ?: 0);

DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Mengirim jawaban tugas id ' . $taskId . ($terlambat ? ' (setelah tenggat).' : '.'));
json_out([
    'status' => 'success',
    'code' => 201,
    'message' => $terlambat ? 'Jawaban tersimpan, tetapi tercatat dikirim setelah tenggat.' : 'Jawaban tersimpan dan siap dinilai guru.',
    'id' => $id,
    'task_id' => $taskId,
    'terlambat' => $terlambat,
    // mysqli/PDO mengembalikan 1 untuk INSERT baru dan 2 untuk baris yang
    // diperbarui lewat ON DUPLICATE KEY UPDATE.
    'pernah_kirim_sebelumnya' => $st->rowCount() >= 2,
], 201, ['Cache-Control' => 'no-store']);
