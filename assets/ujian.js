// Alur mahasiswa: cek perangkat -> tata tertib -> ruang tunggu -> ujian -> hasil.
(function () {
  const { h, T, rpc, toast, idPerangkat, namaPerangkat, urlGambar, jamDetik, jam, durasi, JENIS, cekKonfigurasi } = CBT;
  const app = document.getElementById("app");
  const banner = document.getElementById("banner");
  if (!cekKonfigurasi(app)) return;

  const DEV = idPerangkat();
  const qs = new URLSearchParams(location.search);
  let sesiLokal = null;
  if (qs.get("uji")) {
    sesiLokal = { token: qs.get("uji"), nama: "Uji coba dosen", nim: "UJI", kode: "UJI-COBA", uji: true };
    try { sessionStorage.setItem("cbt_uji", JSON.stringify(sesiLokal)); } catch (e) {}
    history.replaceState(null, "", "ujian.html?mode=uji");
  } else if (qs.get("mode") === "uji") {
    try { sesiLokal = JSON.parse(sessionStorage.getItem("cbt_uji") || "null"); } catch (e) {}
  } else {
    try { sesiLokal = JSON.parse(localStorage.getItem("cbt_attempt") || "null"); } catch (e) {}
  }
  if (!sesiLokal || !sesiLokal.token) { location.href = "index.html"; return; }
  const TOKEN = sesiLokal.token;
  const KUNCI_ANTRE = "cbt_antre_" + TOKEN;
  const KUNCI_CEK = "cbt_cek_" + TOKEN;

  let info = null;            // hasil terakhir dari server
  let selisihJam = 0;         // jam server - jam perangkat (ms)
  let pengatur = [];          // interval yang perlu dihentikan
  const henti = () => { pengatur.forEach(clearInterval); pengatur = []; };
  const sekarang = () => Date.now() + selisihJam;

  function tanya(judul, isi, ya) {
    return new Promise(res => {
      const tutup = v => { m.remove(); res(v); };
      const m = h("div.modal-latar", h("div.modal", { role: "dialog", "aria-modal": "true" }, h("h2", judul), h("p", isi),
        h("div.baris.akhir", h("button", { onclick: () => tutup(false) }, "Batal"), h("button.utama", { onclick: () => tutup(true) }, ya || "Ya"))));
      document.body.append(m);
    });
  }
  function tampil(...isi) { app.replaceChildren(...isi); window.scrollTo(0, 0); }
  function kepala(kanan) {
    return h("header.kepala", h("div", h("div.judul", "CBT Three-Tier Test"), h("div.sub", (info && info.sesi ? info.sesi.nama : "") )),
      h("div.kanan", h("span", sesiLokal.nama + " · " + sesiLokal.nim), kanan || null));
  }
  function aturBanner() {
    banner.replaceChildren();
    if (sesiLokal.uji) banner.append(h("div.banner.uji", "MODE UJI COBA DOSEN — jawaban tidak masuk rekap nilai"));
    if (!navigator.onLine) banner.append(h("div.banner.offline", "Koneksi terputus. Jawaban disimpan di perangkat dan dikirim otomatis saat tersambung."));
  }
  window.addEventListener("online", aturBanner);
  window.addEventListener("offline", aturBanner);

  function terima(r) {
    if (r && r.sekarang) selisihJam = r.sekarang - Date.now();
    info = Object.assign({}, info || {}, r);
    return info;
  }

  async function mulaiAlur() {
    aturBanner();
    try {
      terima(await rpc("mhs_detak", { p_token: TOKEN, p_device: DEV, p_rtt: null, p_posisi: null }));
    } catch (e) {
      return tampil(kepala(), h("main.isi.sempit", h("div.kartu.bahaya", h("h2", "Tidak dapat memuat ujian"), h("p", e.message),
        h("div.baris", h("button.utama", { onclick: mulaiAlur }, "Coba lagi"), h("a.tombol", { href: "index.html" }, "Kembali ke halaman masuk")))));
    }
    arahkan();
  }

  function arahkan() {
    henti();
    const st = info.status;
    if (st === "perangkat_lain") return layarPerangkatLain();
    if (st === "ditolak") return layarDitolak();
    if (st === "selesai") return layarHasil();
    if (st === "diarsipkan") return layarPesan("Ujian Anda direset oleh dosen", "Silakan masuk ulang dengan kode ujian, NIM, dan PIN.", true);
    if (st === "aktif") return layarLanjutkan();
    let cekSudah = false;
    try { cekSudah = !!sessionStorage.getItem(KUNCI_CEK); } catch (e) {}
    if (!cekSudah) return layarCekPerangkat();
    return layarRuangTunggu();
  }

  function layarPesan(judul, isi, keMasuk) {
    tampil(kepala(), h("main.isi.sempit", h("div.kartu", h("h2", judul), h("p", isi),
      keMasuk ? h("a.tombol.utama", { href: "index.html", onclick: () => { try { localStorage.removeItem("cbt_attempt"); } catch (e) {} } }, "Ke halaman masuk") : null)));
  }
  function layarPerangkatLain() {
    layarPesan("Ujian dibuka di perangkat lain", "Akun Anda baru saja masuk dari perangkat lain, sehingga perangkat ini dinonaktifkan. Jika itu memang Anda, lanjutkan di perangkat tersebut. Jika ingin kembali ke perangkat ini, masuk ulang; dosen perlu mengizinkan Anda lagi.", true);
  }
  function layarDitolak() {
    tampil(kepala(), h("main.isi.sempit", h("div.kartu.bahaya", h("h2", "Permintaan masuk ditolak dosen"),
      h("p", "Hubungi dosen atau pengawas. Jika dosen mengizinkan kembali, halaman ini akan berlanjut otomatis."))));
    pengatur.push(setInterval(async () => { try { terima(await rpc("mhs_detak", { p_token: TOKEN, p_device: DEV, p_rtt: null })); if (info.status !== "ditolak") arahkan(); } catch (e) {} }, 8000));
  }

  // ------------------------------------------------------------------
  // 1. Cek perangkat
  // ------------------------------------------------------------------
  function layarCekPerangkat() {
    const daftar = h("div");
    const tombol = h("button.utama.penuh.mt", { disabled: true }, "Lanjut ke tata tertib");
    const ulang = h("button.penuh.mt", { onclick: () => layarCekPerangkat() }, "Ulangi pemeriksaan");
    tampil(kepala(), h("main.isi.sedang", h("div.kartu",
      h("h1", "Cek perangkat"), h("p.redup", "Sistem memeriksa perangkat dan koneksi Anda sebelum ujian. Hasilnya juga terlihat oleh dosen."),
      daftar, tombol, ulang)));

    const baris = (judul) => { const t = h("span.titik"), k = h("small", "Memeriksa..."); const b = h("div.cek-baris", t, h("div.ket", h("strong", judul), k)); daftar.append(b); return (warna, teks) => { t.className = "titik " + warna; k.textContent = teks; }; };
    const hasil = { perangkat: namaPerangkat(), layar: screen.width + "x" + screen.height };

    (async () => {
      const b1 = baris("Peramban");
      const modern = !!(window.fetch && window.Promise && window.localStorage && Array.prototype.flat);
      b1(modern ? "hijau" : "merah", hasil.perangkat + (modern ? " — didukung" : " — terlalu lama, perbarui peramban"));

      const b2 = baris("Penyimpanan lokal (cadangan jawaban saat offline)");
      let simpanOk = false;
      try { localStorage.setItem("cbt_tes", "1"); simpanOk = localStorage.getItem("cbt_tes") === "1"; localStorage.removeItem("cbt_tes"); } catch (e) {}
      b2(simpanOk ? "hijau" : "merah", simpanOk ? "Berfungsi" : "Tidak berfungsi. Matikan mode penyamaran/incognito.");
      hasil.penyimpanan = simpanOk;

      const b3 = baris("Layar penuh");
      const fs = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
      b3(fs ? "hijau" : "kuning", fs ? "Didukung" : "Tidak didukung di perangkat ini (mis. iPhone). Ujian tetap bisa, tetapi jangan berpindah aplikasi.");
      hasil.layar_penuh = fs;

      const b4 = baris("Ukuran layar");
      const lebar = Math.min(window.innerWidth, screen.width);
      b4(lebar >= 360 ? "hijau" : "kuning", lebar + " piksel" + (lebar >= 360 ? "" : " — sempit, putar ke mode lanskap jika sulit dibaca"));

      const b5 = baris("Baterai");
      if (navigator.getBattery) {
        try { const bt = await navigator.getBattery(); const p = Math.round(bt.level * 100); hasil.baterai = p;
          b5(p >= 30 || bt.charging ? "hijau" : "kuning", p + "%" + (bt.charging ? " (mengisi)" : "") + (p < 30 && !bt.charging ? " — sambungkan pengisi daya" : ""));
        } catch (e) { b5("", "Tidak dapat dibaca"); }
      } else b5("", "Tidak dapat dibaca di peramban ini — pastikan baterai cukup");

      const b6 = baris("Koneksi ke server");
      const waktu = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        try { terima(await rpc("mhs_detak", { p_token: TOKEN, p_device: DEV, p_rtt: null })); waktu.push(performance.now() - t0); }
        catch (e) { waktu.push(9999); }
        b6("", "Mengukur... (" + (i + 1) + "/5)");
      }
      waktu.sort((a, b) => a - b);
      const med = Math.round(waktu[2]);
      hasil.rtt = med;
      const mutu = med < 300 ? ["hijau", "Baik"] : med <= 1000 ? ["kuning", "Lemah"] : ["merah", "Buruk"];
      hasil.koneksi = mutu[1];
      b6(mutu[0], mutu[1] + " — waktu respons " + (med >= 9999 ? "gagal" : med + " ms") +
        (mutu[1] === "Baik" ? "" : mutu[1] === "Lemah" ? ". Ujian bisa berjalan, tetapi cari sinyal lebih kuat." : ". Pindah ke tempat dengan sinyal lebih baik lalu ulangi."));

      try { terima(await rpc("mhs_cek", { p_token: TOKEN, p_device: DEV, p_cek: hasil })); } catch (e) {}
      const boleh = simpanOk && modern && med < 9999;
      tombol.disabled = !boleh;
      if (!boleh) tombol.textContent = "Perbaiki dulu masalah berwarna merah";
      tombol.onclick = () => { try { sessionStorage.setItem(KUNCI_CEK, "1"); } catch (e) {} layarTataTertib(); };
    })();
  }

  // ------------------------------------------------------------------
  // 2. Tata tertib
  // ------------------------------------------------------------------
  function layarTataTertib() {
    const s = info.sesi || {};
    const cb = h("input", { type: "checkbox", id: "setuju" });
    const btn = h("button.utama.penuh.mt", { disabled: true, onclick: layarRuangTunggu }, "Saya setuju, masuk ruang tunggu");
    cb.addEventListener("change", () => btn.disabled = !cb.checked);
    tampil(kepala(), h("main.isi.sedang", h("div.kartu",
      h("h1", "Tata tertib ujian"),
      h("p", h("strong", s.materi || ""), " · ", s.jumlah_soal + " soal · ", s.durasi + " menit · navigasi ", s.navigasi === "berurutan" ? "berurutan (tidak bisa kembali ke soal sebelumnya)" : "bebas"),
      h("ol",
        h("li", "Setiap soal terdiri dari 3 tingkat: jawaban, alasan, dan tingkat keyakinan. Ketiganya harus diisi."),
        h("li", "Ujian berjalan dalam layar penuh. Berpindah tab/aplikasi atau keluar layar penuh lebih dari 2 detik dicatat sebagai pelanggaran."),
        h("li", "Jika pelanggaran mencapai ", h("strong", s.ambang + " kali"), ", jawaban otomatis dikirim dan ujian selesai."),
        h("li", "Jawaban tersimpan otomatis. Jika sinyal putus, jawaban disimpan di perangkat dan dikirim saat tersambung kembali. Putus sinyal tidak dihitung pelanggaran."),
        h("li", "Waktu tetap berjalan walaupun halaman tertutup. Jika waktu habis, jawaban yang tersimpan dikirim otomatis."),
        h("li", "Menyalin, menempel, dan klik kanan dinonaktifkan."),
        h("li", "Kerjakan sendiri. Nama dan NIM Anda tampil di panel samping layar ujian.")),
      h("label.baris", { for: "setuju", style: { fontWeight: 400 } }, cb, " Saya sudah membaca dan akan mematuhi tata tertib."),
      btn)));
  }

  // ------------------------------------------------------------------
  // 3. Ruang tunggu
  // ------------------------------------------------------------------
  function layarRuangTunggu() {
    henti();
    const status = h("div");
    const btnMulai = h("button.hijau.penuh.mt.tersembunyi", { onclick: mulaiUjian }, "Mulai ujian");
    tampil(kepala(), h("main.isi.sempit", h("div.kartu.pusat", h("h1", "Ruang tunggu"), status, btnMulai,
      h("p.redup.kecil.mt", "Jangan tutup halaman ini. Halaman diperbarui otomatis setiap beberapa detik."))));
    const perbarui = () => {
      const s = info.sesi || {};
      if (info.status === "menunggu") status.replaceChildren(h("p", h("span.lencana.kuning", "Menunggu izin dosen")), h("p.redup", "Dosen akan memeriksa data dan perangkat Anda lalu memberi izin."));
      else if (info.status === "diizinkan" && !info.siap_mulai) status.replaceChildren(h("p", h("span.lencana.biru", "Sudah diizinkan")), h("p.redup", "Menunggu dosen memulai ujian secara serentak."));
      else if (info.siap_mulai) {
        status.replaceChildren(h("p", h("span.lencana.hijau", "Ujian siap dimulai")),
          h("p.redup", s.mode_mulai === "serentak" && !info.uji ? "Waktu ujian sudah berjalan sejak dosen memulai. Segera mulai." : "Waktu " + s.durasi + " menit mulai dihitung saat Anda menekan tombol."));
        btnMulai.classList.remove("tersembunyi");
      }
      else if (info.status !== "menunggu" && info.status !== "diizinkan") arahkan();
    };
    perbarui();
    const detak = async () => {
      const t0 = performance.now();
      try { terima(await rpc("mhs_detak", { p_token: TOKEN, p_device: DEV, p_rtt: null })); terima({ rtt: Math.round(performance.now() - t0) }); }
      catch (e) { return; }
      if (!["menunggu", "diizinkan"].includes(info.status)) return arahkan();
      perbarui();
    };
    pengatur.push(setInterval(detak, 5000));
  }

  function masukLayarPenuh() {
    const d = document.documentElement;
    const f = d.requestFullscreen || d.webkitRequestFullscreen;
    if (f) try { const p = f.call(d); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  function adaLayarPenuh() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  const dukungLayarPenuh = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

  async function mulaiUjian() {
    masukLayarPenuh();
    try { const r = await rpc("mhs_mulai", { p_token: TOKEN, p_device: DEV }); terima(r); ruangUjian(r); }
    catch (e) { toast(e.message, "galat"); }
  }

  function layarLanjutkan() {
    tampil(kepala(), h("main.isi.sempit", h("div.kartu.pusat", h("h1", "Ujian sedang berlangsung"),
      h("p.redup", "Waktu tetap berjalan. Tekan tombol untuk kembali ke soal."),
      h("button.utama.penuh", { onclick: mulaiUjian }, "Lanjutkan ujian"))));
  }

  // ------------------------------------------------------------------
  // 4. Ruang ujian
  // ------------------------------------------------------------------
  function ruangUjian(data) {
    henti();
    const berurutan = data.navigasi === "berurutan";
    let soal = data.soal;            // daftar soal (berurutan: hanya soal aktif)
    let idx = 0;                     // indeks soal di daftar
    const total = data.total;
    const bankId = data.bank_id;
    const jwb = {};
    soal.forEach(q => jwb[q.id] = Object.assign({ t1: null, t2: null, t3: null, ragu: false }, q.jawab));

    // antrean jawaban yang belum terkirim (bertahan walau halaman dimuat ulang)
    let antre = {};
    try { antre = JSON.parse(localStorage.getItem(KUNCI_ANTRE) || "{}"); } catch (e) {}
    Object.keys(antre).forEach(id => { if (jwb[id]) Object.assign(jwb[id], antre[id]); });
    const simpanAntre = () => { try { localStorage.setItem(KUNCI_ANTRE, JSON.stringify(antre)); } catch (e) {} };
    let antreKejadian = [];
    try { antreKejadian = JSON.parse(localStorage.getItem(KUNCI_ANTRE + "_k") || "[]"); } catch (e) {}
    const simpanKejadian = () => { try { localStorage.setItem(KUNCI_ANTRE + "_k", JSON.stringify(antreKejadian)); } catch (e) {} };

    let selesai = false;
    const elWaktu = h("div.waktu", { role: "timer", "aria-live": "off" }, "--:--");
    const elSimpan = h("span.simpan", { "aria-live": "polite" }, "Tersimpan");
    const elPel = h("span.lencana", "Pelanggaran 0/" + info.ambang);
    const elNo = h("span.lencana.biru", "");
    const kotakSoal = h("div");
    const panel = h("aside.panel-nomor");
    const tombolKirim = h("button.bahaya", { onclick: konfirmasiKirim }, "Kirim jawaban");

    // identitas peserta di panel kanan (tanpa watermark di atas soal agar mudah dibaca)
    const kartuIdentitas = () => h("div.kartu.identitas", { "aria-label": "Identitas peserta" },
      h("div.kecil.redup", "Peserta"),
      h("div.nama-peserta", sesiLokal.nama),
      h("div", "NIM ", h("strong", sesiLokal.nim)),
      h("div.kecil.redup", "Kode ujian " + sesiLokal.kode + (data.paket ? " · paket " + data.paket : "")));

    tampil(h("div.ujian-kepala", elWaktu, elNo, elPel, elSimpan, h("span", { style: { marginLeft: "auto" } }), tombolKirim),
      h("div.ujian-tata.tanpa-pilih", h("section", kotakSoal), panel));

    function lengkap(id) { const j = jwb[id]; return j && j.t1 != null && j.t2 != null && j.t3 != null; }
    function sebagian(id) { const j = jwb[id]; return j && (j.t1 != null || j.t2 != null || j.t3 != null); }

    function gambarEl(g, kelas) {
      if (!g) return null;
      const file = typeof g === "string" ? g : g.file;
      const alt = (typeof g === "object" && g.alt) || "Gambar soal";
      const src = urlGambar(bankId, file);
      const img = h("img", { src, alt, loading: "lazy", onclick: () => perbesar(src, alt) });
      img.onerror = () => img.replaceWith(h("div.kartu.peringatan.kecil", "Gambar gagal dimuat. ", h("button.kecil", { onclick: () => { img.src = src + "?r=" + Date.now(); } }, "Muat ulang")));
      return h("figure." + (kelas || "gambar-soal"), { style: { margin: "10px 0" } }, img, typeof g === "object" && g.alt ? h("figcaption", g.alt) : null);
    }
    function perbesar(src, alt) {
      const m = h("div.modal-latar", { onclick: () => m.remove() }, h("img", { src, alt, style: { maxWidth: "95vw", maxHeight: "90vh", background: "#fff", borderRadius: "8px" } }));
      document.body.append(m);
    }

    function grupOpsi(q, tier, judul, pertanyaan) {
      const wadah = h("div.tier", { role: "radiogroup", "aria-label": judul });
      wadah.append(h("div.tier-label", judul), T("p", pertanyaan, { style: { fontWeight: 600 } }));
      q[tier].opsi.forEach((o, i) => {
        const nama = q.id + "_" + tier;
        const kunci = tier === "tier1" ? "t1" : "t2";
        const inp = h("input", { type: "radio", name: nama, value: i, checked: jwb[q.id][kunci] === i });
        const lab = h("label.opsi" + (jwb[q.id][kunci] === i ? ".dipilih" : ""), inp, h("span.huruf", "ABCDEFGH"[i] + "."),
          h("span", T("span", o.teks || ""), o.gambar ? gambarEl({ file: o.gambar, alt: o.alt || ("Gambar pilihan " + "ABCDEFGH"[i]) }, "x") : null));
        inp.addEventListener("change", () => { ubah(q.id, kunci, i); wadah.querySelectorAll(".opsi").forEach(x => x.classList.remove("dipilih")); lab.classList.add("dipilih"); });
        wadah.append(lab);
      });
      return wadah;
    }

    function gambarSoal() {
      const q = soal[idx];
      const nomor = berurutan ? (data.posisi + 1) : q.no;
      elNo.textContent = "Soal " + nomor + " / " + total;
      const tier3 = h("div.tier", { role: "radiogroup", "aria-label": "Tingkat 3: keyakinan" }, h("div.tier-label", "Tingkat 3 · Keyakinan"),
        h("p", { style: { fontWeight: 600 } }, "Seberapa yakin Anda dengan jawaban dan alasan di atas?"));
      const yakin = h("div.yakin");
      [[1, "Yakin"], [0, "Tidak yakin"]].forEach(([v, t]) => {
        const inp = h("input", { type: "radio", name: q.id + "_t3", value: v, checked: jwb[q.id].t3 === v });
        const lab = h("label.opsi" + (jwb[q.id].t3 === v ? ".dipilih" : ""), inp, h("span", t));
        inp.addEventListener("change", () => { ubah(q.id, "t3", v); yakin.querySelectorAll(".opsi").forEach(x => x.classList.remove("dipilih")); lab.classList.add("dipilih"); });
        yakin.append(lab);
      });
      tier3.append(yakin);

      const ragu = h("input", { type: "checkbox", checked: jwb[q.id].ragu });
      ragu.addEventListener("change", () => ubah(q.id, "ragu", ragu.checked));

      const navigasi = h("div.baris.mt");
      if (berurutan) {
        const akhir = data.posisi + 1 >= total;
        navigasi.append(h("span.redup.kecil", "Mode berurutan: soal yang sudah dilewati tidak dapat dibuka lagi."), h("span", { style: { marginLeft: "auto" } }),
          akhir ? h("button.bahaya", { onclick: konfirmasiKirim }, "Selesai & kirim") : h("button.utama", { onclick: lanjutBerurutan }, "Simpan & lanjut →"));
      } else {
        navigasi.append(h("button", { disabled: idx === 0, onclick: () => pindah(idx - 1) }, "← Sebelumnya"),
          h("label.baris", { style: { margin: 0, fontWeight: 400 } }, ragu, " Ragu-ragu"),
          h("span", { style: { marginLeft: "auto" } }),
          idx < soal.length - 1 ? h("button.utama", { onclick: () => pindah(idx + 1) }, "Berikutnya →") : h("button.bahaya", { onclick: konfirmasiKirim }, "Selesai & kirim"));
      }

      kotakSoal.replaceChildren(h("div.kartu.soal-kartu",
        h("h2", "Soal " + nomor),
        gambarEl(q.gambar),
        grupOpsi(q, "tier1", "Tingkat 1 · Jawaban", q.tier1.teks),
        grupOpsi(q, "tier2", "Tingkat 2 · Alasan", q.tier2.teks),
        tier3), navigasi);
      gambarPanel();
    }

    function gambarPanel() {
      if (berurutan) {
        panel.replaceChildren(kartuIdentitas(), h("div.kartu", h("h3", "Kemajuan"), h("div.batang", h("span", { style: { width: Math.round((data.posisi) / total * 100) + "%" } })),
          h("p.kecil.redup.mt", (data.posisi) + " dari " + total + " soal sudah dilewati.")));
        return;
      }
      const grid = h("div.nomor");
      soal.forEach((q, i) => {
        const k = lengkap(q.id) ? ".lengkap" : sebagian(q.id) ? ".sebagian" : "";
        grid.append(h("button" + k + (jwb[q.id].ragu ? ".ragu" : "") + (i === idx ? ".sekarang" : ""),
          { onclick: () => pindah(i), "aria-label": "Soal " + q.no + (lengkap(q.id) ? ", lengkap" : sebagian(q.id) ? ", belum lengkap" : ", kosong") }, q.no));
      });
      const n = soal.filter(q => lengkap(q.id)).length;
      panel.replaceChildren(kartuIdentitas(), h("div.kartu", h("h3", "Nomor soal"), grid,
        h("p.kecil.mt", n + " dari " + total + " lengkap"),
        h("div.legenda", h("span", "■ hijau: ketiga tingkat terisi"), h("span", "■ kuning: belum lengkap"), h("span", "□ garis oranye: ragu-ragu"))));
    }

    function pindah(i) { if (i < 0 || i >= soal.length) return; idx = i; gambarSoal(); kirimDetak(); }

    // ---------- penyimpanan jawaban ----------
    let urut = Date.now();
    function ubah(id, kunci, nilai) {
      jwb[id][kunci] = nilai;
      antre[id] = Object.assign({}, jwb[id], { urut: ++urut });
      simpanAntre();
      gambarPanel();
      kirimAntre();
    }
    let sedangKirim = false;
    async function kirimAntre() {
      if (sedangKirim) return;
      const ids = Object.keys(antre);
      if (!ids.length) { elSimpan.textContent = "Tersimpan " + jamDetik(Date.now()); elSimpan.classList.remove("gagal"); return; }
      sedangKirim = true;
      elSimpan.textContent = "Menyimpan..."; elSimpan.classList.remove("gagal");
      try {
        for (const id of ids) {
          const j = antre[id];
          await rpc("mhs_jawab", { p_token: TOKEN, p_device: DEV, p_soal: id, p_t1: j.t1, p_t2: j.t2, p_t3: j.t3, p_ragu: !!j.ragu, p_urut: j.urut });
          if (antre[id] && antre[id].urut === j.urut) delete antre[id];
          simpanAntre();
        }
        elSimpan.textContent = "Tersimpan " + jamDetik(Date.now());
      } catch (e) {
        elSimpan.textContent = "⚠ Gagal menyimpan " + Object.keys(antre).length + " jawaban — dicoba lagi otomatis";
        elSimpan.classList.add("gagal");
        if (!selesai && /selesai|habis|perangkat lain|tidak dapat dijawab/i.test(e.message)) { toast(e.message, "galat"); periksaStatus(); }
      } finally { sedangKirim = false; }
      if (Object.keys(antre).length && navigator.onLine) setTimeout(kirimAntre, 3000);
    }

    async function lanjutBerurutan() {
      const q = soal[idx];
      if (!lengkap(q.id) && !(await tanya("Soal ini belum lengkap", "Setelah lanjut, Anda tidak dapat kembali ke soal ini. Tetap lanjut?", "Tetap lanjut"))) return;
      await kirimAntre();
      if (Object.keys(antre).length) return toast("Jawaban belum terkirim. Periksa koneksi lalu coba lagi.", "galat");
      try {
        const r = await rpc("mhs_lanjut", { p_token: TOKEN, p_device: DEV });
        terima(r); data = r; soal = r.soal; idx = 0;
        soal.forEach(x => jwb[x.id] = Object.assign({ t1: null, t2: null, t3: null, ragu: false }, x.jawab));
        gambarSoal();
      } catch (e) { toast("Tidak dapat memuat soal berikutnya: " + e.message, "galat"); }
    }

    // ---------- pengiriman akhir ----------
    function konfirmasiKirim() {
      const kosong = berurutan ? (lengkap(soal[idx].id) ? 0 : 1) : soal.filter(q => !lengkap(q.id)).length;
      const ragu = berurutan ? 0 : soal.filter(q => jwb[q.id].ragu).length;
      const m = h("div.modal-latar", h("div.modal", { role: "dialog", "aria-modal": "true" },
        h("h2", "Kirim jawaban sekarang?"),
        kosong ? h("p", h("span.lencana.kuning", kosong + " soal belum lengkap"), " Soal yang belum lengkap dinilai tidak dijawab.") : h("p", "Semua soal sudah terisi lengkap."),
        ragu ? h("p", h("span.lencana", ragu + " soal ditandai ragu-ragu")) : null,
        h("p.redup", "Setelah dikirim, jawaban tidak dapat diubah."),
        h("div.baris.akhir", h("button", { onclick: () => m.remove() }, "Periksa lagi"), h("button.bahaya", { onclick: () => { m.remove(); kirimAkhir("manual"); } }, "Ya, kirim"))));
      document.body.append(m);
    }

    async function kirimAkhir(alasan) {
      if (selesai) return;
      selesai = true;
      const layar = h("div.peringatan-layar", { style: { background: "rgba(31,78,121,.95)" } }, h("h2", alasan === "waktu" ? "Waktu habis" : "Mengirim jawaban..."), h("p", "Mohon tunggu, jangan tutup halaman."));
      document.body.append(layar);
      const batasCoba = Date.now() + 2 * 60 * 1000;
      let ulangAntre = 0;
      while (true) {
        try {
          if (!navigator.onLine) throw new Error("koneksi");
          await kirimAntre();
          if (Object.keys(antre).length && ulangAntre++ < 3) throw new Error("koneksi");
          const r = await rpc("mhs_kirim", { p_token: TOKEN, p_device: DEV });
          bersihkan(); layar.remove();
          info.status = "selesai"; return layarHasil(r);
        } catch (e) {
          if (!/koneksi/i.test(e.message)) { bersihkan(); layar.remove(); return periksaStatus(true); }
          if (Date.now() > batasCoba) {
            layar.replaceChildren(h("h2", "Belum tersambung ke server"), h("p", "Jawaban tersimpan di perangkat ini. Jangan hapus data peramban. Sambungkan internet lalu tekan tombol di bawah. Jika masa tenggang terlewati, jawaban yang sudah tersimpan di server tetap dinilai."),
              h("button.utama", { onclick: () => { layar.remove(); selesai = false; kirimAkhir(alasan); } }, "Coba kirim lagi"));
            return;
          }
          layar.querySelector("p").textContent = "Koneksi terputus. Mencoba lagi... jawaban aman di perangkat ini.";
          await new Promise(r => setTimeout(r, 4000));
        }
      }
    }

    function bersihkan() {
      henti(); lepasPengawas();
      try { if (adaLayarPenuh()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {}
    }

    async function periksaStatus(paksa) {
      try { terima(await rpc("mhs_detak", { p_token: TOKEN, p_device: DEV, p_rtt: null })); } catch (e) { return; }
      if (info.status !== "aktif" || paksa) { bersihkan(); selesai = true; arahkan(); }
    }

    // ---------- waktu & detak ----------
    function tik() {
      const sisa = (info.batas_at - sekarang()) / 1000;
      if (!isFinite(sisa) || info.batas_at > 4e12) { elWaktu.textContent = "∞"; return; }
      elWaktu.textContent = durasi(sisa);
      elWaktu.classList.toggle("genting", sisa <= 300);
      if (sisa <= 300 && sisa > 299) toast("Sisa waktu 5 menit.");
      if (sisa <= 0 && !selesai) kirimAkhir("waktu");
    }
    let rttTerakhir = null;
    async function kirimDetak() {
      const t0 = performance.now();
      try {
        const r = await rpc("mhs_detak", { p_token: TOKEN, p_device: DEV, p_rtt: rttTerakhir, p_posisi: berurutan ? data.posisi : idx });
        rttTerakhir = Math.round(performance.now() - t0);
        terima(r);
        elPel.textContent = "Pelanggaran " + info.pelanggaran + "/" + info.ambang;
        elPel.className = "lencana" + (info.pelanggaran ? " kuning" : "");
        if (info.status !== "aktif" && !selesai) { selesai = true; bersihkan(); arahkan(); }
        kirimAntre(); kirimKejadian();
      } catch (e) {}
    }
    pengatur.push(setInterval(tik, 1000));
    pengatur.push(setInterval(kirimDetak, 15000));
    pengatur.push(setInterval(() => { if (Object.keys(antre).length) kirimAntre(); }, 5000));

    // ---------- pengawasan (proctoring) ----------
    let pergiSejak = null, jenisPergi = null, peringatanEl = null;
    function catat(jenis, lamaDetik, mulai) {
      antreKejadian.push({ jenis, lama: lamaDetik, soal: soal[idx] && soal[idx].id, mulai: mulai || Date.now() });
      simpanKejadian(); kirimKejadian();
    }
    let kirimKejadianJalan = false;
    async function kirimKejadian() {
      if (kirimKejadianJalan || !antreKejadian.length) return;
      kirimKejadianJalan = true;
      try {
        while (antreKejadian.length) {
          const k = antreKejadian[0];
          const r = await rpc("mhs_kejadian", { p_token: TOKEN, p_device: DEV, p_jenis: k.jenis, p_lama: k.lama, p_soal: k.soal, p_mulai: k.mulai });
          antreKejadian.shift(); simpanKejadian();
          const sebelum = info.pelanggaran;
          info.pelanggaran = r.pelanggaran;
          elPel.textContent = "Pelanggaran " + r.pelanggaran + "/" + r.ambang;
          elPel.className = "lencana" + (r.pelanggaran ? " kuning" : "");
          if (r.pelanggaran > sebelum) tampilPeringatan(k, r);
          if (r.selesai && !selesai) {
            selesai = true; bersihkan();
            terima(await rpc("mhs_detak", { p_token: TOKEN, p_device: DEV, p_rtt: null }));
            return layarHasil(null, "Batas pelanggaran tercapai. Jawaban Anda telah dikirim otomatis.");
          }
        }
      } catch (e) {} finally { kirimKejadianJalan = false; }
    }
    function tampilPeringatan(k, r) {
      if (peringatanEl) peringatanEl.remove();
      peringatanEl = h("div.peringatan-layar", { role: "alertdialog" },
        h("h2", "Pelanggaran " + r.pelanggaran + " dari " + r.ambang),
        h("p", (JENIS[k.jenis] || k.jenis) + " selama " + k.lama + " detik tercatat."),
        h("p", r.ambang - r.pelanggaran > 0 ? "Sisa " + (r.ambang - r.pelanggaran) + " kali lagi sebelum jawaban dikirim otomatis." : ""),
        h("button", { onclick: () => { peringatanEl.remove(); peringatanEl = null; if (dukungLayarPenuh && !adaLayarPenuh()) masukLayarPenuh(); } }, dukungLayarPenuh ? "Saya mengerti, kembali ke layar penuh" : "Saya mengerti"));
      document.body.append(peringatanEl);
    }
    function pergi(jenis) { if (selesai || pergiSejak) return; pergiSejak = Date.now(); jenisPergi = jenis; }
    function kembali() {
      if (!pergiSejak || selesai) return;
      if (document.hidden || !document.hasFocus()) return;
      const lama = Math.round((Date.now() - pergiSejak) / 1000);
      const mulai = pergiSejak; pergiSejak = null;
      if (lama >= 2) catat(jenisPergi, lama, mulai);
    }
    const onVis = () => document.hidden ? pergi("tab") : kembali();
    const onBlur = () => pergi("tab");
    const onFocus = () => kembali();
    let layarPenuhSejak = null, tutupLayar = null;
    const onFs = () => {
      if (selesai || !dukungLayarPenuh) return;
      if (!adaLayarPenuh()) {
        layarPenuhSejak = Date.now();
        tutupLayar = h("div.peringatan-layar", h("h2", "Anda keluar dari layar penuh"), h("p", "Kembali dalam 2 detik agar tidak dihitung pelanggaran."),
          h("button", { onclick: masukLayarPenuh }, "Kembali ke layar penuh"));
        document.body.append(tutupLayar);
      } else if (layarPenuhSejak) {
        const lama = Math.round((Date.now() - layarPenuhSejak) / 1000), mulai = layarPenuhSejak; layarPenuhSejak = null;
        if (tutupLayar) { tutupLayar.remove(); tutupLayar = null; }
        if (lama >= 2 && !document.hidden) catat("layar_penuh", lama, mulai);
      }
    };
    const blokir = (jenis) => (ev) => { ev.preventDefault(); catat(jenis, 0); toast(jenis === "salin" ? "Menyalin dan menempel tidak diizinkan." : "Klik kanan tidak diizinkan."); };
    const onCopy = blokir("salin"), onCtx = blokir("klik_kanan");
    let offlineSejak = null;
    const onOff = () => { offlineSejak = Date.now(); aturBanner(); };
    const onOn = () => { aturBanner(); if (offlineSejak) { catat("offline", Math.round((Date.now() - offlineSejak) / 1000), offlineSejak); offlineSejak = null; } kirimAntre(); kirimDetak(); };
    const onUnload = (ev) => { if (!selesai) { ev.preventDefault(); ev.returnValue = ""; } };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur); window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFs); document.addEventListener("webkitfullscreenchange", onFs);
    ["copy", "cut", "paste"].forEach(e => document.addEventListener(e, onCopy));
    document.addEventListener("contextmenu", onCtx);
    window.addEventListener("offline", onOff); window.addEventListener("online", onOn);
    window.addEventListener("beforeunload", onUnload);
    function lepasPengawas() {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("webkitfullscreenchange", onFs);
      ["copy", "cut", "paste"].forEach(e => document.removeEventListener(e, onCopy));
      document.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("offline", onOff); window.removeEventListener("online", onOn);
      window.removeEventListener("beforeunload", onUnload);
      if (tutupLayar) tutupLayar.remove(); if (peringatanEl) peringatanEl.remove();
    }

    gambarSoal(); tik(); kirimAntre(); kirimKejadian();
    if (dukungLayarPenuh && !adaLayarPenuh()) setTimeout(() => { if (!adaLayarPenuh() && !selesai) onFs(); }, 800);
  }

  // ------------------------------------------------------------------
  // 5. Hasil
  // ------------------------------------------------------------------
  async function layarHasil(r, catatan) {
    henti();
    if (!r) {
      try { r = await rpc("mhs_hasil", { p_token: TOKEN }); }
      catch (e) { return tampil(kepala(), h("main.isi.sempit", h("div.kartu.bahaya", h("p", e.message), h("button", { onclick: () => layarHasil() }, "Coba lagi")))); }
    }
    try { localStorage.removeItem(KUNCI_ANTRE); localStorage.removeItem(KUNCI_ANTRE + "_k"); } catch (e) {}
    const KAT = ["Paham konsep", "Miskonsepsi (false positive)", "Miskonsepsi (false negative)", "Miskonsepsi", "Tidak paham (tebakan beruntung)", "Tidak paham konsep", "Tidak dijawab"];
    const warnaKat = k => !k ? "" : k.startsWith("Paham") ? "hijau" : k.startsWith("Miskonsepsi") ? "merah" : k.startsWith("Tidak paham") ? "kuning" : "";
    const CARA = { manual: "dikirim sendiri", waktu: "waktu habis", pelanggaran: "batas pelanggaran tercapai", ditutup: "sesi ditutup dosen" };
    const isi = h("main.isi.sedang");
    isi.append(h("div.kartu.pusat",
      catatan ? h("div.kartu.peringatan", catatan) : null,
      h("p.redup", r.sesi_nama + " · paket " + r.paket),
      h("div.nilai-besar", r.nilai == null ? "-" : String(r.nilai).replace(".", ",")),
      h("p", "Nilai Anda (0–100)"),
      h("p.kecil.redup", "Kode bukti: ", h("strong", r.kode_bukti || "-"), " · selesai " + jam(r.selesai_at) + " (" + (CARA[r.cara_selesai] || r.cara_selesai) + ")"),
      h("p.kecil.redup", "Simpan kode bukti ini. Dosen dapat mencocokkannya dengan rekap.")));

    if (r.ringkas) {
      const tb = h("tbody");
      KAT.forEach(k => { const n = r.ringkas[k] || 0; if (n) tb.append(h("tr", h("td", h("span.lencana." + (warnaKat(k) || "x"), k)), h("td", n + " soal"))); });
      isi.append(h("div.kartu", h("h2", "Profil pemahaman"), h("table.data", tb),
        r.konsep_ulang && r.konsep_ulang.length ? h("p.mt", h("strong", "Konsep yang perlu dipelajari ulang: "), r.konsep_ulang.join(", ")) : h("p.mt", "Tidak ada konsep yang perlu diulang. Bagus!")));
    }
    if (r.per_soal) {
      const k = h("div.kartu", h("h2", r.tingkat >= 4 ? "Pembahasan per soal" : "Hasil per soal"));
      r.per_soal.forEach(p => {
        const blok = h("div.tier", h("div.baris", h("strong", "Soal " + p.no), p.konsep ? h("span.redup.kecil", p.konsep) : null, h("span", { style: { marginLeft: "auto" } }), h("span", { class: "lencana " + warnaKat(p.kategori) }, p.kategori || "-")));
        if (p.soal) blok.append(T("p.mt", p.soal));
        if (p.gambar) { const g = typeof p.gambar === "string" ? { file: p.gambar } : p.gambar; blok.append(h("figure.gambar-soal", h("img", { src: urlGambar(r.bank_id, g.file), alt: g.alt || "Gambar soal" }))); }
        if (p.kunci_t1) {
          blok.append(h("p.kecil", h("strong", "Jawaban Anda: "), p.pilihan_t1 ? p.pilihan_t1.teks : "(kosong)", " — ", h("strong", "alasan: "), p.pilihan_t2 ? p.pilihan_t2.teks : "(kosong)"));
          blok.append(h("p.kecil", h("strong", "Kunci: "), p.kunci_t1.teks, " — ", h("strong", "alasan: "), p.kunci_t2.teks));
        }
        if (p.feedback) blok.append(h("div.kartu.peringatan.kecil", "Tentang alasan Anda: ", p.feedback));
        if (p.pembahasan) blok.append(T("div.kartu.kecil", p.pembahasan, { style: { background: "var(--utama-muda)" } }));
        k.append(blok);
      });
      isi.append(k);
    }
    if (!r.sesi_ditutup && r.tingkat < 4) isi.append(h("div.kartu.kecil", "Pembahasan lengkap dapat tersedia setelah dosen menutup sesi. ", h("button.kecil", { onclick: () => layarHasil() }, "Muat ulang hasil")));
    if (r.riwayat && r.riwayat.length) {
      const tb = h("tbody");
      r.riwayat.forEach(x => tb.append(h("tr", h("td", jamDetik(x.mulai_at)), h("td", JENIS[x.jenis] || x.jenis), h("td", x.lama_detik + " dtk"), h("td", x.dihitung ? h("span.lencana.merah", "Dihitung") : h("span.lencana", "Tidak dihitung")))));
      isi.append(h("div.kartu", h("h3", "Catatan kejadian selama ujian"), h("div.gulir", h("table.data", h("thead", h("tr", h("th", "Waktu"), h("th", "Jenis"), h("th", "Lama"), h("th", "Status"))), tb))));
    }
    isi.append(h("div.baris.mt.tidak-cetak", h("button", { onclick: () => window.print() }, "Cetak / simpan PDF"),
      h("a.tombol", { href: "index.html", onclick: () => { if (!sesiLokal.uji) try { localStorage.removeItem("cbt_attempt"); } catch (e) {} } }, "Keluar")));
    tampil(kepala(), isi);
  }

  mulaiAlur();
})();
