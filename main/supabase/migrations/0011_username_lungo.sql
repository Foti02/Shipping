-- 0011_username_lungo.sql
-- Il nome account ha il formato nome_cognome (es. alessandro_di_gregorio): il limite sale da 20 a 40 caratteri.
-- Incrementale e rieseguibile: sostituisce il vincolo sul formato di profili.username.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profili'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%username%' loop
    execute format('alter table profili drop constraint %I', c);
  end loop;
  alter table profili add constraint profili_username_check check (username ~ '^[a-z0-9._-]{3,40}$');
end $$;
