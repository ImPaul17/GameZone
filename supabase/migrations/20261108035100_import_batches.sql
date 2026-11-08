-- Editorial batches are private server data. A shared lease bounds work across functions.
create table if not exists public.import_batches (
  id uuid primary key,
  revision integer not null check (revision > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  status text generated always as (document ->> 'status') stored,
  total integer generated always as ((document ->> 'total')::integer) stored,
  done integer generated always as ((document ->> 'done')::integer) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_status check (status in ('queued', 'running', 'paused', 'completed')),
  constraint import_batches_size check (total between 1 and 1000 and done between 0 and total)
);
create index if not exists import_batches_created_at_idx on public.import_batches(created_at desc, id);
alter table public.import_batches enable row level security;
revoke all on table public.import_batches from public, anon, authenticated;
grant select, insert, update on table public.import_batches to service_role;

create table if not exists public.import_batch_control (
  id boolean primary key default true check (id),
  token uuid,
  lease_until timestamptz not null default '-infinity',
  next_at timestamptz not null default '-infinity'
);
insert into public.import_batch_control(id) values(true) on conflict(id) do nothing;
alter table public.import_batch_control enable row level security;
revoke all on table public.import_batch_control from public, anon, authenticated;
grant select, update on table public.import_batch_control to service_role;

create or replace function public.import_batch_acquire()
returns jsonb
language plpgsql security invoker
set search_path = ''
as $function$
declare
  control public.import_batch_control%rowtype;
  instant timestamptz := clock_timestamp();
  claim_token uuid;
begin
  select * into strict control from public.import_batch_control where id = true for update;
  if control.lease_until > instant or control.next_at > instant then
    return jsonb_build_object('retryAt', greatest(control.lease_until, control.next_at));
  end if;
  claim_token := gen_random_uuid();
  update public.import_batch_control set token = claim_token,
    lease_until = instant + interval '120 seconds', next_at = instant + interval '2 seconds'
    where id = true;
  return jsonb_build_object('token', claim_token, 'retryAt', instant + interval '120 seconds');
end;
$function$;

create or replace function public.import_batch_release(p_token uuid, p_wait_seconds integer default 2)
returns void
language sql security invoker
set search_path = ''
as $function$
  update public.import_batch_control set token = null, lease_until = '-infinity',
    next_at = clock_timestamp() + make_interval(secs => greatest(2, least(3600, p_wait_seconds)))
    where id = true and token = p_token;
$function$;

revoke all on function public.import_batch_acquire() from public, anon, authenticated;
revoke all on function public.import_batch_release(uuid, integer) from public, anon, authenticated;
grant execute on function public.import_batch_acquire() to service_role;
grant execute on function public.import_batch_release(uuid, integer) to service_role;
