<?php
/**
 * SIRKUIT - lib/sandbox_sql.php
 * Aturan aman dan eksekusi statement SQL siswa pada database ruang latihan.
 * Dipakai api/sandbox-query.php (Lab Kueri) dan api/lab-run.php (Latihan SQL
 * Lab Uji), jadi pembatasan apa yang boleh dijalankan siswa di MySQL hanya
 * ada satu tempat.
 */

declare(strict_types=1);

final class SandboxSql
{
    /** Perintah yang boleh dijalankan siswa di ruang latihan. */
    const PERINTAH = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'SHOW', 'DESCRIBE', 'EXPLAIN'];

    /** Perintah pembaca yang mengembalikan baris hasil, bukan rowCount. */
    const PEMBACA = ['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN'];

    /** Batas waktu satu kueri pada MySQL, dalam detik. */
    const MAKS_DETIK = 5;

    /** Jumlah statement maksimum dalam satu kode SQL Lab Uji. */
    const MAKS_STATEMENT = 12;

    /** Data aplikasi SIRKUIT yang tidak boleh disentuh siswa dari ruang latihan. */
    const TABEL_TERLARANG = [
        'users', 'tasks', 'task_submissions', 'quiz_attempts', 'activity_logs',
        'app_settings', 'rate_buckets', 'lab_runs', 'pbl_scenarios',
        'pbl_solutions', 'pbl_simulation_logs', 'lab_exercises',
    ];

    /**
     * Memecah kode SQL siswa menjadi daftar statement. Komentar baris (-- dan #)
     * dan blok /* ... *\/ dibuang; titik koma di dalam tanda kutip diabaikan.
     *
     * @return array<int, string>
     */
    public static function pisah(string $kode): array
    {
        $statement = [];
        $buf = '';
        $kutip = null;
        $n = strlen($kode);
        for ($i = 0; $i < $n; $i++) {
            $c = $kode[$i];
            $d = $i + 1 < $n ? $kode[$i + 1] : '';
            if ($kutip !== null) {
                $buf .= $c;
                if ($c === '\\' && $kutip !== '`') {
                    if ($d !== '') {
                        $buf .= $d;
                        $i++;
                    }
                } elseif ($c === $kutip) {
                    if ($d === $kutip) {
                        $buf .= $d;
                        $i++;
                    } else {
                        $kutip = null;
                    }
                }
                continue;
            }
            if ($c === "'" || $c === '"' || $c === '`') {
                $kutip = $c;
                $buf .= $c;
                continue;
            }
            if (($c === '-' && $d === '-') || $c === '#') {
                while ($i < $n && $kode[$i] !== "\n") {
                    $i++;
                }
                $buf .= "\n";
                continue;
            }
            if ($c === '/' && $d === '*') {
                $tutup = strpos($kode, '*/', $i + 2);
                $i = $tutup === false ? $n : $tutup + 1;
                $buf .= "\n";
                continue;
            }
            if ($c === ';') {
                $s = trim($buf);
                if ($s !== '') {
                    $statement[] = $s;
                }
                $buf = '';
                continue;
            }
            $buf .= $c;
        }
        $sisa = trim($buf);
        if ($sisa !== '') {
            $statement[] = $sisa;
        }
        return $statement;
    }

    /**
     * Memeriksa satu statement terhadap aturan ruang latihan.
     *
     * @return array{pesan: string, http: int}|null  null berarti boleh dijalankan
     */
    public static function validasi(string $sql): ?array
    {
        $kata = self::perintah($sql);
        if (!in_array($kata, self::PERINTAH, true)) {
            return [
                'pesan' => 'Perintah ' . ($kata === '' ? '(kosong)' : $kata) . ' tidak diizinkan di ruang latihan. Gunakan SELECT, INSERT, UPDATE, atau DELETE.',
                'http' => 400,
            ];
        }
        foreach (self::TABEL_TERLARANG as $terlarang) {
            if (preg_match('/\b' . $terlarang . '\b/i', $sql)) {
                return [
                    'pesan' => 'Tabel "' . $terlarang . '" adalah data aplikasi SIRKUIT, bukan bagian materi yang boleh diakses siswa.',
                    'http' => 403,
                ];
            }
        }
        $tabel = self::tabelUtama($sql);
        if ($tabel !== null && !in_array($tabel, DB::TABEL_AJAR, true)) {
            return [
                'pesan' => 'Tabel "' . $tabel . '" bukan tabel materi ajar. Tabel yang tersedia: ' . implode(', ', DB::TABEL_AJAR) . '.',
                'http' => 400,
            ];
        }
        if (in_array($kata, ['UPDATE', 'DELETE'], true) && !preg_match('/\bwhere\b/i', $sql)) {
            return [
                'pesan' => 'Perintah ' . $kata . ' tanpa klausa WHERE ditolak: akan mengubah seluruh baris tabel.',
                'http' => 400,
            ];
        }
        return null;
    }

    /**
     * Menjalankan satu statement pada database ruang latihan. SELECT yang tidak
     * memakai LIMIT otomatis dibatasi pengaturan grid_baris_maks.
     *
     * @return array{perintah: string, sql: string, kolom: array, baris: array, jumlah: int, terpengaruh: int, waktu_ms: int, error: ?string, kode: ?int}
     */
    public static function eksekusi(string $sql): array
    {
        $awal = microtime(true);
        $perintah = self::perintah($sql);
        if ($perintah === 'SELECT' && !preg_match('/\blimit\b/i', $sql)) {
            $sql .= ' LIMIT ' . (int) DB::setting('grid_baris_maks', 200);
        }
        $rekam = [
            'perintah' => $perintah,
            'sql' => $sql,
            'kolom' => [],
            'baris' => [],
            'jumlah' => 0,
            'terpengaruh' => 0,
            'waktu_ms' => 0,
            'error' => null,
            'kode' => null,
        ];
        try {
            $pdo = DB::sandbox();
            // MySQL 8 memakai MAX_EXECUTION_TIME (milidetik), MariaDB memakai
            // max_statement_time (detik). Nama salah membuat semua kueri gagal.
            $server = (string) $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
            if (stripos($server, 'mariadb') !== false) {
                $pdo->exec('SET SESSION max_statement_time = ' . self::MAKS_DETIK);
            } else {
                $pdo->exec('SET SESSION MAX_EXECUTION_TIME = ' . (self::MAKS_DETIK * 1000));
            }
            $st = $pdo->prepare($sql);
            $st->execute();
            if (in_array($perintah, self::PEMBACA, true)) {
                $baris = $st->fetchAll(PDO::FETCH_ASSOC);
                $kolom = [];
                for ($i = 0, $n = $st->columnCount(); $i < $n; $i++) {
                    $meta = $st->getColumnMeta($i) ?: [];
                    $kolom[] = ['nama' => (string) ($meta['name'] ?? ''), 'tipe' => (string) ($meta['native_type'] ?? '')];
                }
                $rekam['kolom'] = $kolom;
                $rekam['baris'] = $baris;
                $rekam['jumlah'] = count($baris);
                $rekam['terpengaruh'] = count($baris);
            } else {
                $rekam['terpengaruh'] = $st->rowCount();
            }
        } catch (PDOException $e) {
            $pesan = $e->getMessage();
            $kode = (int) ($e->errorInfo[1] ?? 0);
            $rekam['error'] = $pesan === '' ? 'Kueri ditolak MySQL.' : $pesan;
            $rekam['kode'] = $kode === 0 ? null : $kode;
            $rekam['waktu_ms'] = (int) round((microtime(true) - $awal) * 1000);
            return $rekam;
        }
        $rekam['waktu_ms'] = (int) round((microtime(true) - $awal) * 1000);
        return $rekam;
    }

    /** Petunjuk singkat untuk galat MySQL yang paling sering muncul di kelas. */
    public static function pesanGuru(?int $kode): string
    {
        if ($kode === 1054) {
            return 'Unknown column: periksa nama kolom pada panel struktur tabel.';
        }
        if ($kode === 1146) {
            return 'Table doesnt exist: periksa nama tabel pada panel struktur tabel.';
        }
        return 'Periksa sintaks SQL sesuai dialek MySQL.';
    }

    /**
     * Baris hasil untuk grid: jumlahnya dibatasi dan tiap nilai dipotong, supaya
     * jejak yang dikirim ke peramban tetap ringan walau kueri siswa lebar.
     *
     * @return array<int, array<string, string>>
     */
    public static function potongBaris(array $baris, int $maks = 40): array
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

    public static function perintah(string $sql): string
    {
        $kata = preg_split('/\s+/', trim($sql)) ?: [];
        return strtoupper((string) ($kata[0] ?? ''));
    }

    /** Nama tabel yang menjadi sasaran statement, untuk pemeriksaan whitelist. */
    public static function tabelUtama(string $sql): ?string
    {
        if (preg_match('/\bfrom\s+`?([a-z_]+)`?/i', $sql, $m)) {
            return strtolower($m[1]);
        }
        if (preg_match('/\binto\s+`?([a-z_]+)`?/i', $sql, $m)) {
            return strtolower($m[1]);
        }
        if (preg_match('/^update\s+`?([a-z_]+)`?/i', $sql, $m)) {
            return strtolower($m[1]);
        }
        return null;
    }
}
