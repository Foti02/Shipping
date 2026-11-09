-- 0003_dati.sql
-- Dati di base di un magazzino: azienda, anagrafiche, articoli, ubicazioni, lotti, impostazioni.
-- Lettura: basta essere membri. Scrittura: _richiedi(magazzino, azione). Ogni scrittura finisce in `attivita`.
-- Errori: permesso_negato, non_trovato, dato_non_valido, gia_esiste, stato_non_valido.

-- =====================================================================
-- Azienda
-- =====================================================================

-- ritorna: {magazzino_id, ragione_sociale, indirizzo, comune, nazione, fax, cod_fisc, p_iva, telefono, cellulare,
--           email, sito_web, capitale_sociale, altro, updated_at}  (se la riga manca: solo magazzino_id, ragione_sociale '', nazione 'Italia')
create function api_azienda_leggi(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_az azienda;
begin
  perform _membro(p_magazzino);
  select * into v_az from azienda where magazzino_id = p_magazzino;
  if not found then
    return jsonb_build_object('magazzino_id', p_magazzino, 'ragione_sociale', '', 'nazione', 'Italia');
  end if;
  return to_jsonb(v_az);
end $$;

-- p_dati: chiavi di `azienda` (le assenti restano invariate). Permesso: anagrafiche.scrivi.
-- ritorna: la stessa forma di api_azienda_leggi, dopo il salvataggio
create function api_azienda_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_az azienda; v_new azienda;
begin
  perform _richiedi(p_magazzino, 'anagrafiche.scrivi');
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  insert into azienda (magazzino_id) values (p_magazzino) on conflict (magazzino_id) do nothing;
  select * into v_az from azienda where magazzino_id = p_magazzino;
  begin
    v_new := jsonb_populate_record(v_az, p_dati);
    update azienda set
      ragione_sociale = btrim(coalesce(v_new.ragione_sociale, '')), indirizzo = v_new.indirizzo, comune = v_new.comune,
      nazione = v_new.nazione, fax = v_new.fax, cod_fisc = v_new.cod_fisc, p_iva = v_new.p_iva,
      telefono = v_new.telefono, cellulare = v_new.cellulare, email = v_new.email, sito_web = v_new.sito_web,
      capitale_sociale = v_new.capitale_sociale, altro = v_new.altro
    where magazzino_id = p_magazzino returning * into v_az;
  exception
    when invalid_text_representation or datatype_mismatch or not_null_violation then raise exception 'dato_non_valido';
  end;
  perform _registra(p_magazzino, 'azienda.salva', 'azienda', p_magazzino, jsonb_build_object('ragione_sociale', v_az.ragione_sociale));
  return to_jsonb(v_az);
end $$;

-- =====================================================================
-- Anagrafiche (clienti e fornitori)
-- =====================================================================

-- p_tipo: 'cliente' | 'fornitore' | null (tutti). p_cerca: testo libero su ragione sociale, codice, comune, p_iva, email.
-- ritorna: [{id, magazzino_id, tipo, codice, ragione_sociale, indirizzo, comune, email, sito_web, banca, iban, cod_fisc,
--            p_iva, telefono, cellulare, sconto_perc, lead_time_giorni, note, created_at, updated_at}] ordinate per ragione_sociale
create function api_anagrafiche_elenco(p_magazzino uuid, p_tipo text default null, p_cerca text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_c text := nullif(btrim(coalesce(p_cerca, '')), '');
begin
  perform _membro(p_magazzino);
  if nullif(p_tipo, '') is not null and p_tipo not in ('cliente', 'fornitore') then raise exception 'dato_non_valido'; end if;
  select coalesce(jsonb_agg(to_jsonb(n) order by lower(n.ragione_sociale), n.id), '[]'::jsonb) into v_res
  from anagrafiche n
  where n.magazzino_id = p_magazzino
    and (nullif(p_tipo, '') is null or n.tipo = p_tipo)
    and (v_c is null or n.ragione_sociale ilike '%' || v_c || '%' or n.codice ilike '%' || v_c || '%'
         or n.comune ilike '%' || v_c || '%' or n.p_iva ilike '%' || v_c || '%' or n.email ilike '%' || v_c || '%');
  return v_res;
end $$;

-- p_dati: campi di `anagrafiche`. Con `id` modifica (il tipo non cambia), senza crea (tipo e ragione_sociale obbligatori).
-- Permesso: anagrafiche.scrivi. Codice duplicato nello stesso tipo: gia_esiste.
-- ritorna: la riga salvata {id, magazzino_id, tipo, codice, ragione_sociale, ..., sconto_perc, lead_time_giorni, note}
create function api_anagrafica_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid := p_magazzino; v_old anagrafiche; v_new anagrafiche; v_crea boolean;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  if not v_crea then
    select magazzino_id into v_m from anagrafiche where id = (p_dati ->> 'id')::uuid;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _richiedi(v_m, 'anagrafiche.scrivi');
  begin
    if v_crea then
      if btrim(coalesce(p_dati ->> 'ragione_sociale', '')) = '' or coalesce(p_dati ->> 'tipo', '') not in ('cliente', 'fornitore') then
        raise exception 'dato_non_valido';
      end if;
      insert into anagrafiche (magazzino_id, tipo, ragione_sociale)
      values (v_m, p_dati ->> 'tipo', btrim(p_dati ->> 'ragione_sociale')) returning * into v_old;
    else
      select * into v_old from anagrafiche where id = (p_dati ->> 'id')::uuid;
    end if;
    v_new := jsonb_populate_record(v_old, p_dati);
    v_new.ragione_sociale := btrim(coalesce(v_new.ragione_sociale, ''));
    v_new.codice := nullif(btrim(coalesce(v_new.codice, '')), '');
    v_new.sconto_perc := coalesce(v_new.sconto_perc, 0);
    v_new.lead_time_giorni := coalesce(v_new.lead_time_giorni, v_old.lead_time_giorni);
    if v_new.ragione_sociale = '' or v_new.sconto_perc not between 0 and 100 or v_new.lead_time_giorni < 0 then
      raise exception 'dato_non_valido';
    end if;
    update anagrafiche set
      codice = v_new.codice, ragione_sociale = v_new.ragione_sociale, indirizzo = v_new.indirizzo, comune = v_new.comune,
      email = v_new.email, sito_web = v_new.sito_web, banca = v_new.banca, iban = v_new.iban, cod_fisc = v_new.cod_fisc,
      p_iva = v_new.p_iva, telefono = v_new.telefono, cellulare = v_new.cellulare, sconto_perc = v_new.sconto_perc,
      lead_time_giorni = v_new.lead_time_giorni, note = v_new.note
    where id = v_old.id returning * into v_new;
  exception
    when unique_violation then raise exception 'gia_esiste';
    when not_null_violation or check_violation or numeric_value_out_of_range or invalid_text_representation or datatype_mismatch then
      raise exception 'dato_non_valido';
  end;
  perform _registra(v_m, case when v_crea then 'anagrafica.crea' else 'anagrafica.modifica' end, 'anagrafica', v_new.id,
                    jsonb_build_object('tipo', v_new.tipo, 'ragione_sociale', v_new.ragione_sociale));
  return to_jsonb(v_new);
end $$;

-- Permesso: anagrafiche.scrivi. Se ha documenti collegati: stato_non_valido.
-- ritorna: {ok: true, id}
create function api_anagrafica_elimina(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ana anagrafiche;
begin
  select * into v_ana from anagrafiche where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(v_ana.magazzino_id, 'anagrafiche.scrivi');
  begin
    delete from anagrafiche where id = p_id;
  exception when foreign_key_violation or restrict_violation then raise exception 'stato_non_valido';
  end;
  perform _registra(v_ana.magazzino_id, 'anagrafica.elimina', 'anagrafica', p_id,
                    jsonb_build_object('tipo', v_ana.tipo, 'ragione_sociale', v_ana.ragione_sociale));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- Documenti intestati all'anagrafica, i piu' recenti per primi. p_limite predefinito 50 (massimo 500).
-- ritorna: [{id, tipo, anno, numero, data, stato, stato_spedizione, pagato, imponibile_cent, imposta_cent, totale_cent, created_at}]
create function api_anagrafica_storico(p_id uuid, p_limite int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid; v_res jsonb;
begin
  select magazzino_id into v_m from anagrafiche where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(v_m);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.data desc, t.created_at desc, t.id), '[]'::jsonb) into v_res
  from (select d.id, d.tipo, d.anno, d.numero, d.data, d.stato, d.stato_spedizione, d.pagato,
               d.imponibile_cent, d.imposta_cent, d.totale_cent, d.created_at
        from documenti d where d.anagrafica_id = p_id
        order by d.data desc, d.created_at desc, d.id
        limit greatest(1, least(coalesce(p_limite, 50), 500))) t;
  return v_res;
end $$;

-- =====================================================================
-- Articoli
-- =====================================================================

-- Interno, senza permessi ne' registro: crea (senza p_dati.id) o aggiorna (con id) un articolo del magazzino.
-- Chiavi modificabili: matricola, descrizione, um, categoria, gruppo, prezzo_acquisto_cent, iva_perc, ricarico_perc,
-- sconto_perc, scorta_minima, scorta_sicurezza, punto_riordino, lead_time_giorni, domanda_giornaliera, costo_ordine_cent,
-- costo_mantenimento_perc, barcode, ubicazione_id, fornitore_abituale_id, codice_fornitore, gestione_lotti, note, attivo.
-- Solo in creazione: giacenza_iniziale (> 0 crea giacenza e movimento 'apertura').
-- Se punto_riordino non e' indicato diventa almeno max(scorta_minima (solo creazione), scorta_sicurezza).
create function _articolo_scrivi(p_magazzino uuid, p_dati jsonb) returns articoli
language plpgsql security definer set search_path = public as $$
declare v_old articoli; v_new articoli; v_crea boolean; v_giac numeric := 0;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  begin
    if v_crea then
      if btrim(coalesce(p_dati ->> 'matricola', '')) = '' or btrim(coalesce(p_dati ->> 'descrizione', '')) = '' then
        raise exception 'dato_non_valido';
      end if;
      v_giac := coalesce(nullif(p_dati ->> 'giacenza_iniziale', '')::numeric, 0);
      if v_giac < 0 then raise exception 'dato_non_valido'; end if;
      insert into articoli (magazzino_id, matricola, descrizione)
      values (p_magazzino, btrim(p_dati ->> 'matricola'), btrim(p_dati ->> 'descrizione')) returning * into v_old;
    else
      select * into v_old from articoli where id = (p_dati ->> 'id')::uuid and magazzino_id = p_magazzino;
      if not found then raise exception 'non_trovato'; end if;
    end if;
    v_new := jsonb_populate_record(v_old, p_dati);
    v_new.matricola := btrim(coalesce(v_new.matricola, ''));
    v_new.descrizione := btrim(coalesce(v_new.descrizione, ''));
    v_new.um := coalesce(nullif(btrim(coalesce(v_new.um, '')), ''), v_old.um);
    v_new.categoria := coalesce(nullif(btrim(coalesce(v_new.categoria, '')), ''), v_old.categoria);
    v_new.prezzo_acquisto_cent := coalesce(v_new.prezzo_acquisto_cent, v_old.prezzo_acquisto_cent);
    v_new.iva_perc := coalesce(v_new.iva_perc, v_old.iva_perc);
    v_new.ricarico_perc := coalesce(v_new.ricarico_perc, v_old.ricarico_perc);
    v_new.sconto_perc := coalesce(v_new.sconto_perc, v_old.sconto_perc);
    v_new.scorta_minima := coalesce(v_new.scorta_minima, v_old.scorta_minima);
    v_new.scorta_sicurezza := coalesce(v_new.scorta_sicurezza, v_old.scorta_sicurezza);
    v_new.punto_riordino := coalesce(v_new.punto_riordino, v_old.punto_riordino);
    v_new.lead_time_giorni := coalesce(v_new.lead_time_giorni, v_old.lead_time_giorni);
    v_new.costo_ordine_cent := coalesce(v_new.costo_ordine_cent, v_old.costo_ordine_cent);
    v_new.costo_mantenimento_perc := coalesce(v_new.costo_mantenimento_perc, v_old.costo_mantenimento_perc);
    v_new.gestione_lotti := coalesce(v_new.gestione_lotti, v_old.gestione_lotti);
    v_new.attivo := coalesce(v_new.attivo, v_old.attivo);
    if not (p_dati ? 'punto_riordino') then
      v_new.punto_riordino := greatest(v_new.punto_riordino, v_new.scorta_sicurezza, case when v_crea then v_new.scorta_minima else 0 end);
    end if;
    if v_new.matricola = '' or v_new.descrizione = ''
       or v_new.prezzo_acquisto_cent < 0 or v_new.costo_ordine_cent < 0 or v_new.lead_time_giorni < 0
       or v_new.scorta_minima < 0 or v_new.scorta_sicurezza < 0 or v_new.punto_riordino < 0
       or coalesce(v_new.domanda_giornaliera, 0) < 0 or v_new.ricarico_perc < 0
       or v_new.iva_perc not between 0 and 100 or v_new.sconto_perc not between 0 and 100
       or v_new.costo_mantenimento_perc not between 0 and 100
       or v_new.punto_riordino < v_new.scorta_sicurezza then
      raise exception 'dato_non_valido';
    end if;
    if v_new.ubicazione_id is not null
       and not exists (select 1 from ubicazioni where id = v_new.ubicazione_id and magazzino_id = p_magazzino) then
      raise exception 'dato_non_valido';
    end if;
    if v_new.fornitore_abituale_id is not null
       and not exists (select 1 from anagrafiche where id = v_new.fornitore_abituale_id and magazzino_id = p_magazzino and tipo = 'fornitore') then
      raise exception 'dato_non_valido';
    end if;
    update articoli set
      matricola = v_new.matricola, descrizione = v_new.descrizione, um = v_new.um, categoria = v_new.categoria,
      gruppo = v_new.gruppo, prezzo_acquisto_cent = v_new.prezzo_acquisto_cent, iva_perc = v_new.iva_perc,
      ricarico_perc = v_new.ricarico_perc, sconto_perc = v_new.sconto_perc, scorta_minima = v_new.scorta_minima,
      scorta_sicurezza = v_new.scorta_sicurezza, punto_riordino = v_new.punto_riordino,
      lead_time_giorni = v_new.lead_time_giorni, domanda_giornaliera = v_new.domanda_giornaliera,
      costo_ordine_cent = v_new.costo_ordine_cent, costo_mantenimento_perc = v_new.costo_mantenimento_perc,
      barcode = v_new.barcode, ubicazione_id = v_new.ubicazione_id, fornitore_abituale_id = v_new.fornitore_abituale_id,
      codice_fornitore = v_new.codice_fornitore, gestione_lotti = v_new.gestione_lotti, note = v_new.note,
      attivo = v_new.attivo
    where id = v_old.id returning * into v_new;
    if v_crea and v_giac > 0 then
      insert into giacenze (magazzino_id, articolo_id, ubicazione_id, qta) values (p_magazzino, v_new.id, v_new.ubicazione_id, v_giac);
      insert into movimenti_stock (magazzino_id, articolo_id, ubicazione_id, qta, costo_unit_cent, causale, user_id)
      values (p_magazzino, v_new.id, v_new.ubicazione_id, v_giac, v_new.prezzo_acquisto_cent, 'apertura', auth.uid());
    end if;
  exception
    when unique_violation then raise exception 'gia_esiste';
    when not_null_violation or check_violation or numeric_value_out_of_range or invalid_text_representation
         or datatype_mismatch or foreign_key_violation then
      raise exception 'dato_non_valido';
  end;
  return v_new;
end $$;

-- Una riga per articolo del magazzino, per descrizione. p_cerca: matricola, descrizione, barcode o codice fornitore.
-- carichi/scarichi/resi: totali dal registro movimenti_stock (numeri positivi, al netto degli annulli);
-- giacenza: somma di giacenze; ordinato: quantita' nelle righe di ordini fornitore confermati (non evasi ne' annullati).
-- stato_riga: 'blu' se ordinato > 0, altrimenti 'giallo' se punto_riordino > 0 e giacenza <= punto_riordino, altrimenti 'verde'.
-- ritorna: [{id, magazzino_id, matricola, descrizione, um, categoria, gruppo, prezzo_acquisto_cent, iva_perc, ricarico_perc,
--            sconto_perc, scorta_minima, scorta_sicurezza, punto_riordino, lead_time_giorni, domanda_giornaliera,
--            costo_ordine_cent, costo_mantenimento_perc, barcode, ubicazione_id, fornitore_abituale_id, codice_fornitore,
--            gestione_lotti, note, attivo, scenario_id, created_at, updated_at,
--            ubicazione_codice, fornitore_nome, carichi, scarichi, resi, giacenza, ordinato, stato_riga}]
create function api_articoli_elenco(p_magazzino uuid, p_cerca text default null, p_categoria text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_c text := nullif(btrim(coalesce(p_cerca, '')), ''); v_cat text := nullif(btrim(coalesce(p_categoria, '')), '');
begin
  perform _membro(p_magazzino);
  select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.descrizione), x.matricola), '[]'::jsonb) into v_res
  from (
    select a.*, u.codice as ubicazione_codice, f.ragione_sociale as fornitore_nome,
           coalesce(g.qta, 0) as giacenza,
           coalesce(mv.carichi, 0) as carichi, coalesce(mv.scarichi, 0) as scarichi, coalesce(mv.resi, 0) as resi,
           coalesce(o.qta, 0) as ordinato,
           case when coalesce(o.qta, 0) > 0 then 'blu'
                when a.punto_riordino > 0 and coalesce(g.qta, 0) <= a.punto_riordino then 'giallo'
                else 'verde' end as stato_riga
    from articoli a
    left join ubicazioni u on u.id = a.ubicazione_id
    left join anagrafiche f on f.id = a.fornitore_abituale_id
    left join lateral (select sum(gg.qta) as qta from giacenze gg where gg.articolo_id = a.id) g on true
    left join lateral (
      select sum(m.qta) filter (where m.causale = 'carico' or (m.causale = 'annullo' and d.tipo = 'carico')) as carichi,
             -sum(m.qta) filter (where m.causale = 'scarico' or (m.causale = 'annullo' and d.tipo = 'scarico')) as scarichi,
             sum(m.qta) filter (where m.causale = 'reso_cliente' or (m.causale = 'annullo' and d.tipo = 'reso_cliente')) as resi
      from movimenti_stock m left join documenti d on d.id = m.documento_id
      where m.articolo_id = a.id) mv on true
    left join lateral (
      select sum(rd.qta) as qta from righe_documento rd join documenti dd on dd.id = rd.documento_id
      where rd.articolo_id = a.id and dd.tipo = 'ordine_fornitore' and dd.stato = 'confermato') o on true
    where a.magazzino_id = p_magazzino
      and (v_cat is null or a.categoria = v_cat)
      and (v_c is null or a.matricola ilike '%' || v_c || '%' or a.descrizione ilike '%' || v_c || '%'
           or a.barcode ilike '%' || v_c || '%' or a.codice_fornitore ilike '%' || v_c || '%')
  ) x;
  return v_res;
end $$;

-- ritorna: {articolo: {...colonne di articoli..., ubicazione_codice, fornitore_nome}, giacenza,
--           giacenze: [{id, lotto_id, lotto_codice, scadenza, ubicazione_id, ubicazione_codice, qta}],
--           movimenti: [{id, causale, qta, costo_unit_cent, lotto_id, lotto_codice, ubicazione_id, ubicazione_codice,
--                        documento_id, username, created_at}]}   (ultimi 20, il piu' recente per primo)
create function api_articolo_leggi(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_art articoli;
begin
  select * into v_art from articoli where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(v_art.magazzino_id);
  return jsonb_build_object(
    'articolo', to_jsonb(v_art) || jsonb_build_object(
      'ubicazione_codice', (select codice from ubicazioni where id = v_art.ubicazione_id),
      'fornitore_nome', (select ragione_sociale from anagrafiche where id = v_art.fornitore_abituale_id)),
    'giacenza', coalesce((select sum(qta) from giacenze where articolo_id = v_art.id), 0),
    'giacenze', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.scadenza nulls last, t.lotto_codice nulls first, t.ubicazione_codice nulls first)
      from (select g.id, g.lotto_id, l.codice as lotto_codice, l.scadenza, g.ubicazione_id, u.codice as ubicazione_codice, g.qta
            from giacenze g left join lotti l on l.id = g.lotto_id left join ubicazioni u on u.id = g.ubicazione_id
            where g.articolo_id = v_art.id) t), '[]'::jsonb),
    'movimenti', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.id desc)
      from (select m.id, m.causale, m.qta, m.costo_unit_cent, m.lotto_id, l.codice as lotto_codice, m.ubicazione_id,
                   u.codice as ubicazione_codice, m.documento_id, p.username, m.created_at
            from movimenti_stock m left join lotti l on l.id = m.lotto_id left join ubicazioni u on u.id = m.ubicazione_id
            left join profili p on p.user_id = m.user_id
            where m.articolo_id = v_art.id order by m.id desc limit 20) t), '[]'::jsonb));
end $$;

-- p_dati: campi di `articoli` (vedi _articolo_scrivi). Con `id` modifica, senza crea (matricola e descrizione obbligatorie).
-- In creazione, `giacenza_iniziale` > 0 apre la giacenza. Permesso: articoli.scrivi.
-- Errori: dato_non_valido (campi vuoti, negativi, punto_riordino < scorta_sicurezza, ubicazione/fornitore di un altro magazzino),
-- gia_esiste (matricola duplicata).
-- ritorna: la riga di articoli salvata {id, magazzino_id, matricola, descrizione, ..., attivo, created_at, updated_at}
create function api_articolo_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid := p_magazzino; v_art articoli; v_crea boolean;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  if not v_crea then
    select magazzino_id into v_m from articoli where id = (p_dati ->> 'id')::uuid;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _richiedi(v_m, 'articoli.scrivi');
  v_art := _articolo_scrivi(v_m, p_dati);
  perform _registra(v_m, case when v_crea then 'articolo.crea' else 'articolo.modifica' end, 'articolo', v_art.id,
                    jsonb_build_object('matricola', v_art.matricola, 'descrizione', v_art.descrizione));
  return to_jsonb(v_art);
end $$;

-- Solo se l'articolo non ha movimenti ne' righe di documento, altrimenti stato_non_valido. Permesso: articoli.scrivi.
-- ritorna: {ok: true, id}
create function api_articolo_elimina(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_art articoli;
begin
  select * into v_art from articoli where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(v_art.magazzino_id, 'articoli.scrivi');
  if exists (select 1 from movimenti_stock where articolo_id = p_id)
     or exists (select 1 from righe_documento where articolo_id = p_id) then
    raise exception 'stato_non_valido';
  end if;
  begin
    delete from articoli where id = p_id;
  exception when foreign_key_violation or restrict_violation then raise exception 'stato_non_valido';
  end;
  perform _registra(v_art.magazzino_id, 'articolo.elimina', 'articolo', p_id,
                    jsonb_build_object('matricola', v_art.matricola, 'descrizione', v_art.descrizione));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- p_righe: array di oggetti con le stesse chiavi di api_articolo_salva (matricola e descrizione obbligatorie).
-- Upsert per matricola: se esiste nel magazzino viene aggiornata (solo le chiavi presenti), altrimenti creata.
-- Le righe non valide sono saltate e riportate; le altre vengono importate. Permesso: articoli.scrivi.
-- ritorna: {creati, aggiornati, errori: [{riga (da 1), matricola, errore (codice)}]}
create function api_articoli_importa(p_magazzino uuid, p_righe jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_riga jsonb; v_n int := 0; v_creati int := 0; v_agg int := 0; v_errori jsonb := '[]'::jsonb;
        v_id uuid; v_mat text; v_dati jsonb;
begin
  perform _richiedi(p_magazzino, 'articoli.scrivi');
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then raise exception 'dato_non_valido'; end if;
  for v_riga in select value from jsonb_array_elements(p_righe) loop
    v_n := v_n + 1;
    begin
      if jsonb_typeof(v_riga) <> 'object' then raise exception 'dato_non_valido'; end if;
      v_mat := btrim(coalesce(v_riga ->> 'matricola', ''));
      v_id := null;
      if v_mat <> '' then select id into v_id from articoli where magazzino_id = p_magazzino and matricola = v_mat; end if;
      v_dati := (v_riga - 'id' - 'magazzino_id') || case when v_id is null then '{}'::jsonb else jsonb_build_object('id', v_id) end;
      perform _articolo_scrivi(p_magazzino, v_dati);
      if v_id is null then v_creati := v_creati + 1; else v_agg := v_agg + 1; end if;
    exception when others then
      v_errori := v_errori || jsonb_build_object('riga', v_n, 'matricola', v_mat,
        'errore', case when sqlerrm in ('dato_non_valido', 'gia_esiste', 'non_trovato') then sqlerrm else 'dato_non_valido' end);
    end;
  end loop;
  perform _registra(p_magazzino, 'articoli.importa', 'articolo', null,
                    jsonb_build_object('creati', v_creati, 'aggiornati', v_agg, 'errori', jsonb_array_length(v_errori)));
  return jsonb_build_object('creati', v_creati, 'aggiornati', v_agg, 'errori', v_errori);
end $$;

-- p_ids: array jsonb di uuid (non vuoto; gli articoli di altri magazzini sono ignorati).
-- p_tipo: 'prezzo_perc' = prezzo di acquisto aumentato di p_valore % (negativo = sconto, minimo -100);
--         'ricarico_perc' = IMPOSTA il ricarico a p_valore % (0-999.99); 'sconto_perc' = IMPOSTA lo sconto fisso a p_valore % (0-100).
-- Permesso: articoli.scrivi.
-- ritorna: {aggiornati: n}
create function api_articoli_variazione(p_magazzino uuid, p_ids jsonb, p_tipo text, p_valore numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_n int;
begin
  perform _richiedi(p_magazzino, 'articoli.scrivi');
  if p_ids is null or jsonb_typeof(p_ids) <> 'array' or jsonb_array_length(p_ids) = 0 or p_valore is null
     or p_tipo not in ('prezzo_perc', 'ricarico_perc', 'sconto_perc') then
    raise exception 'dato_non_valido';
  end if;
  if (p_tipo = 'prezzo_perc' and p_valore < -100)
     or (p_tipo = 'ricarico_perc' and p_valore not between 0 and 999.99)
     or (p_tipo = 'sconto_perc' and p_valore not between 0 and 100) then
    raise exception 'dato_non_valido';
  end if;
  begin
    select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(p_ids);
  exception when invalid_text_representation then raise exception 'dato_non_valido';
  end;
  update articoli set
    prezzo_acquisto_cent = case when p_tipo = 'prezzo_perc' then round(prezzo_acquisto_cent * (1 + p_valore / 100))::bigint else prezzo_acquisto_cent end,
    ricarico_perc = case when p_tipo = 'ricarico_perc' then p_valore else ricarico_perc end,
    sconto_perc = case when p_tipo = 'sconto_perc' then p_valore else sconto_perc end
  where magazzino_id = p_magazzino and id = any (v_ids);
  get diagnostics v_n = row_count;
  perform _registra(p_magazzino, 'articoli.variazione', 'articolo', null,
                    jsonb_build_object('tipo', p_tipo, 'valore', p_valore, 'aggiornati', v_n));
  return jsonb_build_object('aggiornati', v_n);
end $$;

-- =====================================================================
-- Ubicazioni
-- =====================================================================

-- ritorna: [{id, magazzino_id, codice, zona, corridoio, scaffale, created_at, n_articoli (articoli con questa ubicazione
--            abituale), qta_totale (somma giacenze li')}] ordinate per codice
create function api_ubicazioni_elenco(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb;
begin
  perform _membro(p_magazzino);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.codice), '[]'::jsonb) into v_res
  from (select u.*,
               (select count(*) from articoli a where a.ubicazione_id = u.id)::int as n_articoli,
               coalesce((select sum(g.qta) from giacenze g where g.ubicazione_id = u.id), 0) as qta_totale
        from ubicazioni u where u.magazzino_id = p_magazzino) t;
  return v_res;
end $$;

-- p_dati: {id?, codice, zona?, corridoio?, scaffale?}. Con id modifica. Permesso: lotti_ubicazioni. Codice duplicato: gia_esiste.
-- ritorna: {id, magazzino_id, codice, zona, corridoio, scaffale, created_at}
create function api_ubicazione_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid := p_magazzino; v_ub ubicazioni; v_crea boolean; v_cod text;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  if not v_crea then
    select magazzino_id into v_m from ubicazioni where id = (p_dati ->> 'id')::uuid;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _richiedi(v_m, 'lotti_ubicazioni');
  v_cod := btrim(coalesce(p_dati ->> 'codice', ''));
  begin
    if v_crea then
      if v_cod = '' then raise exception 'dato_non_valido'; end if;
      insert into ubicazioni (magazzino_id, codice, zona, corridoio, scaffale)
      values (v_m, v_cod, p_dati ->> 'zona', p_dati ->> 'corridoio', p_dati ->> 'scaffale') returning * into v_ub;
    else
      if p_dati ? 'codice' and v_cod = '' then raise exception 'dato_non_valido'; end if;
      update ubicazioni set
        codice = case when p_dati ? 'codice' then v_cod else codice end,
        zona = case when p_dati ? 'zona' then p_dati ->> 'zona' else zona end,
        corridoio = case when p_dati ? 'corridoio' then p_dati ->> 'corridoio' else corridoio end,
        scaffale = case when p_dati ? 'scaffale' then p_dati ->> 'scaffale' else scaffale end
      where id = (p_dati ->> 'id')::uuid returning * into v_ub;
    end if;
  exception when unique_violation then raise exception 'gia_esiste';
  end;
  perform _registra(v_m, case when v_crea then 'ubicazione.crea' else 'ubicazione.modifica' end, 'ubicazione', v_ub.id,
                    jsonb_build_object('codice', v_ub.codice));
  return to_jsonb(v_ub);
end $$;

-- Permesso: lotti_ubicazioni. Se vi e' ancora merce (giacenza <> 0): stato_non_valido.
-- ritorna: {ok: true, id}
create function api_ubicazione_elimina(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ub ubicazioni;
begin
  select * into v_ub from ubicazioni where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(v_ub.magazzino_id, 'lotti_ubicazioni');
  if exists (select 1 from giacenze where ubicazione_id = p_id and qta <> 0) then raise exception 'stato_non_valido'; end if;
  delete from ubicazioni where id = p_id;
  perform _registra(v_ub.magazzino_id, 'ubicazione.elimina', 'ubicazione', p_id, jsonb_build_object('codice', v_ub.codice));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- =====================================================================
-- Lotti
-- =====================================================================

-- Lotti di un articolo, con scadenza piu' vicina per prima (FEFO), senza scadenza in fondo.
-- ritorna: [{id, magazzino_id, articolo_id, codice, scadenza (data o null), created_at, qta (giacenza totale del lotto)}]
create function api_lotti_elenco(p_articolo uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid; v_res jsonb;
begin
  select magazzino_id into v_m from articoli where id = p_articolo;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(v_m);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.scadenza nulls last, t.codice), '[]'::jsonb) into v_res
  from (select l.*, coalesce((select sum(g.qta) from giacenze g where g.lotto_id = l.id), 0) as qta
        from lotti l where l.articolo_id = p_articolo) t;
  return v_res;
end $$;

-- p_dati: {id?, articolo_id (obbligatorio in creazione), codice, scadenza? ('YYYY-MM-DD' o null)}. Con id modifica codice e scadenza.
-- Permesso: lotti_ubicazioni. Codice duplicato sullo stesso articolo: gia_esiste.
-- ritorna: {id, magazzino_id, articolo_id, codice, scadenza, created_at}
create function api_lotto_salva(p_magazzino uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m uuid := p_magazzino; v_lotto lotti; v_crea boolean; v_cod text; v_art uuid;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then raise exception 'dato_non_valido'; end if;
  v_crea := nullif(p_dati ->> 'id', '') is null;
  if not v_crea then
    select magazzino_id into v_m from lotti where id = (p_dati ->> 'id')::uuid;
    if not found then raise exception 'non_trovato'; end if;
  end if;
  perform _richiedi(v_m, 'lotti_ubicazioni');
  v_cod := btrim(coalesce(p_dati ->> 'codice', ''));
  begin
    if v_crea then
      v_art := nullif(p_dati ->> 'articolo_id', '')::uuid;
      if v_cod = '' or v_art is null then raise exception 'dato_non_valido'; end if;
      if not exists (select 1 from articoli where id = v_art and magazzino_id = v_m) then raise exception 'non_trovato'; end if;
      insert into lotti (magazzino_id, articolo_id, codice, scadenza)
      values (v_m, v_art, v_cod, nullif(p_dati ->> 'scadenza', '')::date) returning * into v_lotto;
    else
      if p_dati ? 'codice' and v_cod = '' then raise exception 'dato_non_valido'; end if;
      update lotti set
        codice = case when p_dati ? 'codice' then v_cod else codice end,
        scadenza = case when p_dati ? 'scadenza' then nullif(p_dati ->> 'scadenza', '')::date else scadenza end
      where id = (p_dati ->> 'id')::uuid returning * into v_lotto;
    end if;
  exception
    when unique_violation then raise exception 'gia_esiste';
    when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then raise exception 'dato_non_valido';
  end;
  perform _registra(v_m, case when v_crea then 'lotto.crea' else 'lotto.modifica' end, 'lotto', v_lotto.id,
                    jsonb_build_object('codice', v_lotto.codice, 'articolo_id', v_lotto.articolo_id));
  return to_jsonb(v_lotto);
end $$;

-- =====================================================================
-- Impostazioni del magazzino
-- =====================================================================

-- Senza p_blocca_giacenza_negativa (null) legge soltanto (basta essere membri). Per cambiarla serve essere docente
-- della classe o proprietario del magazzino personale, altrimenti permesso_negato.
-- ritorna: {magazzino_id, blocca_giacenza_negativa}
create function api_magazzino_impostazioni(p_magazzino uuid, p_blocca_giacenza_negativa boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_mb membri; v_mag magazzini;
begin
  v_mb := _membro(p_magazzino);
  select * into v_mag from magazzini where id = p_magazzino;
  if p_blocca_giacenza_negativa is not null then
    if not (v_mb.ruolo = 'docente' or (v_mag.tipo = 'personale' and v_mag.proprietario_id = v_mb.user_id)) then
      raise exception 'permesso_negato';
    end if;
    update magazzini set blocca_giacenza_negativa = p_blocca_giacenza_negativa where id = p_magazzino
    returning * into v_mag;
    perform _registra(p_magazzino, 'magazzino.impostazioni', 'magazzino', p_magazzino,
                      jsonb_build_object('blocca_giacenza_negativa', p_blocca_giacenza_negativa));
  end if;
  return jsonb_build_object('magazzino_id', v_mag.id, 'blocca_giacenza_negativa', v_mag.blocca_giacenza_negativa);
end $$;
