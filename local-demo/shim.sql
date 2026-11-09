-- Simula il minimo di Supabase che le migrazioni usano: schema auth, auth.users, auth.uid(), ruoli.
-- Eseguito PRIMA delle migrazioni, sia dai test sia da local-demo.
create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- chi sta chiamando: impostato dal chiamante con `select set_config('app.uid', '<uuid>', false)`
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;

create role anon nologin;
create role authenticated nologin;
