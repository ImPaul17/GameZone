-- This optional platform helper is invoked by its event trigger, never by clients.
-- Preserve projects where the helper has not been installed.
do $migration$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end;
$migration$;
