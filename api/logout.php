<?php
/**
 * api/logout.php - POST
 * session_destroy() + penghapusan cookie sesi.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib/boot.php';

require_method(['POST']);
csrf_validasi();
logout();

json_out(['status' => 'success', 'message' => 'Sesi diakhiri.', 'login' => false], 200, ['Cache-Control' => 'no-store']);
