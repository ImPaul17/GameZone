-- News editorial snapshots are private. Only the trusted server projects published content.
create table if not exists public.news_records (
  id uuid primary key,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  draft_slug text not null unique check (draft_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  locked_slug text,
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null default now(),
  check (record->>'id' = id::text),
  check ((record->>'revision')::bigint = revision),
  check (record->'draft'->>'slug' = draft_slug),
  check (locked_slug is null or locked_slug = draft_slug)
);
alter table public.news_records enable row level security;
revoke all on public.news_records from public, anon, authenticated;
grant select, insert, update, delete on public.news_records to service_role;

create or replace function public.news_create_record(p_record jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_record jsonb;
begin
  if jsonb_typeof(p_record) is distinct from 'object'
     or not (p_record ?& array['id','draft','published','publishedAt','lockedSlug','revision','createdAt','updatedAt'])
     or jsonb_typeof(p_record->'draft') is distinct from 'object'
     or p_record->>'revision' is distinct from '1'
     or p_record->'published' is distinct from 'null'::jsonb
     or p_record->'publishedAt' is distinct from 'null'::jsonb
     or p_record->'lockedSlug' is distinct from 'null'::jsonb
  then raise exception 'invalid_record'; end if;
  v_record := p_record || jsonb_build_object('lockedSlug', null);
  insert into public.news_records(id,record,draft_slug,locked_slug,revision,updated_at)
    values ((v_record->>'id')::uuid,v_record,v_record->'draft'->>'slug',null,1,(v_record->>'updatedAt')::timestamptz);
  return v_record;
end;
$$;

create or replace function public.news_update_record(p_id uuid,p_content jsonb,p_expected_revision bigint,p_action text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_row public.news_records%rowtype;
  v_record jsonb;
  v_locked_slug text;
  v_now text := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_action is null or p_action not in ('save','publish','unpublish') or jsonb_typeof(p_content) is distinct from 'object' then raise exception 'invalid_action'; end if;
  select * into v_row from public.news_records where id=p_id for update;
  if not found then raise exception 'record_not_found'; end if;
  if p_expected_revision is distinct from v_row.revision then raise exception 'revision_conflict'; end if;
  if v_row.locked_slug is not null and v_row.locked_slug is distinct from p_content->>'slug' then raise exception 'slug_locked'; end if;
  v_locked_slug := coalesce(v_row.locked_slug,case when p_action='publish' then p_content->>'slug' else null end);
  v_record := v_row.record || jsonb_build_object('draft',p_content,'revision',v_row.revision+1,'updatedAt',v_now,'lockedSlug',v_locked_slug);
  if p_action='publish' then v_record := v_record || jsonb_build_object('published',p_content,'publishedAt',v_now);
  elsif p_action='unpublish' then v_record := v_record || jsonb_build_object('published',null,'publishedAt',null); end if;
  update public.news_records set record=v_record,draft_slug=p_content->>'slug',locked_slug=v_locked_slug,revision=v_row.revision+1,updated_at=now() where id=p_id;
  return v_record;
end;
$$;

revoke all on function public.news_create_record(jsonb) from public,anon,authenticated;
revoke all on function public.news_update_record(uuid,jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.news_create_record(jsonb) to service_role;
grant execute on function public.news_update_record(uuid,jsonb,bigint,text) to service_role;
