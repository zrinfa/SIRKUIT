<?php
/**
 * SIRKUIT - lib/auth.php
 * Autentikasi berbasis session_start() PHP + password_verify(). Inilah
 * lapisan yang menghasilkan status 401 pada skenario PBL: token sesi yang
 * kedaluwarsa benar-benar ditolak server, bukan disimulasikan.
 */

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $s = config()['session'];
    session_name($s['name']);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => !empty($s['secure']) && ($_SERVER['HTTPS'] ?? '') !== '',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();

    // Umur sesi dibatasi, bukan dibiarkan seumur hidup cookie.
    $hidup = (int) ($s['lifetime'] ?? 7200);
    if (isset($_SESSION['lahir']) && time() - (int) $_SESSION['lahir'] > $hidup) {
        $_SESSION = [];
        session_destroy();
        session_start();
    }
    $_SESSION['lahir'] = $_SESSION['lahir'] ?? time();
}

/**
 * Cocokkan email atau NISN/NIP + kata sandi + peran yang diminta form login.
 * Mengembalikan array user atau string pesan galat.
 */
function login(string $identitas, string $password, string $peran): array|string
{
    $peran = $peran === 'guru' ? 'guru' : 'siswa';
    $st = DB::app()->prepare('SELECT * FROM users WHERE (email = ? OR nisn_nip = ?) AND peran = ? LIMIT 1');
    $st->execute([$identitas, $identitas, $peran]);
    $u = $st->fetch();
    if (!$u || !password_verify($password, (string) $u['password_hash'])) {
        return 'Email atau NISN/NIP dan kata sandi tidak cocok untuk peran ' . $peran . '.';
    }
    if (password_needs_rehash((string) $u['password_hash'], PASSWORD_DEFAULT)) {
        $up = DB::app()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $up->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id' => (int) $u['id'],
        'nisn_nip' => (string) $u['nisn_nip'],
        'nama' => (string) $u['nama'],
        'email' => $u['email'] === null ? null : (string) $u['email'],
        'peran' => (string) $u['peran'],
        'kelas' => $u['kelas'] === null ? null : (string) $u['kelas'],
    ];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    DB::logAktivitas((string) $u['nama'], $u['kelas'] ?? null, $peran, 'Login berhasil sebagai ' . $peran . '.');
    return $_SESSION['user'];
}

function logout(): void
{
    $u = user();
    if ($u) {
        DB::logAktivitas($u['nama'], $u['kelas'], $u['peran'], 'Logout dari SIRKUIT.');
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

function user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function require_login(): array
{
    $u = user();
    if (!$u) {
        json_error('Sesi berakhir, silakan login kembali.', 401, ['token_sesi' => 'expired', 'login' => true]);
    }
    return $u;
}

function require_peran(string $peran): array
{
    $u = require_login();
    if ($u['peran'] !== $peran) {
        json_error('Akun dengan peran ' . $u['peran'] . ' tidak berhak membuka halaman ini.', 403);
    }
    return $u;
}

/**
 * Validasi header Authorization: Bearer <token> terhadap tabel sesi nyata.
 * Dipakai endpoint materi ajar (misal api/nilai-ukk.php) untuk mendemonstrasikan
 * error 401 tanpa harus menghapus validasi yang diajarkan.
 */
function token_bearer(): ?string
{
    $h = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if ($h === '') {
        $h = (string) ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    }
    // mod_rewrite dapat menghilangkan header Authorization sebelum sampai ke PHP.
    // getallheaders() membacanya langsung dari request Apache, jadi tetap tersedia.
    if ($h === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp((string) $k, 'Authorization') === 0) {
                $h = (string) $v;
                break;
            }
        }
    }
    if (preg_match('/^Bearer\s+(\S+)$/i', trim($h), $m)) {
        return $m[1];
    }
    return null;
}

function sesi_aktif(?string $token): ?array
{
    if ($token === null || $token === '' || $token === 'token_expired_null') {
        return null;
    }
    $st = DB::ajar()->prepare(
        'SELECT s.*, w.nisn, w.nama, w.kelas FROM sesi_login s
         JOIN siswa w ON w.id = s.siswa_id
         WHERE s.token = ? AND s.status = "aktif" AND (s.kedaluwarsa_at IS NULL OR s.kedaluwarsa_at > NOW()) LIMIT 1'
    );
    $st->execute([$token]);
    $r = $st->fetch();
    return $r ?: null;
}

/**
 * Menghubungkan akun login (users) dengan baris materi ajar (siswa).
 * users.nisn_nip memuat NISN, sedangkan tabel materi ajar memakai siswa.id,
 * jadi pencarian dilakukan lewat kolom nisn.
 */
function siswa_milik_user(array $u): ?array
{
    $st = DB::ajar()->prepare('SELECT id, nisn, nama, kelas FROM siswa WHERE nisn = ? LIMIT 1');
    $st->execute([(string) $u['nisn_nip']]);
    $r = $st->fetch();
    return $r ?: null;
}

/**
 * Buat token sesi baru untuk user yang sedang login; dipakai api/auth.php
 * ketika siswa memperbaiki kasus 401 dari sisi PHP.
 */
function token_baru(int $userId): array
{
    $u = DB::app()->prepare('SELECT nisn_nip, nama, kelas, peran FROM users WHERE id = ?');
    $u->execute([$userId]);
    $row = $u->fetch();
    if (!$row) {
        json_error('Data siswa tidak ditemukan.', 404);
    }
    $siswa = siswa_milik_user(['nisn_nip' => (string) $row['nisn_nip']]);
    if (!$siswa) {
        json_error($row['peran'] === 'guru'
            ? 'Token sesi terikat pada baris siswa di tabel ruang latihan, jadi kasus 401 hanya dapat dijalankan dengan akun siswa. Guru memakai tab Solusi untuk memeriksa kerangkanya.'
            : 'Akun ini belum tertaut dengan tabel siswa. Hubungi guru laboratorium.', 409);
    }
    $token = 'tok_' . bin2hex(random_bytes(16));
    $ins = DB::ajar()->prepare(
        'INSERT INTO sesi_login (siswa_id, token, status, ip, dibuat_at, kedaluwarsa_at)
         VALUES (?, ?, "aktif", ?, NOW(), DATE_ADD(NOW(), INTERVAL 72 HOUR))'
    );
    $ins->execute([$siswa['id'], $token, client_ip()]);
    return ['token' => $token, 'nama' => (string) $siswa['nama'], 'kelas' => (string) $siswa['kelas'], 'siswa_id' => $siswa['id']];
}
