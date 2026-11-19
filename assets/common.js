// Fungsi bersama untuk semua halaman.
(function () {
  const C = window.CBT_CONFIG || {};
  const belumDiatur = !C.SUPABASE_URL || C.SUPABASE_URL.includes("XXXX") || !C.SUPABASE_ANON_KEY || C.SUPABASE_ANON_KEY.includes("TEMPEL");

  const sb = belumDiatur ? null : window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  // Membuat elemen: h("div.kelas#id", {atribut}, anak...)
  function h(tag, attrs, ...kids) {
    const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
    const e = document.createElement(m[1] || "div");
    (m[2].match(/[.#][\w-]+/g) || []).forEach(t => t[0] === "." ? e.classList.add(t.slice(1)) : (e.id = t.slice(1)));
    if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v === false || v == null) continue;
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "html") e.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k))); });
    return e;
  }

  function toast(pesan, jenis) {
    let box = document.getElementById("toasts");
    if (!box) { box = h("div#toasts", { role: "status", "aria-live": "polite" }); document.body.append(box); }
    const t = h("div.toast" + (jenis ? "." + jenis : ""), pesan);
    box.append(t);
    setTimeout(() => t.remove(), jenis === "galat" ? 7000 : 4000);
  }

  function pesanGalat(e) {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Tidak ada koneksi internet. Coba lagi.";
    return m.replace(/^.*?ERROR:\s*/, "");
  }

  async function rpc(nama, args) {
    if (!sb) throw new Error("Aplikasi belum dihubungkan ke Supabase (assets/config.js).");
    const { data, error } = await sb.rpc(nama, args || {});
    if (error) throw new Error(pesanGalat(error));
    return data;
  }

  function idPerangkat() {
    let id = null;
    try { id = localStorage.getItem("cbt_device"); } catch (e) {}
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
      try { localStorage.setItem("cbt_device", id); } catch (e) {}
    }
    return id;
  }

  function namaPerangkat() {
    const u = navigator.userAgent;
    const b = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" :
      /SamsungBrowser/.test(u) ? "Samsung Internet" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Peramban lain";
    const o = /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iOS" : /Windows/.test(u) ? "Windows" :
      /Mac OS/.test(u) ? "macOS" : /Linux/.test(u) ? "Linux" : "";
    return b + (o ? " / " + o : "");
  }

  function urlGambar(bankId, file) {
    if (!file) return null;
    if (/^(https?:|data:)/.test(file)) return file;
    return C.SUPABASE_URL + "/storage/v1/object/public/gambar/" + bankId + "/" + encodeURIComponent(file);
  }

  // Menampilkan teks dengan rumus: $...$ (KaTeX jika tersedia).
  function teks(el, s) {
    el.textContent = s == null ? "" : String(s);
    if (window.renderMathInElement) {
      try { window.renderMathInElement(el, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false }); } catch (e) {}
    }
    return el;
  }
  function T(tag, s, attrs) { return teks(h(tag, attrs || {}), s); }

  const pad = n => String(n).padStart(2, "0");
  function jam(ms) { if (!ms) return "-"; const d = new Date(ms); return pad(d.getHours()) + "." + pad(d.getMinutes()); }
  function jamDetik(ms) { if (!ms) return "-"; const d = new Date(ms); return jam(ms) + "." + pad(d.getSeconds()); }
  function tanggalJam(ms) { if (!ms) return "-"; const d = new Date(ms); return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) + " " + jam(ms); }
  function durasi(detik) { detik = Math.max(0, Math.floor(detik)); const j = Math.floor(detik / 3600), m = Math.floor(detik % 3600 / 60), s = detik % 60; return (j ? j + ":" + pad(m) : pad(m)) + ":" + pad(s); }

  const JENIS = {
    tab: "Pindah tab / aplikasi", layar_penuh: "Keluar layar penuh", offline: "Koneksi terputus",
    salin: "Mencoba menyalin/menempel", klik_kanan: "Klik kanan", perangkat_lain: "Masuk dari perangkat lain"
  };

  function cekKonfigurasi(wadah) {
    if (!belumDiatur) return true;
    wadah.replaceChildren(h("div.kartu.peringatan",
      h("h2", "Aplikasi belum dihubungkan ke database"),
      h("p", "Buka file ", h("code", "assets/config.js"), " lalu isi SUPABASE_URL dan SUPABASE_ANON_KEY dari proyek Supabase Anda. Lihat README atau panduan pemasangan.")));
    return false;
  }

  window.CBT = { sb, h, toast, rpc, pesanGalat, idPerangkat, namaPerangkat, urlGambar, teks, T, jam, jamDetik, tanggalJam, durasi, JENIS, cekKonfigurasi, C };
})();
