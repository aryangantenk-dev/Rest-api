-- Skema yanz.api untuk Supabase (backend REST).
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- RLS aktif tanpa policy, jadi tabel hanya bisa diakses dengan service role /
-- secret key (yang hanya dipakai di server), bukan dengan anon key.

create table if not exists public.api_stats (
  path varchar(120) primary key,
  hits integer not null default 0,
  updated_at timestamp not null default now()
);

create table if not exists public.short_links (
  id serial primary key,
  code varchar(16) not null unique,
  url text not null,
  hits integer not null default 0,
  created_at timestamp not null default now()
);

create index if not exists short_links_url_idx on public.short_links using hash (url);

-- IP yang diblokir karena melewati batas permintaan berulang kali.
-- Buka blokir: hapus barisnya di sini, atau panggil /api/admin/unban.
create table if not exists public.banned_ips (
  ip varchar(64) primary key,
  reason text not null default '',
  created_at timestamp not null default now()
);

alter table public.banned_ips enable row level security;
alter table public.api_stats enable row level security;
alter table public.short_links enable row level security;

create or replace function public.record_api_hit(p_path text)
returns void
language sql
set search_path = ''
as $$
  insert into public.api_stats (path, hits)
  values (left(p_path, 120), 1)
  on conflict (path) do update set hits = public.api_stats.hits + 1, updated_at = now();
$$;

create or replace function public.api_stats_summary()
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'totalRequests', (select coalesce(sum(hits), 0)::int from public.api_stats),
    'top', (select coalesce(json_agg(t), '[]'::json) from (select path, hits from public.api_stats order by hits desc limit 5) t)
  );
$$;

-- Mengembalikan kode milik p_url; membuatnya dengan p_code bila belum ada.
-- Mengembalikan null bila p_code sudah dipakai URL lain (pemanggil mencoba kode baru).
create or replace function public.shorten_url(p_url text, p_code text)
returns json
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  select code, hits into r from public.short_links where url = p_url limit 1;
  if found then
    return json_build_object('code', r.code, 'hits', r.hits);
  end if;
  insert into public.short_links (code, url) values (p_code, p_url);
  return json_build_object('code', p_code, 'hits', 0);
exception when unique_violation then
  return null;
end;
$$;

create or replace function public.resolve_short_link(p_code text)
returns text
language sql
set search_path = ''
as $$
  update public.short_links set hits = hits + 1 where code = p_code returning url;
$$;

revoke all on function public.record_api_hit(text) from public, anon, authenticated;
revoke all on function public.api_stats_summary() from public, anon, authenticated;
revoke all on function public.shorten_url(text, text) from public, anon, authenticated;
revoke all on function public.resolve_short_link(text) from public, anon, authenticated;
grant execute on function public.record_api_hit(text) to service_role;
grant execute on function public.api_stats_summary() to service_role;
grant execute on function public.shorten_url(text, text) to service_role;
grant execute on function public.resolve_short_link(text) to service_role;

-- ---------------------------------------------------------------------------
-- Akun pengguna dan API key (login Google / email + kode OTP).
-- Hanya dipakai lewat fungsi di bawah, dengan service role dari server.
-- ---------------------------------------------------------------------------

create table if not exists public.api_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  avatar text not null default '',
  -- Cara masuk saat akun dibuat: 'google' atau 'email'.
  provider text not null default 'email',
  api_key text not null unique,
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  key_rotated_at timestamptz
);

-- Satu baris per alamat email. Kodenya tidak disimpan, hanya hash-nya.
create table if not exists public.auth_otps (
  email text primary key,
  code_hash text not null default '',
  expires_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_sent_at timestamptz not null default now(),
  window_start timestamptz not null default now(),
  window_sends integer not null default 1,
  ip text not null default ''
);

create index if not exists auth_otps_last_sent_idx on public.auth_otps (last_sent_at);

-- Username (wajib diisi sebelum akun dipakai; null selama belum dipilih) dan foto profil
-- (opsional; nama berkas di folder avatars/ pada bucket gambar, kosong berarti belum diatur).
alter table public.api_users add column if not exists username text;
alter table public.api_users add column if not exists photo text not null default '';
create unique index if not exists api_users_username_key on public.api_users (username);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'api_users_username_format') then
    alter table public.api_users add constraint api_users_username_format
      check (username is null or username ~ '^[a-z][a-z0-9_]{2,19}$');
  end if;
end
$$;

alter table public.api_users enable row level security;
alter table public.auth_otps enable row level security;
revoke all on table public.api_users from anon, authenticated;
revoke all on table public.auth_otps from anon, authenticated;
grant all on table public.api_users to service_role;
grant all on table public.auth_otps to service_role;

create or replace function public.auth_user_json(u public.api_users)
returns json
language sql
immutable
set search_path = ''
as $$
  select json_build_object(
    'id', u.id, 'email', u.email, 'name', u.name, 'avatar', u.avatar, 'provider', u.provider,
    'username', coalesce(u.username, ''), 'photo', u.photo,
    'api_key', u.api_key, 'banned', u.banned, 'created_at', u.created_at, 'last_login_at', u.last_login_at
  );
$$;

-- Masuk atau daftar: membuat akun dengan p_key bila email belum dikenal.
create or replace function public.auth_login(p_email text, p_name text, p_avatar text, p_provider text, p_key text)
returns json
language plpgsql
set search_path = ''
as $$
declare
  u public.api_users;
begin
  insert into public.api_users (email, name, avatar, provider, api_key)
  values (p_email, coalesce(p_name, ''), coalesce(p_avatar, ''), p_provider, p_key)
  on conflict (email) do update set
    last_login_at = clock_timestamp(),
    name = case when public.api_users.name = '' then excluded.name else public.api_users.name end,
    avatar = case when excluded.avatar <> '' then excluded.avatar else public.api_users.avatar end
  returning * into u;
  return public.auth_user_json(u);
end;
$$;

create or replace function public.auth_user(p_id uuid)
returns json
language sql
stable
set search_path = ''
as $$
  select public.auth_user_json(u) from public.api_users u where u.id = p_id;
$$;

-- Dipanggil untuk memeriksa API key pada setiap permintaan (hasilnya di-cache di server).
create or replace function public.auth_key_user(p_key text)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object('id', u.id, 'banned', u.banned) from public.api_users u where u.api_key = p_key;
$$;

create or replace function public.auth_rotate_key(p_id uuid, p_key text)
returns json
language plpgsql
set search_path = ''
as $$
declare
  u public.api_users;
begin
  update public.api_users set api_key = p_key, key_rotated_at = now() where id = p_id returning * into u;
  if not found then
    return null;
  end if;
  return public.auth_user_json(u);
end;
$$;

-- Catat kode OTP baru. status: 'sent', 'cooldown' (baru saja dikirim), 'limit' (kuota email/IP per jam habis),
-- atau 'busy' (kuota seluruh situs per jam habis). 'wait' = detik sampai boleh mencoba lagi.
create or replace function public.auth_otp_issue(
  p_email text, p_hash text, p_ip text, p_ttl integer, p_cooldown integer,
  p_max_email integer, p_max_ip integer, p_max_site integer
)
returns json
language plpgsql
set search_path = ''
as $$
declare
  r public.auth_otps;
  fresh boolean;
  wait integer;
  n integer;
begin
  if random() < 0.02 then
    delete from public.auth_otps where last_sent_at < now() - interval '2 days';
  end if;

  select coalesce(sum(window_sends), 0) into n from public.auth_otps where last_sent_at > now() - interval '1 hour';
  if n >= p_max_site then
    return json_build_object('status', 'busy', 'wait', 600);
  end if;
  if p_ip <> '' then
    select coalesce(sum(window_sends), 0) into n from public.auth_otps where ip = p_ip and last_sent_at > now() - interval '1 hour';
    if n >= p_max_ip then
      return json_build_object('status', 'limit', 'wait', 1800);
    end if;
  end if;

  select * into r from public.auth_otps where email = p_email for update;
  if found then
    wait := p_cooldown - floor(extract(epoch from (now() - r.last_sent_at)))::integer;
    if wait > 0 then
      return json_build_object('status', 'cooldown', 'wait', wait);
    end if;
    fresh := r.window_start <= now() - interval '1 hour';
    if not fresh and r.window_sends >= p_max_email then
      return json_build_object('status', 'limit', 'wait', ceil(extract(epoch from (r.window_start + interval '1 hour' - now())))::integer);
    end if;
    update public.auth_otps set
      code_hash = p_hash,
      expires_at = now() + make_interval(secs => p_ttl),
      attempts = 0,
      last_sent_at = now(),
      ip = p_ip,
      window_start = case when fresh then now() else r.window_start end,
      window_sends = case when fresh then 1 else r.window_sends + 1 end
    where email = p_email;
  else
    insert into public.auth_otps (email, code_hash, expires_at, ip)
    values (p_email, p_hash, now() + make_interval(secs => p_ttl), p_ip)
    on conflict (email) do nothing;
    if not found then
      return json_build_object('status', 'cooldown', 'wait', p_cooldown);
    end if;
  end if;
  return json_build_object('status', 'sent', 'wait', p_cooldown);
end;
$$;

-- Periksa kode: 'ok', 'invalid', 'expired', 'locked' (terlalu banyak salah), atau 'none' (tidak ada kode aktif).
-- Kode hanya bisa dipakai sekali.
create or replace function public.auth_otp_check(p_email text, p_hash text, p_max_attempts integer)
returns text
language plpgsql
set search_path = ''
as $$
declare
  r public.auth_otps;
begin
  select * into r from public.auth_otps where email = p_email for update;
  if not found or r.code_hash = '' then
    return 'none';
  end if;
  if r.expires_at < now() then
    return 'expired';
  end if;
  if r.attempts >= p_max_attempts then
    return 'locked';
  end if;
  if r.code_hash = p_hash then
    update public.auth_otps set code_hash = '', attempts = 0 where email = p_email;
    return 'ok';
  end if;
  update public.auth_otps set attempts = attempts + 1 where email = p_email;
  return case when r.attempts + 1 >= p_max_attempts then 'locked' else 'invalid' end;
end;
$$;

-- Email gagal terkirim: batalkan kodenya supaya pengguna bisa langsung mencoba lagi.
create or replace function public.auth_otp_cancel(p_email text)
returns void
language sql
set search_path = ''
as $$
  update public.auth_otps
  set code_hash = '', last_sent_at = now() - interval '1 day', window_sends = greatest(window_sends - 1, 0)
  where email = p_email;
$$;

-- Untuk owner (/api/admin/users): akun terbaru, API key disamarkan.
create or replace function public.auth_admin_users(p_limit integer)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'total', (select count(*) from public.api_users),
    'users', (
      select coalesce(json_agg(t), '[]'::json) from (
        select email, coalesce(username, '') as username, name, provider, banned, created_at, last_login_at,
               left(api_key, 7) || '…' || right(api_key, 4) as api_key
        from public.api_users order by created_at desc limit greatest(1, least(p_limit, 500))
      ) t
    )
  );
$$;

-- true bila username sudah dipakai akun lain.
create or replace function public.auth_username_taken(p_username text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.api_users where username = p_username);
$$;

-- Isi atau ganti username. status: 'ok' (beserta akun), 'taken', 'invalid', atau 'none' (akun tidak ada).
create or replace function public.auth_set_username(p_id uuid, p_username text)
returns json
language plpgsql
set search_path = ''
as $$
declare
  u public.api_users;
begin
  update public.api_users set username = p_username where id = p_id returning * into u;
  if not found then
    return json_build_object('status', 'none');
  end if;
  return json_build_object('status', 'ok', 'user', public.auth_user_json(u));
exception
  when unique_violation then
    return json_build_object('status', 'taken');
  when check_violation then
    return json_build_object('status', 'invalid');
end;
$$;

-- Atur foto profil (p_photo kosong = hapus). Mengembalikan nama berkas lama supaya bisa dihapus dari penyimpanan.
create or replace function public.auth_set_photo(p_id uuid, p_photo text)
returns json
language plpgsql
set search_path = ''
as $$
declare
  u public.api_users;
  old text;
begin
  select photo into old from public.api_users where id = p_id for update;
  if not found then
    return null;
  end if;
  update public.api_users set photo = p_photo where id = p_id returning * into u;
  return json_build_object('old', old, 'user', public.auth_user_json(u));
end;
$$;

-- Nonaktifkan / aktifkan lagi sebuah akun (API key-nya ikut berhenti / jalan lagi).
create or replace function public.auth_set_banned(p_email text, p_banned boolean)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.api_users set banned = p_banned where email = lower(p_email);
  return found;
end;
$$;

revoke all on function public.auth_user_json(public.api_users) from public, anon, authenticated;
revoke all on function public.auth_login(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.auth_user(uuid) from public, anon, authenticated;
revoke all on function public.auth_key_user(text) from public, anon, authenticated;
revoke all on function public.auth_rotate_key(uuid, text) from public, anon, authenticated;
revoke all on function public.auth_otp_issue(text, text, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.auth_otp_check(text, text, integer) from public, anon, authenticated;
revoke all on function public.auth_otp_cancel(text) from public, anon, authenticated;
revoke all on function public.auth_admin_users(integer) from public, anon, authenticated;
revoke all on function public.auth_set_banned(text, boolean) from public, anon, authenticated;
revoke all on function public.auth_username_taken(text) from public, anon, authenticated;
revoke all on function public.auth_set_username(uuid, text) from public, anon, authenticated;
revoke all on function public.auth_set_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.auth_user_json(public.api_users) to service_role;
grant execute on function public.auth_login(text, text, text, text, text) to service_role;
grant execute on function public.auth_user(uuid) to service_role;
grant execute on function public.auth_key_user(text) to service_role;
grant execute on function public.auth_rotate_key(uuid, text) to service_role;
grant execute on function public.auth_otp_issue(text, text, text, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.auth_otp_check(text, text, integer) to service_role;
grant execute on function public.auth_otp_cancel(text) to service_role;
grant execute on function public.auth_admin_users(integer) to service_role;
grant execute on function public.auth_set_banned(text, boolean) to service_role;
grant execute on function public.auth_username_taken(text) to service_role;
grant execute on function public.auth_set_username(uuid, text) to service_role;
grant execute on function public.auth_set_photo(uuid, text) to service_role;
