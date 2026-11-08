<?php
/**
 * SIRKUIT - lib/checker.php
 * Penilai latihan Lab Uji. Aturan penilaian disimpan sebagai JSON deklaratif
 * pada kolom lab_exercises.cek, BUKAN sebagai kode yang dikirim peramban,
 * sehingga siswa tidak bisa mengubah kriteria atau menyuntik kode di sini.
 */

declare(strict_types=1);

final class Checker
{
    /** Bentuk aturan yang didukung. Aturan asing diabaikan, bukan dijalankan. */
    const ATURAN = [
        'fail_if_fatal', 'output_not', 'output_all', 'output_any',
        'no_failed_query', 'query_all', 'query_any', 'query_count',
        'call_no_status', 'call_any', 'pesan_lulus',
    ];

    /**
     * @param array $trace hasil Runner::jalankan / sandbox peramban
     * @return array{passed:bool,pesan:string,periksa:array<int,array{aturan:string,lulus:bool,pesan:string}>}
     */
    public static function evaluasi(?string $cekJson, array $trace): array
    {
        $cek = json_decode((string) $cekJson, true);
        if (!is_array($cek)) {
            return ['passed' => false, 'pesan' => 'Latihan ini belum punya aturan penilaian.', 'periksa' => []];
        }

        $periksa = [];
        $gagal = null;
        $lulus = isset($cek['pesan_lulus']) ? (string) $cek['pesan_lulus'] : 'Kode sudah benar dan memenuhi tujuan latihan.';

        if (($trace['fatal'] ?? null) !== null && trim((string) $trace['fatal']) !== '') {
            return [
                'passed' => false,
                'pesan' => 'Fatal error PHP: ' . $trace['fatal'],
                'periksa' => [['aturan' => 'fatal', 'lulus' => false, 'pesan' => (string) $trace['fatal']]],
            ];
        }

        if (!empty($trace['dihentikan'])) {
            $timeout = (int) ($trace['timeout_detik'] ?? 5);
            return [
                'passed' => false,
                'pesan' => 'Skrip dihentikan setelah ' . $timeout . ' detik. Periksa perulangan tanpa batas atau kueri yang memindai seluruh tabel.',
                'periksa' => [['aturan' => 'timeout', 'lulus' => false, 'pesan' => 'Wall-clock limit runner']],
            ];
        }

        $output = (string) ($trace['output'] ?? '');
        $queries = $trace['queries'] ?? [];
        $calls = $trace['calls'] ?? [];

        if (($cek['fail_if_fatal'] ?? true) && !empty($trace['warning_fatal'])) {
            $gagal = 'Ada error PHP yang belum ditangani.';
        }

        if (!empty($cek['no_failed_query'])) {
            $rusak = null;
            foreach ($queries as $q) {
                if (!empty($q['error'])) {
                    $rusak = (string) $q['error'];
                    break;
                }
            }
            $periksa[] = ['aturan' => 'no_failed_query', 'lulus' => $rusak === null, 'pesan' => $rusak];
            if ($rusak !== null) {
                $gagal = 'MySQL menolak kueri: ' . $rusak;
            }
        }

        foreach ((array) ($cek['output_not'] ?? []) as $r) {
            $hit = self::cocokSet(self::pola($r['re'] ?? ''), $output, true);
            $pesan = (string) ($r['pesan'] ?? 'Masih ada keluaran kerangka awal.');
            $periksa[] = ['aturan' => 'output_not', 'lulus' => !$hit, 'pesan' => $pesan];
            if ($hit && $gagal === null) {
                $gagal = $pesan;
            }
        }

        foreach ((array) ($cek['output_all'] ?? []) as $r) {
            $pola = self::pola($r['re'] ?? '');
            $hit = count($pola) > 0;
            foreach ($pola as $p) {
                $hit = $hit && self::cocok($p, $output);
            }
            [$pesan, $lulusR] = self::pesanAturan($r, 'Output tidak memuat semua pola yang diminta.');
            $periksa[] = ['aturan' => 'output_all', 'lulus' => $hit, 'pesan' => $pesan];
            if (!$hit && $gagal === null) {
                $gagal = $pesan;
            } elseif ($hit && $lulusR !== null) {
                $lulus = $lulusR;
            }
        }

        foreach ((array) ($cek['output_any'] ?? []) as $r) {
            $pola = self::pola($r['re'] ?? '');
            $hit = false;
            foreach ($pola as $p) {
                $hit = $hit || self::cocok($p, $output);
            }
            [$pesan, $lulusR] = self::pesanAturan($r, 'Keluaran belum memuat teks yang diminta.');
            $periksa[] = ['aturan' => 'output_any', 'lulus' => $hit, 'pesan' => $pesan];
            if (!$hit && $gagal === null) {
                $gagal = $pesan;
            } elseif ($hit && $lulusR !== null) {
                $lulus = $lulusR;
            }
        }

        foreach ((array) ($cek['query_all'] ?? []) as $r) {
            $hit = self::adaKueri($queries, self::pola($r['re'] ?? ''), true);
            [$pesan, $lulusR] = self::pesanAturan($r, 'Belum ada satu kueri yang memenuhi semua pola.');
            $periksa[] = ['aturan' => 'query_all', 'lulus' => $hit, 'pesan' => $pesan];
            if (!$hit && $gagal === null) {
                $gagal = $pesan;
            } elseif ($hit && $lulusR !== null) {
                $lulus = $lulusR;
            }
        }

        foreach ((array) ($cek['query_any'] ?? []) as $r) {
            $hit = self::adaKueri($queries, self::pola($r['re'] ?? ''), false);
            [$pesan, $lulusR] = self::pesanAturan($r, 'Belum ada kueri yang cocok dengan pola.');
            $periksa[] = ['aturan' => 'query_any', 'lulus' => $hit, 'pesan' => $pesan];
            if (!$hit && $gagal === null) {
                $gagal = $pesan;
            } elseif ($hit && $lulusR !== null) {
                $lulus = $lulusR;
            }
        }

        foreach ((array) ($cek['query_count'] ?? []) as $r) {
            $pola = self::pola($r['re'] ?? '');
            $min = max(1, (int) ($r['min'] ?? 1));
            $jumlah = 0;
            foreach ($queries as $q) {
                if (self::cocokSet($pola, (string) $q['sql'], true) && empty($q['error'])) {
                    $jumlah++;
                }
            }
            $hit = $jumlah >= $min;
            [$pesan, $lulusR] = self::pesanAturan($r, 'Baru ' . $jumlah . ' kueri yang sah, seharusnya minimal ' . $min . '.');
            $periksa[] = ['aturan' => 'query_count', 'lulus' => $hit, 'pesan' => $pesan];
            if (!$hit && $gagal === null) {
                $gagal = $pesan;
            } elseif ($hit && $lulusR !== null) {
                $lulus = $lulusR;
            }
        }

        foreach ((array) ($cek['call_no_status'] ?? []) as $r) {
            $status = (int) ($r['status'] ?? 0);
            $hit = false;
            foreach ($calls as $c) {
                if ((int) ($c['status'] ?? 0) === $status) {
                    $hit = true;
                    break;
                }
            }
            $pesan = (string) ($r['pesan'] ?? 'Masih ada request berstatus ' . $status . '.');
            $periksa[] = ['aturan' => 'call_no_status', 'lulus' => !$hit, 'pesan' => $pesan];
            if ($hit && $gagal === null) {
                $gagal = $pesan;
            }
        }

        foreach ((array) ($cek['call_any'] ?? []) as $r) {
            $cocok = false;
            foreach ($calls as $c) {
                if (isset($r['status']) && (int) $c['status'] !== (int) $r['status']) {
                    continue;
                }
                if (isset($r['method']) && strtoupper((string) $c['method']) !== strtoupper((string) $r['method'])) {
                    continue;
                }
                if (isset($r['path_prefix']) && strncmp((string) $c['path'], (string) $r['path_prefix'], strlen((string) $r['path_prefix'])) !== 0) {
                    continue;
                }
                if (isset($r['from_cache']) && (bool) ($c['from_cache'] ?? false) !== (bool) $r['from_cache']) {
                    continue;
                }
                $cocok = true;
                break;
            }
            [$pesan, $lulusR] = self::pesanAturan($r, 'Belum ada request yang memenuhi aturan.');
            $periksa[] = ['aturan' => 'call_any', 'lulus' => $cocok, 'pesan' => $pesan];
            if (!$cocok && $gagal === null) {
                $gagal = $pesan;
            } elseif ($cocok && $lulusR !== null) {
                $lulus = $lulusR;
            }
        }

        return [
            'passed' => $gagal === null,
            'pesan' => $gagal ?? $lulus,
            'periksa' => $periksa,
        ];
    }

    /** @return array<int, string> daftar pola regex (body-nya saja, tanpa delimiter) */
    private static function pola($re): array
    {
        if (is_string($re)) {
            $re = [$re];
        }
        if (!is_array($re)) {
            return [];
        }
        $out = [];
        foreach ($re as $p) {
            if (is_string($p) && $p !== '') {
                $out[] = $p;
            }
        }
        return $out;
    }

    private static function cocok(string $pola, string $teks): bool
    {
        return (bool) @preg_match('/' . str_replace('/', '\/', $pola) . '/iu', $teks);
    }

    /** @param array<int,string> $pola */
    private static function cocokSet(array $pola, string $teks, bool $semua): bool
    {
        if (!$pola) {
            return false;
        }
        foreach ($pola as $p) {
            $hit = self::cocok($p, $teks);
            if ($semua && !$hit) {
                return false;
            }
            if (!$semua && $hit) {
                return true;
            }
        }
        return $semua;
    }

    /** @param array<int,string> $pola */
    private static function adaKueri(array $queries, array $pola, bool $semua): bool
    {
        if (!$pola) {
            return false;
        }
        foreach ($queries as $q) {
            if (self::cocokSet($pola, (string) $q['sql'], $semua)) {
                return true;
            }
        }
        return false;
    }

    /** @return array{0:string,1:?string} [pesan gagal, pesan jika lulus atau null] */
    private static function pesanAturan(array $r, string $bawaan): array
    {
        $pesan = isset($r['pesan']) ? (string) $r['pesan'] : $bawaan;
        // Aturan tanpa pesan_lulus tidak boleh menimpa pesan lulus latihan,
        // sebab isinya masih berupa petunjuk kegagalan.
        $lulus = isset($r['pesan_lulus']) ? (string) $r['pesan_lulus'] : null;
        return [$pesan, $lulus];
    }
}
