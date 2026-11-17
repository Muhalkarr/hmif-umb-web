# HMIF UMB — PRTS Tactical Terminal & Web Portal

Portal web Himpunan Mahasiswa Informatika (HMIF), Universitas Mayasari Bakti. Aplikasi menggunakan antarmuka bertema PRTS dan terdiri dari portal publik, API, Admin Console, Site Studio, dan workspace anggota.

> **Penting tentang data:** roster, statistik, agenda, akun contoh, dan sejumlah konten yang disertakan untuk development adalah fixture sintetis—bukan data anggota resmi atau data real-time. Naskah AD/ART dan GBHO yang disediakan merupakan dokumen organisasi yang ditampilkan sebagai sumber resmi. Verifikasi dokumen, roster, periode, dan keputusan dengan pengurus sebelum menerbitkan atau memakai data produksi.

## Daftar isi

- [Ruang lingkup dan fitur](#ruang-lingkup-dan-fitur)
- [Peran dan struktur organisasi](#peran-dan-struktur-organisasi)
- [Arsitektur dan struktur repositori](#arsitektur-dan-struktur-repositori)
- [Persyaratan dan instalasi lokal](#persyaratan-dan-instalasi-lokal)
- [Konfigurasi lingkungan](#konfigurasi-lingkungan)
- [Perintah proyek dan validasi](#perintah-proyek-dan-validasi)
- [Data, backup, dan pemulihan](#data-backup-dan-pemulihan)
- [Keamanan dan batasan operasional](#keamanan-dan-batasan-operasional)
- [Production](#production)
- [Troubleshooting](#troubleshooting)
- [Dokumentasi terkait](#dokumentasi-terkait)

## Ruang lingkup dan fitur

### Portal publik dan administrasi

- **Beranda dan identitas organisasi:** visi, misi, profil, statistik, dan konten situs yang dapat dikonfigurasi. Data awal tidak otomatis menjadi data resmi.
- **Program kerja dan operasi organisasi:** pelacakan program, sasaran/KPI, tugas Kanban, kalender kegiatan, agenda, dan data operasi sesuai izin akun.
- **Struktur organisasi:** periode, unit hierarkis, posisi, personel, dan penugasan dapat dikelola terpisah. Editor tidak memaksakan satu susunan organisasi.
- **Konstitusi dan kaderisasi:** AD/ART, GBHO, materi kaderisasi, dan kuis pemahaman. Penilaian kuis di browser adalah latihan dan tidak memberi hak akses.
- **Site Studio (Visual CMS):** pengelolaan tema, halaman dan blok terdaftar, koleksi terstruktur, aset, revisi, pratinjau draft, publikasi, dan pemulihan versi.
- **Soundtrack portal:** pemutar tanpa autoplay dengan preferensi lokal; superadmin dapat mengelola playlist dari Site Studio.
- **Showcase dan Career Hub:** pengajuan karya, profil alumni/mentor, lowongan dan magang melalui proses review sebelum publikasi. Dapatkan persetujuan alumni dan jangan tampilkan kontak pribadi tanpa dasar yang sah.
- **Kalender:** agenda akademik/kegiatan dan tenggat beasiswa atau kompetisi. Tautan pendaftaran eksternal harus HTTPS.
- **Direktori hierarki:** Peta Navigasi Situs menampilkan hubungan halaman yang diatur di Site Studio; bagan struktur universitas memakai unit dan periode berlaku tersendiri, terpisah dari peta kampus maupun kepengurusan HMIF.
- **Aspirasi:** pengiriman aspirasi dan pelacakan privat. Isi aspirasi dan balasan disimpan terenkripsi.
- **Event:** pendaftaran, tiket QR privat, check-in, dan sertifikat dengan halaman verifikasi. Detail tiket privat hanya ditampilkan pada saat pendaftaran; simpan QR yang diberikan. Check-in satu kali dan dibatasi tanggal event menurut zona waktu Asia/Jakarta.
- **Admin Console:** pengelolaan akun dan modul administrasi yang dibatasi role/clearance.
- **Akses akun dari Site Studio:** superadmin dapat mengubah clearance anggota dan memberikan/mencabut capability langsung untuk akun anggota terpilih secara massal; akun superadmin dikecualikan.

### Workspace anggota

Setelah login, pengguna diarahkan ke workspace `#workspace/home`. Menu disesuaikan dengan akun dan izin. Halaman yang tersedia mencakup beranda, profil dan keamanan, notifikasi, Support Desk, Pusat Akademik/LMS, rapat, serta modul operasional sesuai akses.

- **Dashboard:** menggabungkan notifikasi akun, tiket bantuan milik akun, progres learning path, agenda publik mendatang, dan tiket event yang memang boleh dilihat pengguna. Loading, kosong, dan kegagalan API dibedakan.
- **Support Desk:** anggota melihat tiket sendiri; petugas ber-clearance 2+ dapat meninjau antrean, membalas, mengubah status, dan melihat laporan agregat.
- **Akses berbasis penugasan:** superadmin dapat memetakan capability ke posisi pada periode organisasi aktif. Capability sensitif—buku kas, statistik mahasiswa, aspirasi, delegasi, polling, ringkasan LPJ, dan perubahan jenjang kaderisasi—hanya berlaku bagi pemegang penugasan aktif; clearance 3 saja tidak cukup.
- **Statistik akun:** tabel akun nyata memakai kolom standar dan kolom kustom yang diatur superadmin lewat Site Studio. Tabel hanya tampil bagi pemegang `student_demographics.view`; anggota dapat mengelola nilai kolom kustom miliknya sendiri. Data contoh sintetis telah dihapus.
- **Pusat Akademik/LMS:** bank soal/resource, PDF atau tautan HTTPS, learning path berurutan dengan prasyarat, progres milestone, serta diskusi yang dimoderasi. Resource/path buatan kurator tetap draft sampai ditinjau dan diterbitkan superadmin.
- **Kurasi akademik:** capability `academic_curate` memberikan akses kurasi akademik dan pengelolaan draft milik sendiri, bukan kenaikan clearance atau akses Site Studio/operasional.
- **Klinik Koding:** rekomendasi tutor berdasarkan keahlian, slot, ketersediaan dan konflik jadwal. Pengurus mengonfirmasi tutor/sesi secara manual; tautan online HTTPS dimasukkan manual dan tidak dibuat melalui integrasi Google Meet.
- **Notifikasi:** pusat notifikasi in-app dengan preferensi per akun untuk kategori dan pengingat yang didukung. Ketersediaan notifikasi browser/push bergantung pada konfigurasi dan persetujuan browser; push bukan pengganti pusat notifikasi in-app.
- **Rapat HMIF:** rapat privat hanya terlihat bagi akun yang diundang. Penyelenggara dengan capability eksplisit dapat membuat rapat berulang harian/mingguan/bulanan (maksimal 12 bulan), mengelola RSVP, presensi, notulensi, keputusan, tindak lanjut, PDF privat, dan tautan dokumentasi HTTPS. Hak berbagi pada layanan penyimpanan eksternal harus diatur terpisah.
- **Video rapat:** panggilan bawaan menggunakan LiveKit, dikelola atau self-hosted, dan hanya aktif setelah konfigurasi. Peserta yang diundang memperoleh token ruang terbatas dengan masa berlaku 10 menit; UI menyediakan kontrol mikrofon, kamera, berbagi layar, dan keluar.
- **Perekaman rapat:** backend dapat menggunakan LiveKit Egress dan bucket S3-compatible privat. Fitur ini nonaktif secara default dan hanya dapat diaktifkan dengan konfigurasi lengkap, kebijakan disetujui, serta retensi 1–3650 hari. Penyelenggara harus mengonfirmasi bahwa peserta telah diberi tahu; peserta juga menerima notifikasi saat perekaman dimulai. Status direkonsiliasi berkala, unduhan hanya tersedia bagi peserta rapat melalui URL bertanda tangan singkat, dan media yang kedaluwarsa dihapus otomatis.
- **Batas konferensi:** pembuatan Google Meet otomatis belum tersedia. Video memerlukan LiveKit yang disediakan operator; perekaman juga memerlukan Egress dan object storage privat. Perekaman tidak boleh diaktifkan sebelum kebijakan organisasi/hukum mengenai pemberitahuan, akses, retensi, dan penghapusan disetujui.

### Fitur yang masih berupa demo atau memiliki batas integrasi

Navigasi atau tampilan modul tidak dengan sendirinya berarti workflow backend telah tersedia. Gunakan daftar di atas dan dokumentasi backend untuk mengetahui batas tiap fitur. Seed, roster, agenda, dan konten contoh di lingkungan development dapat bersifat sintetis. Dashboard Statistik Mahasiswa memakai akun terdaftar dan bukan sensus resmi seluruh mahasiswa; jangan menganggap data tersebut sebagai informasi resmi universitas.

Web Push memiliki service worker, utilitas client, dan endpoint API untuk mengambil VAPID public key serta mendaftar/menghapus subscription. Kunci VAPID sementara yang dibuat otomatis tidak bertahan setelah restart. Siapkan kunci stabil sebelum mengandalkan subscription lintas restart. Endpoint pengiriman uji hanya tersedia di development; ketersediaan endpoint subscription tidak berarti semua jenis notifikasi in-app otomatis dikirim sebagai push.

## Peran dan struktur organisasi

- Semua akun yang berhasil login memiliki workspace dan halaman profil/keamanan.
- Clearance anggota adalah level 1–3. Operasional organisasi tertentu memerlukan clearance 2 atau lebih; izin backend tetap menjadi penentu akses.
- `superadmin` adalah role khusus, bukan clearance 4. Pengelolaan Site Studio, role, publikasi, dan administrasi superadmin tidak diberikan hanya berdasarkan nama jabatan.
- Capability sensitif dipetakan secara eksplisit oleh superadmin ke posisi pada periode aktif melalui menu **Akses jabatan**. Capability hanya diberikan kepada pemegang penugasan yang sedang berlaku dan berhenti ketika periode/penugasan berakhir.
- Capability langsung dapat diberikan/dicabut pada akun anggota terpilih melalui tab **Akses Akun** di Site Studio. Capability langsung tetap terpisah dari mapping posisi; mencabut izin langsung tidak membatalkan capability dari penugasan aktif.
- Clearance 3 tidak otomatis memberi akses ke buku kas, statistik mahasiswa, aspirasi, delegasi, pemungutan suara, ringkasan LPJ, atau perubahan jenjang kaderisasi. Capability tersebut tidak menaikkan clearance; `academic_curate` dan `meeting_organize` juga tetap perlu diberikan secara eksplisit.
- Struktur organisasi menggunakan model generik berbasis periode, unit, posisi, personel, dan penugasan. Keanggotaan anggota biasa tetap terpisah dari penugasan jabatan.
- Site Studio dapat membuat draft template **BPH Inti/BPD/DPA**. Template menyediakan tiga posisi BPH Inti (Ketua Himpunan, Sekretaris Jenderal, Bendahara Umum) serta unit BPD, DPA, koordinator angkatan, dan kepanitiaan ad hoc. Semua masih dapat disesuaikan; template membuat draft tanpa personel, penugasan, maupun izin.
- Template adalah titik awal konfigurasi, bukan keputusan organisasi atau sumber kewenangan. Verifikasi susunan, nama posisi, roster, tanggal periode, serta dasar AD/ART/keputusan MUBES sebelum penetapan/publikasi. Jangan menyimpulkan kewenangan atau memberikan izin dari nama unit.
- Tanggal pengesahan efektif yang diperlukan untuk menghitung tenggat transisi belum dicatat. Aplikasi tidak menghitung tenggat tersebut secara otomatis.

## Arsitektur dan struktur repositori

| Bagian | Teknologi / tanggung jawab | Alamat lokal |
| --- | --- | --- |
| Frontend | Vite, JavaScript ES modules, CSS | `http://localhost:5173` |
| Backend | Node.js, Express 5, API JSON | `http://localhost:3001` |
| Persistensi | SQLite, WAL, foreign keys; repository dan layanan server | `data/hmif.sqlite` secara default pada development |
| File upload | Direktori penyimpanan aset privat | `data/site-assets/` secara default pada development |

Frontend dev server mem-proxy `/api` ke backend lokal. Jalankan kedua proses dalam terminal terpisah.

Bagian penting repositori:

```text
.
├── e2e/                    # Browser E2E dengan Playwright
├── public/                 # Berkas statis, ikon, service worker
├── scripts/                # Smoke test rilis dan pemeriksaan ukuran bundle
├── server/
│   ├── context/             # Konteks layanan/rute dan konfigurasi runtime
│   ├── middleware/          # Auth dan middleware backend
│   ├── repositories/        # Persistensi/akses data
│   ├── routes/              # Endpoint API
│   ├── services/            # Layanan backend
│   ├── *.test.js            # Tes backend
│   └── README.md            # Panduan backend, login lokal, operasi dan troubleshooting
├── src/
│   ├── features/            # Fitur browser, termasuk Web Push
│   ├── scripts/             # Aplikasi, workspace, Site Studio, dan data portal
│   └── styles/              # Gaya antarmuka
├── tests/                   # Tes lintas fitur
├── .env.example             # Contoh konfigurasi lokal
├── package.json             # Dependensi dan perintah npm
└── playwright.config.js     # Konfigurasi E2E
```

API diorganisasi ke dalam rute autentikasi/akun, SSO, Site Studio, admin, akademik/learning, Support Desk, rapat, operasi, keuangan, kehadiran, voting, Web Push, dan health check. Lihat implementasi pada [`server/routes/`](./server/routes/) dan panduan [`server/README.md`](./server/README.md).

## Persyaratan dan instalasi lokal

Gunakan **Node.js 22** dan npm. Dari root repositori:

```powershell
npm ci
Copy-Item .env.example .env
```

Buka `.env`, lalu isi sekurangnya `JWT_SECRET` dan `INITIAL_ADMIN_PASSWORD` bila database development baru akan dibuat. Gunakan secret acak, bukan contoh atau placeholder:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Isi nilai yang dihasilkan sebagai `JWT_SECRET`. Gunakan nilai rahasia berbeda untuk setiap lingkungan. `JWT_SECRET` minimal 32 byte; password superadmin awal minimal 16 karakter.

Jalankan backend dan frontend pada dua terminal PowerShell di root proyek:

```powershell
# Terminal 1
npm run dev:api
```

```powershell
# Terminal 2
npm run dev
```

Buka `http://localhost:5173`. Jangan membuka port API `3001` untuk menggunakan antarmuka web. Jangan commit `.env` atau menempelkan secret ke log, chat, dokumentasi, maupun issue.

### Seed dan login lokal

`INITIAL_ADMIN_NIM` dan `INITIAL_ADMIN_PASSWORD` dipakai hanya ketika membuat database SQLite baru tanpa sumber data lama yang diimpor. Keduanya tidak mereset akun/database yang sudah ada. Pada development, jika `data/database.json` tersedia saat SQLite pertama kali dibuat, data tersebut dapat diimpor; password yang dipakai tetap hash dari data yang diimpor. Mengedit `.env` setelah database ada tidak mengganti password di SQLite.

Login menggunakan **NIM/ID pengguna**, bukan email. Jika credential awal tidak berlaku karena database lama telah dibuat, ikuti prosedur pemeriksaan/reset yang dijelaskan dalam [panduan backend](./server/README.md). Hindari menghapus atau mengganti nama database/data sebelum memastikan Anda memahami dampaknya.

### Menjalankan build lokal

```powershell
npm run build
npm run preview
```

`preview` menjalankan hasil frontend produksi untuk pengecekan tampilan. Backend tetap harus dijalankan secara terpisah untuk menguji API.

## Konfigurasi lingkungan

Salin `.env.example` sebagai sumber lengkap nilai awal. Variabel berikut dibaca server kecuali jika ditandai sebagai Vite/frontend:

| Variabel | Kapan diperlukan | Fungsi dan catatan |
| --- | --- | --- |
| `NODE_ENV` | Disarankan | Gunakan `development` lokal dan `production` pada server. |
| `PORT` | Opsional | Port API; default `3001`. |
| `JWT_SECRET` | Wajib | Kunci acak minimal 32 byte untuk menandatangani sesi. Rotasi akan membatalkan sesi dan memengaruhi kunci turunan jika kunci khusus tidak diatur. |
| `FRONTEND_ORIGINS` | Wajib di production | Daftar origin frontend dipisahkan koma, tanpa path. Mutasi API ditolak jika header `Origin` tidak cocok. Development default: `http://localhost:5173,http://127.0.0.1:5173`. |
| `ALLOW_PUBLIC_REGISTRATION` | Opsional | Pendaftaran mandiri hanya aktif jika bernilai `true`; default `false`. Akun baru dari alur publik bukan superadmin. |
| `INITIAL_ADMIN_NIM` | Saat seed DB kosong | NIM/ID superadmin awal. Hanya dipakai pada pembuatan DB baru sesuai aturan seed; tidak mereset akun yang ada. |
| `INITIAL_ADMIN_PASSWORD` | Saat seed DB kosong | Password superadmin awal, minimal 16 karakter; tidak mereset password yang sudah tersimpan. |
| `DATABASE_FILE` | Wajib di production | Path absolut file SQLite pada volume persisten di luar workspace. Tidak boleh memakai lokasi database default development. |
| `ASSET_STORAGE_DIR` | Wajib di production | Path absolut direktori aset privat pada volume persisten. |
| `ASPIRATION_ENCRYPTION_KEY` | Disarankan | Kunci stabil minimal 32 byte untuk isi aspirasi dan balasan. Bila kosong, diturunkan dari `JWT_SECRET`; jangan mengganti selama data terenkripsi masih perlu dibaca. |
| `EVENT_TICKET_ENCRYPTION_KEY` | Opsional/disarankan | Kunci stabil minimal 32 byte untuk token QR yang dapat dipulihkan dari dashboard. Bila kosong, diturunkan dari `JWT_SECRET`; jangan mengganti selama tiket terkait masih berlaku. |
| `RESEND_API_KEY` | Opsional | API key Resend untuk pengiriman email tiket event. Tanpa konfigurasi ini, jalur tiket di browser tetap digunakan. |
| `EVENT_EMAIL_FROM` | Bersama Resend | Alamat/nama pengirim yang telah diverifikasi, misalnya `HMIF Events <events@example.org>`. |
| `GOOGLE_CLIENT_ID` | Jika mengaktifkan Google SSO | OAuth client ID Google. |
| `GOOGLE_CLIENT_SECRET` | Jika mengaktifkan Google SSO | OAuth client secret. Simpan sebagai secret; jangan pernah menaruhnya di frontend. |
| `GOOGLE_CALLBACK_URL` | Jika mengaktifkan Google SSO | Callback yang didaftarkan pada Google OAuth; default lokal `http://localhost:3001/api/auth/sso/google/callback`. |
| `FRONTEND_SSO_SUCCESS` | Opsional untuk SSO | URL frontend tujuan sesudah login Google berhasil. |
| `FRONTEND_SSO_ERROR` | Opsional untuk SSO | URL frontend tujuan ketika autentikasi/tautan akun gagal. |
| `VAPID_PUBLIC_KEY` | Jika mempertahankan Web Push | Kunci publik VAPID untuk browser. Atur pasangan stabil dengan kunci privat. |
| `VAPID_PRIVATE_KEY` | Jika mempertahankan Web Push | Kunci privat VAPID. Jangan dibagikan atau dimasukkan ke kode. Kunci sementara otomatis tidak persisten dan subscription yang ada mungkin tidak bekerja setelah restart. |
| `VAPID_CONTACT_EMAIL` | Opsional untuk Web Push | Email kontak dalam identitas VAPID; default `admin@hmif-umb.ac.id`. |
| `MEETING_VIDEO_ENABLED` | Jika mengaktifkan panggilan bawaan | Harus bernilai `true` dan konfigurasi LiveKit lengkap. Default `false`. |
| `LIVEKIT_WS_URL` | Jika mengaktifkan panggilan bawaan | URL WebSocket LiveKit untuk browser; production wajib `wss://`. Alias lama `LIVEKIT_URL` juga diterima. |
| `LIVEKIT_API_URL` | Opsional bersama LiveKit | URL API server LiveKit; jika kosong, diturunkan dari `LIVEKIT_WS_URL` (`wss`→`https`). Production wajib HTTPS. |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Jika mengaktifkan panggilan bawaan | Kredensial server LiveKit; konfigurasi keduanya bersama endpoint. Simpan hanya di secret manager/server environment. |
| `MEETING_RECORDING_ENABLED` | Jika recording telah disetujui | Harus bernilai `true`; tidak mengaktifkan perekaman tanpa gate kebijakan, retention, LiveKit, dan storage yang lain. Default `false`. |
| `MEETING_RECORDING_POLICY_APPROVED` | Jika mengaktifkan perekaman | Harus bernilai `true` setelah organisasi menyetujui pemberitahuan, akses, retensi, dan penghapusan. Default `false`. |
| `MEETING_RECORDING_RETENTION_DAYS` | Jika mengaktifkan perekaman | Bilangan bulat 1–3650; tidak memiliki nilai default. Rekaman tidak aktif bila tidak valid/kosong. |
| `MEETING_RECORDING_S3_BUCKET`, `MEETING_RECORDING_S3_ACCESS_KEY`, `MEETING_RECORDING_S3_SECRET_KEY` | Jika mengaktifkan perekaman | Harus terisi bersama. Pakai bucket privat dan kredensial berizin minimum, termasuk izin hapus objek untuk lifecycle retensi. |
| `MEETING_RECORDING_S3_REGION` | Opsional bersama storage rekaman | Region S3; default `us-east-1`. |
| `MEETING_RECORDING_S3_ENDPOINT` | Opsional bersama storage rekaman | Endpoint S3-compatible kustom; bila dipakai di production harus HTTPS. |
| `MEETING_RECORDING_S3_FORCE_PATH_STYLE` | Opsional bersama storage rekaman | Gunakan `true` hanya bila provider S3-compatible memerlukan path-style addressing; default `false`. |
| `VITE_API_URL` | Opsional lokal; atur untuk build nonlokal bila memakai fitur terkait | Base URL API/WebSocket yang dipakai fitur frontend tertentu (misalnya Web Push dan statistik WebSocket). Default-nya `http://localhost:3001`, yang tidak sesuai untuk browser pengguna production. Nilai `VITE_*` masuk ke build browser dan tidak boleh berisi secret. |

Untuk konfigurasi lengkap Google OAuth, VAPID, seed, serta catatan migrasi, lihat [`.env.example`](./.env.example) dan [panduan backend](./server/README.md). Jangan letakkan secret pada variabel `VITE_*`.

### Konfigurasi konferensi rapat

Konferensi bersifat opt-in. Atur URL LiveKit dan secret di lingkungan server, lalu aktifkan `MEETING_VIDEO_ENABLED=true`. Browser harus dapat mengakses endpoint WSS dan media LiveKit; server harus dapat mengakses API LiveKit. Operator bertanggung jawab atas TLS, TURN/firewall, kapasitas, monitoring, dan SLA penyedia.

Perekaman harus tetap nonaktif sampai kebijakan organisasi disetujui. Untuk mengaktifkannya, semua gate `MEETING_RECORDING_*` harus lengkap bersama LiveKit dan bucket privat. Endpoint storage kustom di production harus HTTPS. Konfirmasi penyelenggara di UI dan notifikasi peserta membantu proses pemberitahuan, tetapi bukan pengganti persetujuan yang diwajibkan organisasi atau hukum. Pembuatan Google Meet otomatis belum terintegrasi; Google SSO saat ini bukan consent Google Calendar.

## Perintah proyek dan validasi

| Perintah | Tujuan |
| --- | --- |
| `npm run dev` | Menjalankan Vite frontend pada port `5173`. |
| `npm run dev:api` | Menjalankan API; membaca `.env` melalui `--env-file-if-exists`. |
| `npm run build` | Membuat build frontend produksi pada `dist/`. |
| `npm run preview` | Menyajikan build frontend untuk pemeriksaan lokal. |
| `npm test` | Menjalankan seluruh tes Node.js (`node --test`), termasuk unit/integrasi backend. |
| `npm run test:e2e` | Menjalankan browser E2E Playwright pada Chromium. |
| `npm run smoke:release` | Smoke test API pada DB dan aset sintetis sementara. |
| `npm run check:bundle` | Memastikan ukuran bundle awal tidak melewati batas proyek. |
| `npm run check:release` | Menjalankan tes, build, pemeriksaan bundle, smoke test, dan E2E. |

Untuk menjalankan E2E pertama kali, pasang browser Chromium Playwright:

```powershell
npx playwright install chromium
```

`npm run test:e2e` memakai akun, database, direktori aset, server API, dan Vite sementara; tidak memerlukan credential produksi. `npm run smoke:release` memeriksa health, konfigurasi publik, sesi admin, notifikasi, Support Desk, learning, rapat, serta guard startup production. Kedua pengujian membersihkan data sintetisnya. Workflow GitHub Actions menjalankan `npm run check:release` dengan Node 22 dan Chromium, tanpa secret maupun data produksi.

Build memisahkan modul admin/akademik/Site Studio, QR generator, dan naskah AD/ART besar ke chunk yang dimuat saat dibutuhkan. Pemeriksaan bundle membatasi JavaScript entry awal hingga 500 KiB; chunk naskah panjang dapat lebih besar.

## Data, backup, dan pemulihan

- Pada development, database default adalah `data/hmif.sqlite`; file data lama `data/database.json` dapat diimpor satu kali. Database, file WAL/SHM, dan aset runtime tidak boleh dianggap sebagai fixture yang aman untuk dibagikan.
- Pada production, gunakan volume persisten terpisah untuk `DATABASE_FILE` dan `ASSET_STORAGE_DIR`. Database production baru memulai koleksi operasi (misalnya agenda/transaksi) kosong serta konten situs tanpa materi awal; masukkan dan tinjau konten resmi sebelum publikasi.
- `GET /api/admin/backup` mengekspor data JSON dan metadata operasional. Ini **bukan** backup pemulihan mandiri: file gambar, audio, font, dan PDF tetap berada pada `ASSET_STORAGE_DIR` (termasuk subfolder `knowledge` dan `soundtracks`). Belum tersedia endpoint pemulihan JSON.
- Untuk backup konsisten, hentikan penulisan aplikasi, lakukan checkpoint WAL (`PRAGMA wal_checkpoint(TRUNCATE)`) atau gunakan SQLite Online Backup API, lalu cadangkan database dan seluruh `ASSET_STORAGE_DIR` sebagai satu set. Jika perekaman diaktifkan, backup dan pemulihan bucket rekaman S3-compatible juga harus dikelola sebagai data privat; backup JSON tidak mencakup media tersebut. Jangan menyalin hanya file `.sqlite` ketika aplikasi sedang menulis.
- Uji pemulihan pada staging terisolasi dengan akun uji. Verifikasi login, ekspor metadata, unduhan berkas, dan hash SHA-256 berkas sebelum menyatakan pemulihan berhasil.
- Backup dapat memuat data pribadi anggota dan hash kredensial. Batasi akses, enkripsi saat disimpan/ditransfer, dan tetapkan retensi. Jangan unggah backup ke issue/chat atau commit ke Git.

Panduan backend memuat langkah-langkah pemulihan lebih terperinci dan catatan data setiap fitur.

## Keamanan dan batasan operasional

- Sesi menggunakan cookie `prts_session` yang `HttpOnly`, `SameSite=Strict`, berumur dua jam, dan `Secure` di production. Perubahan origin, login, dan sesi harus diuji melalui HTTPS pada production.
- Mutasi API memerlukan `Origin` yang terdaftar dalam `FRONTEND_ORIGINS`. Bukalah frontend dari origin yang sama persis, termasuk hostname dan port.
- Password disimpan sebagai hash. `JWT_SECRET` bukan password akun dan tidak mengubah hash pengguna.
- Endpoint autentikasi, registrasi, dan aspirasi dilindungi rate limit. Upload divalidasi tipe dan signature/container; SVG/markup aktif ditolak.
- Draft situs memakai revision ID/optimistic concurrency untuk mendeteksi konflik. Aksi administratif penting dicatat ke audit log.
- Aspirasi dan balasan, serta token e-ticket yang dapat dipulihkan, menggunakan enkripsi dengan kunci khusus bila disediakan. Jaga stabilitas kunci agar data lama tetap terbaca.
- PDF rapat privat diakses melalui endpoint terautentikasi dan kontrol peserta; tautan eksternal HTTPS tetap mengikuti pengaturan izin penyedia eksternal. Token LiveKit berlaku 10 menit dan terbatas ke satu ruang; URL unduh rekaman berlaku lima menit. Akses media juga memerlukan kebijakan izin pada storage privat.
- SQLite sesuai untuk deployment satu host kecil. Jangan meletakkan database SQLite di network filesystem atau berbagi file database di antara beberapa instance. Untuk skala multi-instance, migrasikan ke database transaksional terkelola dan object storage.
- Pendaftaran publik default nonaktif. Jika diaktifkan, tinjau kebijakan verifikasi dan operasi akun sebelum membuka ke publik.
- Fitur yang belum tersedia meliputi endpoint restore backup JSON dan pembuatan Google Meet otomatis. Panggilan LiveKit dan rekaman server-side tersedia secara opt-in; rekaman tetap nonaktif hingga konfigurasi serta kebijakan retensi/pemberitahuan disetujui.

## Production

README ini bukan prosedur deployment penyedia cloud tertentu. Sebelum membuka portal kepada pengguna:

1. Tetapkan domain HTTPS dan set `FRONTEND_ORIGINS` ke origin yang tepat.
2. Set `NODE_ENV=production`, `JWT_SECRET` acak/unik, serta secret enkripsi yang stabil dan tersimpan di secret manager.
3. Siapkan volume persisten terpisah untuk `DATABASE_FILE` dan `ASSET_STORAGE_DIR`; pastikan proses aplikasi punya izin minimum yang diperlukan.
4. Siapkan backup teruji untuk database dan semua aset. Uji pemulihan di staging, bukan pada data production.
5. Siapkan superadmin awal melalui prosedur penyediaan yang aman; ganti kredensial awal setelah login pertama. Jangan mengaktifkan registrasi publik tanpa kebijakan yang disetujui.
6. Konfigurasikan OAuth, Resend, atau Web Push hanya jika fitur terkait memang akan digunakan; batasi redirect URL dan simpan secret di secret manager.
7. Jalankan `npm run check:release`, periksa health, audit akses/role, verifikasi konten resmi, serta pastikan log tidak berisi data sensitif sebelum rilis.

Jangan menggunakan seed demo atau menganggap user, roster, tanggal, agenda, izin, dan data organisasi hasil fixture sebagai data production yang sudah benar.

## Troubleshooting

| Gejala | Pemeriksaan / tindakan |
| --- | --- |
| API gagal start karena `JWT_SECRET` | Pastikan `.env` berada di root, secret terisi dan panjangnya minimal 32 byte. Jangan salin placeholder. |
| Login menyatakan password salah setelah mengisi `.env` | `INITIAL_ADMIN_PASSWORD` hanya berlaku saat seed database baru. Periksa sumber database dan ikuti panduan reset akun di [`server/README.md`](./server/README.md). |
| NIM tidak ditemukan | Login memakai NIM/ID yang tersimpan di SQLite, bukan email. Periksa apakah data lama diimpor. |
| Login berhasil tetapi Site Studio tidak terlihat | Site Studio khusus role `superadmin`; clearance anggota tidak otomatis memberikan akses tersebut. |
| `ECONNREFUSED` atau API tidak merespons | Pastikan `npm run dev:api` berjalan pada port yang dikonfigurasi dan frontend memakai proxy Vite/default API URL yang sesuai. |
| `Origin tidak diizinkan` | Cocokkan origin browser (protokol, hostname, port) dengan `FRONTEND_ORIGINS`. `localhost` dan `127.0.0.1` adalah origin yang berbeda. |
| Data tidak muncul atau konfigurasi tampak kosong | Jalankan API, periksa log API, lalu muat ulang. Pisahkan data demo dari konten production. |
| Cookie tidak tersimpan di production | Gunakan HTTPS dan origin yang diizinkan. Cookie `Secure` tidak berfungsi melalui HTTP biasa. |
| Web Push berhenti setelah restart | Atur VAPID public/private key yang sama secara persisten, pastikan HTTPS dan izin browser, lalu subscribe ulang jika perlu. |
| `npm run test:e2e` gagal karena browser tidak tersedia | Jalankan `npx playwright install chromium`, lalu ulangi tes. |

## Dokumentasi terkait

- [Panduan backend lengkap](./server/README.md) — konfigurasi lokal, login/seed, Site Studio, batas akses, data fitur, dan pemecahan masalah.
- [Contoh variabel lingkungan](./.env.example) — nama variabel runtime dan contoh pengaturan lokal.
- [Workflow validasi GitHub Actions](./.github/workflows/validate.yml) — versi Node, instalasi Chromium, dan perintah CI.
- [`e2e/`](./e2e/) — pengujian workflow anggota dan penyelenggara di browser.
- [`server/routes/`](./server/routes/) — implementasi endpoint API.
- [`src/scripts/organizationTemplates.js`](./src/scripts/organizationTemplates.js) — template draft struktur organisasi.
- [`src/scripts/constitutionData.js`](./src/scripts/constitutionData.js) dan [`Draft Amandemen AD & ART + GBHO.pdf`](./Draft%20Amandemen%20AD%20%26%20ART%20%2B%20GBHO.pdf) — metadata dokumen konstitusi dan dokumen rujukan resmi.
