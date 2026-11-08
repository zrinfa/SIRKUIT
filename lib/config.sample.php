<?php
/**
 * SIRKUIT - lib/config.sample.php
 * Salin berkas ini menjadi lib/config.php lalu isi kredensial MySQL dari
 * cPanel (Bagian Databases > MySQL Databases). Berkas config.php tidak boleh
 * di-commit karena menyimpan kata sandi database.
 */

return [
    'app' => [
        'nama' => 'SIRKUIT',
        'versi' => '3.0.3',
        'timezone' => 'Asia/Jakarta',
        // true hanya saat pengembangan;false saat media pembelajaran dipakai di kelas.
        'debug' => false,
    ],

    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'charset' => 'utf8mb4',

        // Database aplikasi (akun, tugas, nilai, log). Dipakai lib/db.php.
        'app_name' => 'namauser_sirkuit',
        'app_user' => 'namauser_sirkuit',
        'app_pass' => 'GANTI_DENGAN_PASSWORD_APP',

        // Database ruang latihan. User MySQL ini sengaja tidak diberi hak ke
        // tabel users, tasks, task_submissions, dan quiz_attempts.
        'sandbox_name' => 'namauser_sirkuit_sbx',
        'sandbox_user' => 'namauser_sirkuit_sbx',
        'sandbox_pass' => 'GANTI_DENGAN_PASSWORD_SANDBOX',
    ],

    'session' => [
        'name' => 'SIRKUITSID',
        'lifetime' => 7200,
        // Matikan saat hosting berjalan di belakang HTTPS cPanel (AutoSSL).
        'secure' => true,
    ],

    'runner' => [
        // true  : api/lab-run.php mengeksekusi PHP siswa pada anak proses server.
        //         Hanya aktifkan bila hosting mengizinkan proc_open dan Anda siap
        //         menanggung risikonya (lihat README bagian Keamanan Lab Uji).
        // false : eksekusi tetap di sandbox browser (php-mini.js) dan kueri SQL
        //         siswa dikirim ke api/sandbox-query.php. Ini pilihan aman untuk
        //         hosting cPanel bersama.
        'aktif' => false,
        'php_bin' => '/usr/bin/php',
        // Alamat yang dipakai anak proses ketika http_get() memanggil endpoint
        // sendiri. Kosong = turunkan dari header Host request saat itu.
        'basis_url' => '',
        'timeout_detik' => 5,
        'memori_mb' => 64,
        'direktori_run' => '/tmp/sirkuit-run',
        // Dipakai sebagai -d disable_functions pada ANAK PROSES. Fungsi berkas
        // (fopen, file_get_contents) sengaja tidak diblokir karena helper
        // http_get() membutuhkannya; anak proses tetap dikurung open_basedir ke
        // direktori run sehingga lib/config.php tidak bisa dibaca.
        'fungsi_diblok' => 'exec,shell_exec,system,passthru,popen,proc_open,pclose,pcntl_fork,pcntl_exec,pcntl_signal,pcntl_alarm,pcntl_wait,pcntl_waitpid,dl,mail,putenv,ini_alter,ini_restore,set_include_path,restore_include_path,fsockopen,stream_socket_client,stream_socket_server,stream_socket_pair,socket_create,socket_bind,socket_connect,curl_init,curl_exec,curl_multi_exec,curl_setopt,curl_setopt_array,show_source,highlight_file,readfile,scandir,opendir,glob,chmod,chown,lchown,symlink,link',
    ],

    'rate' => [
        '_window_detik' => 60,
        'kuota_default' => 60,
    ],
];
