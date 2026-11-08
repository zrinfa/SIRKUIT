<?php
/**
 * SIRKUIT - lib/boot.php
 * Titik masuk bersama untuk seluruh endpoint api/ dan index.php.
 */

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/auth.php';

$cfg = config();
date_default_timezone_set($cfg['app']['timezone'] ?? 'Asia/Jakarta');

if (!empty($cfg['app']['debug'])) {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    error_reporting(E_ALL & ~E_DEPRECATED);
}

start_session();

/** Galat tak tertangkap tetap dikirim sebagai JSON, bukan HTML error page. */
set_exception_handler(function (Throwable $e) use ($cfg) {
    error_log('[SIRKUIT] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $pesan = !empty($cfg['app']['debug'])
        ? $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')'
        : 'Terjadi kesalahan pada server. Hubungi guru laboratorium.';
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'error', 'message' => $pesan, 'kode' => 500], JSON_UNESCAPED_UNICODE);
    exit;
});

register_shutdown_function(function () use ($cfg) {
    $e = error_get_last();
    if (!$e || !in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }
    if (headers_sent()) {
        return;
    }
    $pesan = !empty($cfg['app']['debug']) ? $e['message'] : 'Kegagalan fatal pada server.';
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'error', 'message' => $pesan, 'kode' => 500], JSON_UNESCAPED_UNICODE);
});
