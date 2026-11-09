-- 0099_grants.sql  (resta sempre l'ultima migrazione)
-- Nessun accesso diretto alle tabelle. Il client puo' chiamare solo le funzioni api_*.
-- Le funzioni interne (_nome) non sono chiamabili dal client: per questo si toglie tutto a PUBLIC.

-- Oggetti creati DOPO questa migrazione (nuove migrazioni): niente privilegi di default.
-- 1) EXECUTE a PUBLIC e' il default globale di Postgres: va tolto a livello globale (un revoke "in schema" non lo toglie).
-- 2) Su Supabase i default privileges danno ALL ad anon/authenticated: si tolgono per lo schema public.
-- Valgono per il ruolo che esegue la migrazione (su Supabase: postgres, quello delle migrazioni).
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Ogni tabella nuova in public riceve RLS attiva (senza policy = nessun accesso diretto), come quelle di 0001.
create function _rls_automatico() returns event_trigger language plpgsql as $$
declare r record;
begin
  for r in select object_identity from pg_event_trigger_ddl_commands()
           where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') and schema_name = 'public' loop
    execute format('alter table %s enable row level security', r.object_identity);
  end loop;
end $$;
create event trigger rls_automatico on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function _rls_automatico();

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
