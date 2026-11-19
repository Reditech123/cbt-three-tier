// Halaman dosen: masuk, bank soal, kelas & peserta, sesi ujian, izin, pantauan, rekap.
(function () {
  const { sb, h, T, rpc, toast, pesanGalat, urlGambar, jam, jamDetik, tanggalJam, durasi, JENIS, C, cekKonfigurasi } = CBT;
  const X = window.CBTX;
  const app = document.getElementById("app");
  if (!cekKonfigurasi(app)) return;

  let pengguna = null;
  let pengatur = [];
  const henti = () => { pengatur.forEach(clearInterval); pengatur = []; };

  async function q(promise) { const { data, error } = await promise; if (error) throw new Error(pesanGalat(error)); return data; }
  const aman = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, "galat"); } };

  function modal(judul, isi, tombol) {
    const m = h("div.modal-latar", h("div.modal", { role: "dialog", "aria-modal": "true" }, h("h2", judul), isi,
      h("div.baris.akhir.mt", tombol || h("button", { onclick: () => m.remove() }, "Tutup"))));
    document.body.append(m);
    return m;
  }
  function yakin(judul, isi, ya, kelas) {
    return new Promise(res => {
      const m = modal(judul, h("p", isi), [h("button", { onclick: () => { m.remove(); res(false); } }, "Batal"),
        h("button." + (kelas || "utama"), { onclick: () => { m.remove(); res(true); } }, ya)]);
    });
  }

  // ------------------------------------------------------------------
  // Masuk / daftar
  // ------------------------------------------------------------------
  function layarMasuk(mode) {
    henti();
    mode = mode || "masuk";
    const email = h("input", { type: "email", id: "email", autocomplete: "username", required: true });
    const sandi = h("input", { type: "password", id: "sandi", autocomplete: mode === "masuk" ? "current-password" : "new-password", required: true, minlength: 8 });
    const nama = h("input", { type: "text", id: "nama" });
    const galat = h("div.kartu.bahaya.mt.tersembunyi", { role: "alert" });
    const btn = h("button.utama.penuh.mt", { type: "submit" }, mode === "masuk" ? "Masuk" : "Daftar");
    const form = h("form", { novalidate: true },
      mode === "daftar" ? [h("label", { for: "nama" }, "Nama lengkap"), nama] : null,
      h("label", { for: "email" }, "Email"), email,
      h("label", { for: "sandi" }, "Kata sandi ", mode === "daftar" ? h("span.bantu", "(minimal 8 karakter)") : null), sandi,
      galat, btn);
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); galat.classList.add("tersembunyi"); btn.disabled = true;
      try {
        if (mode === "masuk") {
          await q(sb.auth.signInWithPassword({ email: email.value.trim(), password: sandi.value }));
        } else {
          if (sandi.value.length < 8) throw new Error("Kata sandi minimal 8 karakter.");
          const d = await q(sb.auth.signUp({ email: email.value.trim(), password: sandi.value, options: { data: { nama: nama.value.trim() }, emailRedirectTo: location.href.split("#")[0] } }));
          if (!d.session) { btn.disabled = false; return modal("Periksa email Anda", h("p", "Tautan konfirmasi telah dikirim ke " + email.value + ". Klik tautan itu, lalu kembali ke halaman ini untuk masuk.")); }
        }
      } catch (e) { galat.textContent = e.message === "Invalid login credentials" ? "Email atau kata sandi salah." : e.message; galat.classList.remove("tersembunyi"); btn.disabled = false; }
    });
    app.replaceChildren(
      h("header.kepala", h("div", h("div.judul", "CBT Three-Tier Test · Dosen"), h("div.sub", C.NAMA_INSTITUSI || "")), h("div.kanan", h("a.tombol", { href: "index.html", style: { background: "rgba(255,255,255,.15)", color: "#fff" } }, "Halaman mahasiswa"))),
      h("main.isi.sempit", h("div.kartu", h("h1", mode === "masuk" ? "Masuk dosen" : "Daftar akun dosen"), form,
        C.IZINKAN_DAFTAR_DOSEN ? h("p.kecil.mt", mode === "masuk" ? ["Belum punya akun? ", h("a", { href: "#", onclick: e => { e.preventDefault(); layarMasuk("daftar"); } }, "Daftar")] : ["Sudah punya akun? ", h("a", { href: "#", onclick: e => { e.preventDefault(); layarMasuk("masuk"); } }, "Masuk")]) : null,
        mode === "masuk" ? h("p.kecil", h("a", { href: "#", onclick: aman(async e => { e.preventDefault(); if (!email.value) return toast("Isi email terlebih dahulu.", "galat"); await q(sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.href.split("#")[0] })); toast("Tautan atur ulang kata sandi telah dikirim ke email.", "sukses"); }) }, "Lupa kata sandi?")) : null)));
  }

  // ------------------------------------------------------------------
  // Kerangka halaman
  // ------------------------------------------------------------------
  function bingkai(aktif, ...isi) {
    const nav = h("nav.tab-nav", { "aria-label": "Menu dosen" },
      [["sesi", "Sesi ujian"], ["bank", "Bank soal"], ["kelas", "Kelas & peserta"]].map(([k, t]) =>
        h("button" + (aktif === k ? ".aktif" : ""), { onclick: () => location.hash = k }, t)));
    const nama = (pengguna.user_metadata && pengguna.user_metadata.nama) || pengguna.email;
    app.replaceChildren(
      h("header.kepala", h("div", h("div.judul", "CBT Three-Tier Test · Dosen"), h("div.sub", C.NAMA_INSTITUSI || "")),
        h("div.kanan", h("span", nama), h("button.kecil", { onclick: aman(async () => { await sb.auth.signOut(); }) }, "Keluar"))),
      h("main.isi", nav, ...isi));
  }

  async function rute() {
    henti();
    if (!pengguna) return layarMasuk();
    const [hal, id] = (location.hash.slice(1) || "sesi").split("/");
    try {
      if (hal === "sesi" && id) return await layarDetailSesi(id);
      if (hal === "sesi") return await layarDaftarSesi();
      if (hal === "buat-sesi") return await layarBuatSesi();
      if (hal === "bank" && id) return await layarDetailBank(id);
      if (hal === "bank") return await layarBank();
      if (hal === "kelas" && id) return await layarDetailKelas(id);
      if (hal === "kelas") return await layarKelas();
      location.hash = "sesi";
    } catch (e) { bingkai("", h("div.kartu.bahaya", h("p", e.message), h("button", { onclick: rute }, "Coba lagi"))); }
  }
  window.addEventListener("hashchange", rute);

  // ------------------------------------------------------------------
  // Bank soal
  // ------------------------------------------------------------------
  async function layarBank() {
    const daftar = await q(sb.from("bank_soal").select("id, materi, jumlah_paket, jumlah_soal, dibuat_at").order("dibuat_at", { ascending: false }));
    const fileIn = h("input", { type: "file", accept: ".json,.xlsx,.xls", id: "fileBank" });
    const hasil = h("div");
    fileIn.addEventListener("change", aman(async () => {
      const f = fileIn.files[0]; if (!f) return;
      let data, galatParse = [];
      if (/\.json$/i.test(f.name)) {
        try { data = JSON.parse(await f.text()); } catch (e) { return hasil.replaceChildren(h("div.kartu.bahaya", "File JSON tidak dapat dibaca: " + e.message)); }
      } else {
        const r = X.excelKeJson(await f.arrayBuffer(), f.name); data = r.data; galatParse = r.galat;
      }
      const v = X.validasi(data);
      const galat = galatParse.concat(v.galat);
      const jml = (data.paket || []).map(p => p.kode + ": " + ((p.soal || []).length) + " soal").join(" · ");
      const gb = X.daftarGambar(data);
      const materi = h("input", { type: "text", value: data.materi || "" });
      hasil.replaceChildren(h("div.kartu" + (galat.length ? ".bahaya" : ".sukses"),
        h("h3", galat.length ? "Ada " + galat.length + " kesalahan yang harus diperbaiki" : "Bank soal valid"),
        h("p", jml), gb.length ? h("p.kecil", "Gambar yang dipakai: " + gb.join(", ") + ". Unggah setelah bank disimpan.") : null,
        galat.length ? h("ul", galat.slice(0, 50).map(g => h("li", g))) : null,
        v.peringatan.length ? h("details", h("summary", v.peringatan.length + " catatan (tidak menghalangi)"), h("ul.kecil", v.peringatan.map(g => h("li", g)))) : null,
        !galat.length ? [h("label", "Nama materi"), materi, h("button.utama.mt", { onclick: aman(async () => {
          data.materi = materi.value.trim() || data.materi;
          const r = await q(sb.from("bank_soal").insert({ materi: data.materi, isi: data, jumlah_paket: data.paket.length, jumlah_soal: data.paket[0].soal.length }).select("id").single());
          toast("Bank soal tersimpan.", "sukses"); location.hash = "bank/" + r.id;
        }) }, "Simpan bank soal")] : null));
    }));
    bingkai("bank",
      h("div.kartu", h("h2", "Unggah bank soal"),
        h("p.redup", "Gunakan template Excel (paling mudah) atau file JSON. Sistem memeriksa kunci, jumlah pilihan, dan keseimbangan antarpaket sebelum disimpan."),
        h("div.baris", h("button", { onclick: () => X.unduhTemplate() }, "Unduh template Excel kosong"),
          h("button", { onclick: aman(async () => X.unduhTemplate(await (await fetch("contoh/contoh-soal.json")).json())) }, "Unduh contoh Excel berisi soal"),
          h("a.tombol", { href: "contoh/contoh-soal.json", download: "contoh-soal.json" }, "Unduh contoh JSON")),
        h("label", { for: "fileBank" }, "Pilih file (.xlsx atau .json)"), fileIn, hasil),
      h("div.kartu", h("h2", "Bank soal saya"),
        daftar.length ? h("div.gulir", h("table.data", h("thead", h("tr", h("th", "Materi"), h("th", "Paket"), h("th", "Soal/paket"), h("th", "Dibuat"), h("th", ""))),
          h("tbody", daftar.map(b => h("tr", h("td", b.materi), h("td", b.jumlah_paket), h("td", b.jumlah_soal), h("td", tanggalJam(new Date(b.dibuat_at).getTime())),
            h("td", h("button.kecil", { onclick: () => location.hash = "bank/" + b.id }, "Buka"))))))) : h("p.kosong", "Belum ada bank soal.")));
  }

  async function kompres(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size < 300 * 1024) return file;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const skala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * skala); c.height = Math.round(img.height * skala);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, file.type, 0.85));
    return blob && blob.size < file.size ? blob : file;
  }

  async function layarDetailBank(id) {
    const b = await q(sb.from("bank_soal").select("*").eq("id", id).single());
    const d = b.isi;
    const perlu = X.daftarGambar(d);
    let ada = [];
    try { ada = (await q(sb.storage.from("gambar").list(id, { limit: 1000 }))).map(x => x.name); } catch (e) {}
    const kotakGambar = h("div");
    const gambarUlang = () => {
      kotakGambar.replaceChildren(perlu.length ? h("table.data", h("tbody", perlu.map(f => h("tr", h("td", f), h("td", ada.includes(f) ? h("span.lencana.hijau", "Terunggah") : h("span.lencana.merah", "Belum ada")),
        h("td", ada.includes(f) ? h("a", { href: urlGambar(id, f), target: "_blank" }, "Lihat") : ""))))) : h("p.redup", "Bank soal ini tidak memakai gambar."));
    };
    gambarUlang();
    const fIn = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml", multiple: true });
    fIn.addEventListener("change", aman(async () => {
      for (const f of fIn.files) {
        if (perlu.length && !perlu.includes(f.name)) toast("Catatan: " + f.name + " tidak dipakai di soal mana pun (nama file harus sama persis).");
        const blob = await kompres(f);
        await q(sb.storage.from("gambar").upload(id + "/" + f.name, blob, { upsert: true, contentType: f.type, cacheControl: "3600" }));
        if (!ada.includes(f.name)) ada.push(f.name);
        gambarUlang();
      }
      toast("Gambar terunggah.", "sukses"); fIn.value = "";
    }));

    const pratinjau = h("div");
    const paketPilih = h("select", d.paket.map(p => h("option", { value: p.kode }, "Paket " + p.kode)));
    const gambarPratinjau = () => {
      const p = d.paket.find(x => x.kode === paketPilih.value);
      pratinjau.replaceChildren(...p.soal.map((s, i) => h("div.tier",
        h("div.baris", h("strong", (i + 1) + ". [" + s.id + "]"), h("span.redup.kecil", s.konsep || "")),
        s.gambar ? h("figure.gambar-soal", h("img", { src: urlGambar(id, typeof s.gambar === "string" ? s.gambar : s.gambar.file), alt: s.gambar.alt || "" })) : null,
        T("p", s.tier1.teks),
        h("ol", { type: "A" }, s.tier1.opsi.map((o, k) => T("li", (typeof o === "object" ? o.teks : o) + (k === s.tier1.kunci ? "  ✔" : ""), { style: k === s.tier1.kunci ? { fontWeight: 700 } : {} }))),
        h("p.kecil.redup", "Alasan:"),
        h("ol", { type: "A" }, s.tier2.opsi.map((o, k) => T("li", (typeof o === "object" ? o.teks : o) + (k === s.tier2.kunci ? "  ✔" : ""), { style: k === s.tier2.kunci ? { fontWeight: 700 } : {} }))))));
    };
    paketPilih.addEventListener("change", gambarPratinjau);
    gambarPratinjau();

    bingkai("bank",
      h("p", h("a", { href: "#bank" }, "← Bank soal")),
      h("div.kartu", h("h2", b.materi), h("p.redup", d.paket.length + " paket · " + d.paket[0].soal.length + " soal per paket"),
        h("div.baris", h("button", { onclick: () => X.unduhTemplate(d) }, "Unduh sebagai Excel"),
          h("button", { onclick: () => { const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })), download: b.materi + ".json" }); a.click(); } }, "Unduh JSON"),
          h("button.bahaya", { onclick: aman(async () => {
            if (!(await yakin("Hapus bank soal?", "Bank soal yang sudah dipakai sesi ujian tidak dapat dihapus.", "Hapus", "bahaya"))) return;
            await q(sb.from("bank_soal").delete().eq("id", id)); toast("Bank soal dihapus."); location.hash = "bank";
          }) }, "Hapus"))),
      h("div.kartu", h("h3", "Gambar soal"), h("p.redup.kecil", "Unggah file dengan nama yang sama persis seperti di kolom gambar. Gambar besar diperkecil otomatis agar ringan dibuka di HP."), kotakGambar, h("label", "Pilih gambar (boleh banyak sekaligus)"), fIn),
      h("div.kartu", h("div.baris", h("h3", { style: { margin: 0 } }, "Pratinjau soal & kunci"), paketPilih), pratinjau));
  }

  // ------------------------------------------------------------------
  // Kelas & peserta
  // ------------------------------------------------------------------
  async function layarKelas() {
    const daftar = await q(sb.from("kelas").select("id, nama, dibuat_at, peserta(count)").order("dibuat_at", { ascending: false }));
    const nama = h("input", { type: "text", placeholder: "mis. PGMI 3A — Konsep Dasar IPA Fisika" });
    bingkai("kelas",
      h("div.kartu", h("h2", "Buat kelas"), h("div.baris", h("div", { style: { flex: 1 } }, nama),
        h("button.utama", { onclick: aman(async () => { if (!nama.value.trim()) return; const r = await q(sb.from("kelas").insert({ nama: nama.value.trim() }).select("id").single()); location.hash = "kelas/" + r.id; }) }, "Buat"))),
      h("div.kartu", h("h2", "Kelas saya"), daftar.length ? h("table.data", h("tbody", daftar.map(k => h("tr", h("td", k.nama), h("td", (k.peserta[0] ? k.peserta[0].count : 0) + " peserta"),
        h("td", h("button.kecil", { onclick: () => location.hash = "kelas/" + k.id }, "Buka")))))) : h("p.kosong", "Belum ada kelas.")));
  }

  async function layarDetailKelas(id) {
    const k = await q(sb.from("kelas").select("*").eq("id", id).single());
    const ps = await q(sb.from("peserta").select("id, nim, nama").eq("kelas_id", id).order("nim"));
    const tempel = h("textarea", { placeholder: "Satu baris satu mahasiswa: NIM [tab atau koma] Nama\n231101001\tAhmad Fauzi\n231101002, Siti Aminah" });
    const fIn = h("input", { type: "file", accept: ".xlsx,.xls,.csv" });
    async function tambah(data) {
      if (!data.length) return toast("Tidak ada data peserta yang terbaca.", "galat");
      const r = await rpc("dosen_tambah_peserta", { p_kelas: id, p_data: data });
      tampilPin(r);
    }
    function tampilPin(r) {
      const m = modal("PIN peserta (" + r.length + ")", [h("p.kartu.peringatan.kecil", "PIN hanya ditampilkan sekali dan disimpan terenkripsi. Unduh sekarang lalu bagikan ke masing-masing mahasiswa secara pribadi."),
        h("div.gulir", { style: { maxHeight: "40vh" } }, h("table.data", h("tbody", r.map(x => h("tr", h("td", x.o_nim), h("td", x.o_nama), h("td", h("strong", x.o_pin)))))))],
        [h("button.utama", { onclick: () => X.unduhPin(k.nama, r) }, "Unduh Excel PIN"), h("button", { onclick: () => { m.remove(); rute(); } }, "Selesai")]);
    }
    fIn.addEventListener("change", aman(async () => { const f = fIn.files[0]; if (f) await tambah(X.bacaPeserta(await f.arrayBuffer())); fIn.value = ""; }));
    bingkai("kelas",
      h("p", h("a", { href: "#kelas" }, "← Kelas")),
      h("div.kartu", h("h2", k.nama), h("p.redup", ps.length + " peserta"),
        h("div.baris",
          h("button.kecil", { onclick: aman(async () => {
            const baru = prompt("Nama kelas yang baru:", k.nama);
            if (!baru || !baru.trim() || baru.trim() === k.nama) return;
            await q(sb.from("kelas").update({ nama: baru.trim() }).eq("id", id));
            toast("Nama kelas diperbarui.", "sukses"); rute();
          }) }, "Ganti nama kelas"),
          h("button.kecil.bahaya", { onclick: aman(async () => {
            const dipakai = await q(sb.from("sesi_ujian").select("nama, status").eq("kelas_id", id));
            if (dipakai.length) {
              return modal("Kelas tidak dapat dihapus", [
                h("p", "Kelas ini masih dipakai oleh " + dipakai.length + " sesi ujian:"),
                h("ul", dipakai.map(s => h("li", s.nama + " (" + s.status + ")"))),
                h("p.kecil.redup", "Sesi berstatus draf dapat dihapus dulu di menu Sesi ujian. Sesi yang sudah aktif atau ditutup menyimpan nilai mahasiswa, sehingga kelasnya dikunci agar data nilai tidak hilang. Bila hanya ada kesalahan nama atau NIM, gunakan Ganti nama kelas atau perbaiki peserta satu per satu.")]);
            }
            if (!(await yakin("Hapus kelas " + k.nama + "?", "Kelas beserta " + ps.length + " peserta dan PIN-nya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.", "Hapus kelas", "bahaya"))) return;
            await q(sb.from("kelas").delete().eq("id", id));
            toast("Kelas dihapus.", "sukses"); location.hash = "kelas";
          }) }, "Hapus kelas"))),
      h("div.kartu", h("h3", "Tambah peserta"), h("p.redup.kecil", "Tempel dari Excel/SIAKAD atau unggah file Excel berkolom NIM dan Nama. NIM yang sudah ada akan diperbarui namanya dan dibuatkan PIN baru."),
        tempel, h("div.baris.mt", h("button.utama", { onclick: aman(async () => {
          const data = tempel.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const m = l.split(/\t|;|,/); return { nim: (m[0] || "").trim(), nama: m.slice(1).join(" ").trim() }; }).filter(x => x.nim && x.nama);
          await tambah(data); tempel.value = "";
        }) }, "Tambah & buat PIN")), h("label", "atau unggah Excel"), fIn),
      h("div.kartu", h("div.baris", h("h3", { style: { margin: 0 } }, "Daftar peserta"), h("span", { style: { marginLeft: "auto" } }),
        ps.length ? h("button.kecil", { onclick: aman(async () => { if (await yakin("Buat ulang semua PIN?", "PIN lama tidak berlaku lagi.", "Buat ulang")) await tambah(ps.map(p => ({ nim: p.nim, nama: p.nama }))); }) }, "Buat ulang semua PIN") : null),
        ps.length ? h("div.gulir", h("table.data", h("thead", h("tr", h("th", "NIM"), h("th", "Nama"), h("th", ""))), h("tbody", ps.map(p => h("tr", h("td", p.nim), h("td", p.nama),
          h("td.baris", h("button.kecil", { onclick: aman(async () => tambah([{ nim: p.nim, nama: p.nama }])) }, "PIN baru"),
            h("button.kecil", { onclick: aman(async () => { if (!(await yakin("Hapus " + p.nama + "?", "Data ujian peserta ini juga akan terhapus.", "Hapus", "bahaya"))) return; await q(sb.from("peserta").delete().eq("id", p.id)); rute(); }) }, "Hapus"))))))) : h("p.kosong", "Belum ada peserta.")));
  }

  // ------------------------------------------------------------------
  // Sesi ujian
  // ------------------------------------------------------------------
  const STATUS_SESI = { draf: ["", "Draf"], aktif: ["hijau", "Aktif"], ditutup: ["biru", "Ditutup"] };
  const lencanaSesi = s => h("span", { class: "lencana " + STATUS_SESI[s][0] }, STATUS_SESI[s][1]);

  async function layarDaftarSesi() {
    const daftar = await q(sb.from("sesi_ujian").select("id, nama, kode, status, buka_at, tutup_at, durasi_menit, kelas(nama), bank_soal(materi)").order("dibuat_at", { ascending: false }));
    bingkai("sesi",
      h("div.baris", { style: { marginBottom: "12px" } }, h("h2", { style: { margin: 0 } }, "Sesi ujian"), h("span", { style: { marginLeft: "auto" } }), h("button.utama", { onclick: () => location.hash = "buat-sesi" }, "+ Buat sesi")),
      daftar.length ? h("div.kartu.gulir", h("table.data", h("thead", h("tr", h("th", "Nama"), h("th", "Kode"), h("th", "Kelas"), h("th", "Jadwal"), h("th", "Status"), h("th", ""))),
        h("tbody", daftar.map(s => h("tr", h("td", h("strong", s.nama), h("div.kecil.redup", s.bank_soal ? s.bank_soal.materi : "")), h("td", h("code", s.kode)), h("td", s.kelas ? s.kelas.nama : ""),
          h("td.kecil", tanggalJam(new Date(s.buka_at).getTime()), h("br"), "s.d. " + tanggalJam(new Date(s.tutup_at).getTime()), h("br"), s.durasi_menit + " menit"),
          h("td", lencanaSesi(s.status)), h("td", h("button.kecil.utama", { onclick: () => location.hash = "sesi/" + s.id }, s.status === "ditutup" ? "Lihat hasil" : "Kelola / mulai"))))))) :
        h("div.kartu.kosong", h("p", "Belum ada sesi ujian."), h("p.kecil", "Urutan persiapan: 1) unggah bank soal, 2) buat kelas & PIN peserta, 3) buat sesi.")));
  }

  function keLokal(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }

  async function layarBuatSesi() {
    const bank = await q(sb.from("bank_soal").select("id, materi, isi").order("dibuat_at", { ascending: false }));
    const kelas = await q(sb.from("kelas").select("id, nama").order("dibuat_at", { ascending: false }));
    if (!bank.length || !kelas.length) return bingkai("sesi", h("div.kartu.peringatan", h("p", "Sebelum membuat sesi, siapkan dulu ", !bank.length ? h("a", { href: "#bank" }, "bank soal") : null, !bank.length && !kelas.length ? " dan " : "", !kelas.length ? h("a", { href: "#kelas" }, "kelas beserta peserta") : null, ".")));
    const f = {};
    const pil = (id, opsi, nilai) => { const s = h("select", { id }, opsi.map(([v, t]) => h("option", { value: v, selected: String(v) === String(nilai) }, t))); f[id] = s; return s; };
    const inp = (id, attrs) => (f[id] = h("input", Object.assign({ id }, attrs)));
    const kotakPaket = h("div.baris");
    const isiPaket = () => {
      const b = bank.find(x => x.id === f.bank.value);
      kotakPaket.replaceChildren(...b.isi.paket.map(p => h("label.baris", { style: { fontWeight: 400, margin: 0 } }, h("input", { type: "checkbox", value: p.kode, checked: true, class: "cekPaket" }), " Paket " + p.kode + " (" + p.soal.length + " soal)")));
    };
    const mulai = new Date(Date.now() + 3600e3); mulai.setMinutes(0, 0, 0);
    const form = h("div",
      h("label", { for: "nama" }, "Nama sesi"), inp("nama", { type: "text", placeholder: "mis. UTS Konsep Dasar IPA Fisika — PGMI 3A" }),
      h("div.grid2",
        h("div", h("label", { for: "bank" }, "Bank soal"), pil("bank", bank.map(b => [b.id, b.materi]))),
        h("div", h("label", { for: "kelas" }, "Kelas peserta"), pil("kelas", kelas.map(k => [k.id, k.nama])))),
      h("label", "Paket yang dipakai ", h("span.bantu", "(dibagikan merata dan acak ke mahasiswa)")), kotakPaket,
      h("div.grid3",
        h("div", h("label", { for: "buka" }, "Dibuka mulai"), inp("buka", { type: "datetime-local", value: keLokal(mulai) })),
        h("div", h("label", { for: "tutup" }, "Ditutup pada"), inp("tutup", { type: "datetime-local", value: keLokal(new Date(mulai.getTime() + 2 * 3600e3)) })),
        h("div", h("label", { for: "durasi" }, "Durasi (menit)"), inp("durasi", { type: "number", min: 1, max: 600, value: 60 }))),
      h("div.grid3",
        h("div", h("label", { for: "mode" }, "Cara mulai"), pil("mode", [["serentak", "Serentak (dosen menekan Mulai)"], ["per_orang", "Per orang (setelah diizinkan)"]], "serentak")),
        h("div", h("label", { for: "nav" }, "Navigasi soal"), pil("nav", [["bebas", "Bebas (bisa kembali)"], ["berurutan", "Berurutan (tidak bisa kembali)"]], "bebas")),
        h("div", h("label", { for: "ambang" }, "Batas pelanggaran"), inp("ambang", { type: "number", min: 1, max: 20, value: 3 }))),
      h("div.grid3",
        h("div", h("label", { for: "aturan" }, "Aturan skor"), pil("aturan", [["ketat", "Ketat: tingkat 1, 2 benar + yakin"], ["longgar", "Longgar: tingkat 1, 2 benar"]], "ketat")),
        h("div", h("label", { for: "fb1" }, "Umpan balik saat selesai"), pil("fb1", [[1, "1 · Nilai saja"], [2, "2 · Nilai + profil konsep"], [3, "3 · + hasil per soal"], [4, "4 · + kunci & pembahasan"]], 2)),
        h("div", h("label", { for: "fb2" }, "Umpan balik setelah sesi ditutup"), pil("fb2", [[1, "1 · Nilai saja"], [2, "2 · Nilai + profil konsep"], [3, "3 · + hasil per soal"], [4, "4 · + kunci & pembahasan"]], 4))),
      h("p.kecil.redup.mt", "Mode serentak: waktu semua peserta dihitung sejak Anda menekan Mulai. Mode per orang: waktu tiap peserta dihitung sejak ia menekan Mulai. Ujian selalu berhenti paling lambat pada jam tutup."),
      h("div.baris.akhir.mt", h("button", { onclick: () => location.hash = "sesi" }, "Batal"), h("button", { onclick: aman(() => simpan(false)) }, "Simpan sebagai draf"), h("button.hijau", { onclick: aman(() => simpan(true)) }, "Simpan & buka ujian sekarang")));
    f.bank.addEventListener("change", isiPaket);
    isiPaket();
    async function simpan(bukaSekarang) {
      const paket = [...kotakPaket.querySelectorAll(".cekPaket:checked")].map(x => x.value);
      if (!f.nama.value.trim()) throw new Error("Nama sesi wajib diisi.");
      if (!paket.length) throw new Error("Pilih minimal satu paket.");
      let buka = new Date(f.buka.value); const tutup = new Date(f.tutup.value);
      if (bukaSekarang && buka > new Date()) buka = new Date();
      if (!(tutup > buka)) throw new Error("Jam tutup harus setelah jam buka.");
      const dur = parseInt(f.durasi.value, 10);
      if ((tutup - buka) / 60000 < dur) toast("Catatan: rentang buka–tutup lebih pendek dari durasi; ujian akan berhenti di jam tutup.");
      const r = await q(sb.from("sesi_ujian").insert({ nama: f.nama.value.trim(), bank_soal_id: f.bank.value, kelas_id: f.kelas.value, paket,
        buka_at: buka.toISOString(), tutup_at: tutup.toISOString(), durasi_menit: dur, ambang: parseInt(f.ambang.value, 10),
        navigasi: f.nav.value, mode_mulai: f.mode.value, aturan_skor: f.aturan.value, fb_langsung: +f.fb1.value, fb_tutup: +f.fb2.value,
        status: bukaSekarang ? "aktif" : "draf" }).select("id").single());
      toast(bukaSekarang ? "Ujian dibuka. Bagikan kode, izinkan peserta, lalu tekan Mulai ujian sekarang." : "Sesi disimpan sebagai draf.", "sukses");
      location.hash = "sesi/" + r.id;
    }
    bingkai("sesi", h("p", h("a", { href: "#sesi" }, "← Sesi ujian")), h("div.kartu", h("h2", "Buat sesi ujian"), form));
  }

  // ------------------------------------------------------------------
  // Detail sesi: izin, pantauan, rekap
  // ------------------------------------------------------------------
  let subTab = "izin";
  async function layarDetailSesi(id) {
    let s = await q(sb.from("sesi_ujian").select("*, kelas(nama), bank_soal(materi, isi)").eq("id", id).single());
    const linkMhs = location.href.split("#")[0].replace(/dosen\.html.*$/, "") + "index.html?kode=" + s.kode;
    const isiTab = h("div");
    const kepalaSesi = h("div");
    let terakhir = null;

    function gambarKepala() {
      const tombol = [];
      if (s.status !== "ditutup") tombol.push(h("button", { onclick: aman(async () => {
        const t = await rpc("dosen_uji_coba", { p_sesi: id });
        window.open("ujian.html?uji=" + t, "_blank");
      }) }, "Uji coba sebagai mahasiswa"));
      // jadikan sesi aktif dan pastikan jam buka tidak di masa depan
      async function bukaSesi() {
        const upd = { status: "aktif" };
        if (new Date(s.buka_at) > new Date()) upd.buka_at = new Date().toISOString();
        await q(sb.from("sesi_ujian").update(upd).eq("id", id));
        Object.assign(s, upd);
      }
      const belumMulai = s.status !== "ditutup" && !(s.status === "aktif" && (s.mode_mulai === "per_orang" || s.dimulai_at));
      if (s.status === "draf") tombol.push(h("button", { onclick: aman(async () => {
        await bukaSesi(); toast("Ujian dibuka. Mahasiswa bisa masuk ke ruang tunggu.", "sukses"); gambarKepala(); muat();
      }) }, "Buka ruang tunggu (belum mulai)"));
      if (belumMulai) tombol.push(h("button.hijau", { style: { fontSize: "1.05rem", padding: "10px 20px" }, onclick: aman(async () => {
        const n = terakhir ? terakhir.peserta.filter(p => p.status === "diizinkan" && !p.uji).length : 0;
        const tunggu = terakhir ? terakhir.peserta.filter(p => p.status === "menunggu").length : 0;
        const sisaMenit = (new Date(s.tutup_at) - new Date()) / 60000;
        const pesan = s.mode_mulai === "serentak"
          ? "Waktu " + s.durasi_menit + " menit mulai berjalan sekarang untuk semua peserta. Sudah diizinkan: " + n + " orang" + (tunggu ? ", masih menunggu izin: " + tunggu + " orang (bisa diizinkan sesudahnya, waktunya mengikuti jam yang sama)." : ".")
          : "Sesi dibuka. Pada mode per orang, waktu setiap mahasiswa dihitung sejak ia menekan Mulai setelah Anda izinkan.";
        if (!(await yakin("Mulai ujian sekarang?", pesan + (sisaMenit < s.durasi_menit ? " Perhatian: jam tutup tinggal " + Math.max(0, Math.round(sisaMenit)) + " menit, lebih pendek dari durasi." : ""), "▶ Mulai sekarang"))) return;
        if (s.status === "draf" || new Date(s.buka_at) > new Date()) await bukaSesi();
        if (s.mode_mulai === "serentak") { await rpc("dosen_mulai", { p_sesi: id }); s.dimulai_at = new Date().toISOString(); }
        toast("Ujian dimulai.", "sukses"); subTab = "izin"; gambarKepala(); gambarTab(); muat();
      }) }, "▶ Mulai ujian sekarang"));
      if (s.status === "aktif") tombol.push(h("button.bahaya", { onclick: aman(async () => {
        if (!(await yakin("Tutup sesi?", "Semua ujian yang masih berjalan dikirim dan dinilai sekarang. Mahasiswa tidak bisa masuk lagi. Umpan balik tingkat 'setelah ditutup' menjadi terlihat.", "Tutup sesi", "bahaya"))) return;
        await rpc("dosen_tutup", { p_sesi: id }); s.status = "ditutup"; toast("Sesi ditutup.", "sukses"); gambarKepala(); muat();
      }) }, "Tutup sesi"));
      if (s.status === "draf") tombol.push(h("button", { onclick: () => location.hash = "sesi" }, "Kembali"), h("button.bahaya", { onclick: aman(async () => {
        if (!(await yakin("Hapus sesi draf?", "Sesi dan data uji cobanya dihapus.", "Hapus", "bahaya"))) return;
        await q(sb.from("sesi_ujian").delete().eq("id", id)); location.hash = "sesi";
      }) }, "Hapus"));
      kepalaSesi.replaceChildren(h("div.kartu",
        h("div.baris", h("div", h("h2", { style: { margin: 0 } }, s.nama), h("div.redup.kecil", (s.bank_soal ? s.bank_soal.materi : "") + " · " + (s.kelas ? s.kelas.nama : "") + " · paket " + s.paket.join(", "))),
          h("span", { style: { marginLeft: "auto" } }), lencanaSesi(s.status)),
        h("div.baris.mt", h("div", h("div.kecil.redup", "Kode ujian"), h("div", { style: { fontFamily: "Space Grotesk, monospace", fontSize: "2rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--utama)" } }, s.kode)),
          h("div.kecil", { style: { flex: 1, minWidth: "220px" } }, "Jadwal: " + tanggalJam(new Date(s.buka_at).getTime()) + " – " + jam(new Date(s.tutup_at).getTime()), h("br"),
            "Durasi " + s.durasi_menit + " menit · " + (s.mode_mulai === "serentak" ? "mulai serentak" : "mulai per orang") + " · navigasi " + s.navigasi + " · batas pelanggaran " + s.ambang + " · skor " + s.aturan_skor, h("br"),
            s.dimulai_at ? "Dimulai pukul " + jam(new Date(s.dimulai_at).getTime()) : "", h("br"),
            "Tautan mahasiswa: ", h("a", { href: linkMhs, target: "_blank" }, linkMhs), " ", h("button.kecil", { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(linkMhs); toast("Tautan disalin."); } }, "Salin"))),
        h("div.baris.mt", tombol),
        langkah()));
    }
    function langkah() {
      const mulai = s.mode_mulai === "per_orang" ? s.status !== "draf" : !!s.dimulai_at;
      const L = [["Uji coba (opsional)", s.status !== "draf"], ["Buka ruang tunggu", s.status !== "draf"], ["Izinkan peserta", mulai], ["Mulai ujian", mulai], ["Tutup sesi", s.status === "ditutup"]];
      const kini = L.findIndex(x => !x[1]);
      return h("div.mt.kecil", { style: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" } },
        L.map(([t, ok], i) => [i ? h("span.redup", "→") : null,
          h("span", { class: "lencana " + (ok ? "hijau" : i === kini ? "biru" : "") }, (ok ? "✓ " : (i + 1) + ". ") + t)]),
        s.mode_mulai === "per_orang" && s.status === "aktif" ? h("span.redup", " · Mode per orang: mahasiswa mulai sendiri setelah diizinkan.") : null);
    }

    const tabNav = h("nav.tab-nav");
    function gambarTab() {
      tabNav.replaceChildren(...[["izin", "Izinkan peserta"], ["pantau", "Pantauan langsung"], ["rekap", "Rekap nilai"]].map(([k, t]) => {
        const n = k === "izin" && terakhir ? terakhir.peserta.filter(p => p.status === "menunggu").length : 0;
        return h("button" + (subTab === k ? ".aktif" : ""), { onclick: () => { subTab = k; gambarTab(); tampilTab(); } }, t, n ? h("span.lencana.kuning", n) : null);
      }));
    }

    async function muat() {
      try { terakhir = await rpc("dosen_pantau", { p_sesi: id }); } catch (e) { return toast(e.message, "galat"); }
      gambarTab();
      if (subTab !== "rekap") tampilTab();
    }

    function tampilTab() {
      if (subTab === "izin") return tabIzin();
      if (subTab === "pantau") return tabPantau();
      if (subTab === "rekap") return tabRekap();
    }

    const pilihan = new Set();
    function infoCek(p) {
      const c = p.cek || {};
      const warna = c.koneksi === "Baik" ? "hijau" : c.koneksi === "Lemah" ? "kuning" : c.koneksi ? "merah" : "";
      return h("span.kecil", h("span", { class: "titik " + warna }), c.koneksi ? c.koneksi + " (" + c.rtt + " ms)" : "belum cek", c.baterai != null ? " · baterai " + c.baterai + "%" : "", c.layar_penuh === false ? " · tanpa layar penuh" : "");
    }

    function tabIzin() {
      if (!terakhir) return isiTab.replaceChildren(h("p.kosong", "Memuat..."));
      const tunggu = terakhir.peserta.filter(p => p.status === "menunggu");
      const sudah = terakhir.peserta.filter(p => ["diizinkan", "aktif", "selesai", "ditolak"].includes(p.status) && !p.uji);
      const izinkan = aman(async (ids) => { if (!ids.length) return; const n = await rpc("dosen_izinkan", { p_attempt: ids }); toast(n + " peserta diizinkan.", "sukses"); pilihan.clear(); muat(); });
      const baik = tunggu.filter(p => p.cek && p.cek.koneksi === "Baik").map(p => p.id);
      isiTab.replaceChildren(
        h("div.statistik", [["Terdaftar", terakhir.terdaftar], ["Menunggu izin", tunggu.length], ["Sudah diizinkan", sudah.filter(p => p.status !== "ditolak").length], ["Belum masuk", Math.max(0, terakhir.terdaftar - terakhir.peserta.filter(p => !p.uji).length)]]
          .map(([l, n]) => h("div.kotak", h("div.angka", n), h("div.label", l)))),
        h("div.kartu",
          h("div.baris", h("h3", { style: { margin: 0 } }, "Ruang tunggu"), h("span", { style: { marginLeft: "auto" } }),
            h("button.kecil", { disabled: !pilihan.size, onclick: () => izinkan([...pilihan]) }, "Izinkan terpilih (" + pilihan.size + ")"),
            h("button.kecil", { disabled: !baik.length, onclick: () => izinkan(baik) }, "Izinkan semua berkoneksi baik (" + baik.length + ")"),
            h("button.kecil.hijau", { disabled: !tunggu.length, onclick: () => izinkan(tunggu.map(p => p.id)) }, "Izinkan semua (" + tunggu.length + ")")),
          tunggu.length ? h("div.gulir.mt", h("table.data", h("thead", h("tr", h("th", ""), h("th", "NIM"), h("th", "Nama"), h("th", "Perangkat"), h("th", "Cek perangkat"), h("th", "Masuk"), h("th", ""))),
            h("tbody", tunggu.map(p => {
              const cb = h("input", { type: "checkbox", checked: pilihan.has(p.id), "aria-label": "Pilih " + p.nama });
              cb.addEventListener("change", () => { cb.checked ? pilihan.add(p.id) : pilihan.delete(p.id); gambarTab(); tabIzin(); });
              return h("tr", h("td", cb), h("td", p.nim), h("td", p.nama, p.ganda ? h("div", h("span.lencana.merah", "Masuk ulang / perangkat baru")) : null), h("td.kecil", p.perangkat || "-"), h("td", infoCek(p)), h("td.kecil", jam(p.masuk_at)),
                h("td.baris", h("button.kecil.hijau", { onclick: () => izinkan([p.id]) }, "Izinkan"), h("button.kecil", { onclick: aman(async () => { await rpc("dosen_tolak", { p_attempt: p.id }); muat(); }) }, "Tolak")));
            })))) : h("p.kosong", "Tidak ada peserta yang menunggu. Halaman diperbarui otomatis tiap 10 detik.")),
        ...(s.mode_mulai === "serentak" && !s.dimulai_at && s.status !== "ditutup" ? [h("div.kartu.peringatan", "Peserta yang sudah diizinkan menunggu Anda menekan ", h("strong", "▶ Mulai ujian sekarang"), " di atas.")] : []));
    }

    function tabPantau() {
      if (!terakhir) return isiTab.replaceChildren(h("p.kosong", "Memuat..."));
      const P = terakhir.peserta;
      const aktif = P.filter(p => p.status === "aktif");
      const hitung = { aktif: aktif.filter(p => p.online).length, offline: aktif.filter(p => !p.online).length, selesai: P.filter(p => p.status === "selesai").length, bahaya: aktif.filter(p => p.pelanggaran > 0).length };
      const kartu = P.filter(p => ["aktif", "selesai", "diizinkan"].includes(p.status)).map(p => {
        let kelas = p.status === "selesai" ? "selesai" : p.status === "aktif" ? (p.pelanggaran >= Math.max(1, s.ambang - 1) ? "bahaya" : p.online ? "aktif" : "offline") : "";
        const kej = p.kejadian_terakhir ? p.kejadian_terakhir.split("|") : null;
        return h("div.pantau-kartu." + (kelas || "x"),
          h("div.baris", h("span.nm", p.nama), h("span", { style: { marginLeft: "auto" } }), p.uji ? h("span.lencana", "uji coba") : null,
            p.status === "selesai" ? h("span.lencana.biru", "Nilai " + p.nilai) : p.status === "aktif" ? h("span", { class: "lencana " + (p.online ? "hijau" : "kuning") }, p.online ? "online" : "offline") : h("span.lencana", "menunggu mulai")),
          h("div.meta", p.nim + " · paket " + (p.paket || "-") + " · " + (p.perangkat || "")),
          p.status === "aktif" ? [h("div.batang.mt", h("span", { style: { width: Math.round(p.terjawab / (terakhir.total_soal || 1) * 100) + "%" } })),
            h("div.meta", p.terjawab + "/" + terakhir.total_soal + " lengkap · sisa " + durasi(p.sisa_detik) + " · pelanggaran " + p.pelanggaran + "/" + s.ambang + (p.online ? "" : " · terakhir aktif " + jam(p.terakhir_aktif_at)) + (p.rtt_ms ? " · " + p.rtt_ms + " ms" : "")),
            kej ? h("div.meta", "Kejadian terakhir: " + (JENIS[kej[0]] || kej[0]) + " " + kej[1] + " dtk, " + jam(+kej[2])) : null,
            h("div.baris.mt", h("button.kecil", { onclick: aman(async () => { const m = prompt("Tambah waktu berapa menit untuk " + p.nama + "?", "5"); if (!m) return; await rpc("dosen_tambah_waktu", { p_attempt: p.id, p_menit: parseInt(m, 10) }); toast("Waktu ditambah.", "sukses"); muat(); }) }, "+ waktu"),
              h("button.kecil", { onclick: aman(async () => { if (!(await yakin("Reset ujian " + p.nama + "?", "Percobaan ini diarsipkan (tidak dihapus) dan mahasiswa dapat masuk ulang dari awal.", "Reset", "bahaya"))) return; await rpc("dosen_reset", { p_attempt: p.id }); muat(); }) }, "Reset"))] :
            p.status === "selesai" ? h("div.baris.mt", h("button.kecil", { onclick: aman(async () => { if (!(await yakin("Izinkan " + p.nama + " mengulang?", "Hasil sebelumnya diarsipkan dan tetap bisa dilihat di basis data.", "Reset", "bahaya"))) return; await rpc("dosen_reset", { p_attempt: p.id }); muat(); }) }, "Izinkan ulang")) : null);
      });
      isiTab.replaceChildren(
        h("div.statistik", [["Mengerjakan (online)", hitung.aktif], ["Offline > 45 dtk", hitung.offline], ["Ada pelanggaran", hitung.bahaya], ["Selesai", hitung.selesai]].map(([l, n]) => h("div.kotak", h("div.angka", n), h("div.label", l)))),
        h("div.kartu", h("h3", "Peserta"), kartu.length ? h("div.pantau-grid", kartu) : h("p.kosong", "Belum ada peserta yang diizinkan.")),
        h("div.kartu", h("h3", "Kejadian terbaru"), terakhir.kejadian.length ? h("table.data", h("tbody", terakhir.kejadian.map(k => h("tr", h("td.kecil", jamDetik(k.waktu)), h("td", k.nama), h("td", JENIS[k.jenis] || k.jenis), h("td", k.lama_detik + " dtk"),
          h("td", k.dihitung ? h("span.lencana.merah", "dihitung") : h("span.lencana", "dicatat")))))) : h("p.kosong", "Belum ada kejadian.")),
        h("p.kecil.redup", "Diperbarui otomatis tiap 10 detik · terakhir " + jamDetik(terakhir.sekarang)));
    }

    async function tabRekap() {
      isiTab.replaceChildren(h("p.kosong", "Memuat rekap..."));
      let r;
      try { r = await rpc("dosen_rekap", { p_sesi: id }); } catch (e) { return isiTab.replaceChildren(h("div.kartu.bahaya", e.message)); }
      const P = r.peserta;
      const sel = P.filter(p => p.status === "selesai");
      const nilai = sel.map(p => +p.nilai);
      const rata = nilai.length ? (nilai.reduce((a, b) => a + b, 0) / nilai.length).toFixed(1) : "-";
      const KAT = ["Paham konsep", "Miskonsepsi (false positive)", "Miskonsepsi (false negative)", "Miskonsepsi", "Tidak paham (tebakan beruntung)", "Tidak paham konsep", "Tidak dijawab"];
      const sebaran = {}; KAT.forEach(k => sebaran[k] = 0); let tot = 0;
      const perKonsep = {};
      sel.forEach(p => p.jawaban.forEach(j => {
        sebaran[j.kategori] = (sebaran[j.kategori] || 0) + 1; tot++;
        const k = j.konsep || "(tanpa konsep)"; perKonsep[k] = perKonsep[k] || { n: 0, paham: 0, mis: 0 };
        perKonsep[k].n++; if (/^Paham/.test(j.kategori)) perKonsep[k].paham++; if (/^Miskonsepsi/.test(j.kategori)) perKonsep[k].mis++;
      }));
      const pct = (a, b) => b ? Math.round(a * 100 / b) + "%" : "-";
      isiTab.replaceChildren(
        h("div.statistik", [["Selesai", sel.length + " / " + P.length], ["Rata-rata", rata], ["Tertinggi", nilai.length ? Math.max(...nilai) : "-"], ["Terendah", nilai.length ? Math.min(...nilai) : "-"]].map(([l, n]) => h("div.kotak", h("div.angka", n), h("div.label", l)))),
        h("div.baris", { style: { marginBottom: "12px" } }, h("button.utama", { onclick: () => X.eksporRekap(r, s.bank_soal.isi) }, "Ekspor Excel (nilai, analisis soal, jawaban, kejadian)"), h("button", { onclick: () => window.print() }, "Cetak")),
        h("div.grid2",
          h("div.kartu", h("h3", "Sebaran kategori jawaban"), h("table.data", h("tbody", KAT.filter(k => sebaran[k]).map(k => h("tr", h("td", k), h("td", sebaran[k]), h("td", { style: { width: "40%" } }, h("div.batang", h("span", { style: { width: pct(sebaran[k], tot) } }))), h("td", pct(sebaran[k], tot))))))),
          h("div.kartu", h("h3", "Per konsep"), h("table.data", h("thead", h("tr", h("th", "Konsep"), h("th", "Paham"), h("th", "Miskonsepsi"))), h("tbody", Object.entries(perKonsep).sort((a, b) => b[1].mis / b[1].n - a[1].mis / a[1].n).map(([k, v]) => h("tr", h("td", k), h("td", pct(v.paham, v.n)), h("td", v.mis / v.n >= .3 ? h("strong", { style: { color: "var(--merah)" } }, pct(v.mis, v.n)) : pct(v.mis, v.n)))))))),
        h("div.kartu.gulir", h("h3", "Nilai peserta"), h("table.data", h("thead", h("tr", h("th", "NIM"), h("th", "Nama"), h("th", "Paket"), h("th", "Status"), h("th", "Nilai"), h("th", "Pelanggaran"), h("th", "Selesai"), h("th", "Kode bukti"))),
          h("tbody", P.map(p => h("tr", h("td", p.nim), h("td", p.nama), h("td", p.paket || "-"), h("td", p.status), h("td", h("strong", p.nilai == null ? "-" : p.nilai)), h("td", p.pelanggaran),
            h("td.kecil", (p.cara_selesai || "") + " " + jam(p.selesai_at)), h("td", h("code", p.kode_bukti || "-"))))))),
        h("p.kecil.redup", "Mahasiswa terdaftar yang tidak muncul di tabel belum pernah masuk ke sesi ini."));
    }

    bingkai("sesi", h("p", h("a", { href: "#sesi" }, "← Sesi ujian")), kepalaSesi, tabNav, isiTab);
    gambarKepala(); gambarTab();
    await muat();
    if (subTab === "rekap") tabRekap();
    pengatur.push(setInterval(() => { if (!document.hidden && subTab !== "rekap") muat(); }, 10000));
  }

  // ------------------------------------------------------------------
  sb.auth.onAuthStateChange((ev, sesi) => {
    const baru = sesi ? sesi.user : null;
    const berubah = (baru && baru.id) !== (pengguna && pengguna.id);
    pengguna = baru;
    if (ev === "PASSWORD_RECOVERY") {
      const p = prompt("Masukkan kata sandi baru (minimal 8 karakter):");
      if (p) sb.auth.updateUser({ password: p }).then(({ error }) => toast(error ? pesanGalat(error) : "Kata sandi diperbarui.", error ? "galat" : "sukses"));
    }
    if (berubah || ev === "INITIAL_SESSION") setTimeout(rute, 0);
  });
})();
