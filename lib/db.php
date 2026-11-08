<?php
/**
 * SIRKUIT - lib/db.php
 * Koneksi PDO ke MySQL/MariaDB. Semua akses memakai prepared statement
 * (parameter terganti di server), sesuai materi PDO yang diajarkan.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

final class DB
{
    private static ?PDO $app = null;
    private static ?PDO $sandbox = null;

    public static function cfg(): array
    {
        static $c = null;
        if ($c === null) {
            $c = require __DIR__ . '/config.php';
        }
        return $c;
    }

    private static function connect(string $dbname, string $user, string $pass): PDO
    {
        $db = self::cfg()['db'];
        $dsn = 'mysql:host=' . $db['host'] . ';port=' . $db['port'] . ';dbname=' . $dbname . ';charset=' . $db['charset'];
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");
        $pdo->exec('SET time_zone = "+07:00"');
        return $pdo;
    }

    /** Koneksi aplikasi: akun, tugas, nilai, log. */
    public static function app(): PDO
    {
        if (self::$app === null) {
            $db = self::cfg()['db'];
            self::$app = self::connect($db['app_name'], $db['app_user'], $db['app_pass']);
        }
        return self::$app;
    }

    /**
     * Koneksi ruang latihan: hanya schema sirkuit_sandbox. Dipakai runner Lab
     * Uji sehingga kode siswa tidak pernah memegang kredensial tabel users.
     */
    public static function sandbox(): PDO
    {
        if (self::$sandbox === null) {
            $db = self::cfg()['db'];
            self::$sandbox = self::connect($db['sandbox_name'], $db['sandbox_user'], $db['sandbox_pass']);
        }
        return self::$sandbox;
    }

    /**
     * Pintu masuk tabel MATERI AJAR (siswa, nilai_ukk, jurnal_pkl, proyek,
     * prakerin, sesi_login). Endpoint api/ wajib memakai koneksi ini, bukan
     * DB::app(), supaya data yang dilihat guru di dashboard adalah data yang
     * sama dengan yang ditulis kode siswa di ruang latihan.
     */
    public static function ajar(): PDO
    {
        return self::sandbox();
    }

    /** Semua nama tabel yang boleh diakses siswa dari Lab Uji dan panel grid. */
    public const TABEL_AJAR = ['siswa', 'nilai_ukk', 'jurnal_pkl', 'proyek', 'prakerin', 'sesi_login'];

    public static function tabelExist(string $tabel): bool
    {
        if (!in_array($tabel, self::TABEL_AJAR, true)) {
            return false;
        }
        $st = self::ajar()->prepare(
            'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?'
        );
        $st->execute([$tabel]);
        return (int) $st->fetchColumn() > 0;
    }

    /** Struktur kolom sebuah tabel materi ajar untuk panel schema grid. */
    public static function struktur(string $tabel): array
    {
        if (!in_array($tabel, self::TABEL_AJAR, true)) {
            return [];
        }
        $st = self::ajar()->prepare(
            'SELECT COLUMN_NAME kolom, COLUMN_TYPE tipe, COLUMN_KEY kunci, IS_NULLABLE boleh_null,
                    COLUMN_DEFAULT nilai_default, EXTRA extra
             FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ?
             ORDER BY ORDINAL_POSITION'
        );
        $st->execute([$tabel]);
        return $st->fetchAll();
    }

    public static function logAktivitas(string $nama, ?string $kelas, string $peran, string $aktivitas): void
    {
        $st = self::app()->prepare('INSERT INTO activity_logs (nama, kelas, peran, aktivitas) VALUES (?, ?, ?, ?)');
        $st->execute([$nama, $kelas, $peran, $aktivitas]);
    }

    public static function setting(string $kunci, $default = null)
    {
        $st = self::app()->prepare('SELECT nilai FROM app_settings WHERE kunci = ?');
        $st->execute([$kunci]);
        $v = $st->fetchColumn();
        return $v === false || $v === null ? $default : $v;
    }
}
