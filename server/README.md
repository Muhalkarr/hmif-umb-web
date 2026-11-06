# Backend dan Site Studio HMIF

Dokumen ini menjelaskan arsitektur, variabel lingkungan, langkah menjalankan lokal, cara masuk ke Site Studio, dan perbaikan masalah yang sering terjadi.

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

Respons publik `GET /api/site/config` tidak menyertakan NIM atau ID akun internal. Preview draft Site Studio tetap menyertakan data lengkap dan hanya tersedia bagi superadmin.

Pusat Akademik memakai capability akun `academic_curate`, yang hanya dapat diberikan/dicabut superadmin. Capability ini memberi akses ke workspace akademik dan unggah PDF milik sendiri; tidak memberi akses Site Studio, pengguna, backup, atau operasional organisasi. Resource dan learning path tersimpan sebagai draft, diajukan untuk review, lalu hanya superadmin yang dapat menerbitkan/menolak. Thread diskusi dimoderasi; satu jawaban/alternatif terbit dapat dipilih sebagai solusi. Seed lama tetap fixture demo.

Matchmaking Klinik Koding menggunakan slot pilihan mahasiswa dan keahlian/jadwal tutor untuk memberi rekomendasi. Pengurus tetap memilih tutor dan mengonfirmasi sesi; server memeriksa kecocokan durasi, ketersediaan, benturan, dan mode. Tautan online hanya divalidasi sebagai HTTPS; pembuatan Google Meet tidak terintegrasi.

Pemilik akun dapat mengunggah avatar gambar melalui `POST /api/auth/profile/avatar` (PNG/JPEG/WebP, maksimal 5 MB). File avatar hanya dapat dibaca oleh pemilik akun dan administrator, serta tidak dapat dihapus selama masih dipakai profil.

Empat kursi BPH menggunakan `bphRoleId` stabil (`kahim`, `wakahim`, `sekum`, `bendum`). Site Studio mengisi ID ini pada data lama saat membuka draft; perubahan teks jabatan tidak memengaruhi penetapan atau pelepasan kursi.

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
| `Terlalu banyak percobaan. Coba lagi nanti.` | Pembatas 10 percobaan / 15 menit. Tunggu, atau restart API untuk me-reset limiter di memori proses. |
| `Terjadi kesalahan pada server PRTS` / gagal jaringan | API tidak berjalan, atau proxy `/api` tidak sampai ke port 3001. |

### 4.2 Siapa yang boleh membuka Site Studio

Hanya role `superadmin`.

Pada impor `data/database.json`, user dengan `clearance_level` 4 (contoh: NIM `admin`) menjadi `superadmin`. User lain (level 1–3) bisa login ke terminal, tetapi **tidak** melihat tombol Site Studio.

Setelah login superadmin:

1. Tombol **AKSES KHUSUS** berubah menjadi **ADMIN CONSOLE**.
2. Buka Admin Console.
3. Klik **BUKA SITE STUDIO**.

Site Studio menyimpan konfigurasi terstruktur (tema, urutan blok, koleksi data, aset). Bukan editor CSS/HTML/script mentah. Teks di-render sebagai teks biasa (`textContent`).

---

## 5. Memperbaiki login lokal: password `.env` tidak dipakai

Ini penyebab paling umum setelah mengikuti langkah JWT + `INITIAL_ADMIN_PASSWORD`.

Anda sudah:

1. Menyalin `.env`
2. Mengisi `JWT_SECRET`
3. Mengisi `INITIAL_ADMIN_PASSWORD`
4. Menjalankan `npm run dev:api` dan `npm run dev`

API hidup, jadi `JWT_SECRET` sudah valid. Login tetap gagal dengan **Password salah** karena API membandingkan password form dengan hash di `data/hmif.sqlite` yang berasal dari `data/database.json`. Hash itu **bukan** hash dari `INITIAL_ADMIN_PASSWORD`.

Pilih salah satu cara di bawah. Hentikan `npm run dev:api` dulu.

### Cara A — Reset password user `admin` tanpa menghapus data organisasi (disarankan)

Pastikan `.env` berisi `INITIAL_ADMIN_NIM` (biasanya `admin`) dan `INITIAL_ADMIN_PASSWORD` minimal 16 karakter. Lalu:

```powershell
node --env-file-if-exists=.env --input-type=module -e "import bcrypt from 'bcryptjs'; import Sqlite from 'better-sqlite3'; const sqlite = new Sqlite('data/hmif.sqlite'); const row = sqlite.prepare('SELECT payload FROM app_state WHERE id = 1').get(); if (!row) throw new Error('SQLite belum ada. Jalankan npm run dev:api sekali, lalu ulangi perintah ini.'); const data = JSON.parse(row.payload); const nim = process.env.INITIAL_ADMIN_NIM || 'admin'; const password = process.env.INITIAL_ADMIN_PASSWORD; if (!password || password.length < 16) throw new Error('INITIAL_ADMIN_PASSWORD di .env wajib minimal 16 karakter.'); const user = data.users.find((entry) => entry.nim === nim); if (!user) throw new Error('User tidak ditemukan: ' + nim); user.password_hash = bcrypt.hashSync(password, 10); user.session_version = (user.session_version || 0) + 1; sqlite.prepare('UPDATE app_state SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 1').run(JSON.stringify(data), new Date().toISOString()); console.log('Password user ' + nim + ' sudah disetel ulang ke INITIAL_ADMIN_PASSWORD.');"
```

Jalankan lagi `npm run dev:api`. Login dengan:

- NIM: nilai `INITIAL_ADMIN_NIM` (default `admin`)
- Password: nilai `INITIAL_ADMIN_PASSWORD` di `.env`

### Cara B — Buat database baru dari seed `.env`

Hanya jika Anda rela kehilangan data development di SQLite (user, proker, dsb. yang sudah tersimpan di SQLite). File `data/database.json` tetap ada sebagai cadangan, tetapi **harus dipindah dulu** supaya tidak diimpor lagi.

```powershell
Rename-Item data\database.json data\database.json.bak
Remove-Item data\hmif.sqlite, data\hmif.sqlite-wal, data\hmif.sqlite-shm -ErrorAction SilentlyContinue
npm run dev:api
```

API membuat SQLite baru dan superadmin dari `INITIAL_ADMIN_NIM` + `INITIAL_ADMIN_PASSWORD`. Login dengan kedua nilai itu.

Jika `database.json` tidak dipindah, menghapus SQLite saja akan mengimpor JSON lama sekali lagi dan password `.env` tetap tidak berlaku.

---

## 6. Variabel lingkungan

| Nama | Wajib | Keterangan |
| --- | --- | --- |
| `NODE_ENV` | Disarankan | `development` lokal; `production` di server. |
| `PORT` | Tidak | Port API. Default `3001`. |
| `JWT_SECRET` | Ya | Minimal 32 byte acak. Dipakai menandatangani cookie. |
| `ASPIRATION_ENCRYPTION_KEY` | Disarankan | Secret stabil minimal 32 byte untuk AES-256-GCM isi aspirasi/tanggapan. Jika kosong, diturunkan dari `JWT_SECRET`; jangan rotasi selama ada aspirasi terenkripsi. |
| `ASPIRATION_ENCRYPTION_KEY` | Disarankan | Secret stabil minimal 32 byte untuk AES-256-GCM isi aspirasi/tanggapan. Jika kosong, diturunkan dari `JWT_SECRET`; jangan rotasi selama ada aspirasi terenkripsi. |
| `FRONTEND_ORIGINS` | Ya di production | Daftar origin frontend, dipisah koma. Mutasi (POST/PUT/PATCH/DELETE) ditolak jika `Origin` tidak ada di daftar. Lokal default: `http://localhost:5173,http://127.0.0.1:5173`. Buka situs lewat origin yang sama. |
| `ALLOW_PUBLIC_REGISTRATION` | Tidak | Default mati. User baru publik tidak bisa daftar sendiri. |
| `INITIAL_ADMIN_NIM` | Saat seed database baru | ID superadmin awal. |
| `INITIAL_ADMIN_PASSWORD` | Saat seed database baru | Password superadmin awal, min. 16 karakter. |
| `DATABASE_FILE` | Production | Path absolut file SQLite persisten **di luar** workspace. |
| `ASSET_STORAGE_DIR` | Production | Path absolut folder aset privat persisten. |
| `EVENT_TICKET_ENCRYPTION_KEY` | Opsional | Secret stabil minimal 32 byte untuk mengenkripsi token QR yang dapat dipulihkan dari dashboard. Jika kosong, kunci diturunkan dari `JWT_SECRET`; jangan rotasi selama tiket terkait masih berlaku. |
| `RESEND_API_KEY` | Opsional | API key Resend untuk mengirim e-ticket berisi attachment QR. Jika tidak tersedia, peserta tetap mendapat tiket di browser; anggota login juga dapat membukanya kembali dari dashboard. |
| `EVENT_EMAIL_FROM` | Opsional | Alamat pengirim terverifikasi di Resend, misalnya `HMIF Events <events@domain-anda>`. Digunakan bersama `RESEND_API_KEY`. |

Pendaftaran publik mati secara default. User baru yang dibuat admin selalu ber-role `member` dan clearance 1, kecuali superadmin mengubah role.

---

## 7. Database, role, dan Site Studio

Database aplikasi adalah SQLite (WAL, foreign key, transaksi, optimistic concurrency). Di development, `data/database.json` lama diimpor **satu kali** ke `data/hmif.sqlite`. JSON tidak ditimpa; itu cadangan. File SQLite, `-wal`, `-shm`, dan `data/site-assets/` diabaikan Git.

Role:

- `superadmin` adalah role khusus, bukan angka negatif dan bukan “level 4” di UI anggota. Bypass izin clearance secara eksplisit.
- Clearance anggota hanya 1–3.
- Akun clearance 4 pada JSON lama dimigrasikan menjadi `superadmin` dengan clearance 0.

Perubahan role, konten administratif, upload aset, draft, publish, restore, dan ganti password dicatat di `audit_log`. Hanya superadmin yang boleh `/api/site/*` pengelolaan, Site Studio, dan perubahan role.

Site Studio: tema (warna, font, skala, bentuk, ikon, latar, kontras, motion), page builder (urutan/visibilitas/layout blok terdaftar), koleksi data terstruktur. Draft bisa dipratinjau, dipublikasikan, dan dipulihkan. Setiap simpan memakai revision ID untuk konflik editor bersamaan.

Upload: maksimal 5 MB; gambar PNG/JPEG/WebP dan font WOFF2/TTF/OTF; tipe dan signature dicek. SVG dan markup aktif ditolak. Aset yang masih direferensikan versi mana pun tidak bisa dihapus (untuk rollback). Backup JSON admin mencakup data aplikasi, konfigurasi, revision, metadata aset, dan audit; file binary di `ASSET_STORAGE_DIR` perlu backup terpisah.

Knowledge Base menerima tautan HTTPS atau PDF terkurasi. Upload PDF hanya untuk superadmin, maksimal 20 MB, dan signature file diperiksa. PDF baru dapat diunduh publik jika resource dan revision situs sudah diterbitkan; PDF draft tetap privat. Resource bank soal memiliki thread diskusi: anggota login dapat mengirim komentar yang menunggu moderasi clearance 2+, penulis dapat melihat komentar pending miliknya, dan hanya komentar yang diterbitkan terlihat publik.

Klinik Koding: anggota login dapat mengajukan bimbingan dengan batas 3 permintaan per jam dan melihat statusnya sendiri. Pengurus clearance 2+ dapat melihat antrean serta menjadwalkan tutor anggota clearance 2+ secara manual; sesi online wajib menggunakan HTTPS, sedangkan sesi luring harus mencantumkan lokasi. Tautan dan catatan sesi hanya dikirim ke pemohon serta pengurus.

Backup admin memuat metadata PDF, thread diskusi, dan permintaan tutoring; file biner PDF di `ASSET_STORAGE_DIR/knowledge/` harus ikut dicadangkan.

SQLite cocok untuk satu host kecil. Jangan membagi file SQLite lewat network filesystem. Untuk banyak instance, pindah ke database transaksional terkelola dan object storage.

Penilaian kuis dihitung di browser sebagai data latihan dan tidak memberi hak akses.

---

## 8. Production (ringkas)

Atur `NODE_ENV=production`, `JWT_SECRET` kuat dan unik, `FRONTEND_ORIGINS` sesuai domain HTTPS, `DATABASE_FILE` dan `ASSET_STORAGE_DIR` ke volume persisten di luar workspace.

Database production baru membuat satu superadmin dari `INITIAL_ADMIN_NIM` dan `INITIAL_ADMIN_PASSWORD`; koleksi contoh dimulai kosong. Jangan memakai `database.json` di production. Ganti password admin setelah login pertama.

Simpan secret di secret manager, bukan di repo.

---

## 9. Troubleshooting

- **API start gagal karena JWT:** `.env` tidak terbaca (file bukan di root), secret terlalu pendek, atau Anda menyalin placeholder `<>`.
- **Password salah meski `.env` sudah diisi:** lihat bagian 5. Hash di SQLite tidak ikut berubah.
- **NIM tidak terdaftar:** login dengan NIM yang ada. Setelah impor JSON, superadmin contoh adalah `admin`, bukan email.
- **Masuk berhasil tetapi tidak ada Site Studio:** akun bukan `superadmin` (misalnya anggota level 1–3).
- **`ECONNREFUSED` / server PRTS error:** `npm run dev:api` belum jalan, atau port bukan 3001.
- **`Origin tidak diizinkan`:** frontend tidak berasal dari `FRONTEND_ORIGINS` (contoh: membuka `http://127.0.0.1:5173` padahal origin hanya `http://localhost:5173`).
- **Konfigurasi kosong / data tidak muncul:** API belum jalan saat halaman dimuat. Nyalakan API, lalu muat ulang.
- **Cookie tidak menempel:** buka lewat origin yang diizinkan; di production cookie `Secure` membutuhkan HTTPS.

---

## 10. Pengujian

```powershell
npm test
```

Test memakai database dan folder upload sementara. Database development tidak diubah.
