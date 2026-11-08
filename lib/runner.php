<?php
/**
 * SIRKUIT - lib/runner.php
 * Menjalankan kode PHP siswa di server pada anak proses yang dikandangkan.
 *
 * Lapisan pengamanannya:
 *   1. open_basedir anak proses diarahkan ke direktori run sesaat, jadi kode
 *      siswa tidak bisa membaca lib/config.php (kata sandi basis data aplikasi).
 *   2. disable_functions menutup exec/socket; fungsi berkas dikunci open_basedir
 *      lalu diblokir ulang lewat fungsi bayangan di namespace SIRKUIT_USER.
 *   3. Kode siswa dibungkus `namespace SIRKUIT_USER`, sehingga PDO, mysqli,
 *      ReflectionClass, session_start, file_get_contents dan nama berbahaya lain
 *      mengacu ke pengganti buatan runner, bukan ke versi aslinya.
 *   4. Parent membunuh anak proses lewat wall-clock timeout, sebab
 *      max_execution_time tidak berlaku pada SAPI CLI.
 *
 * Kueri siswa selalu dialihkan ke basis data ruang latihan. Yang masuk ke anak
 * proses hanyalah kredensial user sandbox, bukan kredensial basis aplikasi.
 */

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';

final class Runner
{
    const MARKER = '===SIRKUIT_TRACE===';

    /** Kasus E500 hanya menoleransi 2 koneksi; latihan biasa jauh lebih longgar. */
    const BATAS_KONEKSI = ['E500' => 2];
    const BATAS_KUERI = 40;
    const BATAS_PANGGILAN = 30;

    public static function tersedia(): bool
    {
        $r = config()['runner'] ?? [];
        if (!($r['aktif'] ?? false) || !function_exists('proc_open')) {
            return false;
        }
        $bin = (string) ($r['php_bin'] ?? '');
        return $bin !== '' && (is_executable($bin) || $bin === PHP_BINARY);
    }

    public static function alasanTidakTersedia(): string
    {
        $r = config()['runner'] ?? [];
        if (!($r['aktif'] ?? false)) {
            return 'Runner server dimatikan pada lib/config.php (runner.aktif = false).';
        }
        if (!function_exists('proc_open')) {
            return 'Fungsi proc_open diblokir php.ini hosting. Latihan PHP dijalankan di sandbox peramban.';
        }
        $bin = (string) ($r['php_bin'] ?? '');
        if ($bin === '' || !is_executable($bin)) {
            return 'Path runner.php_bin pada lib/config.php tidak ditemukan di server ini.';
        }
        return 'Runner server belum siap.';
    }

    /**
     * @param array $req kode, bahasa, mode, user, token, sid, api_basis
     * @return array trace: output, header, queries, calls, fatal, peringatan
     */
    public static function jalankan(array $req): array
    {
        $r = config()['runner'];
        $db = config()['db'];
        $mulai = microtime(true);
        $mode = strtoupper((string) ($req['mode'] ?? 'NORMAL'));

        $rundir = self::buatRundir((string) ($r['direktori_run'] ?? '/tmp/sirkuit-run'), $galatRun);
        if ($rundir === null) {
            return self::kosong((string) $galatRun, $mulai, $mode);
        }

        $cfg = [
            'dsn' => 'mysql:host=' . $db['host'] . ';port=' . (int) $db['port'] . ';dbname=' . $db['sandbox_name']
                     . ';charset=' . ($db['charset'] ?? 'utf8mb4'),
            'user' => (string) $db['sandbox_user'],
            'pass' => (string) $db['sandbox_pass'],
            'nama_db' => (string) $db['sandbox_name'],
            'session' => $req['user'] ?? [],
            'token' => (string) ($req['token'] ?? ''),
            'sid' => (string) ($req['sid'] ?? ''),
            'csrf' => (string) ($req['csrf'] ?? ''),
            'basis' => rtrim((string) (($r['basis_url'] ?? '') !== '' ? $r['basis_url'] : ($req['api_basis'] ?? '')), '/'),
            'maks_koneksi' => self::BATAS_KONEKSI[$mode] ?? self::BATAS_KUERI,
            'batas_kueri' => self::BATAS_KUERI,
            'batas_panggilan' => self::BATAS_PANGGILAN,
            'timeout_http' => max(1, (int) ($r['timeout_detik'] ?? 5) - 2),
        ];

        try {
            $config_json = (string) json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            file_put_contents($rundir . '/bootstrap.php', self::bootstrap());
            file_put_contents($rundir . '/user.php', self::userFile((string) ($req['kode'] ?? '')));

            $bin = (string) ($r['php_bin'] ?? PHP_BINARY);
            $timeout = max(2, (int) ($r['timeout_detik'] ?? 5));
            $memori = max(16, (int) ($r['memori_mb'] ?? 64));
            $cmd = escapeshellarg($bin)
                . ' -d error_reporting=E_ALL -d display_errors=stderr -d log_errors=0'
                . ' -d display_startup_errors=stderr -d expose_php=0 -d memory_limit=' . $memori . 'M'
                . ' -d open_basedir=' . escapeshellarg($rundir)
                . ' -d allow_url_fopen=1'
                . ' -d disable_functions=' . escapeshellarg((string) ($r['fungsi_diblok'] ?? ''))
                . ' -f ' . escapeshellarg($rundir . '/bootstrap.php');

            [$keluar, $galat, $dihentikan] = self::proses($cmd, $rundir, $timeout, $config_json);
        } finally {
            self::hapusRundir($rundir);
        }

        $trace = [
            'queries' => [], 'calls' => [], 'header' => [], 'peringatan' => [],
            'koneksi_dipakai' => 0, 'fatal' => null,
        ];
        $output = $keluar;
        if (($pos = strpos($keluar, self::MARKER)) !== false) {
            $output = rtrim(substr($keluar, 0, $pos));
            $d = json_decode(trim(substr($keluar, $pos + strlen(self::MARKER))), true);
            if (is_array($d)) {
                $trace = array_merge($trace, $d);
            }
        }

        $stderr = str_replace($rundir . '/', '', $galat);
        $parsit = self::pisahkanStderr($stderr);
        $trace['fatal'] = $trace['fatal'] ?? $parsit[0];
        $trace['peringatan'] = array_merge((array) $trace['peringatan'], $parsit[1]);
        $trace['output'] = $output;
        $trace['stderr'] = $stderr;
        $trace['dihentikan'] = $dihentikan;
        $trace['timeout_detik'] = max(2, (int) ($r['timeout_detik'] ?? 5));
        $trace['durasi_ms'] = (int) round((microtime(true) - $mulai) * 1000);
        $trace['pemroses'] = 'PHP ' . PHP_VERSION . ' CLI (runner server)';
        $trace['mode'] = $mode;
        $trace['bahasa'] = (string) ($req['bahasa'] ?? 'php');
        $trace['jalankan'] = 'server';
        $trace['basis_data'] = $cfg['nama_db'];
        $trace['basis_url'] = $cfg['basis'];

        return $trace;
    }

    private static function kosong(string $pesan, float $mulai, string $mode): array
    {
        return [
            'output' => '', 'queries' => [], 'calls' => [], 'header' => [], 'peringatan' => [],
            'fatal' => $pesan, 'dihentikan' => false, 'koneksi_dipakai' => 0,
            'durasi_ms' => (int) round((microtime(true) - $mulai) * 1000),
            'mode' => $mode, 'bahasa' => 'php', 'jalankan' => 'server',
        ];
    }

    private static function buatRundir(string $dasar, ?string &$galat): ?string
    {
        $galat = null;
        if (!is_dir($dasar) && !@mkdir($dasar, 0700, true)) {
            $galat = 'Direktori run tidak bisa dibuat. Isi runner.direktori_run dengan path yang bisa ditulis, misalnya /tmp/sirkuit-run.';
            return null;
        }
        for ($i = 0; $i < 5; $i++) {
            $dir = $dasar . '/r' . bin2hex(random_bytes(6));
            if (@mkdir($dir, 0700, false)) {
                return $dir;
            }
        }
        $galat = 'Direktori run sementara sedang penuh.';
        return null;
    }

    private static function hapusRundir(string $dir): void
    {
        foreach (glob($dir . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($dir);
    }

    /** Pembuka `<?php` dibersihkan; siswa cukup menulis badan skrip. */
    private static function userFile(string $kode): string
    {
        $kode = ltrim($kode);
        if (stripos($kode, '<?php') === 0) {
            $kode = substr($kode, 5);
        } elseif (stripos($kode, '<?=') === 0) {
            $kode = 'echo ' . substr($kode, 3);
        }
        return "<?php\nnamespace SIRKUIT_USER;\n" . $kode;
    }

    /** stderr dipecah: baris Fatal/Parse jadi pesan fatal, sisanya jadi peringatan. */
    private static function pisahkanStderr(string $stderr): array
    {
        $fatal = null;
        $peringatan = [];
        foreach (explode("\n", trim($stderr)) as $l) {
            $l = trim(preg_replace([
                '/\s+in\s+\S+\s+on line\s+\d+/i',
                '/\s+in\s+[\w.\/-]+\.php:\d+/i',
                '/\s+#[\d]+\s.*$/s',
                '/SIRKUIT_USER\\\\/',
            ], '', $l));
            if ($l === '') {
                continue;
            }
            if (stripos($l, 'Fatal error') !== false || stripos($l, 'Parse error') !== false) {
                $fatal = $l;
            } else {
                $peringatan[] = $l;
            }
        }
        return [$fatal, $peringatan];
    }

    /** @return array{0:string,1:string,2:bool} stdout, stderr, dihentikan karena waktu */
    private static function proses(string $cmd, string $rundir, int $timeout, string $stdin = ''): array
    {
        $proc = @proc_open($cmd, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes, $rundir, ['LANG' => 'C.UTF-8']);
        if (!is_resource($proc)) {
            return ['', 'proc_open gagal menjalankan PHP CLI.', false];
        }
        // Konfigurasi (termasuk kredensial sandbox) lewat stdin saja, tidak pernah
        // ditulis ke berkas dan tidak muncul pada baris perintah ps.
        if ($stdin !== '') {
            fwrite($pipes[0], $stdin);
        }
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $stdout = '';
        $stderr = '';
        $batas = microtime(true) + $timeout;
        $dihentikan = false;

        while (true) {
            $hidup = proc_get_status($proc)['running'] ?? false;
            $baca = [$pipes[1], $pipes[2]];
            $tulis = $eksepsi = null;
            $sisa = $batas - microtime(true);
            $mikro = $sisa > 0 ? (int) min(1000000, $sisa * 1000000) : 0;
            if (@stream_select($baca, $tulis, $eksepsi, 0, $mikro) === false) {
                break;
            }
            foreach ($baca as $p) {
                $potong = fread($p, 8192);
                if ($potong === false || $potong === '') {
                    continue;
                }
                if ($p === $pipes[1]) {
                    $stdout .= $potong;
                } else {
                    $stderr .= $potong;
                }
            }
            if (!$hidup) {
                $stdout .= (string) stream_get_contents($pipes[1]);
                $stderr .= (string) stream_get_contents($pipes[2]);
                break;
            }
            if ($sisa <= 0) {
                $dihentikan = true;
                proc_terminate($proc);
                usleep(150000);
                break;
            }
        }

        @fclose($pipes[1]);
        @fclose($pipes[2]);
        @proc_close($proc);

        return [$stdout, $stderr, $dihentikan];
    }

    /** Skrip anak proses: pengganti PDO, pelacak kueri, dan helper sesi/HTTP. */
    private static function bootstrap(): string
    {
        $template = <<<'PHP'
<?php
namespace {
    $SK = json_decode((string) file_get_contents('php://stdin'), true);
    if (!is_array($SK)) {
        fwrite(STDERR, "Runner tidak menerima konfigurasi anak proses.\n");
        exit(1);
    }
    $JEJAK = ['queries' => [], 'calls' => [], 'header' => [], 'peringatan' => [], 'koneksi_dipakai' => 0];
    $S = ['koneksi' => 0, 'persisten' => null, 'terakhir' => null, 'kueri' => 0, 'panggil' => 0, 'cache' => [], 'token' => $SK['token']];

    $_SESSION = [
        'nama' => $SK['session']['nama'] ?? 'Siswa',
        'role' => $SK['session']['peran'] ?? 'siswa',
        'nisn_nip' => $SK['session']['nisn_nip'] ?? '',
        'kelas' => $SK['session']['kelas'] ?? null,
        'email' => $SK['session']['email'] ?? null,
    ];
    $_SERVER += [
        'SERVER_SOFTWARE' => 'Apache/2.4 (cPanel) PHP/' . PHP_VERSION,
        'SERVER_SIGNATURE' => 'SIRKUIT Lab Uji',
        'HTTP_HOST' => 'sirkuit.lab',
        'REQUEST_METHOD' => 'GET',
        'REQUEST_URI' => '/lab-uji',
        'REMOTE_ADDR' => '127.0.0.1',
    ];

    register_shutdown_function(function () use (&$JEJAK) {
        echo "\n__MARKER__" . json_encode($JEJAK, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    });

    /**
     * Koneksi ke basis data ruang latihan. Koneksi non-persisten dihitung satu
     * per kueri, meniru perilaku skrip PHP yang membuka koneksi baru setiap
     * query sampai batas max_connections MySQL habis (kasus E500).
     */
    function __sirkuit_koneksi(bool $persisten): \PDO
    {
        global $SK, $S, $JEJAK;
        if ($persisten) {
            if ($S['persisten'] === null) {
                $S['persisten'] = new \PDO($SK['dsn'], $SK['user'], $SK['pass'], [
                    \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                    \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
                    \PDO::ATTR_EMULATE_PREPARES => false,
                ]);
                $S['koneksi']++;
                $S['terakhir'] = $S['persisten'];
                $JEJAK['koneksi_dipakai'] = $S['koneksi'];
            }
            return $S['persisten'];
        }
        if ($S['koneksi'] >= (int) $SK['maks_koneksi']) {
            throw new \SIRKUIT_USER\PDOException(
                'SQLSTATE[HY000] [1040] Too many connections (batas ' . $SK['maks_koneksi'] . ' koneksi ruang latihan habis)',
                1040
            );
        }
        $pdo = new \PDO($SK['dsn'], $SK['user'], $SK['pass'], [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $S['koneksi']++;
        $S['terakhir'] = $pdo;
        $JEJAK['koneksi_dipakai'] = $S['koneksi'];
        return $pdo;
    }

    /** Koneksi terakhir, untuk lastInsertId() dan transaksi, tanpa membuka baru. */
    function __sirkuit_koneksi_terakhir(): ?\PDO
    {
        global $S;
        return $S['terakhir'];
    }

    /** SQL siap baca: placeholder ? terganti nilainya, seperti pada general log MySQL. */
    function __sirkuit_sql_penuh(string $sql, array $args): string
    {
        $i = 0;
        $out = preg_replace_callback('/\?/', function () use (&$i, $args) {
            if (!array_key_exists($i, $args)) {
                $i++;
                return '?';
            }
            $v = $args[$i++];
            if (is_int($v) || is_float($v)) {
                return (string) $v;
            }
            if ($v === null) {
                return 'NULL';
            }
            return "'" . str_replace("'", "''", (string) $v) . "'";
        }, $sql);
        return (string) $out;
    }

    /** Baris hasil kueri untuk grid peramban: dibatasi jumlahnya dan dipotong nilainya. */
    function __sirkuit_ringkas_baris(array $baris, int $maks = 40): array
    {
        $potong = static function ($v): string {
            if ($v === null) {
                return '';
            }
            if (is_bool($v)) {
                return $v ? '1' : '0';
            }
            $s = (string) $v;
            return mb_strlen($s) > 160 ? mb_substr($s, 0, 160) . '...' : $s;
        };
        $out = [];
        foreach (array_slice($baris, 0, $maks) as $r) {
            $baru = [];
            foreach ((array) $r as $k => $v) {
                $baru[(string) $k] = $potong($v);
            }
            $out[] = $baru;
        }
        return $out;
    }

    function token_sesi(): string
    {
        global $S;
        return (string) $S['token'];
    }

    function refresh_session(): array
    {
        global $S;
        $res = __sirkuit_http('POST', '/api/auth.php', ['json' => ['aksi' => 'refresh']]);
        if ((int) $res['status'] === 201 && !empty($res['data']['token'])) {
            $S['token'] = (string) $res['data']['token'];
        }
        return $res;
    }

    function http_get(string $path, array $opt = []): array
    {
        return __sirkuit_http('GET', $path, $opt);
    }

    function http_post(string $path, array $opt = []): array
    {
        return __sirkuit_http('POST', $path, $opt);
    }

    function http_put(string $path, array $opt = []): array
    {
        return __sirkuit_http('PUT', $path, $opt);
    }

    function http_delete(string $path, array $opt = []): array
    {
        return __sirkuit_http('DELETE', $path, $opt);
    }

    /**
     * Request nyata ke endpoint SIRKUIT pada host yang sama, memakai cookie
     * sesi dan header Authorization siswa. Status 401 dan 429 yang muncul
     * dibangkitkan server sungguhan, bukan angka acak.
     */
    function __sirkuit_http(string $metode, string $path, array $opt): array
    {
        global $SK, $S, $JEJAK;
        if ($S['panggil'] >= (int) $SK['batas_panggilan']) {
            throw new \RuntimeException('Kuota ' . $SK['batas_panggilan'] . ' request per eksekusi habis. Kurangi panggilan http_get().');
        }
        $S['panggil']++;
        if ($SK['basis'] === '') {
            throw new \RuntimeException('http_get() membutuhkan api_basis; runner dijalankan tanpa alamat server.');
        }
        if ($path === '' || $path[0] !== '/') {
            $path = '/' . $path;
        }
        $query = '';
        if (!empty($opt['params']) && is_array($opt['params'])) {
            $query = (strpos($path, '?') === false ? '?' : '&') . http_build_query($opt['params']);
        }
        $kunci = $metode . ' ' . $path . $query;

        if (!empty($opt['cache']) && isset($S['cache'][$kunci])) {
            $dariCache = $S['cache'][$kunci];
            $dariCache['from_cache'] = true;
            $JEJAK['calls'][] = ['method' => $metode, 'path' => $path . $query, 'status' => (int) $dariCache['status'], 'from_cache' => true];
            return $dariCache;
        }

        $header = ['Accept: application/json'];
        if ($SK['sid'] !== '') {
            $header[] = 'Cookie: SIRKUITSID=' . $SK['sid'];
        }
        if (!empty($SK['csrf'])) {
            $header[] = 'X-CSRF-Token: ' . $SK['csrf'];
        }
        if ($S['token'] !== '') {
            $header[] = 'Authorization: Bearer ' . $S['token'];
        }
        foreach ((array) ($opt['headers'] ?? []) as $k => $v) {
            $header[] = $k . ': ' . $v;
        }
        $isi = null;
        if (isset($opt['json'])) {
            $isi = json_encode($opt['json'], JSON_UNESCAPED_UNICODE);
            $header[] = 'Content-Type: application/json';
        } elseif (isset($opt['body'])) {
            $isi = (string) $opt['body'];
        }

        $konteks = stream_context_create(['http' => [
            'method' => $metode,
            'header' => implode("\r\n", $header),
            'content' => $isi,
            'ignore_errors' => true,
            'timeout' => (int) $SK['timeout_http'],
        ]]);
        $mentah = @\file_get_contents($SK['basis'] . $path . $query, false, $konteks);

        $status = 0;
        $respon = [];
        foreach ((array) ($http_response_header ?? []) as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) {
                $status = (int) $m[1];
            } elseif (str_contains($h, ':')) {
                [$k, $v] = explode(':', $h, 2);
                $respon[strtolower(trim($k))] = trim($v);
            }
        }
        $hasil = [
            'status' => $status,
            'ok' => $status >= 200 && $status < 300,
            'headers' => $respon,
            'data' => json_decode((string) $mentah, true),
            'text' => (string) $mentah,
            'from_cache' => false,
        ];
        if ($hasil['ok'] && !empty($opt['cache'])) {
            $S['cache'][$kunci] = $hasil;
        }
        $JEJAK['calls'][] = ['method' => $metode, 'path' => $path . $query, 'status' => $status, 'from_cache' => false];
        return $hasil;
    }

    include __DIR__ . '/user.php';
}

namespace SIRKUIT_USER {
    class Exception extends \Exception {}
    class ErrorException extends Exception {}
    class PDOException extends Exception {}
    class RuntimeException extends Exception {}
    class DomainException extends Exception {}
    class InvalidArgumentException extends Exception {}

    /**
     * Pengganti PDO. DSN, user, dan sandi yang ditulis siswa diabaikan;
     * koneksi selalu diarahkan ke basis data ruang latihan.
     */
    class PDO
    {
        const ATTR_ERRMODE = 3;
        const ATTR_DEFAULT_FETCH_MODE = 1002;
        const ATTR_PERSISTENT = 12;
        const ATTR_EMULATE_PREPARES = 20;
        const ERRMODE_EXCEPTION = 2;
        const ERRMODE_SILENT = 0;
        const ERRMODE_WARNING = 1;
        const FETCH_ASSOC = 2;
        const FETCH_NUM = 3;
        const FETCH_BOTH = 4;
        const FETCH_OBJ = 5;

        private bool $persisten = false;

        public function __construct($dsn = '', $user = null, $pass = null, $opt = [])
        {
            $this->persisten = is_array($opt) && !empty($opt[self::ATTR_PERSISTENT]);
        }

        public function prepare($sql, $opt = [])
        {
            return new PDOStatement((string) $sql, $this->persisten);
        }

        public function query($sql, $mode = self::FETCH_ASSOC, ...$a)
        {
            $st = new PDOStatement((string) $sql, $this->persisten);
            $st->execute();
            return $st;
        }

        public function exec($sql)
        {
            $st = new PDOStatement((string) $sql, $this->persisten);
            $st->execute();
            return $st->rowCount();
        }

        public function lastInsertId($n = null) { $p = \__sirkuit_koneksi_terakhir(); return $p?->lastInsertId($n); }
        public function beginTransaction() { $p = \__sirkuit_koneksi($this->persisten); return $p->beginTransaction(); }
        public function commit() { $p = \__sirkuit_koneksi_terakhir(); return $p ? $p->commit() : false; }
        public function rollBack() { $p = \__sirkuit_koneksi_terakhir(); return $p ? $p->rollBack() : false; }
        public function inTransaction() { $p = \__sirkuit_koneksi_terakhir(); return $p ? $p->inTransaction() : false; }
        public function setAttribute($a, $v) { return true; }
        public function errorInfo() { return ['00000', null, null]; }
    }

    class PDOStatement
    {
        private string $sql;
        private bool $persisten;
        private $st = null;
        private array $baris = [];

        public function __construct(string $sql, bool $persisten)
        {
            $this->sql = $sql;
            $this->persisten = $persisten;
        }

        public function execute($param = null)
        {
            global $SK, $S, $JEJAK;
            $args = is_array($param) ? $param : [];
            $rekam = [
                'sql' => $this->sql, 'param' => array_values((array) $param),
                'rows' => 0, 'terpengaruh' => 0, 'error' => null, 'kode' => null,
            ];
            $rekam['sql'] = \__sirkuit_sql_penuh($this->sql, $args);

            if (++$S['kueri'] > (int) $SK['batas_kueri']) {
                throw new RuntimeException('Kuota ' . $SK['batas_kueri'] . ' kueri per eksekusi habis.');
            }
            $awal = microtime(true);
            try {
                $pdo = \__sirkuit_koneksi($this->persisten);
                $this->st = $pdo->prepare($this->sql);
                foreach ((array) $param as $i => $v) {
                    $this->st->bindValue(is_int($i) ? $i + 1 : $i, $v);
                }
                $this->st->execute();
                if (preg_match('/^\s*(select|show|describe|desc|explain)\b/i', $this->sql)) {
                    $this->baris = $this->st->fetchAll(\PDO::FETCH_ASSOC);
                    $rekam['rows'] = count($this->baris);
                    $rekam['kolom'] = $this->baris ? array_keys($this->baris[0]) : [];
                    $rekam['data'] = \__sirkuit_ringkas_baris($this->baris);
                } else {
                    $rekam['terpengaruh'] = $this->st->rowCount();
                }
            } catch (\Throwable $e) {
                $kode = 0;
                if (preg_match('/\[(\d{4})\]/', $e->getMessage(), $m)) {
                    $kode = (int) $m[1];
                } elseif (preg_match('/ERROR (\d{4})/i', $e->getMessage(), $m)) {
                    $kode = (int) $m[1];
                }
                $rekam['error'] = $e->getMessage();
                $rekam['kode'] = $kode ?: null;
                $rekam['waktu_ms'] = (int) round((microtime(true) - $awal) * 1000);
                $JEJAK['queries'][] = $rekam;
                $this->baris = [];
                throw new PDOException($e->getMessage(), $kode, $e);
            }
            $rekam['waktu_ms'] = (int) round((microtime(true) - $awal) * 1000);
            $JEJAK['queries'][] = $rekam;
            return true;
        }

        public function fetchAll($mode = PDO::FETCH_ASSOC) { return $this->baris; }

        public function fetch($mode = PDO::FETCH_ASSOC)
        {
            $r = array_shift($this->baris);
            return $r === null ? false : $r;
        }

        public function fetchColumn()
        {
            $r = $this->fetch();
            if (!$r) {
                return false;
            }
            $v = array_values($r);
            return $v[0] ?? false;
        }

        public function fetchAllColumn(): array
        {
            return array_map(fn($r) => array_values($r)[0] ?? null, $this->baris);
        }

        public function rowCount(): int
        {
            if ($this->st !== null && ($n = $this->st->rowCount()) > 0) {
                return $n;
            }
            return count($this->baris);
        }

        public function columnCount(): int { return $this->st !== null ? $this->st->columnCount() : 0; }
        public function getColumnMeta($i) { return $this->st !== null ? $this->st->getColumnMeta($i) : false; }
        public function bindValue($k, $v, $t = null) { return true; }
        public function bindParam($k, &$v, $t = null) { return true; }
        public function closeCursor() { $this->baris = []; return true; }
        public function errorCode() { return 'HY000'; }
        public function errorInfo() { return ['00000', null, null]; }
    }

    class mysqli
    {
        public function __construct(...$a)
        {
            throw new RuntimeException('Ruang latihan mengajarkan PDO. Kelas mysqli tidak disediakan.');
        }
    }

    class ReflectionClass
    {
        public function __construct($x = null) { throw new RuntimeException('Reflection diblokir di ruang latihan.'); }
    }
    class ReflectionObject extends ReflectionClass {}

    // Fungsi bayangan: kode siswa (namespace SIRKUIT_USER) menabrak versi ini lebih dulu.
    function file_get_contents(...$a) { throw new RuntimeException('file_get_contents() diblokir di ruang latihan.'); }
    function file_put_contents(...$a) { throw new RuntimeException('file_put_contents() diblokir di ruang latihan.'); }
    function fopen(...$a) { throw new RuntimeException('fopen() diblokir di ruang latihan.'); }
    function unlink(...$a) { throw new RuntimeException('unlink() diblokir di ruang latihan.'); }
    function mkdir(...$a) { throw new RuntimeException('mkdir() diblokir di ruang latihan.'); }
    function rmdir(...$a) { throw new RuntimeException('rmdir() diblokir di ruang latihan.'); }
    function rename(...$a) { throw new RuntimeException('rename() diblokir di ruang latihan.'); }
    function copy(...$a) { throw new RuntimeException('copy() diblokir di ruang latihan.'); }
    function chmod(...$a) { throw new RuntimeException('chmod() diblokir di ruang latihan.'); }
    function chown(...$a) { throw new RuntimeException('chown() diblokir di ruang latihan.'); }
    function touch(...$a) { throw new RuntimeException('touch() diblokir di ruang latihan.'); }
    function scandir(...$a) { throw new RuntimeException('scandir() diblokir di ruang latihan.'); }
    function glob(...$a) { throw new RuntimeException('glob() diblokir di ruang latihan.'); }
    function is_file($p) { throw new RuntimeException('Pemeriksaan berkas diblokir di ruang latihan.'); }
    function is_dir($p) { throw new RuntimeException('Pemeriksaan folder diblokir di ruang latihan.'); }
    function exec(...$a) { throw new RuntimeException('exec() diblokir di ruang latihan.'); }
    function shell_exec(...$a) { throw new RuntimeException('shell_exec() diblokir di ruang latihan.'); }
    function system(...$a) { throw new RuntimeException('system() diblokir di ruang latihan.'); }
    function passthru(...$a) { throw new RuntimeException('passthru() diblokir di ruang latihan.'); }
    function popen(...$a) { throw new RuntimeException('popen() diblokir di ruang latihan.'); }
    function proc_open(...$a) { throw new RuntimeException('proc_open() diblokir di ruang latihan.'); }
    function dl(...$a) { throw new RuntimeException('dl() diblokir di ruang latihan.'); }
    function ini_set(...$a) { throw new RuntimeException('ini_set() diblokir di ruang latihan.'); }
    function ini_get($n) { return ''; }
    function putenv(...$a) { throw new RuntimeException('putenv() diblokir di ruang latihan.'); }
    function getenv($n = false) { throw new RuntimeException('getenv() diblokir di ruang latihan.'); }
    function fsockopen(...$a) { throw new RuntimeException('fsockopen() diblokir di ruang latihan.'); }
    function stream_socket_client(...$a) { throw new RuntimeException('stream_socket_client() diblokir di ruang latihan.'); }
    function curl_init(...$a) { throw new RuntimeException('curl diblokir di ruang latihan; gunakan http_get().'); }
    function session_start(...$a) { return true; }
    function session_destroy(...$a) { return true; }
    function set_time_limit(...$a) { return true; }
    function ignore_user_abort(...$a) { return 0; }
    function register_shutdown_function($cb) { return null; }

    function header($h, $replace = true, $code = null)
    {
        global $JEJAK;
        $JEJAK['header'][] = (string) $h;
        return null;
    }

    function http_response_code($code = null)
    {
        global $JEJAK;
        if ($code !== null) {
            $JEJAK['status'] = (int) $code;
        }
        return $JEJAK['status'] ?? 200;
    }
}
PHP;

        return str_replace('__MARKER__', self::MARKER, $template);
    }
}
