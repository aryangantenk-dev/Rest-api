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
