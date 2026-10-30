-- Member profiles never contain email addresses or editorial roles.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 500),
  discord_avatar_url text check (discord_avatar_url is null or discord_avatar_url ~ '^https://cdn[.]discordapp[.]com/(avatars/[0-9]{17,20}/(a_)?[a-f0-9]{32}[.]webp[?]size=256|embed/avatars/[0-5][.]png)$'),
  avatar_path text check (avatar_path is null or (split_part(avatar_path, '/', 1) = id::text and avatar_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}[.]webp$')),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create or replace function public.touch_member_profile_updated_at()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
revoke all on function public.touch_member_profile_updated_at() from public, anon, authenticated;
grant execute on function public.touch_member_profile_updated_at() to authenticated, service_role;
drop trigger if exists member_profile_updated_at on public.profiles;
create trigger member_profile_updated_at before update on public.profiles for each row execute function public.touch_member_profile_updated_at();
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name, bio) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

drop policy if exists "Members read their own profile" on public.profiles;
create policy "Members read their own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists "Members edit their own profile" on public.profiles;
create policy "Members edit their own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Raw uploads remain server-only so every published avatar passes image decoding and normalization.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 4194304, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members read their own avatars" on storage.objects;
create policy "Members read their own avatars" on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
