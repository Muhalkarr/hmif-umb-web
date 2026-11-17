# Backend dan Site Studio HMIF

Panduan ini menjelaskan persiapan, konfigurasi, operasi data, fitur backend, keamanan, validasi, dan troubleshooting untuk portal HMIF. Untuk gambaran fitur produk dan setup ringkas, lihat [README root](../README.md).

Jangan commit file `.env`. File itu berisi secret dan password.

---

## 1. Apa yang sedang Anda jalankan

Aplikasi ini terdiri dari dua proses terpisah:

| Proses | Perintah | Alamat default | Fungsi |
| --- | --- | --- | --- |
| Frontend (Vite) | `npm run dev` | http://localhost:5173 | Tampilan situs, form login, Admin Console, Site Studio |
| Backend (API Express) | `npm run dev:api` | http://localhost:3001 | Login, cookie sesi, data organisasi, Site Studio API |

`npm run dev` **hanya** menyalakan frontend. API harus hidup di terminal lain. Frontend mem-proxy permintaan `/api` ke `http://localhost:3001` (lihat `vite.config.js`).

Alur singkat:

1. Browser membuka `http://localhost:5173`.
2. Tombol **AKSES KHUSUS** membuka form login.
3. Form mengirim `POST /api/auth/login` (lewat proxy Vite) dengan **NIM** dan **password**.
4. API membandingkan password dengan hash di SQLite (`data/hmif.sqlite`).
5. Jika cocok, API memasang cookie sesi `prts_session` (JWT, HttpOnly, SameSite=Strict, berlaku 2 jam).
6. Site Studio hanya bisa dibuka oleh user ber-role **`superadmin`**, dari tombol **BUKA SITE STUDIO** di Admin Console.

`JWT_SECRET` menandatangani cookie sesi. Secret itu **bukan** password login. Mengisi `JWT_SECRET` tidak mengubah password akun.

Setiap akun memiliki `account_id` internal yang permanen; NIM hanya menjadi identitas login yang dapat diganti secara unik. Perubahan NIM melalui `PUT /api/auth/profile` mencabut semua sesi akun, sementara histori presensi/evaluasi dan profil angkatan yang ditautkan secara eksplisit tetap mengikuti akun tersebut. Sesi lama bermigrasi ke ID internal saat digunakan.

Respons publik `GET /api/site/config` tidak menyertakan NIM atau ID akun internal. Pada struktur organisasi generic, hanya nama personel yang ditandai publik beserta penugasan yang terkait yang diterbitkan; tautan akun tetap privat. Preview draft Site Studio tetap menyertakan data lengkap dan hanya tersedia bagi superadmin.

Site Studio menyediakan editor periode, personel, unit hierarkis, posisi, dan penugasan. Keanggotaan tetap berasal dari akun dan tidak disimpulkan dari jabatan. Editor tidak mengisi atau mengunci susunan BPH/DPA; verifikasi AD/ART atau keputusan MUBES diperlukan sebelum penempatan jabatan dimigrasikan. Tab **Statistik Akun** mengatur kolom akun yang tampil, membuat kolom kustom, serta mengisi nilai kustom per akun.

Builder halaman kustom dapat membuat halaman tambahan dari modul teks biasa dan callout yang diizinkan. HTML, JavaScript, SQL, alur aplikasi, backend, dan skema database tidak dapat diedit atau dieksekusi dari UI Site Studio. Tab **Akses Akun** di Site Studio menyediakan perubahan massal clearance 1–3 dan capability langsung bagi akun anggota yang dipilih (maksimal 500 akun per perubahan). Akun superadmin dikecualikan; capability yang diwarisi dari posisi tetap terpisah dari capability langsung akun.

Pada tab **Halaman & Konten**, superadmin dapat menetapkan halaman induk untuk membentuk **Peta Navigasi Situs**; urutan sidebar tetap menjadi urutan saudara pada diagram. Tab **Bagan Universitas** mengelola struktur universitas independen dengan unit, hubungan induk, dan tanggal berlaku per versi. Sinkronisasi repositori hanya mengisi nama universitas dan fakultas yang tersedia pada metadata identitas HMIF; Rektorat, program studi, dan unit lain harus diverifikasi lalu dimasukkan manual. Kedua halaman publik mengikuti visibilitas halaman yang diatur pada Site Studio.

Portal menampilkan AD/ART dan GBHO yang telah disahkan sebagai naskah resmi dan menyediakan PDF sumber melalui `GET /api/site/documents/constitution`. Integritas PDF dilacak dengan SHA-256 di `src/scripts/constitutionData.js`. Tanggal pengesahan lengkap belum tercatat; karena itu portal tidak menghitung tenggat transisi Pasal 60. Penafsiran susunan BPH pada Pasal 27 dan Pasal 29 juga belum ditetapkan pada konfigurasi organisasi.

Pada tab **STRUKTUR & DEPARTEMEN → STRUKTUR ORGANISASI**, superadmin dapat membuat periode draft menggunakan template modular BPH Inti/BPD/DPA, atau memulai periode kosong. Template tidak membuat personel atau penugasan; DPA dan BPD dibuat sebagai unit sejajar, dan departemen/komisi dapat ditambah atau diubah sesuai kebutuhan. Periksa nama dan tanggal periode, roster, susunan, serta rujukan keputusan sebelum mengubah status atau menerbitkan. Anggota biasa tetap dikelola terpisah dari posisi.

Pusat Akademik memakai capability `academic_curate`, yang dapat diberikan langsung oleh superadmin atau dipetakan ke posisi pada periode aktif. Capability ini memberi akses ke workspace akademik dan unggah PDF milik sendiri; tidak memberi akses Site Studio, pengguna, backup, atau operasional organisasi. Resource dan learning path tersimpan sebagai draft, diajukan untuk review, lalu hanya superadmin yang dapat menerbitkan/menolak. Thread diskusi dimoderasi; satu jawaban/alternatif terbit dapat dipilih sebagai solusi. Seed lama tetap fixture demo.

Clearance 3 tidak otomatis memberi akses ke data sensitif. Superadmin dapat mengatur capability posisi melalui menu **Akses jabatan** setelah struktur, periode, akun personel, dan penugasan diterbitkan di Site Studio. Mapping mengikuti periode dan posisi, lalu berlaku hanya selama penugasan pemegang tersebut aktif. Capability yang tersedia meliputi statistik mahasiswa, buku kas, ringkasan LPJ, pengelolaan jenjang kaderisasi, delegasi/mandat, aspirasi/RDP, pemungutan suara, kurasi akademik, peer review, dan penyelenggaraan rapat. Tab **Akses Akun** di Site Studio juga dapat memberikan atau mencabut capability langsung untuk akun anggota terpilih; perubahan langsung tidak mengubah mapping posisi, sehingga capability posisi yang masih berlaku tetap memberi akses. Clearance anggota dapat diubah massal dalam tab yang sama. Operasional dasar tetap memerlukan clearance 2; capability tidak memberi akses superadmin.

Dashboard **Statistik Mahasiswa** menyajikan agregat dan tabel akun anggota terdaftar sesuai kolom yang diaktifkan superadmin. Jika belum ada kolom yang diaktifkan, superadmin tetap melihat semua kolom standar; pemegang capability lainnya hanya melihat kolom yang dikonfigurasi. Tabel individu hanya tersedia bagi pemegang capability `student_demographics.view`; NIM/email dan kolom kustom yang diaktifkan karena itu dapat terlihat oleh pemegang capability tersebut. Kolom kustom mendukung teks, teks panjang, angka, tanggal, ya/tidak, pilihan tunggal, dan pilihan ganda; nilai divalidasi server-side. Superadmin mengelola definisi dan dapat mengisi nilai akun di Site Studio, sedangkan anggota dapat mengelola nilai untuk profilnya sendiri. Hanya agregat yang diekspor sebagai CSV. Data sintetis dan baris contoh dihapus.

Matchmaking Klinik Koding menggunakan slot pilihan mahasiswa dan keahlian/jadwal tutor untuk memberi rekomendasi. Pengurus tetap memilih tutor dan mengonfirmasi sesi; server memeriksa kecocokan durasi, ketersediaan, benturan, dan mode. Tautan online hanya divalidasi sebagai HTTPS; pembuatan Google Meet tidak terintegrasi.

Support Desk menyimpan tiket dan balasan secara persisten. Anggota hanya dapat membaca tiket miliknya; clearance 2 ke atas dapat meninjau antrean, membalas, memperbarui status, dan melihat laporan agregat. Learning path terbit dapat diikuti anggota dan progres milestone disimpan per akun; server memverifikasi milestone serta prasyarat sebelum menerima progres. Progres dicatat sendiri oleh peserta dan bukan hasil penilaian otomatis.

Rapat internal disimpan di tabel privat terpisah dari kalender publik. `meeting_organize` harus diberikan secara eksplisit oleh superadmin, baik langsung pada akun maupun dengan memetakan capability ke posisi di periode aktif. Anggota hanya dapat membaca rapat yang mengundang akun mereka; peserta mengirim RSVP, sementara penyelenggara dapat mencatat presensi, notulensi/keputusan, tindak lanjut, dokumen PDF privat (maksimal 20 MB), dan tautan dokumentasi HTTPS. Seri berulang menghasilkan kejadian individual untuk jadwal harian/mingguan/bulanan sampai batas 12 bulan; satu kejadian dapat dijadwalkan ulang atau dibatalkan tanpa mengubah kejadian lain, atau seluruh rangkaian dibatalkan. PDF hanya diunduh melalui endpoint autentikasi dan akses rapat peserta, dengan audit unggah/unduh. Panggilan video bawaan memakai LiveKit (managed atau self-hosted) dan hanya tersedia setelah dikonfigurasi. Pembuatan Google Meet otomatis belum tersedia. Rekaman sisi server menggunakan LiveKit Egress dan object storage privat, tetapi tetap nonaktif sampai konfigurasi dan persetujuan retensi/policy diaktifkan secara eksplisit; metadata status direkonsiliasi berkala dan file kedaluwarsa dihapus otomatis.

Pemilik akun dapat mengunggah avatar gambar melalui `POST /api/auth/profile/avatar` (PNG/JPEG/WebP, maksimal 5 MB). File avatar hanya dapat dibaca oleh pemilik akun dan administrator, serta tidak dapat dihapus selama masih dipakai profil.

Implementasi saat ini masih memiliki empat `bphRoleId` (`kahim`, `wakahim`, `sekum`, `bendum`) dan migrasi legacy yang mengenali ID tersebut. Ini adalah perilaku kode yang ada, bukan penetapan resmi susunan BPH. Jumlah dan nama kursi harus diverifikasi terhadap AD/ART atau keputusan MUBES yang berlaku sebelum roster resmi atau izin berbasis jabatan diaktifkan; jangan menambah, menghapus, atau memigrasikan penugasan berdasarkan asumsi.

---

## 2. Persiapan satu kali (lokal)

Kerjakan dari folder root proyek (sejajar `package.json`).

### 2.1 Salin file lingkungan

PowerShell:

```powershell
Copy-Item .env.example .env
```

Git Bash / WSL / macOS / Linux:

```bash
cp .env.example .env
```

Buka `.env` lalu isi nilai yang masih kosong. Contoh struktur:

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ALLOW_PUBLIC_REGISTRATION=false
INITIAL_ADMIN_NIM=admin
INITIAL_ADMIN_PASSWORD=
```

Jangan bungkus nilai dengan tanda `<>`, kutip, atau spasi di ujung. Placeholder seperti `<nilai-secret>` di dokumentasi **tidak** ikut disalin.

### 2.2 Isi `JWT_SECRET` (minimal 32 byte acak)

`JWT_SECRET` adalah kunci kriptografi untuk menandatangani JWT. Server menolak start jika kosong atau lebih pendek dari 32 byte UTF-8.

Generate nilai acak, lalu tempel hasilnya ke `.env`:

```env
JWT_SECRET=tempel_output_perintah_di_sini
```

PowerShell (disarankan, 32 byte lalu Base64):

```powershell
$rb = New-Object 'System.Byte[]' 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
[Convert]::ToBase64String($rb)
```

Node.js (48 byte, lebih dari cukup):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

OpenSSL (Git Bash / WSL / macOS / Linux):

```bash
openssl rand -base64 32
```

Ganti secret ini jika pernah tertampil di terminal, chat, atau Git. Secret development dan production harus berbeda.

### 2.3 Isi `INITIAL_ADMIN_NIM` dan `INITIAL_ADMIN_PASSWORD`

| Variabel | Kegunaan | Syarat |
| --- | --- | --- |
| `INITIAL_ADMIN_NIM` | NIM / ID user superadmin **hanya saat database SQLite baru dibuat dari seed kosong** | Default di contoh: `admin` |
| `INITIAL_ADMIN_PASSWORD` | Password superadmin **hanya pada saat yang sama** | Minimal 16 karakter, unik |

**Penting:** kedua variabel ini **tidak mengubah** akun yang sudah ada. Jika `data/hmif.sqlite` sudah pernah dibuat, atau jika `data/database.json` diimpor ke SQLite, password di `.env` **diabaikan**.

Kapan seed dari `.env` dipakai:

- File SQLite belum ada **dan**
- `NODE_ENV` bukan `production` **dan** file `data/database.json` **tidak** ada, **atau**
- `NODE_ENV=production` dengan `DATABASE_FILE` baru (JSON lama tidak diimpor di production)

Kapan seed dari `.env` **tidak** dipakai (kasus Anda saat ini):

- Ada `data/database.json` di development, lalu API pertama kali membuat `data/hmif.sqlite`. Data user (termasuk hash password lama) disalin ke SQLite. Setelah itu JSON hanya cadangan; mengubah `.env` tidak mengubah hash di SQLite.

---

## 3. Menjalankan development

Buka **dua** terminal di root proyek. Jangan set `$env:JWT_SECRET` di PowerShell jika secret sudah ada di `.env`; `npm run dev:api` sudah membaca `.env` lewat `--env-file-if-exists=.env`. Variabel yang sudah di-set di sesi PowerShell bisa menimpa `.env`.

Terminal A:

```powershell
npm run dev:api
```

Pesan sukses kira-kira:

```text
[PRTS API SERVER] Running on port http://localhost:3001
```

Jika muncul `JWT_SECRET wajib diisi...`, secret di `.env` masih kosong atau terlalu pendek. Jika muncul error `INITIAL_ADMIN_*` wajib diatur, API sedang membuat database baru dan password admin belum memenuhi syarat.

Terminal B:

```powershell
npm run dev
```

Buka http://localhost:5173 (bukan port 3001 untuk memakai UI).

---

## 4. Cara masuk dan membuka Site Studio

### 4.1 Login

1. Di situs, klik **AKSES KHUSUS**.
2. Isi **NIM / ID PENGGUNA**, bukan email.
3. Isi **PASSWORD** yang cocok dengan hash di SQLite, bukan semata-mata nilai `INITIAL_ADMIN_PASSWORD` di `.env`.
4. Klik **MASUK KE TERMINAL**.

Pesan error login (artinya berbeda):

| Pesan | Arti |
| --- | --- |
| `NIM tidak terdaftar dalam database PRTS.` | NIM tidak ada di SQLite. |
| `Kredensial tidak valid. Password salah.` | NIM ketemu, tetapi password tidak cocok dengan hash tersimpan. `JWT_SECRET` dan `INITIAL_ADMIN_PASSWORD` di `.env` tidak dipakai pada pengecekan ini. |
| `Terlalu banyak percobaan. Coba lagi nanti.` | Pembatas 10 percobaan per 15 menit. Tunggu sampai jendela pembatas berakhir; jangan restart production untuk menghindari kontrol ini. |
| `Terjadi kesalahan pada server PRTS` / gagal jaringan | API tidak berjalan, atau proxy `/api` tidak sampai ke port 3001. |

### 4.2 Siapa yang boleh membuka Site Studio

Hanya role `superadmin`.

Pada impor `data/database.json`, user dengan `clearance_level` 4 (contoh: NIM `admin`) menjadi `superadmin`. User lain (level 1–3) bisa login ke terminal, tetapi **tidak** melihat tombol Site Studio.

Setelah login superadmin:

1. Tombol **AKSES KHUSUS** berubah menjadi **ADMIN CONSOLE**.
2. Buka Admin Console.
3. Klik **BUKA SITE STUDIO**.

Site Studio menyimpan konfigurasi terstruktur (tema, urutan blok, koleksi data, aset, dan halaman kustom). Builder menyediakan maksimal 20 halaman kustom dan maksimal 12 modul teks/callout per halaman. Isi modul adalah teks biasa dan dirender melalui `textContent`; markup aktif dan jenis modul yang tidak terdaftar tidak diterima. Ini bukan editor kode atau SQL. Perubahan kode/backend/database harus melalui perubahan berversi yang ditinjau dan jalur rilis, bukan dijalankan langsung oleh UI production.

---

## 5. Pemulihan akses akun

`INITIAL_ADMIN_NIM` dan `INITIAL_ADMIN_PASSWORD` adalah nilai seed, bukan mekanisme reset. Mengubahnya setelah database terbentuk tidak mengubah hash password yang tersimpan. Perintah yang mengedit tabel SQLite atau JSON secara langsung tidak didukung: database memiliki beberapa tabel/workflow yang harus tetap konsisten, dan edit langsung dapat merusak data atau melewati audit.

Urutan pemulihan yang aman:

1. Pastikan API dan database yang dipakai benar. Default development adalah `data/hmif.sqlite`; jika `DATABASE_FILE` diatur, gunakan path itu, bukan file default.
2. Jika masih ada superadmin yang dapat login, minta superadmin mereset password akun melalui Admin Console atau alur administrasi yang tersedia.
3. Jika tidak ada superadmin yang dapat mengakses, hentikan API dan jangan mencoba reset langsung pada SQLite production. Buat salinan aman database dan seluruh `ASSET_STORAGE_DIR`; bila database masih aktif, gunakan prosedur backup SQLite yang konsisten, bukan menyalin hanya file utama. Minta operator/maintainer yang berwenang memulihkan akses dengan prosedur yang telah diuji pada salinan staging.
4. Untuk database development yang boleh dibuang, buat proyek/data directory terpisah dan buat database baru dari seed setelah memastikan tidak ada data yang diperlukan. Jika `data/database.json` masih ada, proses seed development dapat mengimpornya kembali; jangan hapus atau menimpa file lama tanpa backup.

Jangan gunakan cara reset yang membaca/mengubah `app_state` langsung. Jangan menerapkan prosedur development pada database production.

---

## 6. Variabel lingkungan

`.env.example` adalah daftar contoh untuk Node server. Jangan commit `.env`; production sebaiknya menerima secret melalui secret manager/environment injection, bukan file yang berada di repo.

| Nama | Kapan diperlukan | Keterangan |
| --- | --- | --- |
| `NODE_ENV` | Disarankan | `development` lokal, `production` pada server. Mengubah cookie `Secure` dan aturan seed/startup. |
| `PORT` | Opsional | Port HTTP API; default `3001`. |
| `JWT_SECRET` | Wajib | Secret acak minimal 32 byte UTF-8. Menandatangani sesi dua jam dan menjadi sumber kunci turunan bila kunci enkripsi spesifik tidak diatur. Rotasi membatalkan sesi aktif. |
| `FRONTEND_ORIGINS` | Wajib di production | Origin frontend dipisahkan koma, tanpa path. Mutasi `POST`/`PUT`/`PATCH`/`DELETE` ditolak jika header `Origin` hilang atau tidak diizinkan. Default development: `http://localhost:5173,http://127.0.0.1:5173`. |
| `ALLOW_PUBLIC_REGISTRATION` | Opsional | Hanya nilai string `true` yang mengaktifkan registrasi publik; default `false`. Akun hasil registrasi ber-clearance 1 dan role `member`. |
| `INITIAL_ADMIN_NIM` | Hanya seed database baru | NIM/ID superadmin awal. Tidak mengubah akun pada database yang telah dibuat. |
| `INITIAL_ADMIN_PASSWORD` | Hanya seed database baru | Password superadmin awal; minimal 16 karakter. Tidak mereset akun yang telah dibuat atau diimpor. |
| `DATABASE_FILE` | Wajib di production | Path absolut database SQLite pada volume persisten terpisah di luar workspace. Production menolak konfigurasi kosong atau lokasi database workspace/default. |
| `ASSET_STORAGE_DIR` | Wajib di production | Path absolut direktori aset privat yang persisten, terpisah dari kode aplikasi. |
| `ASPIRATION_ENCRYPTION_KEY` | Sangat disarankan | Secret stabil minimal 32 byte untuk enkripsi isi aspirasi/balasan AES-256-GCM. Jika kosong, kunci diturunkan dari `JWT_SECRET`; pertahankan nilai yang sama agar data lama tetap terbaca. |
| `EVENT_TICKET_ENCRYPTION_KEY` | Disarankan bila token tiket perlu dipulihkan | Secret stabil minimal 32 byte untuk token QR yang dapat diambil lagi oleh anggota login. Jika kosong, diturunkan dari `JWT_SECRET`; jangan rotasi selama tiket terkait masih berlaku. |
| `RESEND_API_KEY` | Opsional | API key Resend untuk pengiriman email tiket event beserta QR. Tanpa key, tiket tetap dapat ditampilkan di browser; akun anggota dapat mengambil tiket yang tersedia dari dashboard. |
| `EVENT_EMAIL_FROM` | Bersama Resend | Nama/alamat pengirim yang telah diverifikasi Resend, misalnya `HMIF Events <events@example.org>`. |
| `GOOGLE_CLIENT_ID` | Jika Google OAuth diaktifkan | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Jika Google OAuth diaktifkan | OAuth client secret. Simpan hanya di secret manager/server environment. |
| `GOOGLE_CALLBACK_URL` | Jika Google OAuth diaktifkan | Callback yang harus sama persis dengan Authorized redirect URI pada Google Cloud. Default lokal: `http://localhost:3001/api/auth/sso/google/callback`. |
| `FRONTEND_SSO_SUCCESS` | Opsional untuk Google OAuth | URL frontend tujuan setelah SSO berhasil. Atur ke domain frontend production bila tidak memakai default lokal. |
| `FRONTEND_SSO_ERROR` | Opsional untuk Google OAuth | URL frontend tujuan ketika SSO gagal atau perlu penautan akun. |
| `VAPID_PUBLIC_KEY` | Jika Web Push digunakan | Kunci publik VAPID yang diberikan ke browser. Harus cocok dengan private key. |
| `VAPID_PRIVATE_KEY` | Jika Web Push digunakan | Kunci privat VAPID. Jangan pernah dikirim ke browser atau commit. |
| `VAPID_CONTACT_EMAIL` | Opsional untuk Web Push | Email kontak VAPID dalam format `mailto:`; default `admin@hmif-umb.ac.id`. |
| `MEETING_VIDEO_ENABLED` | Jika panggilan LiveKit diaktifkan | Harus bernilai `true` dan konfigurasi LiveKit lengkap. Default `false`. |
| `LIVEKIT_WS_URL` | Jika panggilan LiveKit diaktifkan | Endpoint WebSocket untuk browser; production wajib `wss://`. Alias `LIVEKIT_URL` juga diterima. |
| `LIVEKIT_API_URL` | Opsional bersama LiveKit | Endpoint API untuk backend; bila kosong diturunkan dari URL WebSocket. Production wajib HTTPS. |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Jika panggilan LiveKit diaktifkan | Kredensial server; atur bersama endpoint dan simpan hanya di secret manager/server environment. |
| `MEETING_RECORDING_ENABLED` | Jika perekaman telah disetujui | Harus bernilai `true`, tetapi tidak melewati gate policy, retensi, LiveKit, dan storage. Default `false`. |
| `MEETING_RECORDING_POLICY_APPROVED` | Jika perekaman diaktifkan | Set `true` hanya setelah persetujuan organisasi terhadap pemberitahuan, akses, retensi, dan penghapusan. Default `false`. |
| `MEETING_RECORDING_RETENTION_DAYS` | Jika perekaman diaktifkan | Bilangan bulat 1–3650; wajib terisi, tidak ada default. |
| `MEETING_RECORDING_S3_BUCKET`, `MEETING_RECORDING_S3_ACCESS_KEY`, `MEETING_RECORDING_S3_SECRET_KEY` | Jika perekaman diaktifkan | Wajib diisi bersama. Gunakan bucket privat dan kredensial dengan izin minimum, termasuk delete object untuk retensi. |
| `MEETING_RECORDING_S3_REGION` | Opsional bersama storage rekaman | Region bucket; default `us-east-1`. |
| `MEETING_RECORDING_S3_ENDPOINT` | Opsional bersama storage rekaman | Endpoint S3-compatible kustom; HTTPS diwajibkan pada production. |
| `MEETING_RECORDING_S3_FORCE_PATH_STYLE` | Opsional bersama storage rekaman | Set `true` hanya bila provider memerlukan path-style addressing; default `false`. |
| `VITE_API_URL` | Build frontend dengan API di host lain | Variabel build-time frontend, bukan secret. Mengatur base API untuk beberapa fitur browser dan URL WebSocket (mengganti `http` ke `ws`). Default kode adalah `http://localhost:3001`, sehingga harus diubah untuk build production/nonlokal. |

### Catatan konfigurasi penting

- Generate `JWT_SECRET` atau kunci enkripsi dengan generator kriptografis. Jangan gunakan nilai contoh pada `.env.example`.
- Nilai `VITE_*` tertanam ke bundle frontend yang dapat dibaca publik. Jangan menyimpan secret di dalamnya.
- Untuk deployment HTTPS, gunakan URL `https://` untuk API dan pastikan WebSocket memakai `wss://` melalui konfigurasi `VITE_API_URL`.
- Google OAuth adalah provider SSO yang dikonfigurasi oleh kode saat ini. Di development tanpa credential, status dapat melaporkan mode mock; mode mock tidak tersedia di production.
- Tanpa pasangan VAPID stabil, server membuat pasangan sementara saat startup. Subscription browser yang tersimpan tidak akan dapat diandalkan setelah restart. Web Push juga memerlukan HTTPS (kecuali localhost), service worker, dukungan browser, serta izin pengguna.
- Panggilan video memerlukan endpoint WSS yang dapat dijangkau browser, API LiveKit yang dapat dijangkau backend, serta konfigurasi TLS/media/TURN/firewall yang benar pada deployment LiveKit. Token anggota berlaku 10 menit dan hanya untuk ruang rapat terkait.
- Perekaman hanya aktif bila semua nilai `MEETING_RECORDING_*` yang wajib, LiveKit/Egress, dan policy gate tersedia. Bucket harus privat; URL unduh bertanda tangan berlaku lima menit. Lifecycle backend merekonsiliasi status setiap menit dan mencoba ulang penghapusan media kedaluwarsa. JSON backup tidak menyertakan media pada object storage.
- Google SSO tidak memberikan scope atau consent Calendar. Pembuatan Meet otomatis, update/cancel sinkron, dan kepemilikan akun organizer masih belum tersedia.
- Jangan merotasi kunci enkripsi sebelum membuat strategi migrasi dan memastikan seluruh record lama masih dapat dibaca.

Pendaftaran publik mati secara default. User yang dibuat admin memerlukan otorisasi superadmin dan tidak memperoleh capability khusus secara otomatis.

---

## 7. Data, role, dan fitur backend

Database aplikasi adalah SQLite (WAL, foreign key, transaksi, optimistic concurrency). Di development, `data/database.json` lama diimpor **satu kali** ke `data/hmif.sqlite`. JSON tidak ditimpa; itu cadangan. File SQLite, `-wal`, `-shm`, dan `data/site-assets/` diabaikan Git.

Role:

- `superadmin` adalah role khusus, bukan angka negatif dan bukan “level 4” di UI anggota. Bypass izin clearance secara eksplisit.
- Clearance anggota hanya 1–3.
- Akun clearance 4 pada JSON lama dimigrasikan menjadi `superadmin` dengan clearance 0.

Perubahan role, tindakan administratif, operasi draft/publish/restore, upload aset, dan reset password admin dicatat di `audit_log` sesuai jalur yang digunakan. Akses selalu harus ditegakkan API; menyembunyikan tombol frontend bukan kontrol akses.

Site Studio: tema (warna, font, skala, bentuk, ikon, latar, kontras, motion), page builder (urutan/visibilitas/layout blok terdaftar dan halaman kustom dari modul teks/callout), koleksi data terstruktur, serta tab **Akses Akun** untuk perubahan clearance dan capability langsung secara massal pada anggota terpilih. Draft konten bisa dipratinjau, dipublikasikan, dan dipulihkan; pengelolaan akses menggunakan endpoint admin tersendiri, bukan konfigurasi draft/publish. Setiap simpan konfigurasi memakai revision ID untuk konflik editor bersamaan. Kode arbitrer dan migrasi skema tidak diedit langsung melalui Studio.

Upload: maksimal 5 MB; gambar PNG/JPEG/WebP dan font WOFF2/TTF/OTF; tipe dan signature dicek. SVG dan markup aktif ditolak. Aset yang masih direferensikan versi mana pun tidak bisa dihapus (untuk rollback). Backup JSON admin mencakup data aplikasi, konfigurasi, revision, metadata aset, dan audit; file binary di `ASSET_STORAGE_DIR` perlu backup terpisah.

Knowledge Base menerima tautan HTTPS atau PDF terkurasi. Superadmin dan kurator dengan capability `academic_curate` dapat mengunggah PDF maksimal 20 MB; kurator hanya dapat mengelola berkas miliknya. Signature PDF diperiksa. Resource/path tetap harus melalui submit/review; publikasi resource dan revisi situs berada pada superadmin. PDF draft tetap privat dan PDF terbit hanya dapat diunduh sesuai status resource/publikasi. Resource bank soal memiliki thread diskusi: anggota login dapat mengirim komentar yang menunggu moderasi clearance 2+, penulis dapat melihat komentar pending miliknya, dan hanya komentar yang diterbitkan terlihat publik.

Klinik Koding: anggota login dapat mengajukan bimbingan dengan batas 3 permintaan per jam dan melihat statusnya sendiri. Pengurus clearance 2+ dapat melihat antrean serta menjadwalkan tutor anggota clearance 2+ secara manual; sesi online wajib menggunakan HTTPS, sedangkan sesi luring harus mencantumkan lokasi. Tautan dan catatan sesi hanya dikirim ke pemohon serta pengurus.

Backup admin memuat metadata PDF, thread diskusi, dan permintaan tutoring; file biner PDF di `ASSET_STORAGE_DIR/knowledge/` harus ikut dicadangkan.

Fitur backend lainnya:

| Domain | Ringkasan perilaku dan batas akses |
| --- | --- |
| Akun dan sesi | Login dengan NIM/ID dan password hash; profil, avatar privat, perubahan password/NIM, logout dan pencabutan sesi. NIM dapat berubah, sedangkan referensi internal memakai `account_id`. |
| SSO Google | OAuth2 Google dengan status/configuration endpoint; akun Google yang belum dikenal perlu ditautkan menggunakan alur akun yang tersedia. Redirect/callback harus disetel ke domain yang benar. |
| Operasi organisasi | Program kerja, kalender/event, tugas, aspirasi, Showcase/Career, dokumen kantor, dan data administrasi tersedia melalui endpoint masing-masing dengan pemeriksaan role/clearance. |
| Keuangan | Buku kas/kwitansi bersifat operasional dan aksesnya dibatasi. Jangan menganggap fixture sebagai catatan transaksi resmi. |
| Kehadiran dan event | Sesi presensi QR dikelola akun ber-clearance; registrasi event, tiket privat, validasi check-in satu kali, dan sertifikat mengikuti status presensi. Email tiket opsional menggunakan Resend. |
| Support Desk | Data persisten; pengguna melihat tiket miliknya, staf ber-clearance 2+ dapat menangani antrean dan laporan. |
| Learning | Learning path publik/terbit dapat diikuti; progres milestone disimpan per akun dan diperiksa terhadap milestone/prasyarat di server. Progres adalah laporan mandiri, bukan nilai akademik. |
| Notifikasi | In-app notifications/preferences per akun. Pengingat tenggat dibuat saat endpoint notifikasi dipanggil. Tersedianya push subscription tidak berarti setiap notifikasi in-app otomatis terkirim melalui push. |
| Rapat | Data privat terpisah dari kalender publik, undangan per akun, capability `meeting_organize`, recurring event harian/mingguan/bulanan sampai 366 hari, maks. 100 peserta per rangkaian, RSVP, presensi, notulensi, tindak lanjut, dan lampiran PDF privat. LiveKit video tersedia bila dikonfigurasi; perekaman Egress/object storage memerlukan policy serta retensi yang disetujui. Integrasi pembuatan Google Meet belum tersedia. |
| Web Push | API mengirim public key, menyimpan/menghapus subscription per akun, serta menyediakan test push hanya di development. Kunci stabil dan izin browser diperlukan. |
| WebSocket stats | `/ws/stats` menyediakan statistik live/mutasi untuk frontend. Jika deployment menggunakan reverse proxy, konfigurasi upgrade WebSocket dan `VITE_API_URL` harus benar. Jangan gunakan data statistik demo sebagai metrik terverifikasi. |
| Health | `GET /api/health` mengembalikan status online, nama sistem, versi, dan waktu; bukan pemeriksaan mendalam semua dependency atau kesiapan backup. |

Route API utama dikelompokkan di [`routes/`](./routes/): `auth.js`, `sso.js`, `site.js`, `academic.js`, `support.js`, `learning.js`, `meetings.js`, `operations.js`, `finance.js`, `attendance.js`, `admin.js`, `webPush.js`, dan `health.js`. Ini ringkasan domain, bukan pengganti pemeriksaan authorization pada route/API spesifik.

Struktur organisasi generic menyimpan periode, unit, posisi, orang, dan assignment secara terpisah. Template draft BPH Inti/BPD/DPA memulai struktur tanpa orang, assignment, atau izin. Kode juga masih memiliki ID posisi legacy; keduanya bukan penetapan kewenangan resmi. Verifikasi dokumen AD/ART/keputusan MUBES dan roster sebelum mempublikasikan atau memigrasikan jabatan.

SQLite cocok untuk satu host kecil. Jangan membagi file SQLite lewat network filesystem. Untuk banyak instance, pindah ke database transaksional terkelola dan object storage.

Penilaian kuis dihitung di browser sebagai data latihan dan tidak memberi hak akses.

---

## 8. Backup, restore, dan retensi data

- Endpoint superadmin `GET /api/admin/backup` mengekspor data aplikasi, metadata, revisi, dan audit sesuai implementasi. File biner aset tidak dimasukkan ke JSON.
- Backup penuh harus berisi database SQLite yang konsisten dan seluruh `ASSET_STORAGE_DIR`, termasuk `knowledge`, `soundtracks`, avatar, lampiran rapat, serta aset upload lain yang digunakan. Jangan hanya menyimpan file JSON hasil ekspor.
- Sebelum backup file database, hentikan penulisan aplikasi lalu jalankan checkpoint WAL (`PRAGMA wal_checkpoint(TRUNCATE)`) atau gunakan SQLite Online Backup API. Alternatif yang disarankan adalah prosedur backup SQLite yang konsisten; jangan menyalin hanya berkas utama ketika proses masih menulis.
- Simpan database dan direktori aset sebagai satu set versi yang sama. Catat waktu, versi aplikasi, dan checksum berkas. Akses backup dibatasi karena dapat mengandung data pribadi dan hash kredensial.
- Restore dilakukan ke staging terisolasi dengan path `DATABASE_FILE`/`ASSET_STORAGE_DIR` baru. Verifikasi login uji, `GET /api/health`, metadata backup, dan unduh/hash berkas aset yang dipilih. Belum ada endpoint restore JSON otomatis.
- Tentukan retensi, enkripsi, kontrol akses, dan penghapusan aman sesuai kebijakan organisasi dan hukum yang berlaku. Jadwalkan latihan restore; keberhasilan job backup saja tidak membuktikan data dapat dipulihkan.

## 9. Production dan operasi

Sebelum menerima data nyata:

1. Gunakan Node.js 22, instal dependensi dari lockfile (`npm ci`), dan buat build `npm run build`.
2. Jalankan API di `NODE_ENV=production` dengan `JWT_SECRET` acak/unik, origin HTTPS pada `FRONTEND_ORIGINS`, dan volume persisten terpisah untuk `DATABASE_FILE` serta `ASSET_STORAGE_DIR`. Server menolak database production default/workspace.
3. Pastikan database baru membuat superadmin dari seed awal yang disiapkan aman. Seed awal tidak mengubah database yang sudah ada. Jangan impor `data/database.json` fixture atau data development ke production.
4. Simpan secrets di secret manager; set kunci enkripsi khusus yang stabil. Sediakan rencana rotasi/migrasi dan cadangan sebelum perubahan kunci.
5. Atur reverse proxy HTTPS, cookie `Secure`, forwarding header yang benar, batas request/upload yang sesuai, WebSocket upgrade untuk `/ws/stats`, health monitoring, log yang tidak memuat credential/data privat, dan pembatasan jaringan/akses storage.
6. Konfigurasikan Google OAuth, Resend atau VAPID hanya bila fitur tersebut digunakan. Uji redirect, email, service worker, izin push, dan unsubscribe di staging.
7. Tetapkan operator superadmin/capability secara eksplisit; validasi roster, periode, isi resmi dan kebijakan persetujuan sebelum publikasi. Jangan berikan hak berdasarkan label jabatan tanpa keputusan resmi.
8. Jalankan validasi rilis, smoke check, backup, dan latihan restore staging sebelum deployment. Rilis dan migrasi database perlu prosedur rollback yang diuji; file SQLite tidak boleh dipakai bersama antar-host.

`GET /api/health` adalah health response ringan, bukan bukti bahwa database, storage, email, push, dan WebSocket semuanya siap. Pantau dependensi tersebut secara terpisah. Aplikasi menggunakan SQLite satu host; untuk horizontal scaling, rancang migrasi database dan object storage sebelum menambah instance.

### Konferensi dan rekaman rapat

- Panggilan bawaan bersifat opt-in: isi `LIVEKIT_WS_URL`, `LIVEKIT_API_KEY`, dan `LIVEKIT_API_SECRET`, lalu atur `MEETING_VIDEO_ENABLED=true`. URL endpoint production harus memakai WSS/HTTPS. LiveKit harus dapat diakses browser dan server; deployment perlu mengatur TLS, firewall, TURN/media connectivity, kapasitas, serta monitoring sesuai dokumentasi LiveKit.
- Rekaman server-side tetap nonaktif secara default. Aktifkan hanya setelah kebijakan organisasi disetujui: `MEETING_RECORDING_ENABLED=true`, `MEETING_RECORDING_POLICY_APPROVED=true`, `MEETING_RECORDING_RETENTION_DAYS` berupa bilangan bulat 1–3650, konfigurasi bucket S3-compatible privat, dan LiveKit Egress yang berfungsi. Endpoint storage kustom production wajib HTTPS.
- Gunakan bucket tanpa akses publik dan kredensial berizin minimum untuk menulis/menghapus objek rekaman. Penyediaan/penghapusan media ditangani Egress dan job lifecycle backend; status rekaman direkonsiliasi tiap menit dan media berstatus selesai/gagal dihapus ketika melewati `expires_at`. Backup, enkripsi, kontrol akses, notifikasi peserta, dan prosedur insiden tetap menjadi tanggung jawab operator.
- UI meminta konfirmasi penyelenggara bahwa peserta telah diberi tahu dan mengirim notifikasi ketika perekaman dimulai. Konfirmasi UI bukan pengganti persetujuan hukum/organisasi yang diperlukan.
- Pembuatan Google Meet otomatis belum tersedia. Google SSO saat ini bukan consent Google Calendar; integrasi tersebut memerlukan pemilik akun penyelenggara, scope Calendar, OAuth consent, serta sinkronisasi create/cancel/reschedule yang dirancang terpisah.

## 10. Keamanan dan batasan

- Sesi `prts_session` adalah JWT HttpOnly, SameSite Strict, masa berlaku dua jam, Secure di production. Logout dan perubahan identitas/password mencabut sesi menggunakan versi sesi.
- Mutasi mensyaratkan `Origin` yang diizinkan. `localhost` dan `127.0.0.1`, serta port yang berbeda, adalah origin berbeda.
- JSON request umum dibatasi 32 KiB; konfigurasi Site Studio ditangani dengan batas 64 KiB. Upload menggunakan batas dan pemeriksaan format masing-masing route.
- Rate limit login: 10 percobaan per 15 menit; registrasi: 5 per jam; aspirasi: 8 per jam; pemeriksaan tiket aspirasi: 20 per jam; pendaftaran event: 8 per jam; diskusi akademik: 8 per jam; permintaan Klinik Koding: 3 per jam; statistik GitHub: 60 per jam. Limiter berjalan di memori proses; pertimbangkan implikasinya jika deploy lebih dari satu instance.
- Batas upload saat ini: aset Site Studio dan avatar 5 MiB; PDF akademik/rapat 20 MiB; soundtrack 20 MiB; bukti kwitansi 10 MiB. File gambar/font/audio/PDF diperiksa berdasarkan format dan signature sesuai jenis upload. SVG dan markup aktif ditolak di upload aset Site Studio. Tetap batasi ukuran, akses, dan retensi file.
- Akses privat harus melalui endpoint terautentikasi dan authorization server-side. ID yang sulit ditebak bukan pengganti authorization.
- URL eksternal yang diterima beberapa workflow diwajibkan HTTPS; hal ini tidak menjamin isi atau izin akses layanan eksternal.
- Isi aspirasi dan token e-ticket yang dapat dipulihkan dienkripsi dengan kunci turunan/khusus. Kehilangan kunci yang dipakai dapat membuat data lama tidak dapat dibaca.
- Belum tersedia restore JSON dan integrasi pembuatan Google Meet. Fitur video LiveKit dan perekaman rapat server-side bersifat opt-in melalui konfigurasi; perekaman harus tetap nonaktif sampai organisasi menyetujui pemberitahuan, retensi, akses, dan penghapusan.

Dokumentasi ini bukan audit keamanan atau pengganti kebijakan perlindungan data. Sesuaikan akses dan retensi dengan persetujuan organisasi.

## 11. Troubleshooting

| Gejala | Kemungkinan penyebab / tindakan |
| --- | --- |
| API gagal karena `JWT_SECRET` | `.env` tidak di root, secret kosong/kurang dari 32 byte, atau environment variable kosong menimpa nilai `.env`. |
| Error database production | Set `DATABASE_FILE` dan `ASSET_STORAGE_DIR` ke path absolut persisten di luar workspace; production menolak lokasi database default. |
| Password salah setelah `.env` diisi | Seed awal tidak mereset akun. Periksa file DB yang benar dan sumber import; gunakan reset melalui superadmin. Lihat [Pemulihan akses akun](#5-pemulihan-akses-akun). |
| NIM tidak ditemukan | Login memakai NIM/ID, bukan email. Pastikan file database yang aktif dan apakah data legacy diimpor. |
| Akun login tetapi Site Studio tidak terlihat | Site Studio khusus role `superadmin`. Clearance atau capability kurator tidak memberikan akses ini. |
| `Origin tidak diizinkan` / CORS | Origin browser harus persis cocok dengan `FRONTEND_ORIGINS`, termasuk protocol, hostname, dan port. |
| `ECONNREFUSED` atau frontend gagal memuat API | Pastikan API berjalan pada port yang dikonfigurasi; cek `vite.config.js` proxy untuk development atau `VITE_API_URL` untuk build lintas-host. |
| Sesi tidak tersimpan di HTTPS production | Periksa HTTPS di browser, proxy dan domain/cookie path; cookie production memakai `Secure`. |
| Google SSO kembali ke URL salah | Periksa callback URL pada Google Cloud, `GOOGLE_CALLBACK_URL`, serta URL success/error frontend dan domain yang diizinkan. |
| Email tiket tidak terkirim | Periksa `RESEND_API_KEY`, verified sender `EVENT_EMAIL_FROM`, domain Resend, dan log pengiriman. Tiket browser tetap merupakan jalur utama jika email gagal. |
| Push tidak bertahan sesudah restart | Set pasangan `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` yang tetap; pastikan HTTPS, izin browser, service worker, lalu subscribe ulang jika key pernah berubah. |
| Statistik live/WebSocket gagal | Periksa reverse proxy WebSocket upgrade dan `VITE_API_URL`; gunakan `wss://` pada deployment HTTPS. |
| Data operasional tak muncul pada production baru | DB baru memulai tanpa koleksi operasional dan konten situs production. Masukkan/tinjau data resmi melalui UI/API, lalu publish secara sadar. |
| Lockout karena rate limit | Login dibatasi 10 percobaan per 15 menit per proses. Tunggu jendela berakhir; jangan restart production sebagai kebiasaan atau cara menghindari kontrol. |

## 12. Pengujian, build, dan CI

| Perintah | Cakupan |
| --- | --- |
| `npm test` | Seluruh tes Node (`node --test`), termasuk unit, skema, keamanan, dan workflow API. |
| `npm run build` | Build frontend Vite ke `dist/`. |
| `npm run check:bundle` | Memastikan entry JavaScript awal tidak lebih dari 500 KiB; jalankan setelah build. |
| `npm run smoke:release` | Smoke API dengan DB/aset sementara, health, config publik, login/sesi sintetis, notifikasi, Support Desk, learning, meeting, dan production DB guard. |
| `npm run test:e2e` | Playwright Chromium untuk alur anggota/penyelenggara pada Support Desk, LMS, dan rapat mobile. |
| `npm run check:release` | Urutan penuh: unit/integrasi tests → build → bundle check → release smoke → E2E. |

Persiapan browser E2E (sekali per mesin/runner):

```powershell
npx playwright install chromium
```

Tes E2E dan smoke memakai database, aset, akun sintetis, dan server lokal sementara; tidak memakai data/credential production. Gunakan `npm ci` untuk memasang versi lockfile. Workflow [`.github/workflows/validate.yml`](../.github/workflows/validate.yml) memakai Node.js 22, memasang Chromium beserta dependency, lalu menjalankan `npm run check:release` pada push, pull request, atau manual dispatch.

Saat tes gagal, baca output Playwright dan `test-results/` (trace/error context) sebelum menaikkan timeout atau mengubah tes. Jangan menghapus bukti kegagalan sebelum dianalisis. Untuk dokumentasi umum dan tautan ke source, lihat [README root](../README.md).
