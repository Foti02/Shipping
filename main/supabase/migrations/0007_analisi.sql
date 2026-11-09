-- 0007_analisi.sql
-- Inventario (con "fisico" fittizio), riordino/EOQ, KPI/ABC, valorizzazione CMP/FIFO/LIFO.
-- Soldi in centesimi. Le giacenze si cambiano SOLO con _movimenta (0004): qui la usa solo la rettifica.
-- Letture: basta essere membri. Scritture (inventario): permesso 'inventario' + _registra.

-- ---------- interna: valore di un articolo rifatto dal registro movimenti_stock ----------
-- Tre metodi sullo stesso registro in ordine cronologico (id). I trasferimenti si ignorano: in totale non cambiano la quantita'.
-- shortcut: se un'uscita supera gli strati disponibili (giacenza negativa) l'eccedenza non ha valore in FIFO/LIFO; ok per le esercitazioni.
create function _valorizza_articolo(p_articolo uuid, p_fino timestamptz default null)
returns table (qta numeric, cmp numeric, fifo numeric, lifo numeric)
language plpgsql stable set search_path = public as $$
declare
  m record; r numeric; take numeric; i int;
  q numeric := 0; v numeric := 0; costo_medio numeric;
  fq numeric[] := '{}'; fc numeric[] := '{}'; fh int := 1;      -- FIFO: strati, testa = piu' vecchio
  lq numeric[] := '{}'; lc numeric[] := '{}'; lp int := 0;      -- LIFO: pila, cima = piu' recente
begin
  for m in select s.qta as q, s.costo_unit_cent as c from movimenti_stock s
           where s.articolo_id = p_articolo
             and s.causale not in ('trasferimento_out', 'trasferimento_in')
             and (p_fino is null or s.created_at <= p_fino)
           order by s.id loop
    if m.q > 0 then
      v := v + m.q * m.c; q := q + m.q;
      fq := fq || m.q; fc := fc || m.c::numeric;
      lp := lp + 1; lq[lp] := m.q; lc[lp] := m.c;
    elsif m.q < 0 then
      costo_medio := case when q > 0 then v / q else m.c end;
      v := v + m.q * costo_medio; q := q + m.q;
      if q = 0 then v := 0; end if;
      r := -m.q;
      while r > 0 and fh <= coalesce(array_length(fq, 1), 0) loop
        take := least(r, fq[fh]); fq[fh] := fq[fh] - take; r := r - take;
        if fq[fh] = 0 then fh := fh + 1; end if;
      end loop;
      r := -m.q;
      while r > 0 and lp > 0 loop
        take := least(r, lq[lp]); lq[lp] := lq[lp] - take; r := r - take;
        if lq[lp] = 0 then lp := lp - 1; end if;
      end loop;
    end if;
  end loop;
  qta := q; cmp := v; fifo := 0; lifo := 0;
  for i in fh .. coalesce(array_length(fq, 1), 0) loop fifo := fifo + fq[i] * fc[i]; end loop;
  for i in 1 .. lp loop lifo := lifo + lq[i] * lc[i]; end loop;
  return next;
end $$;

-- ---------- inventario ----------

-- ritorna: {id, nome, stato, righe}   (righe = numero di righe create da giacenze)
create function api_inventario_apri(p_magazzino uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int;
begin
  perform _membro(p_magazzino);
  perform _richiedi(p_magazzino, 'inventario');
  if nullif(trim(coalesce(p_nome, '')), '') is null then raise exception 'dato_non_valido'; end if;
  insert into inventari (magazzino_id, nome, creato_da) values (p_magazzino, trim(p_nome), _uid()) returning id into v_id;
  insert into inventario_righe (inventario_id, articolo_id, lotto_id, ubicazione_id, qta_sistema)
  select v_id, g.articolo_id, g.lotto_id, g.ubicazione_id, g.qta from giacenze g where g.magazzino_id = p_magazzino;
  get diagnostics n = row_count;
  perform _registra(p_magazzino, 'inventario_apri', 'inventario', v_id, jsonb_build_object('nome', trim(p_nome), 'righe', n));
  return jsonb_build_object('id', v_id, 'nome', trim(p_nome), 'stato', 'aperto', 'righe', n);
end $$;

-- ritorna: {riga, articolo_id, matricola, qta_sistema, qta_contata, differenza, rivelata}
--   rivelata = true se la quantita' viene dal fisico fittizio dello scenario (p_qta nullo), false se data da chi conta
create function api_inventario_conta(p_riga uuid, p_qta numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_qta numeric; v_riv boolean := false; v_matr text;
begin
  select ir.*, i.magazzino_id as mag, i.stato as inv_stato into r
  from inventario_righe ir join inventari i on i.id = ir.inventario_id where ir.id = p_riga for update of ir;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(r.mag);
  perform _richiedi(r.mag, 'inventario');
  if r.inv_stato <> 'aperto' or r.rettificata then raise exception 'stato_non_valido'; end if;
  if p_qta is null then
    select f.qta_reale into v_qta from scenario_fisico f join scenari s on s.id = f.scenario_id
    where s.magazzino_id = r.mag and f.articolo_id = r.articolo_id and f.ubicazione_id is not distinct from r.ubicazione_id
    order by s.created_at desc limit 1;
    if not found then raise exception 'dato_non_valido'; end if;
    v_riv := true;
  else
    v_qta := p_qta;
  end if;
  if v_qta < 0 then raise exception 'dato_non_valido'; end if;
  update inventario_righe set qta_contata = v_qta, user_id = _uid() where id = p_riga;
  select matricola into v_matr from articoli where id = r.articolo_id;
  perform _registra(r.mag, 'inventario_conta', 'inventario', r.inventario_id,
                    jsonb_build_object('riga', p_riga, 'matricola', v_matr, 'qta_contata', v_qta));
  return jsonb_build_object('riga', p_riga, 'articolo_id', r.articolo_id, 'matricola', v_matr,
                            'qta_sistema', r.qta_sistema, 'qta_contata', v_qta,
                            'differenza', v_qta - r.qta_sistema, 'rivelata', v_riv);
end $$;

-- ritorna: {riga, differenza, movimento}   (movimento = false se la differenza e' zero: nessuna rettifica scritta)
-- p_causale: conteggio | danneggiato | smarrito | errore_registrazione. differenza = qta_contata - qta_sistema.
create function api_inventario_rettifica(p_riga uuid, p_causale text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_diff numeric; v_mov boolean := false; v_matr text;
begin
  select ir.*, i.magazzino_id as mag, i.stato as inv_stato into r
  from inventario_righe ir join inventari i on i.id = ir.inventario_id where ir.id = p_riga for update of ir;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(r.mag);
  perform _richiedi(r.mag, 'inventario');
  if p_causale is null or p_causale not in ('conteggio', 'danneggiato', 'smarrito', 'errore_registrazione') then
    raise exception 'dato_non_valido';
  end if;
  if r.inv_stato <> 'aperto' or r.rettificata or r.qta_contata is null then raise exception 'stato_non_valido'; end if;
  v_diff := r.qta_contata - r.qta_sistema;
  select matricola into v_matr from articoli where id = r.articolo_id;
  if v_diff <> 0 then
    -- esatto = true: tocca proprio la riga (lotto, ubicazione) contata, senza FEFO/FIFO
    perform _movimenta(r.mag, r.articolo_id, r.lotto_id, r.ubicazione_id, v_diff, _costo_medio(r.articolo_id), 'rettifica', null, true);
    v_mov := true;
  end if;
  update inventario_righe set causale = p_causale, rettificata = true, user_id = _uid() where id = p_riga;
  perform _valuta_inventario(r.mag, r.articolo_id);
  perform _registra(r.mag, 'inventario_rettifica', 'inventario', r.inventario_id,
                    jsonb_build_object('riga', p_riga, 'matricola', v_matr, 'differenza', v_diff, 'causale', p_causale));
  return jsonb_build_object('riga', p_riga, 'differenza', v_diff, 'movimento', v_mov);
end $$;

-- ritorna: {id, stato, righe, rettificate, non_rettificate:[{riga, articolo_id, matricola, differenza}]}
--   non_rettificate = righe contate con differenza diversa da zero e senza rettifica (restano segnalate, il sistema non cambia)
create function api_inventario_chiudi(p_inventario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i inventari; v_non jsonb; v_righe int; v_rett int;
begin
  select * into i from inventari where id = p_inventario for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _membro(i.magazzino_id);
  perform _richiedi(i.magazzino_id, 'inventario');
  if i.stato <> 'aperto' then raise exception 'stato_non_valido'; end if;
  if exists (select 1 from inventario_righe where inventario_id = p_inventario and qta_contata is null) then
    raise exception 'stato_non_valido';
  end if;
  select count(*), count(*) filter (where rettificata) into v_righe, v_rett from inventario_righe where inventario_id = p_inventario;
  select coalesce(jsonb_agg(jsonb_build_object('riga', r.id, 'articolo_id', r.articolo_id, 'matricola', a.matricola,
                                               'differenza', r.qta_contata - r.qta_sistema) order by a.matricola), '[]')
    into v_non
  from inventario_righe r join articoli a on a.id = r.articolo_id
  where r.inventario_id = p_inventario and not r.rettificata and r.qta_contata <> r.qta_sistema;
  update inventari set stato = 'chiuso', chiuso_il = now() where id = p_inventario;
  perform _registra(i.magazzino_id, 'inventario_chiudi', 'inventario', p_inventario,
                    jsonb_build_object('righe', v_righe, 'rettificate', v_rett, 'non_rettificate', jsonb_array_length(v_non)));
  return jsonb_build_object('id', p_inventario, 'stato', 'chiuso', 'righe', v_righe, 'rettificate', v_rett, 'non_rettificate', v_non);
end $$;

-- ritorna: [{id, nome, stato, created_at, chiuso_il, n_righe, n_contate, n_rettificate,
--            righe:[{id, articolo_id, matricola, descrizione, lotto_id, lotto, ubicazione_id, ubicazione,
--                    qta_sistema, qta_contata, differenza, causale, rettificata}]}]   (piu' recente prima; differenza nulla se non contata)
create function api_inventari_elenco(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'nome', i.nome, 'stato', i.stato, 'created_at', i.created_at, 'chiuso_il', i.chiuso_il,
             'n_righe', x.n, 'n_contate', x.contate, 'n_rettificate', x.rett, 'righe', x.righe) order by i.created_at desc, i.id)
    from inventari i
    cross join lateral (
      select count(*) as n, count(r.qta_contata) as contate, count(*) filter (where r.rettificata) as rett,
             coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'articolo_id', r.articolo_id, 'matricola', a.matricola, 'descrizione', a.descrizione,
               'lotto_id', r.lotto_id, 'lotto', l.codice, 'ubicazione_id', r.ubicazione_id, 'ubicazione', u.codice,
               'qta_sistema', r.qta_sistema, 'qta_contata', r.qta_contata,
               'differenza', r.qta_contata - r.qta_sistema, 'causale', r.causale, 'rettificata', r.rettificata)
               order by a.matricola, u.codice nulls first, l.codice nulls first), '[]'::jsonb) as righe
      from inventario_righe r
      join articoli a on a.id = r.articolo_id
      left join lotti l on l.id = r.lotto_id
      left join ubicazioni u on u.id = r.ubicazione_id
      where r.inventario_id = i.id) x
    where i.magazzino_id = p_magazzino), '[]'::jsonb);
end $$;

-- ---------- riordino ----------

-- ritorna: [{articolo_id, matricola, descrizione, um, giacenza, ordinato, domanda_giornaliera, lead_time_giorni,
--            scorta_sicurezza, punto_riordino, punto_riordino_consigliato, eoq, qta_suggerita, urgenza, fornitore_abituale_id}]
--   articoli attivi, ordinati per urgenza ('alta' poi 'media' poi 'nessuna') e matricola.
--   domanda_giornaliera = articoli.domanda_giornaliera se presente, altrimenti scarichi degli ultimi 30 giorni / 30.
--   punto_riordino_consigliato = domanda x lead_time + scorta_sicurezza. ordinato = righe di ordini fornitore confermati.
--   eoq = ceil(sqrt(2 x domanda annua x costo_ordine / (prezzo_acquisto x costo_mantenimento_perc/100))), 0 se mancano i dati.
--   urgenza: soglia = max(punto_riordino, consigliato); se giacenza+ordinato <= soglia: 'alta' se giacenza <= scorta_sicurezza,
--   altrimenti 'media'; se sopra soglia 'nessuna'. qta_suggerita = max(eoq, soglia - (giacenza+ordinato)) (almeno 1), 0 se 'nessuna'.
create function api_riordino_suggerimenti(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return coalesce((
    with b as (
      select a.id, a.matricola, a.descrizione, a.um, a.scorta_sicurezza, a.punto_riordino, a.lead_time_giorni,
             a.prezzo_acquisto_cent, a.costo_ordine_cent, a.costo_mantenimento_perc, a.fornitore_abituale_id,
             coalesce((select sum(g.qta) from giacenze g where g.articolo_id = a.id), 0) as giacenza,
             coalesce((select sum(rd.qta) from righe_documento rd join documenti d on d.id = rd.documento_id
                       where rd.articolo_id = a.id and d.tipo = 'ordine_fornitore' and d.stato = 'confermato'), 0) as ordinato,
             coalesce(a.domanda_giornaliera,
                      coalesce((select -sum(m.qta) from movimenti_stock m
                                where m.articolo_id = a.id and m.causale = 'scarico'
                                  and m.created_at >= now() - interval '30 days'), 0) / 30.0) as domanda
      from articoli a where a.magazzino_id = p_magazzino and a.attivo
    ), c as (
      select b.*,
             round(b.domanda * b.lead_time_giorni + b.scorta_sicurezza, 3) as consigliato,
             case when b.domanda > 0 and b.costo_ordine_cent > 0 and b.prezzo_acquisto_cent > 0 and b.costo_mantenimento_perc > 0
                  then ceil(sqrt(2 * b.domanda * 365 * b.costo_ordine_cent
                                 / (b.prezzo_acquisto_cent * b.costo_mantenimento_perc / 100)))
                  else 0 end as eoq
      from b
    ), d as (
      select c.*, greatest(c.punto_riordino, c.consigliato) as soglia, c.giacenza + c.ordinato as posizione from c
    ), e as (
      select d.*,
             case when d.soglia > 0 and d.posizione <= d.soglia
                  then (case when d.giacenza <= d.scorta_sicurezza then 'alta' else 'media' end)
                  else 'nessuna' end as urgenza
      from d
    )
    select jsonb_agg(jsonb_build_object(
             'articolo_id', e.id, 'matricola', e.matricola, 'descrizione', e.descrizione, 'um', e.um,
             'giacenza', e.giacenza, 'ordinato', e.ordinato, 'domanda_giornaliera', round(e.domanda, 3),
             'lead_time_giorni', e.lead_time_giorni, 'scorta_sicurezza', e.scorta_sicurezza,
             'punto_riordino', e.punto_riordino, 'punto_riordino_consigliato', e.consigliato,
             'eoq', e.eoq,
             'qta_suggerita', case when e.urgenza = 'nessuna' then 0 else greatest(e.eoq, ceil(e.soglia - e.posizione), 1) end,
             'urgenza', e.urgenza, 'fornitore_abituale_id', e.fornitore_abituale_id)
           order by case e.urgenza when 'alta' then 0 when 'media' then 1 else 2 end, e.matricola)
    from e), '[]'::jsonb);
end $$;

-- ---------- KPI ----------

-- ritorna: {giorni, valore_giacenza, costo_venduto, rotazione, copertura_giorni, sottoscorta,
--           abc:[{articolo, articolo_id, descrizione, classe, valore, perc_cum}],
--           fermi:[{articolo_id, matricola, descrizione, giacenza, valore, ultimo_scarico}]}
--   Soldi in centesimi. valore_giacenza = costo medio ponderato dal registro movimenti. costo_venduto = scarichi del periodo x costo.
--   rotazione = costo_venduto / giacenza media (media dei valori a inizio e fine periodo), nulla se la giacenza media e' zero.
--   copertura_giorni = valore_giacenza / (costo_venduto / giorni), nulla se non ci sono scarichi. sottoscorta = articoli attivi
--   con punto_riordino > 0 e giacenza <= punto_riordino. abc: valore = consumo del periodo (costo), classe A finche' il
--   cumulato prima dell'articolo e' < 80%, B < 95%, C il resto; perc_cum include l'articolo; articolo = matricola.
--   fermi: articoli attivi con giacenza > 0 e nessuno scarico nel periodo (ultimo_scarico nullo se non ce ne sono mai stati).
create function api_kpi(p_magazzino uuid, p_giorni int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_giorni int := coalesce(p_giorni, 30); v_inizio timestamptz;
  v_fine_val numeric; v_ini_val numeric; v_cogs numeric; v_media numeric;
  v_sotto int; v_abc jsonb; v_fermi jsonb;
begin
  perform _membro(p_magazzino);
  if v_giorni < 1 or v_giorni > 3650 then raise exception 'dato_non_valido'; end if;
  v_inizio := now() - make_interval(days => v_giorni);

  select coalesce(sum(v.cmp), 0) into v_fine_val
  from articoli a cross join lateral _valorizza_articolo(a.id, null) v where a.magazzino_id = p_magazzino;
  select coalesce(sum(v.cmp), 0) into v_ini_val
  from articoli a cross join lateral _valorizza_articolo(a.id, v_inizio) v where a.magazzino_id = p_magazzino;
  select coalesce(sum(-m.qta * m.costo_unit_cent), 0) into v_cogs from movimenti_stock m
  where m.magazzino_id = p_magazzino and m.causale = 'scarico' and m.created_at >= v_inizio;
  v_media := (v_ini_val + v_fine_val) / 2;

  select count(*) into v_sotto from articoli a
  where a.magazzino_id = p_magazzino and a.attivo and a.punto_riordino > 0
    and coalesce((select sum(g.qta) from giacenze g where g.articolo_id = a.id), 0) <= a.punto_riordino;

  with c as (
    select a.id, a.matricola, a.descrizione, sum(-m.qta * m.costo_unit_cent) as v
    from movimenti_stock m join articoli a on a.id = m.articolo_id
    where m.magazzino_id = p_magazzino and m.causale = 'scarico' and m.created_at >= v_inizio
    group by a.id, a.matricola, a.descrizione having sum(-m.qta * m.costo_unit_cent) > 0
  ), t as (
    select c.*, sum(c.v) over () as tot, sum(c.v) over (order by c.v desc, c.matricola) as cum from c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'articolo', t.matricola, 'articolo_id', t.id, 'descrizione', t.descrizione,
           'classe', case when (t.cum - t.v) * 100 < 80 * t.tot then 'A' when (t.cum - t.v) * 100 < 95 * t.tot then 'B' else 'C' end,
           'valore', round(t.v), 'perc_cum', round(t.cum * 100 / t.tot, 2)) order by t.v desc, t.matricola), '[]'::jsonb)
    into v_abc from t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'articolo_id', a.id, 'matricola', a.matricola, 'descrizione', a.descrizione, 'giacenza', g.q,
           'valore', round(v.cmp),
           'ultimo_scarico', (select max(m.created_at) from movimenti_stock m where m.articolo_id = a.id and m.causale = 'scarico'))
           order by a.matricola), '[]'::jsonb)
    into v_fermi
  from articoli a
  cross join lateral (select coalesce(sum(x.qta), 0) as q from giacenze x where x.articolo_id = a.id) g
  cross join lateral _valorizza_articolo(a.id, null) v
  where a.magazzino_id = p_magazzino and a.attivo and g.q > 0
    and not exists (select 1 from movimenti_stock m where m.articolo_id = a.id and m.causale = 'scarico' and m.created_at >= v_inizio);

  return jsonb_build_object(
    'giorni', v_giorni,
    'valore_giacenza', round(v_fine_val),
    'costo_venduto', round(v_cogs),
    'rotazione', case when v_media > 0 then round(v_cogs / v_media, 2) end,
    'copertura_giorni', case when v_cogs > 0 then round(v_fine_val / (v_cogs / v_giorni), 1) end,
    'sottoscorta', v_sotto, 'abc', v_abc, 'fermi', v_fermi);
end $$;

-- ---------- valorizzazione ----------

-- ritorna: {righe:[{articolo_id, matricola, descrizione, um, qta, valore_cmp, valore_fifo, valore_lifo,
--                   diff_fifo_cmp, diff_lifo_cmp, diff_fifo_lifo}],
--           totali:{valore_cmp, valore_fifo, valore_lifo, diff_fifo_cmp, diff_lifo_cmp, diff_fifo_lifo}}
--   Soldi in centesimi, rifatti dal registro movimenti_stock (solo articoli con movimenti, ordinati per matricola).
--   qta = somma del registro. diff_x_y = valore_x - valore_y. Trasferimenti ignorati.
create function api_valorizzazione(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return (
    with r as (
      select a.id, a.matricola, a.descrizione, a.um, v.qta, round(v.cmp) as c, round(v.fifo) as f, round(v.lifo) as l
      from articoli a cross join lateral _valorizza_articolo(a.id, null) v
      where a.magazzino_id = p_magazzino and exists (select 1 from movimenti_stock m where m.articolo_id = a.id)
    )
    select jsonb_build_object(
      'righe', coalesce((select jsonb_agg(jsonb_build_object(
                 'articolo_id', r.id, 'matricola', r.matricola, 'descrizione', r.descrizione, 'um', r.um, 'qta', r.qta,
                 'valore_cmp', r.c, 'valore_fifo', r.f, 'valore_lifo', r.l,
                 'diff_fifo_cmp', r.f - r.c, 'diff_lifo_cmp', r.l - r.c, 'diff_fifo_lifo', r.f - r.l)
                 order by r.matricola) from r), '[]'::jsonb),
      'totali', (select jsonb_build_object(
                 'valore_cmp', coalesce(sum(r.c), 0), 'valore_fifo', coalesce(sum(r.f), 0), 'valore_lifo', coalesce(sum(r.l), 0),
                 'diff_fifo_cmp', coalesce(sum(r.f - r.c), 0), 'diff_lifo_cmp', coalesce(sum(r.l - r.c), 0),
                 'diff_fifo_lifo', coalesce(sum(r.f - r.l), 0)) from r)));
end $$;
