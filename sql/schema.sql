-- =====================================================================
-- CBT Three-Tier Test — skema database dan fungsi server (Supabase)
-- Cara pakai: buka Supabase > SQL Editor > New query, tempel seluruh
-- isi file ini, lalu tekan Run. Aman dijalankan ulang.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create or replace function public.gen_kode() returns text
language plpgsql volatile as $$
declare
  huruf text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  campur text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  hasil text := '';
  i int;
begin
  for i in 1..3 loop hasil := hasil || substr(huruf, 1 + floor(random()*length(huruf))::int, 1); end loop;
  hasil := hasil || '-';
  for i in 1..4 loop hasil := hasil || substr(campur, 1 + floor(random()*length(campur))::int, 1); end loop;
  return hasil;
end $$;

create table if not exists public.bank_soal (
  id uuid primary key default gen_random_uuid(),
  dosen_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  materi text not null,
  isi jsonb not null,
  jumlah_paket int,
  jumlah_soal int,
  dibuat_at timestamptz not null default now()
);

create table if not exists public.kelas (
  id uuid primary key default gen_random_uuid(),
  dosen_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nama text not null,
  dibuat_at timestamptz not null default now()
);

create table if not exists public.peserta (
  id uuid primary key default gen_random_uuid(),
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  nim text not null,
  nama text not null,
  pin_hash text not null,
  unique (kelas_id, nim)
);

create table if not exists public.sesi_ujian (
  id uuid primary key default gen_random_uuid(),
  dosen_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nama text not null,
  bank_soal_id uuid not null references public.bank_soal(id) on delete restrict,
  kelas_id uuid not null references public.kelas(id) on delete restrict,
  kode text not null unique default public.gen_kode(),
  paket text[] not null,
  buka_at timestamptz not null,
  tutup_at timestamptz not null,
  durasi_menit int not null check (durasi_menit between 1 and 600),
  ambang int not null default 3 check (ambang between 1 and 20),
  navigasi text not null default 'bebas' check (navigasi in ('bebas','berurutan')),
  mode_mulai text not null default 'serentak' check (mode_mulai in ('serentak','per_orang')),
  aturan_skor text not null default 'ketat' check (aturan_skor in ('ketat','longgar')),
  fb_langsung int not null default 2 check (fb_langsung between 1 and 4),
  fb_tutup int not null default 4 check (fb_tutup between 1 and 4),
  status text not null default 'draf' check (status in ('draf','aktif','ditutup')),
  dimulai_at timestamptz,
  dibuat_at timestamptz not null default now()
);

create table if not exists public.attempt (
  id uuid primary key default gen_random_uuid(),
  sesi_id uuid not null references public.sesi_ujian(id) on delete cascade,
  peserta_id uuid references public.peserta(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'menunggu'
    check (status in ('menunggu','ditolak','diizinkan','aktif','selesai','diarsipkan')),
  uji boolean not null default false,
  device_id text,
  perangkat text,
  cek jsonb,
  masuk_at timestamptz not null default now(),
  diizinkan_at timestamptz,
  paket text,
  urutan_soal jsonb,
  urutan_opsi jsonb,
  posisi int not null default 0,
  mulai_at timestamptz,
  batas_at timestamptz,
  tambahan_menit int not null default 0,
  terakhir_aktif_at timestamptz,
  rtt_ms int,
  selesai_at timestamptz,
  cara_selesai text,
  pelanggaran int not null default 0,
  nilai numeric(5,1),
  kode_bukti text,
  direset_at timestamptz
);
create unique index if not exists attempt_satu_per_peserta
  on public.attempt (sesi_id, peserta_id) where status <> 'diarsipkan' and not uji;

create table if not exists public.jawaban (
  attempt_id uuid not null references public.attempt(id) on delete cascade,
  soal_id text not null,
  t1 int, t2 int, t3 int,
  ragu boolean not null default false,
  urut bigint not null default 0,
  kategori text,
  skor int,
  diperbarui_at timestamptz not null default now(),
  primary key (attempt_id, soal_id)
);

create table if not exists public.log_kejadian (
  id bigserial primary key,
  attempt_id uuid not null references public.attempt(id) on delete cascade,
  jenis text not null,
  mulai_at timestamptz not null default now(),
  lama_detik int not null default 0,
  soal_id text,
  dihitung boolean not null default false
);

create table if not exists public.percobaan_login (
  id bigserial primary key,
  sesi_id uuid not null,
  nim text not null,
  waktu timestamptz not null default now(),
  berhasil boolean not null
);
create index if not exists percobaan_login_idx on public.percobaan_login (sesi_id, nim, waktu);

-- ---------------------------------------------------------------------
-- 2. Row Level Security: dosen hanya melihat datanya sendiri,
--    mahasiswa (anon) tidak punya akses tabel sama sekali.
-- ---------------------------------------------------------------------
alter table public.bank_soal enable row level security;
alter table public.kelas enable row level security;
alter table public.peserta enable row level security;
alter table public.sesi_ujian enable row level security;
alter table public.attempt enable row level security;
alter table public.jawaban enable row level security;
alter table public.log_kejadian enable row level security;
alter table public.percobaan_login enable row level security;

drop policy if exists dosen_bank on public.bank_soal;
create policy dosen_bank on public.bank_soal for all to authenticated
  using (dosen_id = auth.uid()) with check (dosen_id = auth.uid());

drop policy if exists dosen_kelas on public.kelas;
create policy dosen_kelas on public.kelas for all to authenticated
  using (dosen_id = auth.uid()) with check (dosen_id = auth.uid());

drop policy if exists dosen_peserta on public.peserta;
create policy dosen_peserta on public.peserta for all to authenticated
  using (exists (select 1 from public.kelas k where k.id = kelas_id and k.dosen_id = auth.uid()))
  with check (exists (select 1 from public.kelas k where k.id = kelas_id and k.dosen_id = auth.uid()));

drop policy if exists dosen_sesi on public.sesi_ujian;
create policy dosen_sesi on public.sesi_ujian for all to authenticated
  using (dosen_id = auth.uid()) with check (dosen_id = auth.uid());

drop policy if exists dosen_attempt on public.attempt;
create policy dosen_attempt on public.attempt for select to authenticated
  using (exists (select 1 from public.sesi_ujian s where s.id = sesi_id and s.dosen_id = auth.uid()));

drop policy if exists dosen_jawaban on public.jawaban;
create policy dosen_jawaban on public.jawaban for select to authenticated
  using (exists (select 1 from public.attempt a join public.sesi_ujian s on s.id = a.sesi_id
                 where a.id = attempt_id and s.dosen_id = auth.uid()));

drop policy if exists dosen_log on public.log_kejadian;
create policy dosen_log on public.log_kejadian for select to authenticated
  using (exists (select 1 from public.attempt a join public.sesi_ujian s on s.id = a.sesi_id
                 where a.id = attempt_id and s.dosen_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Fungsi bantu (internal)
-- ---------------------------------------------------------------------
create or replace function public._soal(p_isi jsonb, p_paket text, p_id text) returns jsonb
language sql stable as $$
  select s from jsonb_array_elements(p_isi->'paket') p, jsonb_array_elements(p->'soal') s
  where p->>'kode' = p_paket and s->>'id' = p_id limit 1
$$;

create or replace function public._opsi(p_opsi jsonb, p_idx int) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(p_opsi->p_idx) = 'object' then p_opsi->p_idx
              else jsonb_build_object('teks', p_opsi->>p_idx) end
$$;

create or replace function public._ms(t timestamptz) returns bigint
language sql immutable as $$ select (extract(epoch from t) * 1000)::bigint $$;

create or replace function public._kategori(b1 boolean, b2 boolean, t3 int, aturan text,
  out kategori text, out skor int)
language plpgsql immutable as $$
begin
  if b1 is null or b2 is null or t3 is null then
    kategori := 'Tidak dijawab'; skor := 0; return;
  end if;
  if t3 = 0 then  -- 0 = Tidak yakin, 1 = Yakin
    kategori := case when b1 and b2 then 'Tidak paham (tebakan beruntung)' else 'Tidak paham konsep' end;
    skor := case when aturan = 'longgar' and b1 and b2 then 1 else 0 end;
    return;
  end if;
  if b1 and b2 then kategori := 'Paham konsep'; skor := 1;
  elsif b1 then kategori := 'Miskonsepsi (false positive)'; skor := 0;
  elsif b2 then kategori := 'Miskonsepsi (false negative)'; skor := 0;
  else kategori := 'Miskonsepsi'; skor := 0;
  end if;
end $$;

-- Menilai dan menutup satu attempt.
create or replace function public._finalisasi(p_id uuid, p_cara text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.attempt; s public.sesi_ujian; isi jsonb; sid text; q jsonb; j public.jawaban;
  r record; total int := 0; benar int := 0;
begin
  select * into a from public.attempt where id = p_id for update;
  if a.status in ('selesai','diarsipkan') or a.mulai_at is null then return; end if;
  select * into s from public.sesi_ujian where id = a.sesi_id;
  select b.isi into isi from public.bank_soal b where b.id = s.bank_soal_id;
  for sid in select jsonb_array_elements_text(coalesce(a.urutan_soal, '[]'::jsonb)) loop
    total := total + 1;
    q := public._soal(isi, a.paket, sid);
    select * into j from public.jawaban where attempt_id = a.id and soal_id = sid;
    select * into r from public._kategori(
      case when j.t1 is null then null else j.t1 = (q->'tier1'->>'kunci')::int end,
      case when j.t2 is null then null else j.t2 = (q->'tier2'->>'kunci')::int end,
      j.t3, s.aturan_skor);
    insert into public.jawaban (attempt_id, soal_id, kategori, skor)
      values (a.id, sid, r.kategori, r.skor)
      on conflict (attempt_id, soal_id) do update set kategori = excluded.kategori, skor = excluded.skor;
    benar := benar + r.skor;
  end loop;
  update public.attempt set status = 'selesai', selesai_at = now(), cara_selesai = p_cara,
    nilai = case when total = 0 then 0 else round(benar * 100.0 / total, 1) end,
    kode_bukti = upper(substr(md5(a.token::text || now()::text), 1, 4) || '-' || substr(md5(a.id::text), 1, 4))
  where id = a.id;
end $$;

-- Menutup attempt yang waktunya sudah lewat (+ masa tenggang 2 menit).
create or replace function public._tutup_kedaluwarsa(p_sesi uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare x uuid;
begin
  for x in select id from public.attempt
           where sesi_id = p_sesi and mulai_at is not null and status not in ('selesai','diarsipkan')
             and batas_at < now() - interval '2 minutes' loop
    perform public._finalisasi(x, 'waktu');
  end loop;
end $$;

create or replace function public._attempt(p_token uuid, p_device text) returns public.attempt
language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt;
begin
  select * into a from public.attempt where token = p_token;
  if not found then raise exception 'Sesi ujian Anda tidak ditemukan. Silakan masuk ulang.'; end if;
  if a.device_id is null and p_device is not null then
    update public.attempt set device_id = p_device where id = a.id;
    a.device_id := p_device;
  end if;
  if a.mulai_at is not null and a.status not in ('selesai','diarsipkan') and a.batas_at < now() - interval '2 minutes' then
    perform public._finalisasi(a.id, 'waktu');
    select * into a from public.attempt where id = a.id;
  end if;
  return a;
end $$;

create or replace function public._info(a public.attempt, p_device text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sesi_ujian; jumlah int; isi jsonb;
begin
  select * into s from public.sesi_ujian where id = a.sesi_id;
  if a.device_id is not null and p_device is not null and a.device_id <> p_device then
    return jsonb_build_object('status', 'perangkat_lain');
  end if;
  select b.isi into isi from public.bank_soal b where b.id = s.bank_soal_id;
  select jsonb_array_length(p->'soal') into jumlah from jsonb_array_elements(isi->'paket') p
    where p->>'kode' = coalesce(a.paket, s.paket[1]) limit 1;
  return jsonb_build_object(
    'status', a.status, 'uji', a.uji, 'sekarang', public._ms(now()),
    'mulai_at', public._ms(a.mulai_at), 'batas_at', public._ms(a.batas_at),
    'pelanggaran', a.pelanggaran, 'ambang', s.ambang,
    'siap_mulai', (a.status = 'diizinkan' and (a.uji or s.mode_mulai = 'per_orang' or s.dimulai_at is not null)),
    'sesi', jsonb_build_object('nama', s.nama, 'durasi', s.durasi_menit, 'jumlah_soal', jumlah,
      'navigasi', s.navigasi, 'mode_mulai', s.mode_mulai, 'ambang', s.ambang, 'status', s.status,
      'tutup_at', public._ms(s.tutup_at), 'materi', isi->>'materi'));
end $$;

-- ---------------------------------------------------------------------
-- 4. Fungsi untuk mahasiswa (dipanggil tanpa login, dengan token)
-- ---------------------------------------------------------------------
create or replace function public.mhs_masuk(p_kode text, p_nim text, p_pin text, p_device text, p_perangkat text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.sesi_ujian; p public.peserta; a public.attempt; gagal int; tunggu int;
begin
  select * into s from public.sesi_ujian where kode = upper(trim(p_kode));
  if not found or s.status = 'draf' then raise exception 'Kode ujian tidak ditemukan atau sesi belum dibuka.'; end if;
  if s.status = 'ditutup' then raise exception 'Sesi ujian ini sudah ditutup.'; end if;
  if now() < s.buka_at then
    raise exception 'Ujian baru dibuka pukul % WIB.', to_char(s.buka_at at time zone 'Asia/Jakarta', 'HH24.MI');
  end if;
  if now() > s.tutup_at then raise exception 'Waktu sesi ujian sudah berakhir.'; end if;

  select count(*), coalesce(ceil(extract(epoch from (min(waktu) + interval '15 minutes' - now())) / 60), 0)
    into gagal, tunggu
    from public.percobaan_login
    where sesi_id = s.id and nim = trim(p_nim) and not berhasil and waktu > now() - interval '15 minutes';
  if gagal >= 5 then
    raise exception 'Terlalu banyak percobaan gagal. Coba lagi dalam % menit.', greatest(tunggu, 1);
  end if;

  select * into p from public.peserta where kelas_id = s.kelas_id and nim = trim(p_nim);
  if not found or p.pin_hash <> crypt(trim(p_pin), p.pin_hash) then
    insert into public.percobaan_login (sesi_id, nim, berhasil) values (s.id, trim(p_nim), false);
    raise exception 'NIM atau PIN salah (percobaan % dari 5).', gagal + 1;
  end if;
  insert into public.percobaan_login (sesi_id, nim, berhasil) values (s.id, trim(p_nim), true);

  select * into a from public.attempt
    where sesi_id = s.id and peserta_id = p.id and status <> 'diarsipkan' and not uji;
  if not found then
    insert into public.attempt (sesi_id, peserta_id, device_id, perangkat)
      values (s.id, p.id, p_device, p_perangkat) returning * into a;
  elsif a.device_id is distinct from p_device and a.status in ('menunggu','diizinkan','aktif') then
    insert into public.log_kejadian (attempt_id, jenis, dihitung) values (a.id, 'perangkat_lain', false);
    update public.attempt set device_id = p_device, perangkat = p_perangkat, status = 'menunggu'
      where id = a.id returning * into a;
  end if;
  return jsonb_build_object('token', a.token, 'nama', p.nama, 'nim', p.nim) || public._info(a, p_device);
end $$;

create or replace function public.mhs_cek(p_token uuid, p_device text, p_cek jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt;
begin
  a := public._attempt(p_token, p_device);
  update public.attempt set cek = p_cek, perangkat = coalesce(p_cek->>'perangkat', perangkat) where id = a.id;
  return public._info(a, p_device);
end $$;

create or replace function public.mhs_detak(p_token uuid, p_device text, p_rtt int, p_posisi int default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt; p public.peserta;
begin
  a := public._attempt(p_token, p_device);
  if a.device_id is not distinct from p_device then
    update public.attempt set terakhir_aktif_at = now(), rtt_ms = p_rtt where id = a.id;
  end if;
  select * into p from public.peserta where id = a.peserta_id;
  return jsonb_build_object('nama', coalesce(p.nama, 'Peserta uji coba'), 'nim', coalesce(p.nim, '-'))
         || public._info(a, p_device);
end $$;

create or replace function public.mhs_soal(p_token uuid, p_device text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt; s public.sesi_ujian; isi jsonb; daftar jsonb := '[]'::jsonb;
  sid text; q jsonb; perm1 jsonb; perm2 jsonb; j public.jawaban; no int := 0;
  o1 jsonb; o2 jsonb; i int; d1 int; d2 int;
begin
  a := public._attempt(p_token, p_device);
  if a.device_id is distinct from p_device then raise exception 'Ujian Anda sedang dibuka di perangkat lain.'; end if;
  if a.status <> 'aktif' then raise exception 'Ujian belum dimulai atau sudah selesai.'; end if;
  select * into s from public.sesi_ujian where id = a.sesi_id;
  select b.isi into isi from public.bank_soal b where b.id = s.bank_soal_id;
  for sid in select jsonb_array_elements_text(a.urutan_soal) loop
    no := no + 1;
    if s.navigasi = 'berurutan' and no - 1 <> a.posisi then continue; end if;
    q := public._soal(isi, a.paket, sid);
    perm1 := a.urutan_opsi->sid->'t1'; perm2 := a.urutan_opsi->sid->'t2';
    o1 := '[]'::jsonb; o2 := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(perm1) - 1 loop
      o1 := o1 || jsonb_build_array(public._opsi(q->'tier1'->'opsi', (perm1->>i)::int));
    end loop;
    for i in 0 .. jsonb_array_length(perm2) - 1 loop
      o2 := o2 || jsonb_build_array(public._opsi(q->'tier2'->'opsi', (perm2->>i)::int));
    end loop;
    select * into j from public.jawaban where attempt_id = a.id and soal_id = sid;
    d1 := null; d2 := null;
    if j.t1 is not null then
      select (x.ord - 1)::int into d1 from jsonb_array_elements_text(perm1) with ordinality x(v, ord) where x.v::int = j.t1;
    end if;
    if j.t2 is not null then
      select (x.ord - 1)::int into d2 from jsonb_array_elements_text(perm2) with ordinality x(v, ord) where x.v::int = j.t2;
    end if;
    daftar := daftar || jsonb_build_array(jsonb_build_object(
      'id', sid, 'no', no, 'gambar', q->'gambar',
      'tier1', jsonb_build_object('teks', q->'tier1'->>'teks', 'opsi', o1),
      'tier2', jsonb_build_object('teks', coalesce(nullif(q->'tier2'->>'teks', ''), 'Alasan jawaban Anda:'), 'opsi', o2),
      'jawab', jsonb_build_object('t1', d1, 't2', d2, 't3', j.t3, 'ragu', coalesce(j.ragu, false))));
  end loop;
  return jsonb_build_object('bank_id', s.bank_soal_id, 'navigasi', s.navigasi, 'posisi', a.posisi,
    'total', jsonb_array_length(a.urutan_soal), 'soal', daftar) || public._info(a, p_device);
end $$;

create or replace function public.mhs_mulai(p_token uuid, p_device text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt; s public.sesi_ujian; isi jsonb; pk text; daftar jsonb; opsi jsonb := '{}'::jsonb;
  q jsonb; basis timestamptz;
begin
  a := public._attempt(p_token, p_device);
  if a.device_id is distinct from p_device then raise exception 'Ujian Anda sedang dibuka di perangkat lain.'; end if;
  if a.status = 'aktif' then return public.mhs_soal(p_token, p_device); end if;
  if a.status <> 'diizinkan' then raise exception 'Anda belum diizinkan dosen untuk memulai.'; end if;
  select * into s from public.sesi_ujian where id = a.sesi_id;
  if not (a.uji or s.mode_mulai = 'per_orang' or s.dimulai_at is not null) then
    raise exception 'Dosen belum memulai ujian. Tunggu sebentar.';
  end if;
  select b.isi into isi from public.bank_soal b where b.id = s.bank_soal_id;

  if a.urutan_soal is null then
    select pkt into pk from unnest(s.paket) pkt
      left join (select paket, count(*) n from public.attempt
                 where sesi_id = s.id and paket is not null and not uji group by paket) c on c.paket = pkt
      order by coalesce(c.n, 0), random() limit 1;
    select jsonb_agg(x->>'id' order by random()) into daftar
      from jsonb_array_elements(isi->'paket') p, jsonb_array_elements(p->'soal') x where p->>'kode' = pk;
    for q in select x from jsonb_array_elements(isi->'paket') p, jsonb_array_elements(p->'soal') x where p->>'kode' = pk loop
      opsi := opsi || jsonb_build_object(q->>'id', jsonb_build_object(
        't1', (select jsonb_agg(i order by random()) from generate_series(0, jsonb_array_length(q->'tier1'->'opsi') - 1) i),
        't2', (select jsonb_agg(i order by random()) from generate_series(0, jsonb_array_length(q->'tier2'->'opsi') - 1) i)));
    end loop;
    update public.attempt set paket = pk, urutan_soal = daftar, urutan_opsi = opsi where id = a.id;
  end if;

  basis := case when s.mode_mulai = 'serentak' and not a.uji then s.dimulai_at else now() end;
  update public.attempt set status = 'aktif',
    mulai_at = coalesce(mulai_at, now()),
    batas_at = coalesce(batas_at,
      least(case when a.uji then 'infinity'::timestamptz else s.tutup_at end,
            basis + make_interval(mins => s.durasi_menit + a.tambahan_menit)))
  where id = a.id;
  return public.mhs_soal(p_token, p_device);
end $$;

create or replace function public.mhs_jawab(p_token uuid, p_device text, p_soal text,
  p_t1 int, p_t2 int, p_t3 int, p_ragu boolean, p_urut bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt; s public.sesi_ujian; asli1 int; asli2 int; posisi_ke int;
begin
  select * into a from public.attempt where token = p_token;
  if not found then raise exception 'Sesi ujian Anda tidak ditemukan.'; end if;
  if a.device_id is distinct from p_device then raise exception 'Ujian Anda sedang dibuka di perangkat lain.'; end if;
  if a.status <> 'aktif' then raise exception 'Ujian sudah selesai; jawaban tidak dapat diubah.'; end if;
  if now() > a.batas_at + interval '2 minutes' then
    perform public._finalisasi(a.id, 'waktu');
    raise exception 'Waktu ujian sudah habis.';
  end if;
  select * into s from public.sesi_ujian where id = a.sesi_id;
  select (x.ord - 1)::int into posisi_ke from jsonb_array_elements_text(a.urutan_soal) with ordinality x(v, ord) where x.v = p_soal;
  if posisi_ke is null then raise exception 'Soal tidak dikenal.'; end if;
  if s.navigasi = 'berurutan' and posisi_ke <> a.posisi then
    raise exception 'Mode berurutan: soal ini tidak dapat dijawab lagi.';
  end if;
  if p_t1 is not null then asli1 := (a.urutan_opsi->p_soal->'t1'->>p_t1)::int; end if;
  if p_t2 is not null then asli2 := (a.urutan_opsi->p_soal->'t2'->>p_t2)::int; end if;
  insert into public.jawaban (attempt_id, soal_id, t1, t2, t3, ragu, urut, diperbarui_at)
    values (a.id, p_soal, asli1, asli2, p_t3, coalesce(p_ragu, false), p_urut, now())
    on conflict (attempt_id, soal_id) do update
      set t1 = excluded.t1, t2 = excluded.t2, t3 = excluded.t3, ragu = excluded.ragu,
          urut = excluded.urut, diperbarui_at = now()
      where public.jawaban.urut <= excluded.urut;
  update public.attempt set terakhir_aktif_at = now() where id = a.id;
  return jsonb_build_object('ok', true, 'soal', p_soal, 'urut', p_urut);
end $$;

create or replace function public.mhs_lanjut(p_token uuid, p_device text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt;
begin
  a := public._attempt(p_token, p_device);
  if a.status <> 'aktif' then raise exception 'Ujian sudah selesai.'; end if;
  update public.attempt set posisi = least(posisi + 1, jsonb_array_length(urutan_soal) - 1) where id = a.id;
  return public.mhs_soal(p_token, p_device);
end $$;

create or replace function public.mhs_kejadian(p_token uuid, p_device text, p_jenis text, p_lama int, p_soal text, p_mulai bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt; s public.sesi_ujian; hitung boolean;
begin
  a := public._attempt(p_token, p_device);
  select * into s from public.sesi_ujian where id = a.sesi_id;
  if a.status <> 'aktif' then
    return jsonb_build_object('pelanggaran', a.pelanggaran, 'ambang', s.ambang, 'selesai', a.status = 'selesai');
  end if;
  hitung := p_jenis in ('tab', 'layar_penuh') and coalesce(p_lama, 0) >= 2;
  insert into public.log_kejadian (attempt_id, jenis, mulai_at, lama_detik, soal_id, dihitung)
    values (a.id, p_jenis, coalesce(to_timestamp(p_mulai / 1000.0), now()), coalesce(p_lama, 0), p_soal, hitung);
  if hitung then
    update public.attempt set pelanggaran = pelanggaran + 1 where id = a.id returning * into a;
    if a.pelanggaran >= s.ambang then perform public._finalisasi(a.id, 'pelanggaran'); end if;
  end if;
  select * into a from public.attempt where id = a.id;
  return jsonb_build_object('pelanggaran', a.pelanggaran, 'ambang', s.ambang, 'selesai', a.status = 'selesai');
end $$;

create or replace function public.mhs_hasil(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt; s public.sesi_ujian; isi jsonb; lvl int; sid text; q jsonb; j public.jawaban;
  per jsonb := '[]'::jsonb; ringkas jsonb; konsep jsonb; riwayat jsonb; no int := 0; item jsonb;
begin
  select * into a from public.attempt where token = p_token;
  if not found then raise exception 'Data ujian tidak ditemukan.'; end if;
  if a.status <> 'selesai' then raise exception 'Ujian belum selesai.'; end if;
  select * into s from public.sesi_ujian where id = a.sesi_id;
  select b.isi into isi from public.bank_soal b where b.id = s.bank_soal_id;
  lvl := case when s.status = 'ditutup' then greatest(s.fb_tutup, s.fb_langsung) else s.fb_langsung end;

  select coalesce(jsonb_object_agg(kategori, n), '{}'::jsonb) into ringkas
    from (select kategori, count(*) n from public.jawaban where attempt_id = a.id group by kategori) t;

  select coalesce(jsonb_agg(distinct public._soal(isi, a.paket, j2.soal_id)->>'konsep'), '[]'::jsonb) into konsep
    from public.jawaban j2 where j2.attempt_id = a.id and j2.skor = 0
      and coalesce(public._soal(isi, a.paket, j2.soal_id)->>'konsep', '') <> '';

  select coalesce(jsonb_agg(jsonb_build_object('jenis', jenis, 'mulai_at', public._ms(mulai_at),
      'lama_detik', lama_detik, 'dihitung', dihitung) order by mulai_at), '[]'::jsonb) into riwayat
    from public.log_kejadian where attempt_id = a.id;

  if lvl >= 3 then
    for sid in select jsonb_array_elements_text(a.urutan_soal) loop
      no := no + 1;
      q := public._soal(isi, a.paket, sid);
      select * into j from public.jawaban where attempt_id = a.id and soal_id = sid;
      item := jsonb_build_object('no', no, 'konsep', q->>'konsep', 'kategori', j.kategori, 'skor', j.skor,
        'feedback', case when j.t2 is not null and j.t2 <> (q->'tier2'->>'kunci')::int
                         then q->'tier2'->'feedback'->>j.t2 end);
      if lvl >= 4 then
        item := item || jsonb_build_object(
          'soal', q->'tier1'->>'teks', 'gambar', q->'gambar',
          'kunci_t1', public._opsi(q->'tier1'->'opsi', (q->'tier1'->>'kunci')::int),
          'kunci_t2', public._opsi(q->'tier2'->'opsi', (q->'tier2'->>'kunci')::int),
          'pilihan_t1', case when j.t1 is null then null else public._opsi(q->'tier1'->'opsi', j.t1) end,
          'pilihan_t2', case when j.t2 is null then null else public._opsi(q->'tier2'->'opsi', j.t2) end,
          'pembahasan', q->>'pembahasan');
      end if;
      per := per || jsonb_build_array(item);
    end loop;
  end if;

  return jsonb_build_object('nilai', a.nilai, 'kode_bukti', a.kode_bukti, 'selesai_at', public._ms(a.selesai_at),
    'cara_selesai', a.cara_selesai, 'paket', a.paket, 'tingkat', lvl, 'sesi_ditutup', s.status = 'ditutup',
    'jumlah_soal', jsonb_array_length(a.urutan_soal), 'bank_id', s.bank_soal_id, 'sesi_nama', s.nama,
    'ringkas', case when lvl >= 2 then ringkas end, 'konsep_ulang', case when lvl >= 2 then konsep end,
    'per_soal', case when lvl >= 3 then per end, 'riwayat', riwayat);
end $$;

create or replace function public.mhs_kirim(p_token uuid, p_device text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt;
begin
  a := public._attempt(p_token, p_device);
  if a.device_id is distinct from p_device then raise exception 'Ujian Anda sedang dibuka di perangkat lain.'; end if;
  perform public._finalisasi(a.id, 'manual');
  return public.mhs_hasil(p_token);
end $$;

-- ---------------------------------------------------------------------
-- 5. Fungsi untuk dosen (wajib login)
-- ---------------------------------------------------------------------
create or replace function public._cek_sesi(p_sesi uuid) returns public.sesi_ujian
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sesi_ujian;
begin
  select * into s from public.sesi_ujian where id = p_sesi and dosen_id = auth.uid();
  if not found then raise exception 'Sesi tidak ditemukan atau bukan milik Anda.'; end if;
  return s;
end $$;

create or replace function public._cek_attempt(p_attempt uuid) returns public.attempt
language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt;
begin
  select a2.* into a from public.attempt a2 join public.sesi_ujian s on s.id = a2.sesi_id
    where a2.id = p_attempt and s.dosen_id = auth.uid();
  if not found then raise exception 'Peserta tidak ditemukan atau bukan milik sesi Anda.'; end if;
  return a;
end $$;

drop function if exists public.dosen_tambah_peserta(uuid, jsonb);
create or replace function public.dosen_tambah_peserta(p_kelas uuid, p_data jsonb)
returns table (o_nim text, o_nama text, o_pin text)
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb; kode text;
begin
  if not exists (select 1 from public.kelas k where k.id = p_kelas and k.dosen_id = auth.uid()) then
    raise exception 'Kelas tidak ditemukan atau bukan milik Anda.';
  end if;
  for r in select * from jsonb_array_elements(p_data) loop
    kode := lpad(floor(random() * 1000000)::int::text, 6, '0');
    insert into public.peserta (kelas_id, nim, nama, pin_hash)
      values (p_kelas, trim(r->>'nim'), trim(r->>'nama'), crypt(kode, gen_salt('bf')))
      on conflict (kelas_id, nim) do update set nama = excluded.nama, pin_hash = excluded.pin_hash;
    o_nim := trim(r->>'nim'); o_nama := trim(r->>'nama'); o_pin := kode;
    return next;
  end loop;
end $$;

create or replace function public.dosen_izinkan(p_attempt uuid[])
returns int language plpgsql security definer set search_path = public, extensions as $$
declare x uuid; a public.attempt; n int := 0;
begin
  foreach x in array p_attempt loop
    a := public._cek_attempt(x);
    if a.status in ('menunggu', 'ditolak') then
      update public.attempt set status = case when mulai_at is null then 'diizinkan' else 'aktif' end,
        diizinkan_at = now() where id = x;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.dosen_tolak(p_attempt uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt;
begin
  a := public._cek_attempt(p_attempt);
  if a.status in ('menunggu', 'diizinkan') then
    update public.attempt set status = 'ditolak' where id = p_attempt;
  end if;
end $$;

create or replace function public.dosen_mulai(p_sesi uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare s public.sesi_ujian;
begin
  s := public._cek_sesi(p_sesi);
  update public.sesi_ujian set dimulai_at = coalesce(dimulai_at, now()) where id = p_sesi;
end $$;

create or replace function public.dosen_tambah_waktu(p_attempt uuid, p_menit int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt;
begin
  a := public._cek_attempt(p_attempt);
  update public.attempt set tambahan_menit = tambahan_menit + p_menit,
    batas_at = case when batas_at is null then null else batas_at + make_interval(mins => p_menit) end
  where id = p_attempt;
end $$;

create or replace function public.dosen_reset(p_attempt uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a public.attempt;
begin
  a := public._cek_attempt(p_attempt);
  update public.attempt set status = 'diarsipkan', direset_at = now() where id = p_attempt;
end $$;

create or replace function public.dosen_uji_coba(p_sesi uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare s public.sesi_ujian; t uuid;
begin
  s := public._cek_sesi(p_sesi);
  delete from public.attempt where sesi_id = p_sesi and uji;
  insert into public.attempt (sesi_id, uji, status, diizinkan_at) values (p_sesi, true, 'diizinkan', now())
    returning token into t;
  return t;
end $$;

create or replace function public.dosen_tutup(p_sesi uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare s public.sesi_ujian; x uuid;
begin
  s := public._cek_sesi(p_sesi);
  for x in select id from public.attempt where sesi_id = p_sesi and mulai_at is not null
           and status not in ('selesai','diarsipkan') loop
    perform public._finalisasi(x, 'ditutup');
  end loop;
  delete from public.attempt where sesi_id = p_sesi and uji;
  update public.sesi_ujian set status = 'ditutup' where id = p_sesi;
end $$;

create or replace function public.dosen_pantau(p_sesi uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.sesi_ujian; peserta jsonb; kejadian jsonb; total int; isi jsonb;
begin
  s := public._cek_sesi(p_sesi);
  perform public._tutup_kedaluwarsa(p_sesi);
  select b.isi into isi from public.bank_soal b where b.id = s.bank_soal_id;
  select jsonb_array_length(p->'soal') into total from jsonb_array_elements(isi->'paket') p
    where p->>'kode' = s.paket[1] limit 1;

  select coalesce(jsonb_agg(row_to_json(t) order by t.urut_status, t.nama), '[]'::jsonb) into peserta from (
    select a.id, a.status, a.uji, coalesce(p.nim, '-') nim, coalesce(p.nama, 'Uji coba dosen') nama,
      a.perangkat, a.cek, a.paket, a.pelanggaran, a.nilai, a.rtt_ms,
      public._ms(a.masuk_at) masuk_at, public._ms(a.terakhir_aktif_at) terakhir_aktif_at,
      (a.terakhir_aktif_at > now() - interval '45 seconds') online,
      greatest(0, extract(epoch from (a.batas_at - now())))::int sisa_detik,
      (select count(*) from public.jawaban j where j.attempt_id = a.id and j.t1 is not null
         and j.t2 is not null and j.t3 is not null) terjawab,
      (select jenis || '|' || lama_detik || '|' || public._ms(mulai_at) from public.log_kejadian l
         where l.attempt_id = a.id and l.jenis <> 'offline' order by mulai_at desc limit 1) kejadian_terakhir,
      exists (select 1 from public.attempt b where b.sesi_id = a.sesi_id and b.peserta_id = a.peserta_id
              and b.id <> a.id and b.status <> 'diarsipkan') ganda,
      case when a.status = 'aktif' and a.pelanggaran >= s.ambang then 0
           when a.status = 'aktif' and a.terakhir_aktif_at < now() - interval '45 seconds' then 1
           when a.status = 'menunggu' then 2
           when a.status = 'aktif' then 3 when a.status = 'diizinkan' then 4
           else 5 end urut_status
    from public.attempt a left join public.peserta p on p.id = a.peserta_id
    where a.sesi_id = p_sesi and a.status <> 'diarsipkan') t;

  select coalesce(jsonb_agg(row_to_json(k) order by k.waktu desc), '[]'::jsonb) into kejadian from (
    select public._ms(l.mulai_at) waktu, coalesce(p.nama, 'Uji coba') nama, l.jenis, l.lama_detik, l.dihitung
    from public.log_kejadian l join public.attempt a on a.id = l.attempt_id
    left join public.peserta p on p.id = a.peserta_id
    where a.sesi_id = p_sesi order by l.mulai_at desc limit 25) k;

  return jsonb_build_object('sekarang', public._ms(now()), 'total_soal', total,
    'terdaftar', (select count(*) from public.peserta where kelas_id = s.kelas_id),
    'dimulai_at', public._ms(s.dimulai_at), 'peserta', peserta, 'kejadian', kejadian);
end $$;

create or replace function public.dosen_rekap(p_sesi uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.sesi_ujian; isi jsonb; hasil jsonb;
begin
  s := public._cek_sesi(p_sesi);
  perform public._tutup_kedaluwarsa(p_sesi);
  select b.isi into isi from public.bank_soal b where b.id = s.bank_soal_id;
  select coalesce(jsonb_agg(row_to_json(t) order by t.nim), '[]'::jsonb) into hasil from (
    select a.id, p.nim, p.nama, a.paket, a.status, a.nilai, a.pelanggaran, a.cara_selesai, a.kode_bukti,
      public._ms(a.mulai_at) mulai_at, public._ms(a.selesai_at) selesai_at,
      (select coalesce(jsonb_agg(jsonb_build_object('soal', j.soal_id,
          'konsep', public._soal(isi, a.paket, j.soal_id)->>'konsep',
          't1', j.t1, 't2', j.t2, 't3', j.t3, 'kategori', j.kategori, 'skor', j.skor) order by j.soal_id), '[]'::jsonb)
        from public.jawaban j where j.attempt_id = a.id) jawaban,
      (select coalesce(jsonb_agg(jsonb_build_object('jenis', l.jenis, 'mulai_at', public._ms(l.mulai_at),
          'lama_detik', l.lama_detik, 'dihitung', l.dihitung, 'soal', l.soal_id) order by l.mulai_at), '[]'::jsonb)
        from public.log_kejadian l where l.attempt_id = a.id) log
    from public.attempt a join public.peserta p on p.id = a.peserta_id
    where a.sesi_id = p_sesi and not a.uji and a.status <> 'diarsipkan') t;
  return jsonb_build_object('sesi', row_to_json(s), 'peserta', hasil);
end $$;

-- ---------------------------------------------------------------------
-- 6. Hak akses fungsi
-- ---------------------------------------------------------------------
revoke all on function public._soal(jsonb, text, text), public._opsi(jsonb, int), public._ms(timestamptz),
  public._kategori(boolean, boolean, int, text), public._finalisasi(uuid, text), public._tutup_kedaluwarsa(uuid),
  public._attempt(uuid, text), public._info(public.attempt, text), public._cek_sesi(uuid), public._cek_attempt(uuid)
  from public, anon, authenticated;

grant execute on function public.mhs_masuk(text, text, text, text, text), public.mhs_cek(uuid, text, jsonb),
  public.mhs_detak(uuid, text, int, int), public.mhs_soal(uuid, text), public.mhs_mulai(uuid, text),
  public.mhs_jawab(uuid, text, text, int, int, int, boolean, bigint), public.mhs_lanjut(uuid, text),
  public.mhs_kejadian(uuid, text, text, int, text, bigint), public.mhs_hasil(uuid), public.mhs_kirim(uuid, text)
  to anon, authenticated;

revoke all on function public.dosen_tambah_peserta(uuid, jsonb), public.dosen_izinkan(uuid[]), public.dosen_tolak(uuid),
  public.dosen_mulai(uuid), public.dosen_tambah_waktu(uuid, int), public.dosen_reset(uuid), public.dosen_uji_coba(uuid),
  public.dosen_tutup(uuid), public.dosen_pantau(uuid), public.dosen_rekap(uuid) from public, anon;
grant execute on function public.dosen_tambah_peserta(uuid, jsonb), public.dosen_izinkan(uuid[]), public.dosen_tolak(uuid),
  public.dosen_mulai(uuid), public.dosen_tambah_waktu(uuid, int), public.dosen_reset(uuid), public.dosen_uji_coba(uuid),
  public.dosen_tutup(uuid), public.dosen_pantau(uuid), public.dosen_rekap(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Penyimpanan gambar soal (Supabase Storage)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('gambar', 'gambar', true)
  on conflict (id) do nothing;

drop policy if exists gambar_dosen_baca on storage.objects;
create policy gambar_dosen_baca on storage.objects for select to authenticated
  using (bucket_id = 'gambar' and exists (
    select 1 from public.bank_soal b where b.id::text = (storage.foldername(name))[1] and b.dosen_id = auth.uid()));

drop policy if exists gambar_dosen_tulis on storage.objects;
create policy gambar_dosen_tulis on storage.objects for insert to authenticated
  with check (bucket_id = 'gambar' and exists (
    select 1 from public.bank_soal b where b.id::text = (storage.foldername(name))[1] and b.dosen_id = auth.uid()));

drop policy if exists gambar_dosen_ubah on storage.objects;
create policy gambar_dosen_ubah on storage.objects for update to authenticated
  using (bucket_id = 'gambar' and exists (
    select 1 from public.bank_soal b where b.id::text = (storage.foldername(name))[1] and b.dosen_id = auth.uid()));

drop policy if exists gambar_dosen_hapus on storage.objects;
create policy gambar_dosen_hapus on storage.objects for delete to authenticated
  using (bucket_id = 'gambar' and exists (
    select 1 from public.bank_soal b where b.id::text = (storage.foldername(name))[1] and b.dosen_id = auth.uid()));
