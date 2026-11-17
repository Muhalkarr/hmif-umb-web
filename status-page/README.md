# Halaman Status Independen

Folder ini adalah halaman statis terpisah dari aplikasi dan API HMIF. Deploy seluruh isi folder ke provider dan domain/subdomain yang berbeda dari portal utama. Untuk ketahanan yang lebih baik, gunakan akun/provider terpisah dengan MFA dan batasi siapa yang dapat mengubah berkas status.

## Mengubah status saat insiden

Edit `status.json`, lalu deploy folder ini:

- `normal`: tidak ada gangguan yang diumumkan.
- `investigating`: gangguan sedang diperiksa.
- `incident`: insiden sedang ditangani.
- `recovering`: layanan sedang dipulihkan.

Ubah `updatedAt` ke waktu UTC saat setiap pembaruan. Tulis pesan singkat untuk pengunjung; jangan publikasikan detail teknis, data pribadi, kredensial, atau klaim yang belum diverifikasi. Halaman akan memeriksa pembaruan setiap 60 detik.

## Menautkan banner portal

Atur variabel berikut saat membangun portal utama, lalu deploy ulang portal:

```text
VITE_SECURITY_STATUS_FEED_URL=https://status.example.org/status.json
VITE_SECURITY_STATUS_PAGE_URL=https://status.example.org/
```

Ganti URL contoh dengan URL aktual. Agar banner utama dapat membaca feed lintas domain, konfigurasi host status untuk mengizinkan permintaan baca dari origin portal utama. Jangan menaruh token atau rahasia di `status.json` maupun variabel `VITE_*`.

Portal juga memiliki kontrol status di Site Studio. Kontrol itu menyimpan status pada API utama dan hanya berfungsi selama API utama dapat dipercaya dan diakses; ia tidak mengubah halaman independen. Saat kondisi darurat, perbarui kanal independen secara terpisah. Sampai folder ini dideploy dan URL feed dikonfigurasi, kanal independen belum aktif.
