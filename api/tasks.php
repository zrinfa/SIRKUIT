<?php
/**
 * api/tasks.php
 * GET    : guru melihat tugas miliknya; siswa melihat tugas aktif kelasnya.
 * POST   : {judul, instruksi, bahasa, kelas, exercise_id, tenggat, bobot} (guru).
 * PUT    : {id, ...} mengubah tugas milik guru yang sama (guru).
 * DELETE : ?id= menandai tugas menjadi arsip (guru).
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

$m = require_method(['GET', 'POST', 'PUT', 'DELETE']);
$u = require_login();
batasi_kuota('/api/tasks.php', $u);

if ($m === 'GET') {
    $pag = paginasi($_GET, 20, 100);
    $status = trim((string) ($_GET['status'] ?? ''));
    $tugas = [];

    if ($u['peran'] === 'guru') {
        $where = 't.guru_id = ?';
        $args = [(int) $u['id']];
        if ($status !== '' && in_array($status, ['aktif', 'arsip'], true)) {
            $where .= ' AND t.status = ?';
            $args[] = $status;
        }
        $st = DB::app()->prepare(
            'SELECT t.id, t.judul, t.instruksi, t.bahasa, t.kelas, t.exercise_id, t.tenggat, t.bobot, t.status, t.created_at,
                    COUNT(s.id) AS jumlah_kirim,
                    SUM(s.lulus = 1) AS jumlah_lulus,
                    SUM(s.id IS NOT NULL AND s.nilai IS NULL) AS belum_dinilai
             FROM tasks t
             LEFT JOIN task_submissions s ON s.task_id = t.id
             WHERE ' . $where . '
             GROUP BY t.id
             ORDER BY t.status, t.tenggat IS NULL, t.tenggat, t.id DESC
             LIMIT ' . $pag['limit'] . ' OFFSET ' . $pag['offset']
        );
        $st->execute($args);
        $tugas = $st->fetchAll();
    } else {
        $st = DB::app()->prepare(
            'SELECT t.id, t.judul, t.instruksi, t.bahasa, t.kelas, t.exercise_id, t.tenggat, t.bobot, t.status, t.created_at,
                    s.id AS submission_id, s.lulus AS submission_lulus, s.nilai AS submission_nilai,
                    s.dikirim_at, s.dinilai_pada, s.catatan_guru
             FROM tasks t
             LEFT JOIN task_submissions s ON s.task_id = t.id AND s.siswa_id = ?
             WHERE t.kelas = ? AND t.status = \'aktif\'
             ORDER BY t.tenggat IS NULL, t.tenggat, t.id DESC
             LIMIT ' . $pag['limit'] . ' OFFSET ' . $pag['offset']
        );
        $st->execute([(int) $u['id'], (string) ($u['kelas'] ?? '')]);
        $tugas = $st->fetchAll();
    }

    json_out([
        'status' => 'success',
        'code' => 200,
        'message' => 'Daftar tugas berhasil dimuat',
        'count' => count($tugas),
        'meta' => ['peran' => $u['peran'], 'kelas' => $u['kelas'] ?? null, 'limit' => $pag['limit'], 'offset' => $pag['offset']],
        'data' => $tugas,
    ]);
}

if ($m === 'DELETE') {
    csrf_validasi();
    if ($u['peran'] !== 'guru') {
        json_error('Hanya guru yang dapat mengarsipkan tugas.', 403);
    }
    $id = (int) ($_GET['id'] ?? 0);
    $st = DB::app()->prepare("UPDATE tasks SET status = 'arsip' WHERE id = ? AND guru_id = ?");
    $st->execute([$id, (int) $u['id']]);
    if ($st->rowCount() === 0) {
        json_error('Tugas tidak ditemukan atau bukan milik akun ini.', 404);
    }
    DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Mengarsipkan tugas id ' . $id . '.');
    json_out(['status' => 'success', 'code' => 200, 'message' => 'Tugas diarsipkan.', 'id' => $id], 200, ['Cache-Control' => 'no-store']);
}

csrf_validasi();
if ($u['peran'] !== 'guru') {
    json_error('Hanya guru yang dapat membuat atau mengubah tugas.', 403);
}
$b = body_json();

$judul = trim((string) ($b['judul'] ?? ''));
$instruksi = trim((string) ($b['instruksi'] ?? ''));
$bahasa = strtolower(trim((string) ($b['bahasa'] ?? 'php')));
$kelas = trim((string) ($b['kelas'] ?? ''));
$tenggat = trim((string) ($b['tenggat'] ?? ''));
$bobot = (int) ($b['bobot'] ?? 1);
$exerciseId = $b['exercise_id'] ?? null;

if ($judul === '' || $instruksi === '' || $kelas === '') {
    json_error('judul, instruksi, dan kelas wajib diisi.', 422);
}
if (!in_array($bahasa, ['php', 'js', 'sql'], true)) {
    json_error('bahasa harus php, js, atau sql.', 422);
}
if ($bobot < 1 || $bobot > 10) {
    json_error('bobot berada pada rentang 1 sampai 10.', 422);
}
if ($tenggat !== '' && strtotime($tenggat) === false) {
    json_error('Format tenggat tidak dikenali. Gunakan "YYYY-MM-DD HH:MM:SS".', 422);
}
if ($exerciseId !== null && $exerciseId !== '') {
    $exerciseId = (int) $exerciseId;
    $cek = DB::app()->prepare('SELECT id, bahasa FROM lab_exercises WHERE id = ? AND aktif = 1');
    $cek->execute([$exerciseId]);
    $lat = $cek->fetch();
    if (!$lat) {
        json_error('exercise_id tidak ditemukan pada bank latihan.', 422);
    }
    if (strtolower((string) $lat['bahasa']) !== $bahasa) {
        json_error('Latihan nomor ' . $exerciseId . ' memakai bahasa ' . $lat['bahasa'] . ', bukan ' . $bahasa . '.', 422);
    }
} else {
    $exerciseId = null;
}

if ($m === 'POST') {
    $st = DB::app()->prepare(
        'INSERT INTO tasks (guru_id, judul, instruksi, bahasa, kelas, exercise_id, tenggat, bobot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([(int) $u['id'], $judul, $instruksi, $bahasa, $kelas, $exerciseId, $tenggat ?: null, $bobot]);
    $id = (int) DB::app()->lastInsertId();
    DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Membuat tugas "' . $judul . '" untuk ' . $kelas . '.');
    json_out(['status' => 'success', 'code' => 201, 'message' => 'Tugas tersimpan.', 'id' => $id], 201, ['Cache-Control' => 'no-store']);
}

$id = (int) ($b['id'] ?? 0);
$st = DB::app()->prepare(
    'UPDATE tasks SET judul = ?, instruksi = ?, bahasa = ?, kelas = ?, exercise_id = ?, tenggat = ?, bobot = ?
     WHERE id = ? AND guru_id = ?'
);
$st->execute([$judul, $instruksi, $bahasa, $kelas, $exerciseId, $tenggat ?: null, $bobot, $id, (int) $u['id']]);
if ($st->rowCount() === 0) {
    $ada = DB::app()->prepare('SELECT COUNT(*) FROM tasks WHERE id = ? AND guru_id = ?');
    $ada->execute([$id, (int) $u['id']]);
    if ((int) $ada->fetchColumn() === 0) {
        json_error('Tugas tidak ditemukan atau bukan milik akun ini.', 404);
    }
}
DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Mengubah tugas id ' . $id . '.');
json_out(['status' => 'success', 'code' => 200, 'message' => 'Tugas diperbarui.', 'id' => $id], 200, ['Cache-Control' => 'no-store']);
