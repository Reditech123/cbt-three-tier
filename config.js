// =====================================================================
// GANTI DUA NILAI DI BAWAH INI dengan milik proyek Supabase Anda.
// Lihat: Supabase > Project Settings > API (atau tombol "Connect").
// Anon/publishable key memang aman diletakkan di sini (bersifat publik);
// keamanan data dijaga oleh aturan di sql/schema.sql.
// JANGAN pernah menaruh "service_role" / "secret" key di file ini.
// =====================================================================
window.CBT_CONFIG = {
  SUPABASE_URL: "https://qnsyxbjufeqwywbmqyls.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_hQsbnVNncPuMyPOtaXGTlg_6522KHFg",

  // Nama institusi yang tampil di kepala halaman.
  NAMA_INSTITUSI: "PGMI UIN Raden Mas Said Surakarta",

  // Izinkan dosen baru mendaftar sendiri lewat halaman dosen?
  // Setelah semua dosen terdaftar, ubah ke false dan matikan juga
  // "Allow new users to sign up" di Supabase > Authentication.
  IZINKAN_DAFTAR_DOSEN: true,
};
