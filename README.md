# CBT Three-Tier Test

Sistem ujian daring (Computer Based Test) untuk tes three-tier:

- Tingkat 1 adalah jawaban, tingkat 2 alasan, dan tingkat 3 keyakinan.
- Hosting gratis: **GitHub Pages** untuk halaman web dan **Supabase** untuk database.

## Fitur

**Mahasiswa**
- Masuk dengan kode ujian, NIM, dan PIN.
- Cek perangkat sebelum ujian.
- Tata tertib, lalu ruang tunggu sampai diizinkan dosen.
- Paket berbeda tiap mahasiswa; urutan soal dan pilihan diacak.
- Timer.
- Simpan otomatis, dengan cadangan offline di perangkat.
- Pengawasan: pindah tab/aplikasi, keluar layar penuh, dan salin-tempel terdeteksi; ada watermark.
- Nilai dan profil pemahaman langsung setelah selesai; umpan balik tingkat 1–4.

**Dosen**
- Bank soal dari Excel atau JSON, dengan validasi otomatis.
- Soal bergambar.
- Kelas, dengan PIN dibuat otomatis.
- Sesi ujian: jadwal, durasi, mulai serentak atau per orang, navigasi bebas atau berurutan.
- Uji coba sebagai mahasiswa.
- Izinkan peserta.
- Pantauan langsung: tambah waktu, reset.
- Rekap nilai, analisis konsep, dan ekspor Excel.

## Struktur folder

```
index.html          halaman masuk mahasiswa
ujian.html          cek perangkat, tata tertib, ruang tunggu, ujian, hasil
dosen.html          halaman dosen
assets/config.js    << ISI DENGAN URL & ANON KEY SUPABASE ANDA
assets/*.js, *.css  kode aplikasi
sql/schema.sql      database + fungsi server (tempel di Supabase SQL Editor)
contoh/             contoh soal (JSON & Excel), contoh gambar, contoh daftar peserta
```

## Pemasangan (ringkas)

1. Buat proyek gratis di <https://supabase.com>.
2. Buka **SQL Editor → New query**, tempel seluruh isi `sql/schema.sql`, lalu tekan **Run**.
3. Salin **Project URL** dan **anon / publishable key** (Project Settings → API) ke `assets/config.js`.
4. Buat repositori GitHub **publik**, lalu unggah semua file dalam folder ini.
5. Di repositori, buka **Settings → Pages → Deploy from a branch → main / (root)**.
6. Di Supabase, buka **Authentication → URL Configuration**. Isi **Site URL** dengan alamat GitHub Pages, mis. `https://username.github.io/cbt-three-tier/`.
7. Buka `.../dosen.html`, daftar akun dosen, lalu unggah contoh bank soal dan lakukan uji coba.

Panduan langkah demi langkah, panduan dosen, dan panduan mahasiswa ada di dokumen panduan yang menyertai kode ini.

## Catatan keamanan

- Kunci jawaban tidak pernah dikirim ke peramban mahasiswa sebelum ujian selesai. Penilaian dilakukan di server (`sql/schema.sql`).
- Anon key memang bersifat publik. Data dilindungi oleh Row Level Security dan fungsi server.
- **Jangan pernah** menaruh `service_role` key di repositori ini.
- File gambar disimpan di bucket publik dengan nama folder acak (UUID). Siapa pun yang tahu alamat lengkapnya dapat membukanya, jadi jangan menaruh jawaban di dalam gambar.
- Pengawasan di peramban bukan penguncian total. Sistem ini mencatat dan membatasi kecurangan, tetapi tidak membuatnya mustahil. Gunakan pengawas untuk ujian berisiko tinggi.

## Format JSON bank soal (ringkas)

```json
{
  "materi": "Nama materi",
  "paket": [
    { "kode": "A", "soal": [
      { "id": "A1", "konsep": "Gaya gesek",
        "gambar": { "file": "gambar.png", "alt": "deskripsi singkat" },
        "tier1": { "teks": "Pertanyaan...", "opsi": ["...", "...", "..."], "kunci": 0 },
        "tier2": { "teks": "Alasan jawaban Anda:", "opsi": ["...", "..."], "kunci": 1,
                   "feedback": ["penjelasan bila alasan ini dipilih", ""] },
        "pembahasan": "Pembahasan..." }
    ]}
  ]
}
```

- `kunci` adalah posisi jawaban benar, dimulai dari 0 (0 = A, 1 = B, …).
- Pilihan boleh berupa objek `{ "teks": "...", "gambar": "file.png" }`.
- Rumus dapat ditulis di antara `$...$`.

## Kategori penilaian

| Tingkat 1 | Tingkat 2 | Tingkat 3 | Kategori | Skor (ketat / longgar) |
|---|---|---|---|---|
| benar | benar | yakin | Paham konsep | 1 / 1 |
| benar | salah | yakin | Miskonsepsi (false positive) | 0 / 0 |
| salah | benar | yakin | Miskonsepsi (false negative) | 0 / 0 |
| salah | salah | yakin | Miskonsepsi | 0 / 0 |
| benar | benar | tidak yakin | Tidak paham (tebakan beruntung) | 0 / 1 |
| lainnya | lainnya | tidak yakin | Tidak paham konsep | 0 / 0 |

Nilai = jumlah jawaban berskor 1 ÷ jumlah soal × 100.
