# HMIF UMB - PRTS Tactical Terminal & Web Portal

Portal digital resmi Himpunan Mahasiswa Informatika (HMIF) Universitas Mayasari Bakti dengan antarmuka bertema taktis PRTS (Arknights Rhodes Island).

Aplikasi ini mencakup antarmuka publik interaktif, Admin Console untuk pengelolaan organisasi, dan Site Studio (Visual CMS) terpadu dengan backend Express dan SQLite yang aman.

> **Status konten:** seluruh identitas, roster, statistik, agenda, dan materi yang saat ini disertakan adalah fixture demo sintetis, bukan data resmi HMIF dan bukan data real-time. Konten akademik yang dibuat lewat workspace akademik berstatus draft sampai melalui review superadmin.

---

## Fitur Utama

- **Dashboard & Identitas Organisasi**: Visi, misi, profil pimpinan, dan statistik konfigurabel. Fixture demo tidak merepresentasikan data resmi atau real-time.
- **Squad / Struktur Fungsionaris**: Daftar operator divisi dengan filter bidang (BPH, PSDM, Litbang, Kominfo).
- **Program Kerja & Misi**: Pelacak status program kerja, KPI, sasaran, dan transparansi anggaran (anggaran hanya dapat diakses fungsionaris terotorisasi).
- **Kalender Pendidikan & Kegiatan**: Sinkronisasi jadwal akademik kampus dengan kegiatan ormawa.
- **Pusat Doktrin & Kaderisasi**: Modul AD/ART, GBHO, roadmap kaderisasi, dan kuis pemahaman kader interaktif.
- **KTA Digital & Presensi QR**: Kartu Tanda Anggota digital dan sistem pencatatan kehadiran kegiatan berbasis QR-Code.
- **Buku Kas Digital (Ledger)**: Transparansi arus kas pemasukan dan pengeluaran divisi BPH.
- **Aspirasi Mahasiswa**: Saluran transmisi aspirasi publik/mahasiswa langsung ke BPH.
- **Site Studio (Visual CMS)**: Editor kustomisasi tema visual (palet warna berstandar WCAG, font, tipografi, gambar hero, latar belakang) dengan sistem versi revisi dan rollback.
- **Dashboard Anggota Berbasis Akses**: Ruang kerja tersendiri dengan profil, keamanan akun, serta menu operasional dan Site Studio yang hanya tampil sesuai clearance.
- **Soundtrack Portal**: Pemutar publik dengan pilihan track, play/pause, volume, mute, dan tanpa autoplay; superadmin mengelola playlist dari Site Studio.
- **Pusat Akademik**: Resource soal UTS/UAS/kuis dengan filter mata kuliah, semester, dosen, dan tahun ajaran; materi PDF/tautan HTTPS; learning path berurutan dengan resource/prasyarat; serta thread bertingkat dengan tipe kontribusi, moderasi, dan solusi terpilih.
- **Kurasi Akademik & Klinik Koding**: Superadmin dapat memberi/mencabut capability `academic_curate`; kurator hanya mengelola draft resource/path dan PDF unggahannya sendiri. Publikasi tetap melalui review superadmin. Matchmaking Klinik Koding merekomendasikan tutor menurut skill, slot pilihan, ketersediaan, dan konflik sesi; pengurus mengonfirmasi jadwal secara manual. Tautan Meet HTTPS dimasukkan manual, belum ada integrasi Google Meet.
- **Pelacakan Tugas Kanban**: Board To-Do, In Progress, Under Review, dan Done dengan PIC, tenggat, serta relasi program kerja untuk clearance 2+.
- **Showcase & Career Hub**: Karya mahasiswa, direktori alumni/mentor, dan lowongan/magang terkurasi yang dikelola superadmin.
- **Helpdesk & agenda**: Aspirasi dengan ticket ID dan kode pelacakan privat; kalender menyajikan agenda akademik dan event.
- **Kalender tenggat**: Superadmin dapat mencatat tenggat beasiswa dan kompetisi dengan tautan pendaftaran HTTPS; tautan tampil pada agenda publik, sementara pendaftaran tiket peserta hanya tersedia untuk jenis agenda event.
- **Notifikasi anggota**: Pusat notifikasi in-app untuk tenggat beasiswa/kompetisi dan tugas yang ditugaskan kepada anggota, perubahan status tugas/pengajuan, serta jadwal dan tindak lanjut Klinik Koding. Anggota dapat mengatur kategori, jangka waktu pengingat tenggat, dan waktu pengingat sesi; tidak ada email atau push browser.
- **Tiket & sertifikat event**: Pendaftar menerima QR tiket privat yang harus disimpan saat pendaftaran karena detail tiket hanya ditampilkan sekali. Petugas ber-clearance 2+ dapat memindai QR atau memasukkan ID dan kode privat secara manual; kamera dapat dihentikan kapan saja. Check-in hanya berlaku satu kali pada tanggal event menurut zona waktu Asia/Jakarta. Sertifikat hanya dapat diterbitkan untuk peserta dengan presensi tervalidasi dan memiliki halaman verifikasi publik.

## Dashboard Anggota

Setelah masuk, pengguna diarahkan ke dashboard pribadi di `#workspace/home`. Navigasi dan modul yang tersedia mengikuti peran/clearance akun:

- Semua akun terdaftar memiliki dashboard beranda dan halaman profil/keamanan.
- Clearance level 2 ke atas dapat membuka operasional organisasi; konten sensitif tetap dibatasi sesuai izin di backend.
- Capability `academic_curate` membuka halaman Pusat Akademik saja tanpa menaikkan clearance atau membuka Site Studio/operasional. Superadmin meninjau dan menerbitkan resource serta learning path.
- Superadmin memperoleh halaman Site Studio tersendiri untuk mengelola tema, halaman, struktur, konten, aset, dan versi. Editor tidak lagi dibuka sebagai modal di atas portal publik.
- Beranda superadmin memuat ringkasan akun, konten, tugas, diskusi, permintaan Klinik Koding, agenda, dan audit dari API. Saat data sedang dimuat, belum tersedia, atau gagal diambil, dashboard menampilkan status yang sesuai dan tidak mengarang metrik.
- Board tugas memerlukan clearance 2; PIC tugas baru dipilih dari akun, dengan tenggat dan riwayat perubahan status pada kartu. Pengelolaan soundtrack, showcase, alumni, dan lowongan hanya tersedia bagi superadmin. Konten nonaktif disembunyikan dari portal publik.
- Tautan **Kembali ke Portal Publik** membawa pengguna keluar dari ruang kerja tanpa mengakhiri sesi.
- Halaman **Notifikasi** tersedia untuk seluruh akun dan hanya menampilkan pemberitahuan milik akun tersebut. Preferensi notifikasi tersimpan per akun; pengingat tenggat dibuat saat anggota membuka pusat notifikasi.

## Soundtrack dan Kurasi Publik

- Pemutar tidak memulai audio sampai pengunjung menekan **PUTAR**. Track, volume, mute, dan pilihan menyembunyikan player disimpan sebagai preferensi lokal browser. Tombol **×** menyembunyikan panel tanpa menghentikan musik; tombol **♫ AUDIO** membukanya kembali.
- Superadmin dapat mengunggah MP3/M4A/WAV/OGG/AAC hingga 20 MB atau mendaftarkan URL HTTPS ke audio yang dapat diputar browser. Server memvalidasi signature/container; pengelola wajib memastikan hak penggunaan musik.
- Site Studio menyediakan pengurutan playlist, aktivasi/nonaktivasi, dan penghapusan track nonaktif. Perubahan katalog dicatat di audit log.
- Showcase dan Career Hub mengikuti alur pengajuan → review (revisi, tolak, atau setujui) → publikasi → arsip. Pengaju dapat melihat catatan reviewer dan mengirim ulang revisi; profil alumni memerlukan persetujuan tercatat sebelum diterbitkan. Dapatkan persetujuan alumni sebelum profil ditampilkan; jangan memasukkan email atau nomor telepon pribadi. URL eksternal harus HTTPS.
- Tenggat beasiswa dan kompetisi dibuat dari Admin Console pada bagian **Kalender Kegiatan**. Tanggal, kategori, dan tautan HTTPS diteruskan ke agenda publik; kategori tenggat tidak membuka alur tiket/presensi event.

---

## Arsitektur Aplikasi

| Komponen | Teknologi | Port Default | Perintah |
| --- | --- | --- | --- |
| **Frontend** | Vite + Vanilla JS + CSS Tokens | `5173` | `npm run dev` |
| **Backend API** | Node.js + Express 5 + SQLite (WAL) | `3001` | `npm run dev:api` |

---

## Panduan Instalasi & Menjalankan

### 1. Salin File Lingkungan (.env)
```powershell
Copy-Item .env.example .env
```
Buka file `.env` dan lengkapi konfigurasi:
- `JWT_SECRET`: Kunci acak minimal 32 karakter (generate menggunakan: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).
- `INITIAL_ADMIN_NIM`: NIM admin superadmin awal (contoh: `admin`).
- `INITIAL_ADMIN_PASSWORD`: Password admin awal (minimal 16 karakter).

### Kesiapan Data Produksi dan Pemulihan

- Database SQLite produksi wajib berada pada volume persisten di luar workspace (`DATABASE_FILE`), sedangkan berkas unggahan berada pada volume persisten (`ASSET_STORAGE_DIR`). Database baru pada mode production memulai tanpa data operasional agenda/transaksi dan dengan konten situs kosong. Masukkan atau tinjau data resmi melalui Site Studio dan Admin Console sebelum mempublikasikan portal; jangan menganggap contoh development sebagai data HMIF yang terverifikasi.
- Endpoint `GET /api/admin/backup` mengunduh ekspor JSON data portal dan metadata operasional. Ekspor ini bukan paket pemulihan mandiri: isi biner gambar, audio, dan PDF berada di `ASSET_STORAGE_DIR` (termasuk subfolder `knowledge` dan `soundtracks`), dan aplikasi belum menyediakan endpoint restore JSON.
- Untuk pemulihan penuh, hentikan penulisan aplikasi, lakukan checkpoint WAL SQLite (`PRAGMA wal_checkpoint(TRUNCATE)`) atau gunakan SQLite Online Backup API, lalu simpan database dan seluruh `ASSET_STORAGE_DIR` sebagai satu set. Jangan menyalin hanya file `.sqlite` saat aplikasi masih menulis; file `-wal` dapat memuat transaksi yang belum ada pada file utama.
- Pulihkan set tersebut ke path `DATABASE_FILE` dan `ASSET_STORAGE_DIR` yang baru pada staging terisolasi. Verifikasi login admin uji, metadata ekspor `/api/admin/backup`, serta unduh gambar, PDF, dan audio untuk membandingkan SHA-256 dengan metadata database sebelum menyatakan pemulihan berhasil.
- Latihan 4 Oktober 2026 berhasil pada staging sementara dengan data sintetis: database SQLite dan direktori aset dipulihkan bersama, lalu byte PNG, PDF, dan MP3 dicocokkan dengan hash metadata. Tidak ada database kerja/produksi yang dipakai. Lindungi backup karena dapat memuat data anggota dan hash kredensial; batasi akses dan retensinya.

### 2. Jalankan Backend API (Terminal 1)
```powershell
npm run dev:api
```

### 3. Jalankan Frontend (Terminal 2)
```powershell
npm run dev
```
Akses portal melalui browser di **`http://localhost:5173`**.

---

## Pengujian & Build

```powershell
# Menjalankan unit & security test suite
npm test

# Build aset frontend produksi
npm run build
```

---

## Keamanan

- Cookie Sesi: `prts_session` (`HttpOnly`, `SameSite=Strict`, `secure` di production).
- Validasi Mutasi CSRF: Verifikasi header `Origin` terhadap `FRONTEND_ORIGINS`.
- Upload File: Pengecekan signature/container gambar, font, PDF, dan format audio yang didukung; penolakan file SVG dan skrip aktif.
- Rate Limiting: Proteksi brute-force pada endpoint autentikasi, registrasi, dan aspirasi.
- Optimistic Concurrency Control pada draft dan state data.
