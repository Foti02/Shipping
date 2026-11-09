-- 0005_classe.sql
-- Classe: creazione, ingresso con codice, gestione membri, azzera/elimina, vista docente, notifiche, registro attivita'.
-- Usa solo gli helper di 0002 e le tabelle di 0001.

-- codice di ingresso: 6 caratteri A-Z0-9 senza 0 O 1 I (32 simboli); la collisione e' gestita da chi inserisce
create function _codice_classe() returns text language plpgsql as $$
declare alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text := ''; i int;
begin
  for i in 1..6 loop c := c || substr(alfabeto, 1 + floor(random() * 32)::int, 1); end loop;
  return c;
end $$;

create function _richiedi_docente(p_magazzino uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not _sono_docente(p_magazzino) then raise exception 'permesso_negato'; end if;
end $$;

-- ritorna: {id, nome, tipo:'classe', codice_ingresso, codice_attivo}
-- Massimo 50 classi per docente e nome di al massimo 500 caratteri, altrimenti dato_non_valido.
create function api_classe_crea(p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); v_nome text := btrim(coalesce(p_nome, '')); mid uuid; cod text;
begin
  -- il blocco sulla riga del profilo mette in fila due creazioni insieme (il limite non si supera)
  perform 1 from profili where user_id = u and ruolo_globale = 'docente' for update;
  if not found then raise exception 'permesso_negato'; end if;
  if v_nome = '' or char_length(v_nome) > 500
     or (select count(*) from magazzini where proprietario_id = u and tipo = 'classe') >= 50 then
    raise exception 'dato_non_valido';
  end if;
  loop
    cod := _codice_classe();
    begin
      insert into magazzini (nome, tipo, proprietario_id, codice_ingresso)
      values (v_nome, 'classe', u, cod) returning id into mid;
      exit;
    exception when unique_violation then null;  -- codice gia' preso: ne genera un altro
    end;
  end loop;
  insert into membri (magazzino_id, user_id, ruolo) values (mid, u, 'docente');
  insert into azienda (magazzino_id, ragione_sociale) values (mid, v_nome);
  perform _registra(mid, 'classe_crea', 'magazzino', mid, jsonb_build_object('nome', v_nome));
  return jsonb_build_object('id', mid, 'nome', v_nome, 'tipo', 'classe', 'codice_ingresso', cod, 'codice_attivo', true);
end $$;

-- ritorna: {id, nome, tipo:'classe', ruolo:'docente'|'studente', ruolo_aziendale:string|null}
-- Idempotente: se sei gia' membro non cambia nulla. Codice disattivato o inesistente: codice_non_valido.
create function api_classe_entra(p_codice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); m magazzini; mb membri;
begin
  select * into m from magazzini
  where tipo = 'classe' and codice_attivo and codice_ingresso = upper(btrim(coalesce(p_codice, '')));
  if not found then raise exception 'codice_non_valido'; end if;
  if not exists (select 1 from membri where magazzino_id = m.id and user_id = u) then
    insert into membri (magazzino_id, user_id, ruolo) values (m.id, u, 'studente');
    perform _registra(m.id, 'classe_entra', 'magazzino', m.id, '{}');
  end if;
  select * into mb from membri where magazzino_id = m.id and user_id = u;
  return jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo,
                            'ruolo', mb.ruolo, 'ruolo_aziendale', mb.ruolo_aziendale);
end $$;

-- ritorna: {codice, attivo}   (p_azione: rigenera | attiva | disattiva; rigenera non cambia lo stato attivo)
create function api_classe_codice(p_magazzino uuid, p_azione text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m magazzini; cod text;
begin
  perform _richiedi_docente(p_magazzino);
  if p_azione not in ('rigenera', 'attiva', 'disattiva') then raise exception 'dato_non_valido'; end if;
  if p_azione = 'rigenera' then
    loop
      cod := _codice_classe();
      begin
        update magazzini set codice_ingresso = cod where id = p_magazzino and tipo = 'classe';
        exit;
      exception when unique_violation then null;
      end;
    end loop;
  else
    update magazzini set codice_attivo = (p_azione = 'attiva') where id = p_magazzino and tipo = 'classe';
  end if;
  select * into m from magazzini where id = p_magazzino;
  perform _registra(p_magazzino, 'classe_codice_' || p_azione, 'magazzino', p_magazzino, '{}');
  return jsonb_build_object('codice', m.codice_ingresso, 'attivo', m.codice_attivo);
end $$;

-- ritorna: [{user_id, username, nome, ruolo:'docente'|'studente', ruolo_aziendale:string|null, entrato_il}]  (ordinati per ruolo e username)
create function api_classe_membri(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_docente(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', pr.user_id, 'username', pr.username, 'nome', pr.nome,
                                        'ruolo', mb.ruolo, 'ruolo_aziendale', mb.ruolo_aziendale,
                                        'entrato_il', mb.entrato_il)
                     order by mb.ruolo, pr.username)
    from membri mb join profili pr on pr.user_id = mb.user_id
    where mb.magazzino_id = p_magazzino), '[]'::jsonb);
end $$;

-- ritorna: {user_id, ruolo_aziendale:string|null}   (p_ruolo_aziendale: magazziniere|acquisti|commerciale|amministrazione|null = jolly; solo per studenti)
create function api_classe_imposta_ruolo(p_magazzino uuid, p_user uuid, p_ruolo_aziendale text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mb membri;
begin
  perform _richiedi_docente(p_magazzino);
  if p_ruolo_aziendale is not null
     and p_ruolo_aziendale not in ('magazziniere', 'acquisti', 'commerciale', 'amministrazione') then
    raise exception 'dato_non_valido';
  end if;
  select * into mb from membri where magazzino_id = p_magazzino and user_id = p_user;
  if not found then raise exception 'non_trovato'; end if;
  if mb.ruolo <> 'studente' then raise exception 'dato_non_valido'; end if;
  update membri set ruolo_aziendale = p_ruolo_aziendale where magazzino_id = p_magazzino and user_id = p_user;
  perform _registra(p_magazzino, 'classe_ruolo', 'membro', p_user, jsonb_build_object('ruolo_aziendale', p_ruolo_aziendale));
  return jsonb_build_object('user_id', p_user, 'ruolo_aziendale', p_ruolo_aziendale);
end $$;

-- ritorna: {ok:true}   (il docente non puo' rimuovere se stesso: permesso_negato)
create function api_classe_rimuovi(p_magazzino uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_docente(p_magazzino);
  if p_user = _uid() then raise exception 'permesso_negato'; end if;
  delete from membri where magazzino_id = p_magazzino and user_id = p_user;
  if not found then raise exception 'non_trovato'; end if;
  perform _registra(p_magazzino, 'classe_rimuovi', 'membro', p_user, '{}');
  return jsonb_build_object('ok', true);
end $$;

-- ritorna: {ok:true}   (p_conferma = nome della classe, altrimenti conferma_errata; tiene magazzino, membri, azienda)
-- Azzera anche i contatori: la numerazione dei documenti riparte da 1.
create function api_classe_azzera(p_magazzino uuid, p_conferma text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m magazzini;
begin
  perform _richiedi_docente(p_magazzino);
  select * into m from magazzini where id = p_magazzino and tipo = 'classe';
  if not found then raise exception 'non_trovato'; end if;
  if p_conferma is distinct from m.nome then raise exception 'conferma_errata'; end if;
  delete from compiti where magazzino_id = p_magazzino;
  delete from scenari where magazzino_id = p_magazzino;      -- porta via scenario_fisico
  delete from documenti where magazzino_id = p_magazzino;    -- porta via righe_documento
  delete from inventari where magazzino_id = p_magazzino;    -- porta via inventario_righe
  delete from movimenti_stock where magazzino_id = p_magazzino;
  delete from giacenze where magazzino_id = p_magazzino;
  delete from lotti where magazzino_id = p_magazzino;
  delete from articoli where magazzino_id = p_magazzino;
  delete from anagrafiche where magazzino_id = p_magazzino;
  delete from ubicazioni where magazzino_id = p_magazzino;
  delete from scadenze where magazzino_id = p_magazzino;
  delete from notifiche where magazzino_id = p_magazzino;    -- porta via notifiche_lette
  delete from contatori where magazzino_id = p_magazzino;
  delete from attivita where magazzino_id = p_magazzino;
  perform _registra(p_magazzino, 'classe_azzera', 'magazzino', p_magazzino, '{}');
  return jsonb_build_object('ok', true);
end $$;

-- ritorna: {ok:true}   (p_conferma = nome della classe, altrimenti conferma_errata; cancella tutto, membri compresi)
create function api_classe_elimina(p_magazzino uuid, p_conferma text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m magazzini;
begin
  perform _richiedi_docente(p_magazzino);
  select * into m from magazzini where id = p_magazzino and tipo = 'classe';
  if not found then raise exception 'non_trovato'; end if;
  if p_conferma is distinct from m.nome then raise exception 'conferma_errata'; end if;
  -- compiti e documenti prima: compiti e righe_documento hanno fk "restrict" verso articoli e anagrafiche
  delete from compiti where magazzino_id = p_magazzino;
  delete from documenti where magazzino_id = p_magazzino;
  delete from magazzini where id = p_magazzino;
  return jsonb_build_object('ok', true);
end $$;

-- ritorna: [{id, nome, codice_ingresso, codice_attivo, n_iscritti, n_online, created_at}]  (classi in cui sono docente; n_iscritti/n_online contano solo gli studenti, online = battito < 45 s)
create function api_docente_classi() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'nome', m.nome, 'codice_ingresso', m.codice_ingresso, 'codice_attivo', m.codice_attivo,
      'n_iscritti', (select count(*) from membri s where s.magazzino_id = m.id and s.ruolo = 'studente'),
      'n_online', (select count(*) from membri s join presenze pz on pz.user_id = s.user_id
                   where s.magazzino_id = m.id and s.ruolo = 'studente' and pz.visto_il > now() - interval '45 seconds'),
      'created_at', m.created_at) order by m.nome, m.created_at)
    from membri d join magazzini m on m.id = d.magazzino_id
    where d.user_id = u and d.ruolo = 'docente' and m.tipo = 'classe'), '[]'::jsonb);
end $$;

-- ritorna: [{user_id, username, nome, ruolo_aziendale:string|null, online:boolean, pagina:string|null,
--            magazzino_usato:null|{tipo:'classe',id,nome}|{tipo:'personale'},
--            ultima_azione:string|null, ultima_azione_il:string|null,
--            compiti:{totale, completati, errori, bloccati}}]   (solo studenti, ordinati per username)
-- Privacy: per un magazzino personale si vede solo il tipo (e la pagina e' nascosta); id, nome e pagina solo per le classi
-- di cui CHI CHIAMA e' docente: per la classe di un altro docente si vede solo {tipo:'classe'} e la pagina e' nascosta.
-- magazzino_usato e' l'ultimo noto, anche se l'iscritto e' offline. ultima_azione: ultima riga di attivita' nella classe.
create function api_docente_utenti(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_docente(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', pr.user_id, 'username', pr.username, 'nome', pr.nome,
      'ruolo_aziendale', mb.ruolo_aziendale,
      'online', coalesce(pz.visto_il > now() - interval '45 seconds', false),
      'pagina', case when pm.tipo = 'classe' and _sono_docente(pm.id) then pz.pagina end,
      'magazzino_usato', case when pm.tipo = 'classe' and _sono_docente(pm.id)
                                then jsonb_build_object('tipo', 'classe', 'id', pm.id, 'nome', pm.nome)
                              when pm.tipo is not null then jsonb_build_object('tipo', pm.tipo)
                         end,
      'ultima_azione', ua.azione,
      'ultima_azione_il', ua.created_at,
      'compiti', jsonb_build_object('totale', c.totale, 'completati', c.completati,
                                    'errori', c.errori, 'bloccati', c.bloccati)
    ) order by pr.username)
    from membri mb
    join profili pr on pr.user_id = mb.user_id
    left join presenze pz on pz.user_id = mb.user_id
    left join magazzini pm on pm.id = pz.magazzino_id
    left join lateral (select a.azione, a.created_at from attivita a
                       where a.magazzino_id = p_magazzino and a.user_id = mb.user_id
                       order by a.id desc limit 1) ua on true
    cross join lateral (select count(*) as totale,
                               count(*) filter (where k.stato = 'completato') as completati,
                               count(*) filter (where k.stato = 'errore') as errori,
                               count(*) filter (where k.stato = 'bloccato') as bloccati
                        from compiti k where k.magazzino_id = p_magazzino and k.assegnato_a = mb.user_id) c
    where mb.magazzino_id = p_magazzino and mb.ruolo = 'studente'), '[]'::jsonb);
end $$;

-- ritorna: {non_lette:int, elenco:[{id, tipo, articolo_id, messaggio, risolta_il, created_at, letta:boolean}]}   (ultime 50, piu' recenti prima; non_lette conta tutte)
create function api_notifiche(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  perform _membro(p_magazzino);
  return jsonb_build_object(
    'non_lette', (select count(*) from notifiche n
                  where n.magazzino_id = p_magazzino
                    and not exists (select 1 from notifiche_lette l where l.notifica_id = n.id and l.user_id = u)),
    'elenco', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'articolo_id', x.articolo_id,
                                          'messaggio', x.messaggio, 'risolta_il', x.risolta_il,
                                          'created_at', x.created_at, 'letta', x.letta)
                       order by x.created_at desc, x.id)
      from (select n.*, exists (select 1 from notifiche_lette l where l.notifica_id = n.id and l.user_id = u) as letta
            from notifiche n where n.magazzino_id = p_magazzino
            order by n.created_at desc, n.id limit 50) x), '[]'::jsonb));
end $$;

-- ritorna: {segnate:int}   (segna come lette per chi chiama tutte le notifiche della classe)
create function api_notifiche_leggi(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); n int;
begin
  perform _membro(p_magazzino);
  insert into notifiche_lette (notifica_id, user_id)
  select id, u from notifiche where magazzino_id = p_magazzino
  on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('segnate', n);
end $$;

-- ritorna: [{id, azione, entita, entita_id, dettagli, created_at, user_id, username}]   (dal piu' recente; p_dopo_id: solo righe con id maggiore, per il polling; p_limite 1-200, default 50)
create function api_attivita(p_magazzino uuid, p_dopo_id bigint default null, p_limite int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'azione', x.azione, 'entita', x.entita, 'entita_id', x.entita_id,
                                        'dettagli', x.dettagli, 'created_at', x.created_at,
                                        'user_id', x.user_id, 'username', x.username)
                     order by x.id desc)
    from (select a.*, pr.username from attivita a left join profili pr on pr.user_id = a.user_id
          where a.magazzino_id = p_magazzino and (p_dopo_id is null or a.id > p_dopo_id)
          order by a.id desc limit greatest(1, least(coalesce(p_limite, 50), 200))) x), '[]'::jsonb);
end $$;
