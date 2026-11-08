<?php
/**
 * api/dashboard.php
 * GET : ringkasan metrik. Guru melihat kondisi satu kelas atau seluruh kelas,
 *       siswa hanya melihat progres dirinya sendiri.
 *
 * Angka tabel materi ajar (siswa, nilai_ukk) dibaca lewat DB::ajar() supaya
 * sama persis dengan hasil kueri yang dijalankan siswa di Lab Uji, sedangkan
 * aktivitas aplikasi (lab_runs, task_submissions, quiz_attempts, logs) dibaca
 * dari schema aplikasi lewat DB::app().
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['GET']);
$u = require_login();
$rl = batasi_kuota('/api/dashboard.php', $u);

$kkm = (int) DB::setting('kkm', 75);
$guru = $u['peran'] === 'guru';
$kelas = trim((string) ($_GET['kelas'] ?? ''));
if (!$guru) {
    $kelas = (string) ($u['kelas'] ?? '');
}

$hitungKelas = static function (PDO $pdo, string $tabel, string $kolomKelas, string $kelas): array {
    if ($kelas === '') {
        $st = $pdo->query('SELECT kelas, COUNT(*) jumlah FROM ' . $tabel . ' GROUP BY ' . $kolomKelas . ' ORDER BY kelas');
        return $st->fetchAll();
    }
    $st = $pdo->prepare('SELECT ' . $kolomKelas . ' AS kelas, COUNT(*) jumlah FROM ' . $tabel . ' WHERE ' . $kolomKelas . ' = ? GROUP BY ' . $kolomKelas);
    $st->execute([$kelas]);
    return $st->fetchAll();
};

if ($guru) {
    $where = $kelas === '' ? '' : ' WHERE kelas = ?';
    $args = $kelas === '' ? [] : [$kelas];

    $st = DB::ajar()->prepare(
        'SELECT COUNT(*) total_siswa,
                COUNT(DISTINCT kelas) jumlah_kelas,
                GROUP_CONCAT(DISTINCT kelas ORDER BY kelas SEPARATOR ", ") daftar_kelas
         FROM siswa' . $where
    );
    $st->execute($args);
    $s = $st->fetch();

    $st = DB::ajar()->prepare(
        'SELECT COUNT(*) terdata, ROUND(AVG(n.nilai), 1) rata_nilai,
                SUM(n.nilai >= ?) tuntas, SUM(n.nilai < ?) belum_tuntas
         FROM nilai_ukk n JOIN siswa s ON s.id = n.siswa_id' .
        ($kelas === '' ? '' : ' WHERE s.kelas = ?')
    );
    $st->execute(array_merge([$kkm, $kkm], $args));
    $ukk = $st->fetch();

    $st = DB::app()->prepare(
        'SELECT COUNT(*) jumlah_tugas, SUM(status = "aktif") tugas_aktif FROM tasks' .
        ($kelas === '' ? '' : ' WHERE kelas = ?')
    );
    $st->execute($args);
    $t = $st->fetch();

    $st = DB::app()->prepare(
        'SELECT COUNT(*) jumlah_kirim, SUM(nilai IS NULL) belum_dinilai,
                SUM(lulus = 1) lulus_pemeriksa, ROUND(AVG(nilai), 1) rata_nilai_tugas
         FROM task_submissions sub JOIN tasks t ON t.id = sub.task_id' .
        ($kelas === '' ? '' : ' WHERE t.kelas = ?')
    );
    $st->execute($args);
    $sub = $st->fetch();

    $st = DB::app()->prepare(
        'SELECT r.bahasa, COUNT(*) jumlah_jalankan, SUM(r.lulus = 1) lulus,
                COUNT(DISTINCT r.user_id) jumlah_siswa_mencoba
         FROM lab_runs r JOIN users w ON w.id = r.user_id' .
        ($kelas === '' ? '' : ' WHERE w.kelas = ?') . ' GROUP BY r.bahasa ORDER BY r.bahasa'
    );
    $st->execute($args);
    $lab = $st->fetchAll();

    $st = DB::app()->prepare(
        'SELECT kelas, COUNT(*) percobaan, ROUND(AVG(skor), 1) rata_skor,
                SUM(skor >= ?) tuntas_kuis
         FROM quiz_attempts' . ($kelas === '' ? '' : ' WHERE kelas = ?') . ' GROUP BY kelas ORDER BY kelas'
    );
    $st->execute(array_merge([$kkm], $args));
    $kuis = $st->fetchAll();

    // Perbandingan tabel ruang latihan dengan akun aplikasi: menemukan siswa
    // yang datanya ada di MySQL tetapi belum bisa login (NISN tidak tertaut).
    $st = DB::app()->prepare('SELECT nisn_nip, nama FROM users WHERE peran = "siswa"');
    $st->execute();
    $punyaAkun = array_column($st->fetchAll(), 'nisn_nip');
    $st = DB::ajar()->prepare('SELECT nisn, nama, kelas FROM siswa' . ($kelas === '' ? '' : ' WHERE kelas = ?') . ' ORDER BY nisn LIMIT 500');
    $st->execute($args);
    $tanpaAkun = array_values(array_filter($st->fetchAll(), static fn ($r) => !in_array((string) $r['nisn'], $punyaAkun, true)));

    $st = DB::app()->query(
        'SELECT nama, kelas, peran, aktivitas, created_at FROM activity_logs
         ORDER BY created_at DESC, id DESC LIMIT 30'
    );
    $log = $st->fetchAll();

    json_out([
        'status' => 'success',
        'code' => 200,
        'message' => 'Ringkasan guru dimuat',
        'meta' => [
            'peran' => 'guru',
            'kelas' => $kelas ?: 'semua kelas',
            'kkm' => $kkm,
            'kuota_sisa' => $rl['sisa'],
            'kuota_per_menit' => $rl['kuota'],
            'sumber' => 'mysql: sirkuit_sandbox lewat DB::ajar(), sirkuit_app lewat DB::app()',
        ],
        'ringkas' => [
            'total_siswa' => (int) ($s['total_siswa'] ?? 0),
            'jumlah_kelas' => (int) ($s['jumlah_kelas'] ?? 0),
            'daftar_kelas' => array_values(array_filter(explode(', ', (string) ($s['daftar_kelas'] ?? '')))),
            'persen_tuntas_ukk' => (int) $ukk['terdata'] > 0
                ? round((int) $ukk['tuntas'] / (int) $ukk['terdata'] * 100, 1)
                : 0,
            'tugas_aktif' => (int) $t['tugas_aktif'],
            'belum_dinilai' => (int) $sub['belum_dinilai'],
            'siswa_belum_punya_akun' => count($tanpaAkun),
        ],
        'nilai_ukk' => $ukk,
        'tugas' => $t,
        'submission' => $sub,
        'lab_runs' => $lab,
        'kuis' => $kuis,
        'siswa_tanpa_akun' => $tanpaAkun,
        'aktivitas_terbaru' => $log,
    ], 200, ['Cache-Control' => 'no-store']);
}

// Ringkasan milik satu siswa.
$st = DB::app()->prepare(
    'SELECT COUNT(*) jumlah_jalankan, SUM(lulus = 1) lolos, MAX(created_at) terakhir_eksperimen
     FROM lab_runs WHERE user_id = ?'
);
$st->execute([(int) $u['id']]);
$lab = $st->fetch();

$st = DB::app()->prepare(
    'SELECT COUNT(*) total, SUM(sub.id IS NOT NULL) terkirim, SUM(sub.lulus = 1) lulus,
            SUM(sub.nilai IS NOT NULL) dinilai, ROUND(AVG(sub.nilai), 1) rata_nilai
     FROM tasks t
     LEFT JOIN task_submissions sub ON sub.task_id = t.id AND sub.siswa_id = ?
     WHERE t.status = "aktif" AND (t.kelas = ? OR ? = "")'
);
$st->execute([(int) $u['id'], (string) ($u['kelas'] ?? ''), (string) ($u['kelas'] ?? '')]);
$tugas = $st->fetch();

$st = DB::app()->prepare(
    'SELECT COUNT(*) percobaan, MAX(skor) skor_terbaik, ROUND(AVG(skor), 1) rata_skor
     FROM quiz_attempts WHERE user_id = ?'
);
$st->execute([(int) $u['id']]);
$kuis = $st->fetch();

$st = DB::ajar()->prepare(
    'SELECT n.nilai, n.paket_keahlian, IF(n.nilai >= ?, "TUNTAS", "PERLU BIMBINGAN") status_kkm
     FROM nilai_ukk n JOIN siswa s ON s.id = n.siswa_id
     WHERE s.nisn = ? AND n.is_published = 1 ORDER BY n.nilai DESC LIMIT 1'
);
$st->execute([$kkm, (string) $u['nisn_nip']]);
$ukk = $st->fetch() ?: null;

$st = DB::app()->prepare(
    'SELECT t.judul, t.bahasa, t.tenggat, sub.lulus, sub.nilai, sub.catatan_guru, sub.dikirim_at
     FROM tasks t JOIN task_submissions sub ON sub.task_id = t.id AND sub.siswa_id = ?
     WHERE t.status = "aktif" ORDER BY sub.dikirim_at DESC LIMIT 10'
);
$st->execute([(int) $u['id']]);
$kirimTerbaru = $st->fetchAll();

json_out([
    'status' => 'success',
    'code' => 200,
    'message' => 'Ringkasan siswa dimuat',
    'meta' => [
        'peran' => 'siswa',
        'nama' => $u['nama'],
        'kelas' => $u['kelas'],
        'kkm' => $kkm,
        'kuota_sisa' => $rl['sisa'],
        'kuota_per_menit' => $rl['kuota'],
    ],
    'ringkas' => [
        'jumlah_jalankan' => (int) ($lab['jumlah_jalankan'] ?? 0),
        'latihan_lolos' => (int) ($lab['lolos'] ?? 0),
        'tugas_terkirim' => (int) $tugas['terkirim'],
        'tugas_aktif' => (int) $tugas['total'],
        'percobaan_kuis' => (int) $kuis['percobaan'],
        'skor_kuis_terbaik' => $kuis['skor_terbaik'] === null ? null : (int) $kuis['skor_terbaik'],
    ],
    'lab_runs' => $lab,
    'tugas' => $tugas,
    'kuis' => $kuis,
    'nilai_ukk' => $ukk,
    'kirim_terbaru' => $kirimTerbaru,
], 200, ['Cache-Control' => 'no-store']);
