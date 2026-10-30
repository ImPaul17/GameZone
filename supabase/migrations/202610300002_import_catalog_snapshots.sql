-- One-shot or repeated transfer of exact local snapshots. Never republish or overwrite.
-- Only the server's service_role can execute this operation.
create or replace function public.catalog_import_snapshots(p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_row jsonb;
  v_record jsonb;
  v_existing public.catalog_records%rowtype;
  v_source_key text;
  v_inserted integer := 0;
  v_identical integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) > 500
     or octet_length(p_rows::text) > 10485760 then
    raise exception 'migration_invalid_payload';
  end if;

  -- Serializes imports and excludes all concurrent INSERT/UPDATE/DELETE operations.
  -- The full function runs in the caller's single PostgREST transaction.
  lock table public.catalog_records in share row exclusive mode;

  if exists (
    select 1 from jsonb_array_elements(p_rows) item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_rows) item
    group by item->>'draft_slug' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_rows) item
    where item->>'source_key' is not null
    group by item->>'source_key' having count(*) > 1
  ) then raise exception 'migration_duplicate_payload'; end if;

  -- Validate every row and every collision before inserting anything.
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_record := v_row->'record';
    if jsonb_typeof(v_row) is distinct from 'object'
       or not (v_row ?& array['id','record','draft_slug','source_key','locked_slug','revision','updated_at'])
       or jsonb_typeof(v_record) is distinct from 'object'
       or not (v_record ?& array['id','draft','published','publishedAt','source','lastImported','revision','createdAt','updatedAt','lockedSlug'])
       or jsonb_typeof(v_record->'draft') is distinct from 'object'
       or v_row->>'id' is distinct from (v_row->>'id')::uuid::text
       or v_record->>'id' is distinct from v_row->>'id'
       or v_record->'revision' is distinct from v_row->'revision'
       or jsonb_typeof(v_row->'revision') is distinct from 'number'
       or (v_row->>'revision')::bigint < 1
       or (v_row->>'revision')::numeric <> (v_row->>'revision')::bigint
       or (v_row->>'revision')::numeric > 9007199254740991
       or coalesce(v_row->>'draft_slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or v_record->'draft'->>'slug' is distinct from v_row->>'draft_slug'
       or v_record->>'lockedSlug' is distinct from v_row->>'locked_slug'
       or (v_row->>'locked_slug' is not null and v_row->>'locked_slug' is distinct from v_row->>'draft_slug')
       or v_record->>'updatedAt' is null
       or v_record->>'createdAt' is null
       or (v_record->>'updatedAt')::timestamptz is distinct from (v_row->>'updated_at')::timestamptz
       or (v_record->>'createdAt')::timestamptz > (v_record->>'updatedAt')::timestamptz
    then raise exception 'migration_invalid_record'; end if;

    if jsonb_typeof(v_record->'published') = 'object' then
      if v_record->>'publishedAt' is null or v_row->>'locked_slug' is null
         or v_record->'published'->>'slug' is distinct from v_row->>'locked_slug'
         or (v_record->>'publishedAt')::timestamptz > (v_record->>'updatedAt')::timestamptz
      then raise exception 'migration_invalid_publication'; end if;
    elsif v_record->'published' = 'null'::jsonb then
      if v_record->'publishedAt' is distinct from 'null'::jsonb then raise exception 'migration_invalid_publication'; end if;
    else raise exception 'migration_invalid_publication'; end if;

    v_source_key := null;
    if jsonb_typeof(v_record->'source') = 'object' then
      if v_record->'source'->>'provider' is distinct from 'pivigames'
         or coalesce(v_record->'source'->>'id', '') !~ '^[a-zA-Z0-9_-]{1,160}$'
      then raise exception 'migration_invalid_source'; end if;
      v_source_key := 'pivigames:' || (v_record->'source'->>'id');
    elsif v_record->'source' is distinct from 'null'::jsonb then raise exception 'migration_invalid_source'; end if;
    if v_source_key is distinct from v_row->>'source_key' then raise exception 'migration_invalid_source'; end if;

    select * into v_existing from public.catalog_records where id = (v_row->>'id')::uuid;
    if found then
      if v_existing.record is distinct from v_record
         or v_existing.draft_slug is distinct from v_row->>'draft_slug'
         or v_existing.source_key is distinct from v_row->>'source_key'
         or v_existing.locked_slug is distinct from v_row->>'locked_slug'
         or v_existing.revision is distinct from (v_row->>'revision')::bigint
         or v_existing.updated_at is distinct from (v_row->>'updated_at')::timestamptz
      then raise exception 'migration_conflict'; end if;
      v_identical := v_identical + 1;
    elsif exists (select 1 from public.catalog_records where draft_slug = v_row->>'draft_slug'
        or (v_row->>'source_key' is not null and source_key = v_row->>'source_key')) then
      raise exception 'migration_conflict';
    end if;
  end loop;

  insert into public.catalog_records(id, record, draft_slug, source_key, locked_slug, revision, updated_at)
    select (item->>'id')::uuid, item->'record', item->>'draft_slug', item->>'source_key',
      item->>'locked_slug', (item->>'revision')::bigint, (item->>'updated_at')::timestamptz
    from jsonb_array_elements(p_rows) item
    on conflict do nothing;
  get diagnostics v_inserted = row_count;

  -- A collision can never turn into a silent skip, even if constraints change later.
  if v_inserted + v_identical <> jsonb_array_length(p_rows) or exists (
    select 1 from jsonb_array_elements(p_rows) item
    left join public.catalog_records existing on existing.id = (item->>'id')::uuid
    where existing.id is null or existing.record is distinct from item->'record'
       or existing.draft_slug is distinct from item->>'draft_slug'
       or existing.source_key is distinct from item->>'source_key'
       or existing.locked_slug is distinct from item->>'locked_slug'
       or existing.revision is distinct from (item->>'revision')::bigint
       or existing.updated_at is distinct from (item->>'updated_at')::timestamptz
  ) then raise exception 'migration_conflict'; end if;

  return jsonb_build_object('inserted', v_inserted, 'identical', v_identical, 'total', jsonb_array_length(p_rows));
end;
$$;

revoke all on function public.catalog_import_snapshots(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_import_snapshots(jsonb) to service_role;
