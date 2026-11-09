-- 0008_agenda.sql
-- Agenda personale: scadenze e appuntamenti dell'utente dentro un magazzino.
-- Ognuno vede e modifica solo le proprie (anche il docente: l'agenda e' personale).

-- ritorna: [{id, oggetto, descrizione, inizio, fine, tipo, stato, anagrafica_id, ragione_sociale}] ordinate per inizio;
--          p_dal / p_al (timestamptz, opzionali) delimitano per data di inizio (p_al escluso)
create function api_scadenze_elenco(p_magazzino uuid, p_dal timestamptz default null, p_al timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  perform _membro(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'oggetto', s.oggetto, 'descrizione', s.descrizione, 'inizio', s.inizio, 'fine', s.fine,
      'tipo', s.tipo, 'stato', s.stato, 'anagrafica_id', s.anagrafica_id, 'ragione_sociale', a.ragione_sociale
    ) order by s.inizio)
    from scadenze s left join anagrafiche a on a.id = s.anagrafica_id
    where s.magazzino_id = p_magazzino and s.user_id = u
      and (p_dal is null or s.inizio >= p_dal) and (p_al is null or s.inizio < p_al)
  ), '[]'::jsonb);
end $$;

-- p_dati: {id?, oggetto, descrizione?, inizio, fine, tipo?, stato?, anagrafica_id?}; con id modifica, senza crea
-- ritorna: {id, oggetto, descrizione, inizio, fine, tipo, stato, anagrafica_id}
create function api_scadenza_salva(p_magazzino uuid, p_dati jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); r scadenze; v_id uuid := nullif(p_dati ->> 'id', '')::uuid;
        v_ini timestamptz; v_fine timestamptz; v_ana uuid := nullif(p_dati ->> 'anagrafica_id', '')::uuid;
begin
  perform _richiedi(p_magazzino, 'scadenze');
  if coalesce(trim(p_dati ->> 'oggetto'), '') = '' then raise exception 'dato_non_valido'; end if;
  begin
    v_ini := (p_dati ->> 'inizio')::timestamptz;
    v_fine := coalesce((p_dati ->> 'fine')::timestamptz, v_ini);
  exception when others then raise exception 'dato_non_valido';
  end;
  if v_ini is null or v_fine < v_ini then raise exception 'dato_non_valido'; end if;
  if coalesce(p_dati ->> 'tipo', 'appuntamento') not in ('appuntamento', 'scadenza')
     or coalesce(p_dati ->> 'stato', 'in_sospeso') not in ('in_sospeso', 'completato') then
    raise exception 'dato_non_valido';
  end if;
  if v_ana is not null and not exists (select 1 from anagrafiche where id = v_ana and magazzino_id = p_magazzino) then
    raise exception 'non_trovato';
  end if;

  if v_id is null then
    insert into scadenze (magazzino_id, user_id, oggetto, descrizione, inizio, fine, tipo, stato, anagrafica_id)
    values (p_magazzino, u, trim(p_dati ->> 'oggetto'), p_dati ->> 'descrizione', v_ini, v_fine,
            coalesce(p_dati ->> 'tipo', 'appuntamento'), coalesce(p_dati ->> 'stato', 'in_sospeso'), v_ana)
    returning * into r;
  else
    update scadenze set oggetto = trim(p_dati ->> 'oggetto'), descrizione = p_dati ->> 'descrizione',
           inizio = v_ini, fine = v_fine, tipo = coalesce(p_dati ->> 'tipo', tipo),
           stato = coalesce(p_dati ->> 'stato', stato), anagrafica_id = v_ana
    where id = v_id and magazzino_id = p_magazzino and user_id = u
    returning * into r;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _registra(p_magazzino, case when v_id is null then 'scadenza_crea' else 'scadenza_modifica' end,
                    'scadenza', r.id, jsonb_build_object('oggetto', r.oggetto));
  return jsonb_build_object('id', r.id, 'oggetto', r.oggetto, 'descrizione', r.descrizione, 'inizio', r.inizio,
                            'fine', r.fine, 'tipo', r.tipo, 'stato', r.stato, 'anagrafica_id', r.anagrafica_id);
end $$;

-- ritorna: {ok: true}
create function api_scadenza_elimina(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); r scadenze;
begin
  select * into r from scadenze where id = p_id and user_id = u;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(r.magazzino_id, 'scadenze');
  delete from scadenze where id = p_id;
  perform _registra(r.magazzino_id, 'scadenza_elimina', 'scadenza', p_id, jsonb_build_object('oggetto', r.oggetto));
  return jsonb_build_object('ok', true);
end $$;
