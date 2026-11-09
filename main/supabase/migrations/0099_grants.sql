-- 0099_grants.sql  (resta sempre l'ultima migrazione)
-- Nessun accesso diretto alle tabelle. Il client puo' chiamare solo le funzioni api_*.
-- Le funzioni interne (_nome) non sono chiamabili dal client: per questo si toglie tutto a PUBLIC.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

do $$
declare f record;
begin
  for f in select oid::regprocedure as sig from pg_proc
           where pronamespace = 'public'::regnamespace and proname like 'api\_%' loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
