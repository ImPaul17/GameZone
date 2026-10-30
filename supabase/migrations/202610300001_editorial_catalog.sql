-- Run once in the Supabase SQL editor or with `supabase db push`.
-- Browser roles cannot read drafts or grant themselves editorial permissions.
create table if not exists public.editor_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.editor_roles enable row level security;
revoke all on public.editor_roles from public, anon, authenticated;
grant select, insert, update, delete on public.editor_roles to service_role;

create table if not exists public.catalog_records (
  id uuid primary key,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  draft_slug text not null unique check (draft_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  source_key text unique,
  locked_slug text,
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null default now(),
  check (record->>'id' = id::text),
  check ((record->>'revision')::bigint = revision),
  check (record->'draft'->>'slug' = draft_slug),
  check (locked_slug is null or locked_slug = draft_slug)
);
alter table public.catalog_records enable row level security;
revoke all on public.catalog_records from public, anon, authenticated;
grant select, insert, update, delete on public.catalog_records to service_role;

create or replace function public.catalog_create_record(p_record jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_source text; v_record jsonb;
begin
  if jsonb_typeof(p_record->'draft') <> 'object'
     or p_record->>'revision' <> '1'
     or p_record->'published' <> 'null'::jsonb then
    raise exception 'invalid_record';
  end if;
  if jsonb_typeof(p_record->'source') = 'object' then
    if p_record->'source'->>'provider' <> 'pivigames' then raise exception 'invalid_source'; end if;
    v_source := (p_record->'source'->>'provider') || ':' || (p_record->'source'->>'id');
  end if;
  v_record := p_record || jsonb_build_object('lockedSlug', null);
  insert into public.catalog_records (id, record, draft_slug, source_key, revision)
    values ((v_record->>'id')::uuid, v_record, v_record->'draft'->>'slug', v_source, 1);
  return v_record;
end;
$$;

create or replace function public.catalog_update_record(
  p_id uuid, p_content jsonb, p_expected_revision bigint, p_action text,
  p_last_imported jsonb default null, p_update_baseline boolean default false,
  p_source jsonb default null, p_update_source boolean default false
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_row public.catalog_records%rowtype;
  v_record jsonb;
  v_source_key text;
  v_locked_slug text;
  v_now text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_action not in ('save', 'publish', 'unpublish') or jsonb_typeof(p_content) <> 'object' then raise exception 'invalid_action'; end if;
  select * into v_row from public.catalog_records where id = p_id for update;
  if not found then raise exception 'record_not_found'; end if;
  if v_row.revision <> p_expected_revision then raise exception 'revision_conflict'; end if;
  if v_row.locked_slug is not null and v_row.locked_slug <> (p_content->>'slug') then raise exception 'slug_locked'; end if;
  v_source_key := v_row.source_key;
  if p_update_source then
    if jsonb_typeof(p_source) = 'object' then
      if (p_source->>'provider') is distinct from 'pivigames' or coalesce(p_source->>'id', '') !~ '^[a-zA-Z0-9_-]{1,160}$' then raise exception 'invalid_source'; end if;
      v_source_key := (p_source->>'provider') || ':' || (p_source->>'id');
    elsif p_source is null or p_source = 'null'::jsonb then
      v_source_key := null;
    else raise exception 'invalid_source';
    end if;
    if v_row.source_key is not null and v_row.source_key is distinct from v_source_key then raise exception 'source_locked'; end if;
  end if;
  v_locked_slug := coalesce(v_row.locked_slug, case when p_action = 'publish' then p_content->>'slug' else null end);
  v_record := v_row.record || jsonb_build_object('draft', p_content, 'revision', v_row.revision + 1, 'updatedAt', v_now, 'lockedSlug', v_locked_slug);
  if p_action = 'publish' then
    v_record := v_record || jsonb_build_object('published', p_content, 'publishedAt', v_now);
  elsif p_action = 'unpublish' then
    v_record := v_record || jsonb_build_object('published', null, 'publishedAt', null);
  end if;
  if p_update_baseline then v_record := v_record || jsonb_build_object('lastImported', p_last_imported); end if;
  if p_update_source then v_record := v_record || jsonb_build_object('source', p_source); end if;
  update public.catalog_records set record = v_record, draft_slug = p_content->>'slug',
    locked_slug = v_locked_slug,
    source_key = v_source_key, revision = v_row.revision + 1, updated_at = now() where id = p_id;
  return v_record;
end;
$$;

revoke all on function public.catalog_create_record(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_update_record(uuid, jsonb, bigint, text, jsonb, boolean, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.catalog_create_record(jsonb) to service_role;
grant execute on function public.catalog_update_record(uuid, jsonb, bigint, text, jsonb, boolean, jsonb, boolean) to service_role;
