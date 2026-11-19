// Validasi bank soal, template Excel, konversi Excel -> JSON, dan ekspor rekap.
(function () {
  const HURUF = "ABCDE";

  // ---------- validasi format JSON bank soal ----------
  function validasi(d) {
    const galat = [], peringatan = [];
    if (!d || typeof d !== "object") return { galat: ["File bukan JSON yang valid."], peringatan };
    if (!d.materi) galat.push("Kolom \"materi\" wajib diisi.");
    if (!Array.isArray(d.paket) || !d.paket.length) { galat.push("\"paket\" harus berupa daftar dan tidak boleh kosong."); return { galat, peringatan }; }
    const kodeDipakai = new Set();
    const ringkas = [];
    d.paket.forEach((p, pi) => {
      const lp = "Paket " + (p.kode || "#" + (pi + 1));
      if (!p.kode) galat.push(lp + ": \"kode\" paket wajib diisi (mis. A).");
      if (kodeDipakai.has(p.kode)) galat.push(lp + ": kode paket ganda.");
      kodeDipakai.add(p.kode);
      if (!Array.isArray(p.soal) || !p.soal.length) { galat.push(lp + ": tidak ada soal."); return; }
      const ids = new Set();
      const konsep = [];
      p.soal.forEach((s, si) => {
        const ls = lp + " soal " + (si + 1) + (s.id ? " (" + s.id + ")" : "");
        if (!s.id) galat.push(ls + ": \"id\" wajib diisi.");
        else if (ids.has(String(s.id))) galat.push(ls + ": id soal ganda dalam paket.");
        ids.add(String(s.id));
        if (s.konsep) konsep.push(String(s.konsep).trim().toLowerCase()); else peringatan.push(ls + ": \"konsep\" kosong; profil konsep mahasiswa kurang informatif.");
        ["tier1", "tier2"].forEach(t => {
          const x = s[t];
          const nm = t === "tier1" ? "tingkat 1" : "tingkat 2";
          if (!x) { galat.push(ls + ": " + nm + " tidak ada."); return; }
          if (t === "tier1" && !x.teks) galat.push(ls + ": teks pertanyaan tingkat 1 kosong.");
          if (!Array.isArray(x.opsi) || x.opsi.length < 2) { galat.push(ls + ": " + nm + " minimal 2 pilihan."); return; }
          if (x.opsi.length > 8) galat.push(ls + ": " + nm + " maksimal 8 pilihan.");
          x.opsi.forEach((o, oi) => {
            const teks = typeof o === "object" && o ? (o.teks || "") : o;
            const gb = typeof o === "object" && o ? o.gambar : null;
            if (!String(teks || "").trim() && !gb) galat.push(ls + ": " + nm + " pilihan " + HURUF[oi] + " kosong.");
          });
          const k = x.kunci;
          if (!Number.isInteger(k) || k < 0 || k >= x.opsi.length) galat.push(ls + ": kunci " + nm + " harus angka 0 sampai " + (x.opsi.length - 1) + " (0 = pilihan pertama).");
          if (t === "tier2" && x.feedback && (!Array.isArray(x.feedback) || x.feedback.length > x.opsi.length)) peringatan.push(ls + ": jumlah feedback tingkat 2 tidak sama dengan jumlah pilihan.");
        });
        if (s.gambar && typeof s.gambar === "object" && !s.gambar.alt) peringatan.push(ls + ": gambar tanpa teks alternatif (alt).");
      });
      ringkas.push({ kode: p.kode, jumlah: p.soal.length, konsep: konsep.sort().join("|") });
    });
    // konsistensi antarpaket
    if (ringkas.length > 1) {
      const n = ringkas[0].jumlah;
      if (ringkas.some(r => r.jumlah !== n)) galat.push("Jumlah soal tiap paket harus sama (" + ringkas.map(r => r.kode + ": " + r.jumlah).join(", ") + ") agar adil.");
      const k0 = ringkas[0].konsep;
      ringkas.slice(1).forEach(r => { if (r.konsep !== k0) peringatan.push("Sebaran konsep paket " + r.kode + " berbeda dengan paket " + ringkas[0].kode + ". Pastikan tiap paket setara."); });
    }
    return { galat, peringatan };
  }

  function daftarGambar(d) {
    const s = new Set();
    (d.paket || []).forEach(p => (p.soal || []).forEach(q => {
      const g = q.gambar; const f = g && (typeof g === "string" ? g : g.file);
      if (f && !/^(https?:|data:)/.test(f)) s.add(f);
      ["tier1", "tier2"].forEach(t => ((q[t] && q[t].opsi) || []).forEach(o => { if (o && typeof o === "object" && o.gambar && !/^(https?:|data:)/.test(o.gambar)) s.add(o.gambar); }));
    }));
    return [...s];
  }

  // ---------- template Excel ----------
  function kolom() {
    const k = ["paket", "id", "konsep", "t1_teks"];
    HURUF.split("").forEach(x => k.push("t1_" + x.toLowerCase()));
    HURUF.split("").forEach(x => k.push("t1_" + x.toLowerCase() + "_gambar"));
    k.push("t1_kunci", "t2_teks");
    HURUF.split("").forEach(x => k.push("t2_" + x.toLowerCase()));
    HURUF.split("").forEach(x => k.push("t2_" + x.toLowerCase() + "_gambar"));
    k.push("t2_kunci");
    HURUF.split("").forEach(x => k.push("fb_t2_" + x.toLowerCase()));
    k.push("pembahasan", "gambar", "gambar_alt");
    return k;
  }

  function jsonKeBaris(d) {
    const rows = [];
    d.paket.forEach(p => p.soal.forEach(s => {
      const r = { paket: p.kode, id: s.id, konsep: s.konsep || "", t1_teks: s.tier1.teks, t2_teks: s.tier2.teks || "",
        t1_kunci: HURUF[s.tier1.kunci], t2_kunci: HURUF[s.tier2.kunci], pembahasan: s.pembahasan || "" };
      ["tier1", "tier2"].forEach((t, ti) => s[t].opsi.forEach((o, i) => {
        const a = "t" + (ti + 1) + "_" + HURUF[i].toLowerCase();
        r[a] = typeof o === "object" ? (o.teks || "") : o;
        if (typeof o === "object" && o.gambar) r[a + "_gambar"] = o.gambar;
      }));
      (s.tier2.feedback || []).forEach((f, i) => { if (f) r["fb_t2_" + HURUF[i].toLowerCase()] = f; });
      if (s.gambar) { r.gambar = typeof s.gambar === "string" ? s.gambar : s.gambar.file; r.gambar_alt = s.gambar.alt || ""; }
      rows.push(r);
    }));
    return rows;
  }

  function unduhTemplate(contoh) {
    const wb = XLSX.utils.book_new();
    const rows = contoh ? jsonKeBaris(contoh) : [];
    const ws = XLSX.utils.json_to_sheet(rows, { header: kolom() });
    ws["!cols"] = kolom().map(c => ({ wch: /teks|pembahasan/.test(c) ? 50 : /gambar/.test(c) ? 16 : c.length > 6 ? 24 : 8 }));
    XLSX.utils.book_append_sheet(wb, ws, "soal");
    const pt = [
      ["PETUNJUK PENGISIAN TEMPLATE SOAL THREE-TIER"], [],
      ["Kolom", "Keterangan"],
      ["materi", "Isi nama materi di sel B1 lembar 'info'."],
      ["paket", "Kode paket, mis. A, B, C. Setiap paket harus punya jumlah soal yang sama."],
      ["id", "Kode unik soal di dalam paketnya, mis. A1, A2."],
      ["konsep", "Nama konsep yang diuji. Dipakai untuk profil pemahaman mahasiswa."],
      ["t1_teks", "Pertanyaan tingkat 1 (jawaban). Rumus boleh ditulis di antara $...$, mis. $v = s/t$."],
      ["t1_a ... t1_e", "Pilihan jawaban tingkat 1. Minimal 2, kosongkan kolom yang tidak dipakai."],
      ["t1_a_gambar ...", "Opsional: nama file gambar untuk pilihan (mis. grafik-a.png)."],
      ["t1_kunci", "Huruf kunci tingkat 1: A, B, C, D, atau E."],
      ["t2_teks", "Opsional: kalimat pengantar alasan. Kosong = 'Alasan jawaban Anda:'."],
      ["t2_a ... t2_e", "Pilihan alasan tingkat 2."],
      ["t2_kunci", "Huruf kunci tingkat 2."],
      ["fb_t2_a ... fb_t2_e", "Opsional: umpan balik bila mahasiswa memilih alasan itu (mis. penjelasan miskonsepsinya)."],
      ["pembahasan", "Pembahasan yang tampil setelah ujian (tingkat umpan balik 4)."],
      ["gambar / gambar_alt", "Opsional: nama file gambar soal dan deskripsi singkatnya. Unggah filenya di menu Bank Soal > Gambar."],
      [], ["Tingkat 3 (yakin / tidak yakin) dibuat otomatis oleh sistem; tidak perlu diisi."]
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(pt); ws2["!cols"] = [{ wch: 22 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, ws2, "petunjuk");
    const ws3 = XLSX.utils.aoa_to_sheet([["materi", contoh ? contoh.materi : "Tulis nama materi di sini"]]);
    XLSX.utils.book_append_sheet(wb, ws3, "info");
    XLSX.writeFile(wb, contoh ? "contoh-soal-three-tier.xlsx" : "template-soal-three-tier.xlsx");
  }

  function excelKeJson(buf, namaFile) {
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets["soal"] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
    let materi = namaFile.replace(/\.[^.]+$/, "");
    if (wb.Sheets["info"]) { const c = wb.Sheets["info"]["B1"]; if (c && c.v) materi = String(c.v); }
    const galat = [];
    const peta = new Map();
    rows.forEach((r, i) => {
      const brs = "Baris " + (i + 2);
      const st = v => String(v == null ? "" : v).trim();
      if (!st(r.paket) && !st(r.t1_teks)) return;
      const opsi = (t) => {
        const o = [];
        for (let k = 0; k < HURUF.length; k++) {
          const x = HURUF[k].toLowerCase();
          const teks = st(r[t + "_" + x]), gb = st(r[t + "_" + x + "_gambar"]);
          if (!teks && !gb) continue;
          o.push(gb ? { teks, gambar: gb } : teks);
        }
        return o;
      };
      const kunci = (v, n, nm) => { const ix = HURUF.indexOf(st(v).toUpperCase()); if (ix < 0 || ix >= n) galat.push(brs + ": kunci " + nm + " tidak valid (\"" + st(v) + "\")."); return ix; };
      const o1 = opsi("t1"), o2 = opsi("t2");
      const s = { id: st(r.id) || ("S" + (i + 1)), konsep: st(r.konsep),
        tier1: { teks: st(r.t1_teks), opsi: o1, kunci: kunci(r.t1_kunci, o1.length, "tingkat 1") },
        tier2: { teks: st(r.t2_teks), opsi: o2, kunci: kunci(r.t2_kunci, o2.length, "tingkat 2"),
          feedback: o2.map((_, k) => st(r["fb_t2_" + HURUF[k].toLowerCase()])) },
        pembahasan: st(r.pembahasan) };
      if (st(r.gambar)) s.gambar = { file: st(r.gambar), alt: st(r.gambar_alt) };
      const kp = st(r.paket) || "A";
      if (!peta.has(kp)) peta.set(kp, []);
      peta.get(kp).push(s);
    });
    const d = { materi, format: "three-tier-v1", paket: [...peta.entries()].map(([kode, soal]) => ({ kode, soal })) };
    return { data: d, galat };
  }

  // ---------- ekspor rekap ----------
  function eksporRekap(rekap, bank) {
    const s = rekap.sesi;
    const KAT = ["Paham konsep", "Miskonsepsi (false positive)", "Miskonsepsi (false negative)", "Miskonsepsi", "Tidak paham (tebakan beruntung)", "Tidak paham konsep", "Tidak dijawab"];
    const waktu = ms => ms ? new Date(ms).toLocaleString("id-ID") : "";
    const nilai = rekap.peserta.map(p => {
      const r = { NIM: p.nim, Nama: p.nama, Paket: p.paket || "", Status: p.status, Nilai: p.nilai, Pelanggaran: p.pelanggaran,
        "Cara selesai": p.cara_selesai || "", Mulai: waktu(p.mulai_at), Selesai: waktu(p.selesai_at), "Kode bukti": p.kode_bukti || "" };
      KAT.forEach(k => r[k] = (p.jawaban || []).filter(j => j.kategori === k).length);
      return r;
    });
    const soalMap = {};
    (bank.paket || []).forEach(pk => pk.soal.forEach(q => soalMap[pk.kode + "|" + q.id] = q));
    const jaw = [], kej = [], anal = {};
    rekap.peserta.forEach(p => {
      (p.jawaban || []).forEach(j => {
        const q = soalMap[p.paket + "|" + j.soal];
        jaw.push({ NIM: p.nim, Nama: p.nama, Paket: p.paket, Soal: j.soal, Konsep: j.konsep || "",
          "Tingkat 1": j.t1 == null ? "" : HURUF[j.t1], "Kunci 1": q ? HURUF[q.tier1.kunci] : "",
          "Tingkat 2": j.t2 == null ? "" : HURUF[j.t2], "Kunci 2": q ? HURUF[q.tier2.kunci] : "",
          "Tingkat 3": j.t3 == null ? "" : (j.t3 === 1 ? "Yakin" : "Tidak yakin"), Kategori: j.kategori, Skor: j.skor });
        const kunci = p.paket + "|" + j.soal;
        anal[kunci] = anal[kunci] || { Paket: p.paket, Soal: j.soal, Konsep: j.konsep || "", N: 0, paham: 0, mis: 0, tdk: 0, kosong: 0 };
        const a = anal[kunci]; a.N++;
        if (/^Paham/.test(j.kategori)) a.paham++; else if (/^Miskonsepsi/.test(j.kategori)) a.mis++; else if (/^Tidak paham/.test(j.kategori)) a.tdk++; else a.kosong++;
      });
      (p.log || []).forEach(l => kej.push({ NIM: p.nim, Nama: p.nama, Waktu: waktu(l.mulai_at), Jenis: (CBT.JENIS[l.jenis] || l.jenis), "Lama (detik)": l.lama_detik, Dihitung: l.dihitung ? "Ya" : "Tidak", Soal: l.soal || "" }));
    });
    const persen = (x, n) => n ? Math.round(x * 1000 / n) / 10 : 0;
    const an = Object.values(anal).sort((a, b) => (a.Paket + a.Soal).localeCompare(b.Paket + b.Soal, "id", { numeric: true }))
      .map(a => ({ Paket: a.Paket, Soal: a.Soal, Konsep: a.Konsep, "Jumlah peserta": a.N, "% Paham konsep": persen(a.paham, a.N), "% Miskonsepsi": persen(a.mis, a.N), "% Tidak paham": persen(a.tdk, a.N), "% Tidak dijawab": persen(a.kosong, a.N) }));
    const wb = XLSX.utils.book_new();
    const info = XLSX.utils.aoa_to_sheet([["Sesi", s.nama], ["Kode", s.kode], ["Materi", bank.materi], ["Aturan skor", s.aturan_skor], ["Durasi (menit)", s.durasi_menit], ["Diekspor", new Date().toLocaleString("id-ID")]]);
    XLSX.utils.book_append_sheet(wb, info, "info");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nilai), "nilai");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(an), "analisis soal");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jaw), "jawaban");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kej), "kejadian");
    XLSX.writeFile(wb, "rekap-" + s.kode + ".xlsx");
  }

  function unduhPin(namaKelas, rows) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ NIM: r.o_nim, Nama: r.o_nama, PIN: r.o_pin })));
    ws["!cols"] = [{ wch: 16 }, { wch: 34 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "PIN");
    XLSX.writeFile(wb, "PIN-" + namaKelas.replace(/[^\w-]+/g, "_") + ".xlsx");
  }

  function bacaPeserta(buf) {
    const wb = XLSX.read(buf, { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
    return rows.map(r => {
      const k = Object.keys(r);
      const cari = re => k.find(x => re.test(x.toLowerCase()));
      return { nim: String(r[cari(/nim|npm|nomor/)] || "").trim(), nama: String(r[cari(/nama/)] || "").trim() };
    }).filter(r => r.nim && r.nama);
  }

  window.CBTX = { validasi, daftarGambar, unduhTemplate, excelKeJson, eksporRekap, unduhPin, bacaPeserta, HURUF };
})();
