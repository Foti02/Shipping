-- Simula il minimo di Supabase che le migrazioni usano: schema auth, auth.users, auth.uid(), ruoli, schema extensions.
-- Eseguito PRIMA delle migrazioni, sia dai test sia da local-demo.
create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  encrypted_password text default '$2a$10$abcdefghijklmnopqrstuvWXYZ0123456789abcdefghijklmnopq',  -- hash bcrypt segnaposto: su Supabase ogni utente ha una password
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- chi sta chiamando: impostato dal chiamante con `select set_config('app.uid', '<uuid>', false)`
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;

create role anon nologin;
create role authenticated nologin;

-- Come su Supabase: pgcrypto nello schema extensions. Se PGlite lo ha caricato (opzione `extensions: { pgcrypto }`)
-- si usa quello vero; altrimenti una finta con md5, SOLO per la demo locale (le migrazioni non la usano mai a loro insaputa).
create schema if not exists extensions;
do $shim$
begin
  create extension pgcrypto schema extensions;
exception when others then
  create function extensions.gen_salt(t text) returns text language sql as $f$
    select '$fake$' || substr(md5(random()::text || clock_timestamp()::text), 1, 8) $f$;
  create function extensions.gen_salt(t text, n int) returns text language sql as $f$
    select extensions.gen_salt(t) $f$;
  create function extensions.crypt(p text, salt text) returns text language sql as $f$
    select substr(salt, 1, 14) || md5(substr(salt, 1, 14) || p) $f$;
end $shim$;

-- Sessioni di Supabase Auth (solo le colonne che servono): api_admin_reimposta_password le svuota per il bersaglio.
-- Come su Supabase: sessions.user_id uuid, refresh_tokens.user_id varchar.
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table auth.refresh_tokens (id bigint generated always as identity primary key, user_id varchar);
