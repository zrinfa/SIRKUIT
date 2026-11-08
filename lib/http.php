<?php
/**
 * SIRKUIT - lib/http.php
 * helper HTTP untuk endpoint api/: respons JSON, metode, rate limit nyata,
 * header cache, dan token CSRF. Bagian ini yang membuat skenario 429 dan
 * Cache-Control pada materi ajar benar-benar terjadi di server.
 */

declare(strict_types=1);

require_once __DIR__ . '/db.php';

function config(): array
{
    return DB::cfg();
}

function json_out($data, int $status = 200, array $headers = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Server: Apache/2.4 / PHP ' . PHP_VERSION);
    foreach ($headers as $k => $v) {
        header($k . ': ' . $v);
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $pesan, int $status = 400, array $extra = []): void
{
    json_out(array_merge(['status' => 'error', 'message' => $pesan], $extra), $status);
}

/** Tolak metode lain dengan 405, pers seperti yang dijelaskan di modul. */
function require_method(array $boleh): string
{
    $m = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($m, $boleh, true)) {
        header('Allow: ' . implode(', ', $boleh));
        json_error('Metode ' . $m . ' tidak diizinkan untuk endpoint ini.', 405, ['allowed' => $boleh]);
    }
    return $m;
}

function body_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $d = json_decode($raw, true);
    if (!is_array($d)) {
        json_error('Body request bukan JSON yang sah.', 400);
    }
    return $d;
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

/**
 * Token bucket nyata per (user, endpoint) per menit. Saat kuota lewat,
 * endpoint mengembalikan 429 Too Many Requests + Retry-After, sama seperti
 * kasus E429 pada modul, hanya saja kini dibangkitkan Apache/PHP sungguhan.
 */
function rate_limit(string $key): array
{
    $cfg = config()['rate'];
    $window = (int) $cfg['_window_detik'];
    $kuota = (int) DB::setting('rate_limit_per_menit', $cfg['kuota_default']);
    $pdo = DB::app();

    $st = $pdo->prepare('SELECT jumlah, window_mulai FROM rate_buckets WHERE bucket_key = ?');
    $st->execute([$key]);
    $baris = $st->fetch();
    $kini = time();

    if (!$baris) {
        $ins = $pdo->prepare('INSERT INTO rate_buckets (bucket_key, jumlah, window_mulai) VALUES (?, 1, NOW())');
        $ins->execute([$key]);
        return ['allowed' => true, 'sisa' => $kuota - 1, 'kuota' => $kuota, 'retry_after' => 0];
    }

    $umur = $kini - strtotime((string) $baris['window_mulai']);
    if ($umur >= $window) {
        $up = $pdo->prepare('UPDATE rate_buckets SET jumlah = 1, window_mulai = NOW() WHERE bucket_key = ?');
        $up->execute([$key]);
        return ['allowed' => true, 'sisa' => $kuota - 1, 'kuota' => $kuota, 'retry_after' => 0];
    }

    if ((int) $baris['jumlah'] >= $kuota) {
        return [
            'allowed' => false,
            'sisa' => 0,
            'kuota' => $kuota,
            'retry_after' => max(1, $window - $umur),
        ];
    }

    $up = $pdo->prepare('UPDATE rate_buckets SET jumlah = jumlah + 1 WHERE bucket_key = ?');
    $up->execute([$key]);
    return ['allowed' => true, 'sisa' => $kuota - (int) $baris['jumlah'] - 1, 'kuota' => $kuota, 'retry_after' => 0];
}

/** Header cache bersama; dasar pembahasan skenario 429 dan optimisasi. */
function cache_header(int $maxAge = 60, string $visibilitas = 'private'): void
{
    header('Cache-Control: ' . $visibilitas . ', max-age=' . $maxAge);
    header('Vary: Accept-Encoding');
}

/**
 * Pembatas kuota per endpoint. Saat habis, server menjawab 429 dengan header
 * Retry-After dan X-RateLimit-Remaining, persis gejala kasus E429 di modul.
 */
function batasi_kuota(string $path, ?array $user = null): array
{
    $kunci = 'api|' . ($user['id'] ?? client_ip()) . '|' . $path;
    $r = rate_limit($kunci);
    header('X-RateLimit-Limit: ' . $r['kuota']);
    header('X-RateLimit-Remaining: ' . $r['sisa']);
    if (!$r['allowed']) {
        header('Retry-After: ' . $r['retry_after']);
        json_error('Rate limit exceeded: kuota ' . $r['kuota'] . ' request per menit habis.', 429, [
            'retry_after' => $r['retry_after'],
            'kuota' => $r['kuota'],
            'solusi' => 'Aktifkan cache (Cache-Control max-age=60) atau kirim ?limit= lebih kecil.',
        ]);
    }
    return $r;
}

/**
 * Token CSRF disimpan di sesi dan dikirim lewat header X-CSRF-Token.
 * Endpoint POST/PUT/DELETE wajib memanggil csrf_validasi().
 */
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_validasi(): void
{
    $kirim = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? '');
    if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], (string) $kirim)) {
        json_error('Token CSRF tidak cocok. Muat ulang halaman lalu ulangi.', 403);
    }
}

/** Nomor halaman + ukuran page yang aman untuk LIMIT/OFFSET. */
function paginasi(array $q, int $default = 20, int $maks = 200): array
{
    $limit = (int) ($q['limit'] ?? $default);
    $offset = (int) ($q['offset'] ?? 0);
    return [
        'limit' => max(1, min($maks, $limit)),
        'offset' => max(0, min(100000, $offset)),
    ];
}
