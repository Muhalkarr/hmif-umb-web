# HMIF UMB — Frostline Portal Prototype

Prototipe antarmuka publik dan ruang kerja pengurus HMIF UMB dengan bahasa visual minimalis-futuristik yang terinspirasi dari referensi Arknights yang diberikan pengguna.

## Struktur

- \`index.html\` — struktur halaman dan komponen UI.
- \`styles.css\` — sistem visual responsif Frostline.
- \`app.js\` — navigasi, filter program kerja, modal simulasi akses, pemilihan role, dan demo workspace.

## Menjalankan

Prototipe ini statis dan tidak membutuhkan backend:

\`\`\`bash
# Buka index.html langsung di browser
# atau jalankan server statis:
python -m http.server 8080
\`\`\`

Kemudian buka \`http://localhost:8080\` dari folder ini.

## Fitur yang bisa dicoba

1. Navigasi bagian Beranda, Organisasi, Program Kerja, Agenda, dan Ruang Akademik.
2. Tombol **Portal Pengurus** membuka pemilih role demo.
3. Pilih Ketua, Wakil Ketua, Sekretaris, Bendahara, Kepala Departemen, atau Staf Departemen.
4. Dashboard internal menampilkan ringkasan peran dan menyediakan navigasi modul.
5. Filter Program Kerja dan menu navigasi seluler.

## Batasan prototipe

- Semua nama, statistik, aktivitas, tanggal, dan nominal adalah data sintetis untuk demonstrasi.
- Pemilih role bukan autentikasi dan tidak membuktikan otorisasi.
- Tombol administratif yang belum terhubung menampilkan pemberitahuan demo.
- Belum ada backend, database, RBAC server-side, penyimpanan, persetujuan, maupun audit log.
- Jangan memasukkan data anggota atau data keuangan nyata ke prototipe ini.

## Arah desain

Palet es biru, abu-abu mineral, dan arang; grid teknis lembut; garis pemisah tipis; tipografi editorial; aksen merah hanya untuk status dan tindakan utama. Visual menggunakan SVG buatan sendiri, tidak menyalin aset gim.
