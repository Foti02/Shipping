-- 0002_base.sql
-- Base comune: identita', permessi, registro attivita', sessione. Tutte le altre migrazioni la usano.
-- Solo plpgsql: le funzioni si risolvono a runtime, l'ordine dei file non conta per i corpi.

create function _uid() returns uuid language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'non_autenticato'; end if;
  return v;
end $$;

-- riga di appartenenza di chi chiama, o permesso_negato
create function _membro(p_magazzino uuid) returns membri
language plpgsql stable security definer set search_path = public as $$
declare m membri;
begin
  select * into m from membri where magazzino_id = p_magazzino and user_id = _uid();
  if not found then raise exception 'permesso_negato'; end if;
  return m;
end $$;

create function _sono_docente(p_magazzino uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from membri where magazzino_id = p_magazzino and user_id = _uid() and ruolo = 'docente');
end $$;

-- vero per: docente della classe, proprietario del personale, jolly (ruolo aziendale nullo), o azione prevista dal ruolo
create function _puo(p_magazzino uuid, p_azione text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m membri; tipo_m text;
begin
  select * into m from membri where magazzino_id = p_magazzino and user_id = _uid();
  if not found then return false; end if;
  if m.ruolo = 'docente' then return true; end if;
  select tipo into tipo_m from magazzini where id = p_magazzino;
  if tipo_m = 'personale' or m.ruolo_aziendale is null then return true; end if;
  return exists (select 1 from permessi_ruolo where ruolo_aziendale = m.ruolo_aziendale and azione = p_azione);
end $$;

create function _richiedi(p_magazzino uuid, p_azione text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not _puo(p_magazzino, p_azione) then raise exception 'permesso_negato'; end if;
end $$;

create function _registra(p_magazzino uuid, p_azione text, p_entita text, p_entita_id uuid, p_dettagli jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into attivita (magazzino_id, user_id, azione, entita, entita_id, dettagli)
  values (p_magazzino, auth.uid(), p_azione, p_entita, p_entita_id, coalesce(p_dettagli, '{}'));
end $$;

-- ogni nuovo utente (Supabase Auth o shim locale) riceve il profilo; lo username arriva nei metadati
create function _nuovo_utente() returns trigger language plpgsql security definer set search_path = public as $$
declare u text := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
begin
  insert into profili (user_id, username, nome)
  values (new.id, u, coalesce(new.raw_user_meta_data ->> 'nome', ''));
  return new;
end $$;
create trigger nuovo_utente after insert on auth.users for each row execute function _nuovo_utente();

insert into permessi_ruolo (ruolo_aziendale, azione) values
  ('magazziniere','carico'), ('magazziniere','scarico'), ('magazziniere','reso'), ('magazziniere','trasferimento'),
  ('magazziniere','inventario'), ('magazziniere','evadi_ordine'), ('magazziniere','spedizione'),
  ('magazziniere','lotti_ubicazioni'), ('magazziniere','scadenze'),
  ('acquisti','ordine_fornitore'), ('acquisti','anagrafiche.scrivi'), ('acquisti','articoli.scrivi'), ('acquisti','scadenze'),
  ('commerciale','preventivo'), ('commerciale','ordine_cliente'), ('commerciale','anagrafiche.scrivi'), ('commerciale','scadenze'),
  ('amministrazione','fattura'), ('amministrazione','anagrafiche.scrivi'), ('amministrazione','scadenze');

create function api_inizializza() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p profili; mid uuid;
begin
  select * into p from profili where user_id = u;
  if not found then raise exception 'non_trovato'; end if;
  if not exists (select 1 from magazzini where proprietario_id = u and tipo = 'personale') then
    insert into magazzini (nome, tipo, proprietario_id) values ('Il mio magazzino', 'personale', u) returning id into mid;
    insert into membri (magazzino_id, user_id, ruolo) values (mid, u, 'studente');
    insert into azienda (magazzino_id) values (mid);
  end if;
  return jsonb_build_object(
    'profilo', to_jsonb(p),
    'magazzini', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo,
                                          'ruolo', mb.ruolo, 'ruolo_aziendale', mb.ruolo_aziendale)
                       order by m.tipo, m.nome)
      from membri mb join magazzini m on m.id = mb.magazzino_id
      where mb.user_id = u), '[]'::jsonb));
end $$;

create function api_heartbeat(p_magazzino uuid, p_pagina text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if p_magazzino is not null then perform _membro(p_magazzino); end if;
  insert into presenze (user_id, magazzino_id, pagina, visto_il) values (u, p_magazzino, p_pagina, now())
  on conflict (user_id) do update set magazzino_id = excluded.magazzino_id, pagina = excluded.pagina, visto_il = now();
  return jsonb_build_object('ok', true);
end $$;
