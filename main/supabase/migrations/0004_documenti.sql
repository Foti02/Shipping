-- 0004_documenti.sql
-- Documenti e magazzino: giacenze, movimenti, numerazione, ciclo documentale, spedizioni, trasferimenti.
-- Solo plpgsql. Le tabelle sono in 0001 (invariate). Convenzioni: vedi replica/architecture.md sezioni 3, 4, 5, 8.
-- Nota: le bozze hanno numero NEGATIVO (colonna not null + unique): il numero vero si assegna alla conferma.
-- Le api_* mostrano numero = null per le bozze.

create sequence documenti_bozza_seq;

-- ---------- stub (ridefiniti con create or replace in 0006_scenari.sql: stessi nomi di parametri, ritorno void) ----------
create function _riordino_dinamico(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  null;
end $$;

create function _valuta_compiti(p_magazzino uuid, p_documento uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  null;
end $$;

create function _sblocca_compiti(p_magazzino uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  null;
end $$;

-- ---------- utilita' interne ----------

-- azione di permesso del tipo di documento
create function _azione_documento(p_tipo text) returns text
language plpgsql immutable as $$
begin
  return case
    when p_tipo = 'carico' then 'carico'
    when p_tipo = 'scarico' then 'scarico'
    when p_tipo = 'reso_cliente' then 'reso'
    when p_tipo = 'preventivo' then 'preventivo'
    when p_tipo = 'ordine_cliente' then 'ordine_cliente'
    when p_tipo = 'ordine_fornitore' then 'ordine_fornitore'
    when p_tipo in ('fattura_vendita', 'fattura_acquisto') then 'fattura'
    else null end;
end $$;

create function _azione_documento_o_errore(p_tipo text) returns text
language plpgsql immutable as $$
declare a text := _azione_documento(p_tipo);
begin
  if a is null then raise exception 'dato_non_valido'; end if;
  return a;
end $$;

-- costo medio ponderato corrente (centesimi) da apertura, carichi e relativi annulli; ripiega sul prezzo di acquisto
create function _costo_medio(p_articolo uuid) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare v_q numeric; v_v numeric; v_p bigint;
begin
  select sum(qta), sum(qta * costo_unit_cent) into v_q, v_v
  from movimenti_stock where articolo_id = p_articolo and causale in ('apertura', 'carico', 'annullo');
  if v_q > 0 then return round(v_v / v_q)::bigint; end if;
  select prezzo_acquisto_cent into v_p from articoli where id = p_articolo;
  return coalesce(v_p, 0);
end $$;

-- applica un delta a una riga di giacenze (la crea se manca)
create function _giac_applica(p_magazzino uuid, p_articolo uuid, p_lotto uuid, p_ubicazione uuid, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into giacenze (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta)
  values (p_magazzino, p_articolo, p_lotto, p_ubicazione, 0)
  on conflict do nothing;
  update giacenze set qta = qta + p_delta
  where articolo_id = p_articolo and lotto_id is not distinct from p_lotto and ubicazione_id is not distinct from p_ubicazione;
end $$;

-- ricalcola righe e totali: netto = round(qta*prezzo*(1-sconto/100)); imposta = round(netto*iva/100);
-- inps e ritenuta sul netto; riga.totale_cent = netto + imposta; totale = imponibile + imposta + inps - ritenuta
create function _ricalcola_documento(p_documento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_imp numeric; v_iva numeric; v_inps numeric; v_rit numeric;
begin
  update righe_documento
  set totale_cent = (round(qta * prezzo_cent * (1 - sconto_perc / 100))
                     + round(round(qta * prezzo_cent * (1 - sconto_perc / 100)) * iva_perc / 100))::bigint
  where documento_id = p_documento;

  select coalesce(sum(n), 0), coalesce(sum(round(n * iva_perc / 100)), 0),
         coalesce(sum(round(n * inps_perc / 100)), 0), coalesce(sum(round(n * ritenuta_perc / 100)), 0)
  into v_imp, v_iva, v_inps, v_rit
  from (select round(qta * prezzo_cent * (1 - sconto_perc / 100)) as n, iva_perc, inps_perc, ritenuta_perc
        from righe_documento where documento_id = p_documento) s;

  update documenti
  set imponibile_cent = v_imp, imposta_cent = v_iva, inps_cent = v_inps, ritenuta_cent = v_rit,
      totale_cent = v_imp + v_iva + v_inps - v_rit
  where id = p_documento;
end $$;

-- controlla la scorta dell'articolo. Sotto soglia se giacenza + ordinato (ordini fornitore confermati) <= punto_riordino
-- (e punto_riordino > 0): una sola notifica scorta_bassa aperta per articolo + _riordino_dinamico.
-- Quando la giacenza torna sopra il punto: chiude le notifiche aperte e chiama _sblocca_compiti.
create function _controlla_scorte(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare art articoli; v_giac numeric; v_ord numeric; v_chiuse int;
begin
  -- serializza i controlli dello stesso articolo (no key update: non blocca gli insert su giacenze)
  select * into art from articoli where id = p_articolo and magazzino_id = p_magazzino for no key update;
  if not found then return; end if;
  select coalesce(sum(qta), 0) into v_giac from giacenze where articolo_id = p_articolo;
  select coalesce(sum(r.qta), 0) into v_ord
  from righe_documento r join documenti d on d.id = r.documento_id
  where d.magazzino_id = p_magazzino and d.tipo = 'ordine_fornitore' and d.stato = 'confermato' and r.articolo_id = p_articolo;

  if art.punto_riordino > 0 and v_giac + v_ord <= art.punto_riordino then
    if not exists (select 1 from notifiche where magazzino_id = p_magazzino and articolo_id = p_articolo
                   and tipo = 'scorta_bassa' and risolta_il is null) then
      insert into notifiche (magazzino_id, tipo, articolo_id, messaggio)
      values (p_magazzino, 'scorta_bassa', p_articolo,
              format('Scorta bassa: %s (%s). Giacenza %s, punto di riordino %s.',
                     art.descrizione, art.matricola, trim_scale(v_giac), trim_scale(art.punto_riordino)));
      perform _riordino_dinamico(p_magazzino, p_articolo);
    end if;
  elsif v_giac > art.punto_riordino then
    update notifiche set risolta_il = now()
    where magazzino_id = p_magazzino and articolo_id = p_articolo and tipo = 'scorta_bassa' and risolta_il is null;
    get diagnostics v_chiuse = row_count;
    if v_chiuse > 0 then perform _sblocca_compiti(p_magazzino); end if;
  end if;
end $$;

-- muove la giacenza e scrive il registro. p_qta con segno.
-- Scarico con p_lotto e p_ubicazione nulli: lotti FEFO (scadenza piu' vicina) se articoli.gestione_lotti, altrimenti FIFO
-- (giacenza con il primo carico piu' vecchio). Con solo uno dei due valorizzato, consuma tra le righe che combaciano.
-- p_esatto = true (opzionale, aggiunto): nessuna scelta automatica, tocca esattamente la riga (lotto, ubicazione).
create function _movimenta(p_magazzino uuid, p_articolo uuid, p_lotto uuid, p_ubicazione uuid, p_qta numeric,
                           p_costo bigint, p_causale text, p_documento uuid, p_esatto boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare art articoli; v_blocca boolean; v_lotti boolean; v_tot numeric; v_resto numeric; v_prendi numeric; r record;
begin
  if p_qta is null or p_qta = 0 then raise exception 'dato_non_valido'; end if;
  select * into art from articoli where id = p_articolo and magazzino_id = p_magazzino;
  if not found then raise exception 'non_trovato'; end if;
  v_lotti := art.gestione_lotti;
  select blocca_giacenza_negativa into v_blocca from magazzini where id = p_magazzino;

  -- blocca tutte le righe dell'articolo, sempre nello stesso ordine: due scarichi insieme si mettono in fila
  perform 1 from giacenze where articolo_id = p_articolo order by id for update;

  if p_qta > 0 then
    perform _giac_applica(p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta);
    insert into movimenti_stock (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
    values (p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta, coalesce(p_costo, 0), p_causale, p_documento, auth.uid());
  elsif p_esatto then
    select coalesce(sum(qta), 0) into v_tot from giacenze
    where articolo_id = p_articolo and lotto_id is not distinct from p_lotto and ubicazione_id is not distinct from p_ubicazione;
    if v_blocca and v_tot + p_qta < 0 then raise exception 'giacenza_insufficiente'; end if;
    perform _giac_applica(p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta);
    insert into movimenti_stock (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
    values (p_magazzino, p_articolo, p_lotto, p_ubicazione, p_qta, coalesce(p_costo, 0), p_causale, p_documento, auth.uid());
  else
    select coalesce(sum(qta), 0) into v_tot from giacenze
    where articolo_id = p_articolo and (p_lotto is null or lotto_id = p_lotto) and (p_ubicazione is null or ubicazione_id = p_ubicazione);
    if v_blocca and v_tot + p_qta < 0 then raise exception 'giacenza_insufficiente'; end if;
    v_resto := -p_qta;
    for r in
      select gg.lotto_id, gg.ubicazione_id, gg.qta
      from giacenze gg left join lotti ll on ll.id = gg.lotto_id
      where gg.articolo_id = p_articolo and gg.qta > 0
        and (p_lotto is null or gg.lotto_id = p_lotto)
        and (p_ubicazione is null or gg.ubicazione_id = p_ubicazione)
      order by case when v_lotti then ll.scadenza end asc nulls last,
               (select min(m.id) from movimenti_stock m
                where m.articolo_id = gg.articolo_id and m.qta > 0
                  and m.lotto_id is not distinct from gg.lotto_id and m.ubicazione_id is not distinct from gg.ubicazione_id) asc nulls last,
               gg.id
    loop
      exit when v_resto <= 0;
      v_prendi := least(r.qta, v_resto);
      perform _giac_applica(p_magazzino, p_articolo, r.lotto_id, r.ubicazione_id, -v_prendi);
      insert into movimenti_stock (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
      values (p_magazzino, p_articolo, r.lotto_id, r.ubicazione_id, -v_prendi, coalesce(p_costo, 0), p_causale, p_documento, auth.uid());
      v_resto := v_resto - v_prendi;
    end loop;
    if v_resto > 0 then  -- solo con blocca_giacenza_negativa = false: il resto va in negativo
      perform _giac_applica(p_magazzino, p_articolo, p_lotto, p_ubicazione, -v_resto);
      insert into movimenti_stock (magazzino_id, articolo_id, lotto_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
      values (p_magazzino, p_articolo, p_lotto, p_ubicazione, -v_resto, coalesce(p_costo, 0), p_causale, p_documento, auth.uid());
    end if;
  end if;

  perform _controlla_scorte(p_magazzino, p_articolo);
end $$;

-- documento come json: la riga di documenti con numero null se bozza, piu' anagrafica {id,codice,ragione_sociale,tipo}
create function _doc_json(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select (to_jsonb(d) - 'numero') || jsonb_build_object(
           'numero', case when d.stato = 'bozza' then null else d.numero end,
           'anagrafica', (select jsonb_build_object('id', a.id, 'codice', a.codice, 'ragione_sociale', a.ragione_sociale, 'tipo', a.tipo)
                          from anagrafiche a where a.id = d.anagrafica_id))
  into v from documenti d where d.id = p_id;
  return v;
end $$;

-- ritorna: {documento:{...colonne di documenti, numero null se bozza, anagrafica:{id,codice,ragione_sociale,tipo}|null},
--   righe:[{...colonne di righe_documento, netto_cent, imposta_cent, articolo_matricola, um, gestione_lotti, lotto_codice,
--           ubicazione_codice, giacenza}], origine:{id,tipo,anno,numero,stato}|null, derivati:[{id,tipo,anno,numero,stato}]}
create function _documento_completo(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d documenti;
begin
  select * into d from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  return jsonb_build_object(
    'documento', _doc_json(p_id),
    'righe', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
               'netto_cent', x.n,
               'imposta_cent', round(x.n * r.iva_perc / 100),
               'articolo_matricola', a.matricola, 'um', a.um, 'gestione_lotti', a.gestione_lotti,
               'lotto_codice', l.codice, 'ubicazione_codice', u.codice,
               'giacenza', case when r.articolo_id is null then null
                                else (select coalesce(sum(g.qta), 0) from giacenze g where g.articolo_id = r.articolo_id) end)
             order by r.posizione)
      from righe_documento r
      cross join lateral (select round(r.qta * r.prezzo_cent * (1 - r.sconto_perc / 100)) as n) x
      left join articoli a on a.id = r.articolo_id
      left join lotti l on l.id = r.lotto_id
      left join ubicazioni u on u.id = r.ubicazione_id
      where r.documento_id = p_id), '[]'::jsonb),
    'origine', (select jsonb_build_object('id', o.id, 'tipo', o.tipo, 'anno', o.anno,
                                          'numero', case when o.stato = 'bozza' then null else o.numero end, 'stato', o.stato)
                from documenti o where o.id = d.documento_origine_id),
    'derivati', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'anno', c.anno,
                                          'numero', case when c.stato = 'bozza' then null else c.numero end, 'stato', c.stato)
                       order by c.created_at)
      from documenti c where c.documento_origine_id = p_id), '[]'::jsonb));
end $$;

-- conferma interna (nessun controllo permessi: lo fa il chiamante). Muove le giacenze per carico, scarico, reso_cliente.
create function _conferma(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documenti; r record; n int; v_anno int;
begin
  select * into d from documenti where id = p_id for update;
  if not found then raise exception 'non_trovato'; end if;
  if d.stato <> 'bozza' then raise exception 'stato_non_valido'; end if;
  if not exists (select 1 from righe_documento where documento_id = p_id) then raise exception 'dato_non_valido'; end if;
  perform _ricalcola_documento(p_id);

  if d.tipo in ('carico', 'scarico', 'reso_cliente') then
    for r in select * from righe_documento where documento_id = p_id and articolo_id is not null order by articolo_id, posizione loop
      if d.tipo = 'carico' then
        perform _movimenta(d.magazzino_id, r.articolo_id, r.lotto_id, r.ubicazione_id, r.qta, r.prezzo_cent, 'carico', p_id);
      elsif d.tipo = 'scarico' then
        perform _movimenta(d.magazzino_id, r.articolo_id, r.lotto_id, r.ubicazione_id, -r.qta, _costo_medio(r.articolo_id), 'scarico', p_id);
      else
        perform _movimenta(d.magazzino_id, r.articolo_id, r.lotto_id, r.ubicazione_id, r.qta, _costo_medio(r.articolo_id), 'reso_cliente', p_id);
      end if;
    end loop;
  end if;

  -- numerazione atomica: mai max()+1
  v_anno := extract(year from d.data)::int;
  insert into contatori (magazzino_id, tipo, anno, ultimo) values (d.magazzino_id, d.tipo, v_anno, 1)
  on conflict (magazzino_id, tipo, anno) do update set ultimo = contatori.ultimo + 1
  returning ultimo into n;

  update documenti
  set stato = 'confermato', anno = v_anno, numero = n,
      stato_spedizione = case when d.tipo in ('ordine_cliente', 'scarico') then 'da_preparare' else null end
  where id = p_id;

  if d.documento_origine_id is not null then
    update documenti set stato = 'evaso' where id = d.documento_origine_id and stato = 'confermato';
  end if;

  perform _registra(d.magazzino_id, 'documento_conferma', 'documento', p_id,
                    jsonb_build_object('tipo', d.tipo, 'anno', v_anno, 'numero', n));
  perform _valuta_compiti(d.magazzino_id, p_id);
end $$;

-- crea la bozza derivata copiando righe (nessun permesso: lo fa il chiamante). Ritorna l'id; se esiste gia' una bozza derivata dello stesso tipo, la riusa.
create function _genera(p_origine uuid, p_tipo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o documenti; v_id uuid;
begin
  select * into o from documenti where id = p_origine for update;
  if not found then raise exception 'non_trovato'; end if;
  if not ((o.tipo = 'preventivo' and p_tipo = 'ordine_cliente')
       or (o.tipo = 'ordine_cliente' and p_tipo = 'scarico')
       or (o.tipo = 'scarico' and p_tipo = 'fattura_vendita')
       or (o.tipo = 'ordine_fornitore' and p_tipo = 'carico')
       or (o.tipo = 'carico' and p_tipo = 'fattura_acquisto')) then
    raise exception 'dato_non_valido';
  end if;
  if o.stato <> 'confermato' then raise exception 'stato_non_valido'; end if;

  select id into v_id from documenti where documento_origine_id = p_origine and tipo = p_tipo and stato = 'bozza' limit 1;
  if v_id is not null then return v_id; end if;

  insert into documenti (magazzino_id, tipo, anno, numero, data, anagrafica_id, documento_origine_id, titolo, banca, iban,
                         condizioni_pagamento, note, creato_da)
  values (o.magazzino_id, p_tipo, extract(year from current_date)::int, -nextval('documenti_bozza_seq')::int, current_date,
          o.anagrafica_id, o.id, case when p_tipo like 'fattura%' then 'FATTURA' else o.titolo end,
          o.banca, o.iban, o.condizioni_pagamento, o.note, auth.uid())
  returning id into v_id;

  insert into righe_documento (documento_id, posizione, articolo_id, descrizione, qta, prezzo_cent, sconto_perc, iva_perc,
                               inps_perc, ritenuta_perc, lotto_id, ubicazione_id)
  select v_id, posizione, articolo_id, descrizione, qta, prezzo_cent, sconto_perc, iva_perc, inps_perc, ritenuta_perc,
         lotto_id, ubicazione_id
  from righe_documento where documento_id = p_origine;

  perform _ricalcola_documento(v_id);
  perform _registra(o.magazzino_id, 'documento_genera', 'documento', v_id,
                    jsonb_build_object('tipo', p_tipo, 'origine_id', p_origine));
  return v_id;
end $$;

-- ---------- API ----------

-- ritorna: [{id, tipo, anno, numero (null se bozza), data, stato, stato_spedizione, anagrafica_id, anagrafica (ragione sociale|null),
--            titolo, imponibile_cent, imposta_cent, totale_cent, pagato, documento_origine_id, n_righe, created_at}]
--          ordinato per data e creazione decrescenti. Filtri tutti opzionali (null = nessun filtro).
create function api_documenti_elenco(p_magazzino uuid, p_tipo text default null, p_dal date default null, p_al date default null,
                                     p_stato text default null, p_cerca text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _membro(p_magazzino);
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'tipo', d.tipo, 'anno', d.anno, 'numero', case when d.stato = 'bozza' then null else d.numero end,
           'data', d.data, 'stato', d.stato, 'stato_spedizione', d.stato_spedizione,
           'anagrafica_id', d.anagrafica_id, 'anagrafica', a.ragione_sociale, 'titolo', d.titolo,
           'imponibile_cent', d.imponibile_cent, 'imposta_cent', d.imposta_cent, 'totale_cent', d.totale_cent,
           'pagato', d.pagato, 'documento_origine_id', d.documento_origine_id,
           'n_righe', (select count(*) from righe_documento r where r.documento_id = d.id), 'created_at', d.created_at)
         order by d.data desc, d.created_at desc), '[]'::jsonb)
  into v
  from documenti d left join anagrafiche a on a.id = d.anagrafica_id
  where d.magazzino_id = p_magazzino
    and (p_tipo is null or d.tipo = p_tipo)
    and (p_dal is null or d.data >= p_dal)
    and (p_al is null or d.data <= p_al)
    and (p_stato is null or d.stato = p_stato)
    and (coalesce(p_cerca, '') = ''
         or a.ragione_sociale ilike '%' || p_cerca || '%'
         or d.titolo ilike '%' || p_cerca || '%'
         or d.note ilike '%' || p_cerca || '%'
         or (d.stato <> 'bozza' and d.numero::text = p_cerca)
         or exists (select 1 from righe_documento r where r.documento_id = d.id and r.descrizione ilike '%' || p_cerca || '%'));
  return v;
end $$;

-- ritorna: {documento:{...colonne di documenti, numero null se bozza, anagrafica:{id,codice,ragione_sociale,tipo}|null},
--   righe:[{...colonne di righe_documento, netto_cent, imposta_cent, articolo_matricola, um, gestione_lotti, lotto_codice,
--           ubicazione_codice, giacenza}], origine:{id,tipo,anno,numero,stato}|null, derivati:[{id,tipo,anno,numero,stato}]}
create function api_documento_leggi(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_mag uuid;
begin
  select magazzino_id into v_mag from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(v_mag);
  return _documento_completo(p_id);
end $$;

-- p_documento: {id?, tipo (solo alla creazione), data?, anagrafica_id?, titolo?, banca?, iban?, condizioni_pagamento?, pagato?, note?,
--   documento_origine_id?}. Con id modifica una bozza; le chiavi assenti restano invariate.
-- p_righe (sostituiscono le precedenti): [{articolo_id?, descrizione?, qta, prezzo_cent?, sconto_perc?, iva_perc?, inps_perc?,
--   ritenuta_perc?, lotto_id?, ubicazione_id?}]. articolo_id obbligatorio tranne nelle fatture. Prezzo mancante: da articolo.
-- ritorna: lo stesso oggetto di api_documento_leggi (numero null: la bozza non e' numerata)
create function api_documento_salva(p_magazzino uuid, p_documento jsonb, p_righe jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := _uid();
  v_id uuid; d documenti; v_tipo text; v_data date; v_anag uuid; v_origine uuid; v_pagato boolean;
  v_art articoli; v_art_id uuid; v_qta numeric; v_prezzo bigint; v_iva numeric; v_sconto numeric; v_desc text;
  v_lotto uuid; v_ubi uuid; v_pos int := 0; el jsonb; n bigint;
begin
  if p_documento is null or jsonb_typeof(p_documento) <> 'object' then raise exception 'dato_non_valido'; end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then raise exception 'dato_non_valido'; end if;

  select * into d from documenti where false;
  v_id := nullif(p_documento ->> 'id', '')::uuid;
  if v_id is not null then
    select * into d from documenti where id = v_id and magazzino_id = p_magazzino for update;
    if not found then raise exception 'non_trovato'; end if;
    v_tipo := d.tipo;
  else
    v_tipo := p_documento ->> 'tipo';
  end if;
  perform _richiedi(p_magazzino, _azione_documento_o_errore(v_tipo));
  if v_id is not null and d.stato <> 'bozza' then raise exception 'stato_non_valido'; end if;

  v_data := case when p_documento ? 'data' then coalesce(nullif(p_documento ->> 'data', '')::date, current_date)
                 else coalesce(d.data, current_date) end;
  v_anag := case when p_documento ? 'anagrafica_id' then nullif(p_documento ->> 'anagrafica_id', '')::uuid else d.anagrafica_id end;
  if v_anag is not null and not exists (
       select 1 from anagrafiche where id = v_anag and magazzino_id = p_magazzino
         and tipo = case when v_tipo in ('carico', 'ordine_fornitore', 'fattura_acquisto') then 'fornitore' else 'cliente' end) then
    raise exception 'dato_non_valido';
  end if;
  v_origine := case when p_documento ? 'documento_origine_id' then nullif(p_documento ->> 'documento_origine_id', '')::uuid
                    else d.documento_origine_id end;
  if v_origine is not null and not exists (select 1 from documenti where id = v_origine and magazzino_id = p_magazzino) then
    raise exception 'dato_non_valido';
  end if;
  v_pagato := case when p_documento ? 'pagato' then coalesce((p_documento ->> 'pagato')::boolean, false)
                   else coalesce(d.pagato, false) end;

  if v_id is null then
    insert into documenti (magazzino_id, tipo, anno, numero, data, anagrafica_id, documento_origine_id, titolo, banca, iban,
                           condizioni_pagamento, pagato, note, creato_da)
    values (p_magazzino, v_tipo, extract(year from v_data)::int, -nextval('documenti_bozza_seq')::int, v_data, v_anag, v_origine,
            p_documento ->> 'titolo', p_documento ->> 'banca', p_documento ->> 'iban', p_documento ->> 'condizioni_pagamento',
            v_pagato, p_documento ->> 'note', u)
    returning id into v_id;
  else
    update documenti set
      anno = extract(year from v_data)::int, data = v_data, anagrafica_id = v_anag, documento_origine_id = v_origine, pagato = v_pagato,
      titolo = case when p_documento ? 'titolo' then p_documento ->> 'titolo' else titolo end,
      banca = case when p_documento ? 'banca' then p_documento ->> 'banca' else banca end,
      iban = case when p_documento ? 'iban' then p_documento ->> 'iban' else iban end,
      condizioni_pagamento = case when p_documento ? 'condizioni_pagamento' then p_documento ->> 'condizioni_pagamento' else condizioni_pagamento end,
      note = case when p_documento ? 'note' then p_documento ->> 'note' else note end
    where id = v_id;
    delete from righe_documento where documento_id = v_id;
  end if;

  for el, n in select t.v, t.n from jsonb_array_elements(p_righe) with ordinality as t(v, n) loop
    v_pos := v_pos + 1;
    select * into v_art from articoli where false;
    v_art_id := nullif(el ->> 'articolo_id', '')::uuid;
    if v_art_id is not null then
      select * into v_art from articoli where id = v_art_id and magazzino_id = p_magazzino;
      if not found then raise exception 'dato_non_valido'; end if;
    elsif v_tipo not like 'fattura%' then
      raise exception 'dato_non_valido';
    end if;
    v_desc := coalesce(nullif(el ->> 'descrizione', ''), v_art.descrizione);
    if v_desc is null then raise exception 'dato_non_valido'; end if;
    v_qta := coalesce((el ->> 'qta')::numeric, 1);
    if v_qta <= 0 then raise exception 'dato_non_valido'; end if;
    v_prezzo := coalesce(round((el ->> 'prezzo_cent')::numeric)::bigint,
                         case when v_art_id is null then 0
                              when v_tipo in ('carico', 'ordine_fornitore', 'fattura_acquisto') then v_art.prezzo_acquisto_cent
                              else round(v_art.prezzo_acquisto_cent * (1 + v_art.ricarico_perc / 100))::bigint end);
    v_sconto := coalesce((el ->> 'sconto_perc')::numeric, 0);
    if v_sconto < 0 or v_sconto > 100 then raise exception 'dato_non_valido'; end if;
    v_iva := coalesce((el ->> 'iva_perc')::numeric, v_art.iva_perc, 22);
    v_lotto := nullif(el ->> 'lotto_id', '')::uuid;
    v_ubi := nullif(el ->> 'ubicazione_id', '')::uuid;
    if v_lotto is not null and not exists (select 1 from lotti where id = v_lotto and magazzino_id = p_magazzino
                                           and articolo_id is not distinct from v_art_id) then
      raise exception 'dato_non_valido';
    end if;
    if v_ubi is not null and not exists (select 1 from ubicazioni where id = v_ubi and magazzino_id = p_magazzino) then
      raise exception 'dato_non_valido';
    end if;
    insert into righe_documento (documento_id, posizione, articolo_id, descrizione, qta, prezzo_cent, sconto_perc, iva_perc,
                                 inps_perc, ritenuta_perc, lotto_id, ubicazione_id)
    values (v_id, v_pos, v_art_id, v_desc, v_qta, v_prezzo, v_sconto, v_iva,
            coalesce((el ->> 'inps_perc')::numeric, 0), coalesce((el ->> 'ritenuta_perc')::numeric, 0), v_lotto, v_ubi);
  end loop;

  perform _ricalcola_documento(v_id);
  perform _registra(p_magazzino, 'documento_salva', 'documento', v_id, jsonb_build_object('tipo', v_tipo, 'righe', v_pos));
  return _documento_completo(v_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi, con stato 'confermato' e numero assegnato.
-- carico/scarico/reso_cliente muovono le giacenze (errore giacenza_insufficiente se bloccato). Poi _valuta_compiti.
create function api_documento_conferma(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti;
begin
  select * into d from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, _azione_documento_o_errore(d.tipo));
  perform _conferma(p_id);
  return _documento_completo(p_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi, con stato 'annullato'. Solo da confermato/evaso.
-- Storna i movimenti (causale annullo, stesso lotto/ubicazione); se l'origine era evasa torna 'confermato'.
create function api_documento_annulla(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti; m record;
begin
  perform _uid();
  select * into d from documenti where id = p_id for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, _azione_documento_o_errore(d.tipo));
  if d.stato not in ('confermato', 'evaso') then raise exception 'stato_non_valido'; end if;

  for m in select * from movimenti_stock where documento_id = p_id and causale in ('carico', 'scarico', 'reso_cliente')
           order by articolo_id, id loop
    perform _movimenta(d.magazzino_id, m.articolo_id, m.lotto_id, m.ubicazione_id, -m.qta, m.costo_unit_cent, 'annullo', p_id, true);
  end loop;

  update documenti set stato = 'annullato' where id = p_id;
  if d.documento_origine_id is not null and not exists (
       select 1 from documenti where documento_origine_id = d.documento_origine_id and id <> p_id and stato in ('confermato', 'evaso')) then
    update documenti set stato = 'confermato' where id = d.documento_origine_id and stato = 'evaso';
  end if;
  perform _registra(d.magazzino_id, 'documento_annulla', 'documento', p_id,
                    jsonb_build_object('tipo', d.tipo, 'anno', d.anno, 'numero', d.numero));
  return _documento_completo(p_id);
end $$;

-- ritorna: {ok: true, id}. Solo bozze (altrimenti stato_non_valido).
create function api_documento_elimina(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti;
begin
  perform _uid();
  select * into d from documenti where id = p_id for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, _azione_documento_o_errore(d.tipo));
  if d.stato <> 'bozza' then raise exception 'stato_non_valido'; end if;
  delete from documenti where id = p_id;
  perform _registra(d.magazzino_id, 'documento_elimina', 'documento', p_id, jsonb_build_object('tipo', d.tipo));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi (documento.pagato aggiornato). Non per documenti annullati.
create function api_documento_pagato(p_id uuid, p_pagato boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti;
begin
  perform _uid();
  select * into d from documenti where id = p_id for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, _azione_documento_o_errore(d.tipo));
  if d.stato = 'annullato' then raise exception 'stato_non_valido'; end if;
  update documenti set pagato = coalesce(p_pagato, false) where id = p_id;
  perform _registra(d.magazzino_id, 'documento_pagato', 'documento', p_id, jsonb_build_object('pagato', coalesce(p_pagato, false)));
  return _documento_completo(p_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi, del NUOVO documento in bozza (con origine valorizzata).
-- Catene: preventivo->ordine_cliente, ordine_cliente->scarico, scarico->fattura_vendita, ordine_fornitore->carico,
-- carico->fattura_acquisto (altrimenti dato_non_valido). L'origine deve essere 'confermato'. Se esiste gia' una bozza derivata
-- dello stesso tipo, la ritorna. L'origine passa a 'evaso' quando il derivato viene confermato.
create function api_documento_genera(p_origine uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o documenti; v_id uuid;
begin
  perform _uid();
  select * into o from documenti where id = p_origine;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(o.magazzino_id, _azione_documento_o_errore(p_tipo));
  v_id := _genera(p_origine, p_tipo);
  return _documento_completo(v_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi, del carico generato e gia' confermato (origine = ordine, che passa a 'evaso').
-- Richiede l'azione 'evadi_ordine'. Solo ordini fornitore 'confermato'.
create function api_ordine_evadi(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o documenti; v_id uuid;
begin
  perform _uid();
  select * into o from documenti where id = p_id;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(o.magazzino_id, 'evadi_ordine');
  if o.tipo <> 'ordine_fornitore' then raise exception 'dato_non_valido'; end if;
  v_id := _genera(p_id, 'carico');
  perform _conferma(v_id);
  return _documento_completo(v_id);
end $$;

-- ritorna: lo stesso oggetto di api_documento_leggi con documento.stato_spedizione aggiornato.
-- p_stato: da_preparare|preparato|spedito|consegnato, solo in avanti (salti ammessi). Solo ordine_cliente e scarico
-- confermati/evasi. Richiede 'spedizione'. Crea una notifica tipo 'spedizione' per la classe.
create function api_spedizione_stato(p_documento uuid, p_stato text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documenti; v_ordine text[] := array['da_preparare', 'preparato', 'spedito', 'consegnato']; v_new int; v_old int;
begin
  perform _uid();
  select * into d from documenti where id = p_documento for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi(d.magazzino_id, 'spedizione');
  v_new := array_position(v_ordine, p_stato);
  if v_new is null then raise exception 'dato_non_valido'; end if;
  if d.tipo not in ('ordine_cliente', 'scarico') or d.stato not in ('confermato', 'evaso') then raise exception 'stato_non_valido'; end if;
  v_old := coalesce(array_position(v_ordine, d.stato_spedizione), 1);
  if v_new <= v_old then raise exception 'stato_non_valido'; end if;

  update documenti set stato_spedizione = p_stato where id = p_documento;
  insert into notifiche (magazzino_id, tipo, messaggio)
  values (d.magazzino_id, 'spedizione',
          format('Spedizione %s n. %s/%s: %s', replace(d.tipo, '_', ' '), d.numero, d.anno, replace(p_stato, '_', ' ')));
  perform _registra(d.magazzino_id, 'spedizione_stato', 'documento', p_documento, jsonb_build_object('stato', p_stato));
  return _documento_completo(p_documento);
end $$;

-- ritorna: [{articolo_id, matricola, descrizione, um, lotto_id, lotto_codice, scadenza, ubicazione_id, ubicazione_codice, qta}]
-- righe di giacenza non nulle, ordinate per articolo; p_articolo nullo = tutti gli articoli del magazzino.
create function api_giacenze(p_magazzino uuid, p_articolo uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _membro(p_magazzino);
  select coalesce(jsonb_agg(jsonb_build_object(
           'articolo_id', g.articolo_id, 'matricola', a.matricola, 'descrizione', a.descrizione, 'um', a.um,
           'lotto_id', g.lotto_id, 'lotto_codice', l.codice, 'scadenza', l.scadenza,
           'ubicazione_id', g.ubicazione_id, 'ubicazione_codice', u.codice, 'qta', g.qta)
         order by a.descrizione, l.scadenza nulls last, u.codice nulls last), '[]'::jsonb)
  into v
  from giacenze g
  join articoli a on a.id = g.articolo_id
  left join lotti l on l.id = g.lotto_id
  left join ubicazioni u on u.id = g.ubicazione_id
  where g.magazzino_id = p_magazzino and g.qta <> 0 and (p_articolo is null or g.articolo_id = p_articolo);
  return v;
end $$;

-- ritorna: {ok: true, articolo_id, lotto_id, da, a, qta}. Due movimenti (trasferimento_in, trasferimento_out) nella stessa
-- transazione; p_da e p_a possono essere nulli = "senza ubicazione" ma devono differire. Richiede 'trasferimento'.
create function api_trasferimento(p_magazzino uuid, p_articolo uuid, p_lotto uuid, p_da uuid, p_a uuid, p_qta numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_costo bigint;
begin
  perform _uid();
  perform _richiedi(p_magazzino, 'trasferimento');
  if p_qta is null or p_qta <= 0 or p_da is not distinct from p_a then raise exception 'dato_non_valido'; end if;
  if not exists (select 1 from articoli where id = p_articolo and magazzino_id = p_magazzino) then raise exception 'non_trovato'; end if;
  if p_lotto is not null and not exists (select 1 from lotti where id = p_lotto and articolo_id = p_articolo) then raise exception 'dato_non_valido'; end if;
  if (p_da is not null and not exists (select 1 from ubicazioni where id = p_da and magazzino_id = p_magazzino))
     or (p_a is not null and not exists (select 1 from ubicazioni where id = p_a and magazzino_id = p_magazzino)) then
    raise exception 'dato_non_valido';
  end if;
  v_costo := _costo_medio(p_articolo);
  -- prima entra, poi esce: il totale non scende mai sotto il punto di riordino a meta' operazione
  perform _movimenta(p_magazzino, p_articolo, p_lotto, p_a, p_qta, v_costo, 'trasferimento_in', null, true);
  perform _movimenta(p_magazzino, p_articolo, p_lotto, p_da, -p_qta, v_costo, 'trasferimento_out', null, true);
  perform _registra(p_magazzino, 'trasferimento', 'articolo', p_articolo,
                    jsonb_build_object('qta', p_qta, 'da', p_da, 'a', p_a, 'lotto_id', p_lotto));
  return jsonb_build_object('ok', true, 'articolo_id', p_articolo, 'lotto_id', p_lotto, 'da', p_da, 'a', p_a, 'qta', p_qta);
end $$;
