-- 0006_scenari.sql
-- Motore degli scenari: generazione deterministica dei compiti per studente, controllo automatico degli errori,
-- sottoscorta condivisa con riordino dinamico, inventario con "fisico" fittizio.
-- Ridefinisce (create or replace, stessa firma) i tre stub di 0004: _riordino_dinamico, _valuta_compiti, _sblocca_compiti.
-- Solo plpgsql, niente estensioni, niente random(): tutto deriva dal seed con hashtext.

-- ---------- permessi ----------
-- Il progetto assegna evadi_ordine anche al ruolo acquisti (compiti "evadi ordine" dell'acquirente).
insert into permessi_ruolo (ruolo_aziendale, azione) values ('acquisti', 'evadi_ordine') on conflict do nothing;

-- ---------- generatore deterministico ----------
-- intero pseudo-casuale in [0, p_mod) stabile per (seed, chiave)
create function _scn_h(p_seed int, p_chiave text, p_mod int) returns int
language plpgsql immutable as $$
begin
  return ((hashtext(p_seed::text || ':' || p_chiave)::bigint & 2147483647) % greatest(p_mod, 1))::int;
end $$;

-- "descrizione|categoria|um|prezzo_cent"
create function _scn_catalogo() returns text[] language plpgsql immutable as $$
begin
  return array[
    'Notebook 15" Core i5 16GB|Informatica|PZ.|62000', 'Notebook 14" Ryzen 5 8GB|Informatica|PZ.|54900',
    'Monitor 24" Full HD|Informatica|PZ.|13900', 'Monitor 27" QHD|Informatica|PZ.|22900',
    'Tastiera USB italiana|Periferiche|PZ.|1490', 'Mouse ottico USB|Periferiche|PZ.|690',
    'Mouse wireless ergonomico|Periferiche|PZ.|2490', 'Webcam Full HD|Periferiche|PZ.|3990',
    'Cuffie con microfono USB|Periferiche|PZ.|2990', 'Docking station USB-C|Informatica|PZ.|8900',
    'Hard disk esterno 1TB|Archiviazione|PZ.|5490', 'SSD interno 500GB|Archiviazione|PZ.|4690',
    'SSD interno 1TB|Archiviazione|PZ.|7990', 'Chiavetta USB 64GB|Archiviazione|PZ.|790',
    'Scheda SD 128GB|Archiviazione|PZ.|1290', 'Router Wi-Fi 6|Reti|PZ.|11900',
    'Switch 8 porte Gigabit|Reti|PZ.|2990', 'Switch 24 porte PoE|Reti|PZ.|27900',
    'Access point Wi-Fi|Reti|PZ.|8490', 'Cavo di rete Cat6 2m|Reti|PZ.|390',
    'Cavo HDMI 2m|Periferiche|PZ.|590', 'Alimentatore universale 65W|Informatica|PZ.|3490',
    'Gruppo di continuita 800VA|Informatica|PZ.|9900', 'Stampante laser monocromatica|Stampa|PZ.|14900',
    'Toner nero compatibile|Stampa|PZ.|3290', 'Cartuccia inchiostro colore|Stampa|PZ.|2190',
    'Tablet 10" 64GB|Informatica|PZ.|21900', 'Smartphone aziendale 128GB|Informatica|PZ.|29900',
    'Lettore barcode USB|Lettori|PZ.|4900', 'Lettore barcode wireless|Lettori|PZ.|8900',
    'Stampante etichette termica|Stampa|PZ.|17900', 'Palmare con lettore RFID|Lettori|PZ.|45900',
    'Etichette termiche 100x150 rotolo|Imballaggio|RT|890', 'Nastro adesivo da imballo|Imballaggio|RT|190',
    'Scatola di cartone 40x30x30|Imballaggio|PZ.|120', 'Pallet EPAL 120x80|Imballaggio|PZ.|1450',
    'Film estensibile 500mm|Imballaggio|RT|790', 'Reggetta in PP rotolo|Imballaggio|RT|1890',
    'Bancale in plastica|Imballaggio|PZ.|2790', 'Carrello a mano pieghevole|Attrezzature|PZ.|6900',
    'Transpallet manuale 2500kg|Attrezzature|PZ.|32900', 'Cassetta plastica impilabile|Attrezzature|PZ.|690',
    'Scaffale metallico 4 ripiani|Attrezzature|PZ.|8900', 'Casco di sicurezza|Sicurezza|PZ.|1490',
    'Guanti antitaglio|Sicurezza|PZ.|590', 'Giubbino alta visibilita|Sicurezza|PZ.|790',
    'Taglierino di sicurezza|Attrezzature|PZ.|390', 'Pistola prezzatrice|Attrezzature|PZ.|2490',
    'Bilancia da banco 30kg|Attrezzature|PZ.|7900', 'Nastro segnaletico giallo-nero|Sicurezza|RT|490'];
end $$;

-- "ragione sociale|comune"
create function _scn_clienti() returns text[] language plpgsql immutable as $$
begin
  return array['Rossi Impianti Srl|Brescia', 'Bianchi Logistica Spa|Verona', 'Ferrari Uffici Srl|Modena', 'Esposito Forniture Snc|Napoli',
    'Romano Ristorazione Srl|Bari', 'Colombo Studio Associato|Milano', 'Ricci Trasporti Srl|Parma', 'Marino Costruzioni Spa|Torino',
    'Greco Farmacie Srl|Palermo', 'Bruno Elettronica Snc|Bergamo', 'Gallo Arredi Srl|Treviso', 'Conti Autofficine Srl|Bologna',
    'De Luca Hotel Spa|Firenze', 'Mancini Cartolibreria Snc|Perugia'];
end $$;

-- "ragione sociale|comune"
create function _scn_fornitori() returns text[] language plpgsql immutable as $$
begin
  return array['TechSupply Italia Spa|Milano', 'Logistica Nord Srl|Padova', 'Distribuzione Informatica Srl|Roma', 'ImballItalia Spa|Cremona',
    'Reti e Sistemi Srl|Torino', 'Ufficio Facile Srl|Bologna', 'Sicurezza Lavoro Snc|Vicenza', 'PrintService Srl|Genova'];
end $$;

-- inserisce un compito; ritorna l'id
create function _scn_compito(p_scenario uuid, p_magazzino uuid, p_user uuid, p_ruolo text, p_tipo text, p_titolo text,
                             p_istruzioni text, p_articolo uuid, p_anagrafica uuid, p_qta numeric, p_param jsonb,
                             p_ordine int, p_stato text default 'da_fare', p_motivo text default null,
                             p_origine text default 'generato') returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  insert into compiti (scenario_id, magazzino_id, assegnato_a, ruolo_aziendale, tipo, titolo, istruzioni, articolo_id,
                       anagrafica_id, qta, parametri, origine, stato, motivo, ordine)
  values (p_scenario, p_magazzino, p_user, p_ruolo, p_tipo, p_titolo, p_istruzioni, p_articolo,
          p_anagrafica, p_qta, coalesce(p_param, '{}'), p_origine, p_stato, p_motivo, p_ordine)
  returning id into v;
  return v;
end $$;

-- documento gia' confermato preesistente nello scenario (DDT, carico o ordine fornitore da fatturare/evadere).
-- Scrive direttamente righe, totali e (per carico/scarico) movimento e giacenza, senza passare da 0004.
create function _scn_doc(p_magazzino uuid, p_tipo text, p_anagrafica uuid, p_articolo uuid, p_qta numeric, p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a articoli; v_anno int := extract(year from current_date)::int; v_num int; v_id uuid;
        v_prezzo bigint; v_netto bigint; v_iva bigint; v_segno int;
begin
  select * into a from articoli where id = p_articolo;
  v_prezzo := case when p_tipo in ('scarico', 'ordine_cliente', 'preventivo', 'fattura_vendita')
                   then round(a.prezzo_acquisto_cent * (100 + a.ricarico_perc) / 100.0) else a.prezzo_acquisto_cent end;
  v_netto := round(p_qta * v_prezzo);
  v_iva := round(v_netto * 22 / 100.0);
  insert into contatori (magazzino_id, tipo, anno, ultimo) values (p_magazzino, p_tipo, v_anno, 1)
  on conflict (magazzino_id, tipo, anno) do update set ultimo = contatori.ultimo + 1
  returning ultimo into v_num;
  insert into documenti (magazzino_id, tipo, anno, numero, anagrafica_id, stato, imponibile_cent, imposta_cent, totale_cent, creato_da)
  values (p_magazzino, p_tipo, v_anno, v_num, p_anagrafica, 'confermato', v_netto, v_iva, v_netto + v_iva, p_user)
  returning id into v_id;
  insert into righe_documento (documento_id, posizione, articolo_id, descrizione, qta, prezzo_cent, iva_perc, ubicazione_id, totale_cent)
  values (v_id, 1, p_articolo, a.descrizione, p_qta, v_prezzo, 22, a.ubicazione_id, v_netto);
  if p_tipo in ('carico', 'scarico') then
    v_segno := case when p_tipo = 'carico' then 1 else -1 end;
    update giacenze set qta = qta + v_segno * p_qta where articolo_id = p_articolo;
    insert into movimenti_stock (magazzino_id, articolo_id, ubicazione_id, qta, costo_unit_cent, causale, documento_id, user_id)
    values (p_magazzino, p_articolo, a.ubicazione_id, v_segno * p_qta, a.prezzo_acquisto_cent, p_tipo, v_id, p_user);
  end if;
  return v_id;
end $$;

-- ---------- generazione ----------
-- ritorna: {scenario_id, nome, stato:'bozza', seed, n_articoli, n_studenti, n_compiti}
-- p_config = {seed, n_articoli, sottoscorta_forzata, con_inventario}. n_articoli effettivo = max(config, 2 x studenti
-- + merci della sottoscorta + merci dell'inventario), cosi' ogni studente ha merci tutte sue e i compiti non si ripetono.
create function api_scenario_genera(p_magazzino uuid, p_nome text, p_config jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := _uid();
  cfg jsonb := coalesce(p_config, '{}'::jsonb);
  sd int := coalesce((cfg ->> 'seed')::int, 1);
  sotto boolean := coalesce((cfg ->> 'sottoscorta_forzata')::boolean, false);
  inv boolean := coalesce((cfg ->> 'con_inventario')::boolean, false);
  sid uuid; pref int; v uuid; tipo_m text;
  stud uuid[]; rol text[]; pool uuid[] := '{}';
  ns int; np int; nm int := 0; ni int := 0; na int;
  cat text[]; nl int; it text; nC int; nF int;
  cli uuid[] := '{}'; clit text[] := '{}'; frn uuid[] := '{}'; frnt text[] := '{}'; frl int[] := '{}';
  ubi uuid[] := '{}'; ubc text[] := '{}';
  art uuid[] := '{}'; atx text[] := '{}'; ui int[] := '{}';
  g0 numeric[] := '{}'; ss numeric[] := '{}'; rr numeric[] := '{}';
  s1 numeric[] := '{}'; s2 numeric[] := '{}'; s3 numeric[] := '{}'; rl numeric[] := '{}';
  i int; j int; k int; m int; rem numeric; dlt numeric; fi int; vi text;
  a1 uuid; a2 uuid; c1 int; c2 int; f1 int; f2 int; q1 numeric; q2 numeric; r text; o int; ik int := 0; uj int; base int;
  asg uuid; qj numeric; n_comp int;
  p_ubi_da uuid; p_ubi_a uuid; doc uuid;
begin
  perform _membro(p_magazzino);
  if not _sono_docente(p_magazzino) then raise exception 'permesso_negato'; end if;
  select tipo into tipo_m from magazzini where id = p_magazzino;
  if tipo_m <> 'classe' or coalesce(trim(p_nome), '') = '' or char_length(trim(p_nome)) > 500 then raise exception 'dato_non_valido'; end if;

  -- studenti in ordine di username: l'assegnazione dipende solo da seed e classe, non dagli uuid
  select array_agg(m.user_id order by pr.username), array_agg(m.ruolo_aziendale order by pr.username)
    into stud, rol
    from membri m join profili pr on pr.user_id = m.user_id
   where m.magazzino_id = p_magazzino and m.ruolo = 'studente';
  ns := coalesce(array_length(stud, 1), 0);
  if ns = 0 then raise exception 'dato_non_valido'; end if;
  for i in 1..ns loop
    if rol[i] is null or rol[i] = 'magazziniere' then pool := pool || stud[i]; end if;
  end loop;
  np := coalesce(array_length(pool, 1), 0);
  if sotto then nm := least(1 + ns / 6, 4); end if;
  if inv then ni := greatest(np, 1); end if;
  na := greatest(coalesce((cfg ->> 'n_articoli')::int, 12), 2 * ns + nm + ni);
  if na > 500 then raise exception 'dato_non_valido'; end if;

  insert into scenari (magazzino_id, nome, stato, seed, config, creato_da)
  values (p_magazzino, trim(p_nome), 'bozza', sd, cfg || jsonb_build_object('n_articoli', na), u)
  returning id into sid;

  -- prefisso libero per matricole e codici anagrafica (piu' scenari nello stesso magazzino)
  select min(x) into pref from generate_series(1, 1000) x
   where not exists (select 1 from articoli where magazzino_id = p_magazzino and matricola like 'S' || x || '-%')
     and not exists (select 1 from anagrafiche where magazzino_id = p_magazzino and (codice like 'C' || x || '-%' or codice like 'F' || x || '-%'));

  -- ubicazioni (12 fisse, riusate se ci sono gia')
  for i in 0..11 loop
    vi := chr(65 + i / 4) || '-0' || (1 + (i % 4) / 2) || '-0' || (1 + i % 2);
    insert into ubicazioni (magazzino_id, codice, zona, corridoio, scaffale)
    values (p_magazzino, vi, 'Zona ' || chr(65 + i / 4), '0' || (1 + (i % 4) / 2), '0' || (1 + i % 2))
    on conflict (magazzino_id, codice) do nothing;
    select id into v from ubicazioni where magazzino_id = p_magazzino and codice = vi;
    ubi := ubi || v; ubc := ubc || vi;
  end loop;

  -- clienti e fornitori
  nC := array_length(_scn_clienti(), 1);
  for i in 1..nC loop
    it := (_scn_clienti())[i];
    insert into anagrafiche (magazzino_id, tipo, codice, ragione_sociale, indirizzo, comune, p_iva, sconto_perc)
    values (p_magazzino, 'cliente', 'C' || pref || '-' || lpad(i::text, 2, '0'), split_part(it, '|', 1),
            'Via ' || (array['Roma','Garibaldi','Mazzini','Verdi','Dante','Marconi'])[1 + _scn_h(sd, 'via' || i, 6)] || ' ' || (1 + _scn_h(sd, 'civ' || i, 90)),
            split_part(it, '|', 2), lpad((10000000 + _scn_h(sd, 'iva' || i, 80000000))::text, 11, '0'),
            (array[0, 5, 10])[1 + _scn_h(sd, 'sc' || i, 3)])
    returning id into v;
    cli := cli || v; clit := clit || split_part(it, '|', 1);
  end loop;
  nF := array_length(_scn_fornitori(), 1);
  for i in 1..nF loop
    it := (_scn_fornitori())[i];
    insert into anagrafiche (magazzino_id, tipo, codice, ragione_sociale, indirizzo, comune, p_iva, lead_time_giorni)
    values (p_magazzino, 'fornitore', 'F' || pref || '-' || lpad(i::text, 2, '0'), split_part(it, '|', 1),
            'Via ' || (array['Industria','Artigiani','Commercio','Stazione','Europa','Liberta'])[1 + _scn_h(sd, 'viaf' || i, 6)] || ' ' || (1 + _scn_h(sd, 'civf' || i, 90)),
            split_part(it, '|', 2), lpad((10000000 + _scn_h(sd, 'ivaf' || i, 80000000))::text, 11, '0'),
            2 + _scn_h(sd, 'lt' || i, 6))
    returning id, lead_time_giorni into v, k;
    frn := frn || v; frnt := frnt || split_part(it, '|', 1); frl := frl || k;
  end loop;

  -- quantita' iniziali, scorta di sicurezza e punto di riordino per merce; poi le merci speciali
  for i in 1..na loop
    g0[i] := 40 + _scn_h(sd, 'g' || i, 81);
    ss[i] := 6 + _scn_h(sd, 's' || i, 4);
    rr[i] := ss[i] + 8 + _scn_h(sd, 'r' || i, 6);
    ui[i] := 1 + _scn_h(sd, 'u' || i, 12);
  end loop;
  -- sottoscorta: tre scarichi (s1, s2, s3). Dopo s1+s2 restano 'rem' pezzi, sotto il punto di riordino rr;
  -- s3 > rem, quindi senza un riordino non si puo' fare
  for m in 1..nm loop
    k := 2 * ns + m;
    rem := 5 + _scn_h(sd, 'rem' || m, 5);
    s1[m] := 10 + _scn_h(sd, 'a' || m, 5);
    s2[m] := 10 + (s1[m] - 10 + 1 + _scn_h(sd, 'b' || m, 4)) % 5;  -- sempre diversa da s1
    s3[m] := rem + 2 + _scn_h(sd, 'c' || m, 4);
    while s3[m] = s1[m] or s3[m] = s2[m] loop s3[m] := s3[m] + 1; end loop;  -- tre quantita' diverse
    g0[k] := s1[m] + s2[m] + rem;
    rr[k] := rem + 3 + _scn_h(sd, 'd' || m, 3);
    ss[k] := 3 + _scn_h(sd, 'e' || m, 3);
  end loop;
  -- inventario: quantita' reale diversa dal sistema (da -5 a +5, mai zero)
  for j in 1..ni loop
    k := 2 * ns + nm + j;
    dlt := 1 + _scn_h(sd, 'i' || j, 5);
    rl[j] := case when _scn_h(sd, 'is' || j, 2) = 0 then g0[k] - dlt else g0[k] + dlt end;
  end loop;

  -- articoli, giacenze iniziali con movimento di apertura
  select array_agg(x order by _scn_h(sd, x, 1000000), x) into cat from unnest(_scn_catalogo()) x;
  nl := array_length(cat, 1);
  for i in 1..na loop
    it := cat[((i - 1) % nl) + 1];
    fi := 1 + _scn_h(sd, 'f' || i, nF);
    vi := 'S' || pref || '-' || lpad(i::text, 3, '0');
    insert into articoli (magazzino_id, matricola, descrizione, um, categoria, prezzo_acquisto_cent, ricarico_perc,
                          scorta_minima, scorta_sicurezza, punto_riordino, lead_time_giorni, domanda_giornaliera,
                          costo_ordine_cent, ubicazione_id, fornitore_abituale_id, scenario_id)
    values (p_magazzino, vi,
            split_part(it, '|', 1) || case when (i - 1) / nl > 0 then ' (serie ' || ((i - 1) / nl + 1) || ')' else '' end,
            split_part(it, '|', 3), split_part(it, '|', 2),
            split_part(it, '|', 4)::bigint * (90 + _scn_h(sd, 'p' || i, 21)) / 100,
            25 + _scn_h(sd, 'k' || i, 26), ss[i], ss[i], rr[i], frl[fi], 2 + _scn_h(sd, 'dd' || i, 5),
            1500 + _scn_h(sd, 'co' || i, 2001), ubi[ui[i]], frn[fi], sid)
    returning id into v;
    art := art || v;
    atx := atx || (vi || ' ' || split_part(it, '|', 1));
    insert into giacenze (magazzino_id, articolo_id, ubicazione_id, qta) values (p_magazzino, v, ubi[ui[i]], g0[i]);
    insert into movimenti_stock (magazzino_id, articolo_id, ubicazione_id, qta, costo_unit_cent, causale, user_id)
    select p_magazzino, v, ubi[ui[i]], g0[i], prezzo_acquisto_cent, 'apertura', u from articoli where id = v;
  end loop;

  -- compiti per studente, coerenti col ruolo; ogni studente lavora su due merci tutte sue (2i-1, 2i)
  for i in 1..ns loop
    a1 := art[2 * i - 1]; a2 := art[2 * i]; r := rol[i]; o := 0;
    c1 := 1 + _scn_h(sd, 'c1' || i, nC);  c2 := 1 + (c1 + _scn_h(sd, 'c2' || i, nC - 1)) % nC;
    f1 := 1 + _scn_h(sd, 'f1' || i, nF);  f2 := 1 + (f1 + _scn_h(sd, 'f2' || i, nF - 1)) % nF;
    q1 := 3 + _scn_h(sd, 'q1' || i, 12);  q2 := 3 + _scn_h(sd, 'q2' || i, 12);

    if r is null or r = 'magazziniere' then
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'magazziniere', 'carico', 'Carico: ' || atx[2 * i - 1],
        'Registra un carico di ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' dal fornitore ' || frnt[f1] || '.',
        a1, frn[f1], q1, '{}', o);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'magazziniere', 'scarico', 'Scarico: ' || atx[2 * i],
        'Registra uno scarico di ' || q2 || ' pezzi di ' || atx[2 * i] || ' per il cliente ' || clit[c1] || '.',
        a2, cli[c1], q2, '{}', o);
    end if;
    if r = 'magazziniere' then
      uj := 1 + (ui[2 * i - 1] - 1 + 1 + _scn_h(sd, 't' || i, 11)) % 12;
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'magazziniere', 'trasferimento', 'Trasferimento: ' || atx[2 * i - 1],
        'Sposta ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' dall''ubicazione ' || ubc[ui[2 * i - 1]] || ' alla ' || ubc[uj] || '.',
        a1, null, q1, jsonb_build_object('da_ubicazione_id', ubi[ui[2 * i - 1]], 'da', ubc[ui[2 * i - 1]],
                                         'a_ubicazione_id', ubi[uj], 'a', ubc[uj]), o);
    end if;
    if r = 'acquisti' then
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'acquisti', 'ordine_fornitore', 'Ordine fornitore: ' || atx[2 * i - 1],
        'Emetti un ordine di ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' al fornitore ' || frnt[f1] || '.',
        a1, frn[f1], q1, '{}', o);
      doc := _scn_doc(p_magazzino, 'ordine_fornitore', frn[f2], a2, q2, u);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'acquisti', 'evadi_ordine', 'Evadi ordine: ' || atx[2 * i],
        'Evadi l''ordine al fornitore ' || frnt[f2] || ' per ' || q2 || ' pezzi di ' || atx[2 * i] || ' (conferma il carico).',
        a2, frn[f2], q2, jsonb_build_object('ordine_id', doc), o);
    end if;
    if r = 'commerciale' then
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'commerciale', 'preventivo', 'Preventivo: ' || atx[2 * i - 1],
        'Prepara un preventivo di ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' per il cliente ' || clit[c1] || '.',
        a1, cli[c1], q1, '{}', o);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'commerciale', 'ordine_cliente', 'Ordine cliente: ' || atx[2 * i],
        'Registra un ordine di ' || q2 || ' pezzi di ' || atx[2 * i] || ' del cliente ' || clit[c2] || '.',
        a2, cli[c2], q2, '{}', o);
    end if;
    if r = 'amministrazione' then
      doc := _scn_doc(p_magazzino, 'scarico', cli[c1], a1, q1, u);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'amministrazione', 'fattura_vendita', 'Fattura di vendita: ' || atx[2 * i - 1],
        'Emetti la fattura per il DDT di ' || q1 || ' pezzi di ' || atx[2 * i - 1] || ' al cliente ' || clit[c1] || '.',
        a1, cli[c1], q1, jsonb_build_object('ddt_id', doc), o);
      doc := _scn_doc(p_magazzino, 'carico', frn[f1], a2, q2, u);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'amministrazione', 'fattura_acquisto', 'Fattura di acquisto: ' || atx[2 * i],
        'Registra la fattura del fornitore ' || frnt[f1] || ' per il carico di ' || q2 || ' pezzi di ' || atx[2 * i] || '.',
        a2, frn[f1], q2, jsonb_build_object('carico_id', doc), o);
    end if;
    if r is null then
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], null, 'preventivo', 'Preventivo: ' || atx[2 * i],
        'Prepara un preventivo di ' || q1 || ' pezzi di ' || atx[2 * i] || ' per il cliente ' || clit[c2] || '.',
        a2, cli[c2], q1, '{}', o);
      o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], null, 'ordine_fornitore', 'Ordine fornitore: ' || atx[2 * i - 1],
        'Emetti un ordine di ' || q2 || ' pezzi di ' || atx[2 * i - 1] || ' al fornitore ' || frnt[f2] || '.',
        a1, frn[f2], q2, '{}', o);
    end if;
    if inv and (r is null or r = 'magazziniere') then
      ik := ik + 1; k := 2 * ns + nm + ik; o := o + 1;
      perform _scn_compito(sid, p_magazzino, stud[i], 'magazziniere', 'inventario', 'Inventario: ' || atx[k],
        'Conta ' || atx[k] || ' in magazzino e, se la quantita'' reale e'' diversa da quella del sistema, rettifica la giacenza indicando la causale.',
        art[k], null, null, '{}', o);
    end if;
  end loop;

  -- inventario senza nessun magazziniere: un solo compito libero
  if inv and np = 0 then
    k := 2 * ns + nm + 1;
    perform _scn_compito(sid, p_magazzino, null, 'magazziniere', 'inventario', 'Inventario: ' || atx[k],
      'Conta ' || atx[k] || ' in magazzino e rettifica la giacenza se serve.', art[k], null, null, '{}', 1);
  end if;
  for j in 1..ni loop
    k := 2 * ns + nm + j;
    insert into scenario_fisico (scenario_id, articolo_id, ubicazione_id, qta_reale) values (sid, art[k], ubi[ui[k]], greatest(rl[j], 0));
  end loop;

  -- sottoscorta condivisa: tre scarichi della stessa merce a studenti (e clienti) diversi
  for m in 1..nm loop
    k := 2 * ns + m;
    base := _scn_h(sd, 'sc' || m, nC);
    for j in 0..2 loop
      qj := case j when 0 then s1[m] when 1 then s2[m] else s3[m] end;
      asg := case when np > 0 then pool[1 + (m + j) % np] end;
      perform _scn_compito(sid, p_magazzino, asg, 'magazziniere', 'scarico', 'Scarico: ' || atx[k],
        'Registra uno scarico di ' || qj || ' pezzi di ' || atx[k] || ' per il cliente ' || clit[1 + (base + 3 * j) % nC] || '.',
        art[k], cli[1 + (base + 3 * j) % nC], qj, '{}', 100 + m * 3 + j,
        case when j = 2 then 'bloccato' else 'da_fare' end,
        case when j = 2 then 'scorta insufficiente' end);
    end loop;
  end loop;

  select count(*) into n_comp from compiti where scenario_id = sid;
  perform _registra(p_magazzino, 'scenario_genera', 'scenario', sid,
                    jsonb_build_object('nome', trim(p_nome), 'seed', sd, 'articoli', na, 'studenti', ns, 'compiti', n_comp));
  return jsonb_build_object('scenario_id', sid, 'nome', trim(p_nome), 'stato', 'bozza', 'seed', sd,
                            'n_articoli', na, 'n_studenti', ns, 'n_compiti', n_comp);
end $$;

-- ritorna: {id, stato}
create function api_scenario_stato(p_scenario uuid, p_stato text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s scenari;
begin
  select * into s from scenari where id = p_scenario;
  if not found then raise exception 'non_trovato'; end if;
  if not _sono_docente(s.magazzino_id) then raise exception 'permesso_negato'; end if;
  if p_stato not in ('attivo', 'chiuso') then raise exception 'dato_non_valido'; end if;
  if s.stato = p_stato then return jsonb_build_object('id', s.id, 'stato', s.stato); end if;
  update scenari set stato = p_stato where id = p_scenario;
  if p_stato = 'attivo' then
    insert into notifiche (magazzino_id, tipo, messaggio)
    values (s.magazzino_id, 'sistema', 'Scenario "' || s.nome || '" attivo: apri la pagina Compiti.');
  end if;
  perform _registra(s.magazzino_id, 'scenario_' || p_stato, 'scenario', s.id, jsonb_build_object('nome', s.nome));
  return jsonb_build_object('id', s.id, 'stato', p_stato);
end $$;

-- ritorna: {id, assegnato_a}   (p_user nullo = compito libero)
create function api_scenario_riassegna(p_compito uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c compiti;
begin
  select * into c from compiti where id = p_compito;
  if not found then raise exception 'non_trovato'; end if;
  if not _sono_docente(c.magazzino_id) then raise exception 'permesso_negato'; end if;
  if p_user is not null and not exists (select 1 from membri where magazzino_id = c.magazzino_id and user_id = p_user and ruolo = 'studente') then
    raise exception 'dato_non_valido';
  end if;
  update compiti set assegnato_a = p_user where id = p_compito;
  perform _registra(c.magazzino_id, 'compito_riassegna', 'compito', c.id, jsonb_build_object('a', p_user));
  return jsonb_build_object('id', c.id, 'assegnato_a', p_user);
end $$;

-- ritorna: {totale, giacenze_negative:[{articolo_id,matricola,descrizione,qta}],
--           ordini_non_evasi:[{documento_id,tipo,anno,numero,controparte}], ddt_senza_fattura:[{documento_id,anno,numero,controparte}],
--           fatture_senza_ddt:[{documento_id,tipo,anno,numero,controparte}], spedizioni_ferme:[{documento_id,tipo,anno,numero,stato_spedizione,aggiornato_il}],
--           compiti_in_errore:[{compito_id,titolo,username,esito}]}
-- Documenti considerati: quelli del magazzino creati dopo lo scenario. Spedizione ferma = non avanzata da oltre 30 minuti.
create function api_scenario_controlla(p_scenario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s scenari; v_neg jsonb; v_ord jsonb; v_ddt jsonb; v_fat jsonb; v_sp jsonb; v_err jsonb;
begin
  select * into s from scenari where id = p_scenario;
  if not found then raise exception 'non_trovato'; end if;
  if not _sono_docente(s.magazzino_id) then raise exception 'permesso_negato'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('articolo_id', a.id, 'matricola', a.matricola, 'descrizione', a.descrizione, 'qta', g.qta)
                            order by a.matricola), '[]') into v_neg
    from giacenze g join articoli a on a.id = g.articolo_id where g.magazzino_id = s.magazzino_id and g.qta < 0;

  select coalesce(jsonb_agg(jsonb_build_object('documento_id', d.id, 'tipo', d.tipo, 'anno', d.anno, 'numero', d.numero,
                            'controparte', an.ragione_sociale) order by d.tipo, d.anno, d.numero), '[]') into v_ord
    from documenti d left join anagrafiche an on an.id = d.anagrafica_id
   where d.magazzino_id = s.magazzino_id and d.created_at >= s.created_at
     and d.tipo in ('ordine_fornitore', 'ordine_cliente') and d.stato = 'confermato';

  select coalesce(jsonb_agg(jsonb_build_object('documento_id', d.id, 'anno', d.anno, 'numero', d.numero,
                            'controparte', an.ragione_sociale) order by d.anno, d.numero), '[]') into v_ddt
    from documenti d left join anagrafiche an on an.id = d.anagrafica_id
   where d.magazzino_id = s.magazzino_id and d.created_at >= s.created_at
     and d.tipo = 'scarico' and d.stato in ('confermato', 'evaso')
     and not exists (select 1 from documenti f where f.documento_origine_id = d.id and f.tipo = 'fattura_vendita' and f.stato <> 'annullato');

  select coalesce(jsonb_agg(jsonb_build_object('documento_id', d.id, 'tipo', d.tipo, 'anno', d.anno, 'numero', d.numero,
                            'controparte', an.ragione_sociale) order by d.tipo, d.anno, d.numero), '[]') into v_fat
    from documenti d left join anagrafiche an on an.id = d.anagrafica_id
   where d.magazzino_id = s.magazzino_id and d.created_at >= s.created_at
     and d.tipo in ('fattura_vendita', 'fattura_acquisto') and d.stato in ('confermato', 'evaso')
     and not exists (select 1 from documenti o where o.id = d.documento_origine_id
                       and o.tipo = case d.tipo when 'fattura_vendita' then 'scarico' else 'carico' end);

  select coalesce(jsonb_agg(jsonb_build_object('documento_id', d.id, 'tipo', d.tipo, 'anno', d.anno, 'numero', d.numero,
                            'stato_spedizione', d.stato_spedizione, 'aggiornato_il', d.updated_at) order by d.updated_at), '[]') into v_sp
    from documenti d
   where d.magazzino_id = s.magazzino_id and d.stato <> 'annullato'
     and d.stato_spedizione in ('da_preparare', 'preparato') and d.updated_at < now() - interval '30 minutes';

  select coalesce(jsonb_agg(jsonb_build_object('compito_id', c.id, 'titolo', c.titolo, 'username', pr.username, 'esito', c.esito)
                            order by pr.username, c.ordine), '[]') into v_err
    from compiti c left join profili pr on pr.user_id = c.assegnato_a
   where c.scenario_id = s.id and c.stato = 'errore';

  return jsonb_build_object('totale', jsonb_array_length(v_neg) + jsonb_array_length(v_ord) + jsonb_array_length(v_ddt)
                                      + jsonb_array_length(v_fat) + jsonb_array_length(v_sp) + jsonb_array_length(v_err),
    'giacenze_negative', v_neg, 'ordini_non_evasi', v_ord, 'ddt_senza_fattura', v_ddt,
    'fatture_senza_ddt', v_fat, 'spedizioni_ferme', v_sp, 'compiti_in_errore', v_err);
end $$;

-- ritorna: [{id, scenario_id, tipo, titolo, istruzioni, articolo_id, articolo_matricola, articolo_descrizione,
--            controparte_id, controparte, controparte_tipo, qta, parametri, origine, stato, motivo, esito,
--            documento_id, completato_il, created_at}]   (solo scenari attivi, ordinati per ordine e creazione)
create function api_compiti_miei(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _membro(p_magazzino);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'scenario_id', c.scenario_id, 'tipo', c.tipo, 'titolo', c.titolo, 'istruzioni', c.istruzioni,
      'articolo_id', c.articolo_id, 'articolo_matricola', a.matricola, 'articolo_descrizione', a.descrizione,
      'controparte_id', c.anagrafica_id, 'controparte', an.ragione_sociale, 'controparte_tipo', an.tipo,
      'qta', c.qta, 'parametri', c.parametri, 'origine', c.origine, 'stato', c.stato, 'motivo', c.motivo,
      'esito', c.esito, 'documento_id', c.documento_id, 'completato_il', c.completato_il, 'created_at', c.created_at)
      order by c.ordine, c.created_at, c.id)
    from compiti c
    join scenari s on s.id = c.scenario_id and s.stato = 'attivo'
    left join articoli a on a.id = c.articolo_id
    left join anagrafiche an on an.id = c.anagrafica_id
    where c.magazzino_id = p_magazzino and c.assegnato_a = _uid()), '[]'::jsonb);
end $$;

-- ritorna: [{id, assegnato_a, username, ruolo_aziendale, tipo, titolo, articolo_matricola, articolo_descrizione,
--            controparte, qta, origine, stato, motivo, esito, documento_id, completato_il}]   (ordinati per username e ordine)
create function api_compiti_tutti(p_scenario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s scenari;
begin
  select * into s from scenari where id = p_scenario;
  if not found then raise exception 'non_trovato'; end if;
  if not _sono_docente(s.magazzino_id) then raise exception 'permesso_negato'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'assegnato_a', c.assegnato_a, 'username', pr.username, 'ruolo_aziendale', c.ruolo_aziendale,
      'tipo', c.tipo, 'titolo', c.titolo, 'articolo_matricola', a.matricola, 'articolo_descrizione', a.descrizione,
      'controparte', an.ragione_sociale, 'qta', c.qta, 'origine', c.origine, 'stato', c.stato, 'motivo', c.motivo,
      'esito', c.esito, 'documento_id', c.documento_id, 'completato_il', c.completato_il)
      order by pr.username nulls last, c.ordine, c.created_at, c.id)
    from compiti c
    left join profili pr on pr.user_id = c.assegnato_a
    left join articoli a on a.id = c.articolo_id
    left join anagrafiche an on an.id = c.anagrafica_id
    where c.scenario_id = p_scenario), '[]'::jsonb);
end $$;

-- ---------- funzioni interne (ridefiniscono gli stub di 0004) ----------
-- Giacenza sotto il punto di riordino: compito dinamico "riordino" a uno studente acquisti (a turno; nessuno = libero)
-- e notifica per tutta la classe. Una sola volta finche' il riordino resta aperto.
create or replace function _riordino_dinamico(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sc scenari; a articoli; v_giac numeric; acq uuid[]; v_n int; v_ass uuid; v_qta numeric; v_ord int; v_nome text;
begin
  select * into sc from scenari where magazzino_id = p_magazzino and stato = 'attivo' order by created_at desc limit 1;
  if not found then return; end if;
  select * into a from articoli where id = p_articolo and magazzino_id = p_magazzino;
  if not found or a.punto_riordino <= 0 then return; end if;
  select coalesce(sum(qta), 0) into v_giac from giacenze where articolo_id = p_articolo;
  if v_giac > a.punto_riordino then return; end if;
  if exists (select 1 from compiti where scenario_id = sc.id and articolo_id = p_articolo and tipo = 'riordino'
               and origine = 'dinamico' and stato in ('da_fare', 'errore')) then return; end if;

  select array_agg(m.user_id order by pr.username) into acq
    from membri m join profili pr on pr.user_id = m.user_id
   where m.magazzino_id = p_magazzino and m.ruolo = 'studente' and m.ruolo_aziendale = 'acquisti';
  select count(*) into v_n from compiti where scenario_id = sc.id and tipo = 'riordino' and origine = 'dinamico';
  select coalesce(max(ordine), 0) + 1 into v_ord from compiti where scenario_id = sc.id;
  if coalesce(array_length(acq, 1), 0) > 0 then v_ass := acq[1 + v_n % array_length(acq, 1)]; end if;
  v_qta := greatest(ceil(2 * a.punto_riordino - v_giac), 1);
  v_nome := a.matricola || ' ' || a.descrizione;

  perform _scn_compito(sc.id, p_magazzino, v_ass, 'acquisti', 'riordino', 'Riordino: ' || v_nome,
    'La giacenza di ' || v_nome || ' (' || v_giac || ') e'' sotto il punto di riordino (' || a.punto_riordino
      || '). Emetti un ordine fornitore di almeno ' || v_qta || ' pezzi.',
    p_articolo, a.fornitore_abituale_id, v_qta, jsonb_build_object('giacenza', v_giac, 'punto_riordino', a.punto_riordino),
    v_ord, 'da_fare', null, 'dinamico');
  insert into notifiche (magazzino_id, tipo, articolo_id, messaggio)
  values (p_magazzino, 'compito', p_articolo, 'Scorta bassa su ' || v_nome || ': nuovo compito di riordino'
          || case when v_ass is null then ' (libero).' else ' assegnato a ' || (select username from profili where user_id = v_ass) || '.' end);
end $$;

-- Dopo ogni conferma: riapre i compiti bloccati se la merce c'e' (al netto degli altri scarichi gia' assegnati)
-- e completa i riordini dinamici la cui giacenza e' tornata sopra il punto di riordino.
create or replace function _sblocca_compiti(p_magazzino uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update compiti c set stato = 'da_fare', motivo = null
   where c.magazzino_id = p_magazzino and c.stato = 'bloccato' and c.articolo_id is not null and c.qta is not null
     and (select coalesce(sum(g.qta), 0) from giacenze g where g.articolo_id = c.articolo_id)
       - (select coalesce(sum(x.qta), 0) from compiti x where x.scenario_id = c.scenario_id and x.articolo_id = c.articolo_id
            and x.tipo = c.tipo and x.stato in ('da_fare', 'errore') and x.id <> c.id) >= c.qta;

  update compiti c set stato = 'completato', completato_il = now(), esito = jsonb_build_object('giacenza_ripristinata', true)
    from articoli a
   where a.id = c.articolo_id and c.magazzino_id = p_magazzino and c.tipo = 'riordino' and c.origine = 'dinamico'
     and c.stato in ('da_fare', 'errore')
     and (select coalesce(sum(g.qta), 0) from giacenze g where g.articolo_id = c.articolo_id) > a.punto_riordino;

  update notifiche n set risolta_il = now()
   where n.magazzino_id = p_magazzino and n.tipo = 'compito' and n.risolta_il is null and n.articolo_id is not null
     and not exists (select 1 from compiti c where c.magazzino_id = p_magazzino and c.articolo_id = n.articolo_id
                       and c.tipo = 'riordino' and c.stato in ('da_fare', 'errore'));
end $$;

-- Confronta il documento confermato con i compiti aperti di chi l'ha creato. Candidati: stesso tipo e merce nel documento.
-- Tutto giusto (controparte, quantita') -> completato; altrimenti errore con esito {errori:[{campo, atteso, trovato}]}.
-- Un carico generato da un ordine fornitore vale come compito evadi_ordine.
create or replace function _valuta_compiti(p_magazzino uuid, p_documento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documenti; u uuid; v_tipo text; c compiti; v_err jsonb; v_trovata numeric; v_ok boolean := false;
        v_primo uuid; v_primo_err jsonb;
begin
  select * into d from documenti where id = p_documento and magazzino_id = p_magazzino;
  if not found or d.stato not in ('confermato', 'evaso') then return; end if;
  u := coalesce(d.creato_da, auth.uid());
  if u is null then return; end if;
  v_tipo := d.tipo;
  if d.tipo = 'carico' and exists (select 1 from documenti o where o.id = d.documento_origine_id and o.tipo = 'ordine_fornitore') then
    v_tipo := 'evadi_ordine';
  end if;

  for c in
    select k.* from compiti k join scenari s on s.id = k.scenario_id and s.stato = 'attivo'
     where k.magazzino_id = p_magazzino and k.assegnato_a = u and k.tipo = v_tipo
       and k.stato in ('da_fare', 'errore', 'bloccato') and k.articolo_id is not null
       and exists (select 1 from righe_documento r where r.documento_id = d.id and r.articolo_id = k.articolo_id)
     order by k.ordine, k.created_at
  loop
    v_err := '[]'::jsonb;
    if c.anagrafica_id is not null and d.anagrafica_id is distinct from c.anagrafica_id then
      v_err := v_err || jsonb_build_object('campo', 'controparte',
        'atteso', (select ragione_sociale from anagrafiche where id = c.anagrafica_id),
        'trovato', (select ragione_sociale from anagrafiche where id = d.anagrafica_id));
    end if;
    select coalesce(sum(qta), 0) into v_trovata from righe_documento where documento_id = d.id and articolo_id = c.articolo_id;
    if c.qta is not null and v_trovata <> c.qta then
      v_err := v_err || jsonb_build_object('campo', 'quantita', 'atteso', c.qta, 'trovato', v_trovata);
    end if;
    if v_tipo = 'evadi_ordine' and c.parametri ? 'ordine_id' and (c.parametri ->> 'ordine_id')::uuid is distinct from d.documento_origine_id then
      v_err := v_err || jsonb_build_object('campo', 'ordine', 'atteso', c.parametri ->> 'ordine_id', 'trovato', d.documento_origine_id);
    end if;

    if jsonb_array_length(v_err) = 0 then
      update compiti set stato = 'completato', motivo = null, esito = jsonb_build_object('ok', true),
                         documento_id = d.id, completato_il = now() where id = c.id;
      perform _registra(p_magazzino, 'compito_completato', 'compito', c.id, jsonb_build_object('tipo', c.tipo));
      v_ok := true; exit;
    elsif v_primo is null then
      v_primo := c.id; v_primo_err := v_err;
    end if;
  end loop;

  if not v_ok and v_primo is not null then
    update compiti set stato = 'errore', motivo = 'dati non corretti', esito = jsonb_build_object('errori', v_primo_err),
                       documento_id = d.id where id = v_primo;
    perform _registra(p_magazzino, 'compito_errore', 'compito', v_primo, jsonb_build_object('errori', v_primo_err));
  end if;

  -- _controlla_scorte chiama _sblocca_compiti solo se chiude una notifica: qui lo si fa a ogni conferma
  perform _sblocca_compiti(p_magazzino);
end $$;

-- Da chiamare dopo un trasferimento: completa il compito "trasferimento" di chi chiama se la quantita' coincide, altrimenti errore.
create or replace function _valuta_trasferimento(p_magazzino uuid, p_articolo uuid, p_qta numeric) returns void
language plpgsql security definer set search_path = public as $$
declare c compiti;
begin
  select k.* into c from compiti k join scenari s on s.id = k.scenario_id and s.stato = 'attivo'
   where k.magazzino_id = p_magazzino and k.assegnato_a = auth.uid() and k.tipo = 'trasferimento' and k.articolo_id = p_articolo
     and k.stato in ('da_fare', 'errore') order by k.ordine limit 1;
  if not found then return; end if;
  if c.qta = p_qta then
    update compiti set stato = 'completato', motivo = null, esito = jsonb_build_object('ok', true), completato_il = now() where id = c.id;
  else
    update compiti set stato = 'errore', motivo = 'dati non corretti',
      esito = jsonb_build_object('errori', jsonb_build_array(jsonb_build_object('campo', 'quantita', 'atteso', c.qta, 'trovato', p_qta))) where id = c.id;
  end if;
end $$;

-- Da chiamare dopo una rettifica d'inventario: il compito "inventario" si completa se la giacenza di sistema
-- coincide con la quantita' reale dello scenario (scenario_fisico), altrimenti errore.
create or replace function _valuta_inventario(p_magazzino uuid, p_articolo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c compiti; v_reale numeric; v_sis numeric;
begin
  select k.* into c from compiti k join scenari s on s.id = k.scenario_id and s.stato = 'attivo'
   where k.magazzino_id = p_magazzino and k.assegnato_a = auth.uid() and k.tipo = 'inventario' and k.articolo_id = p_articolo
     and k.stato in ('da_fare', 'errore') order by k.ordine limit 1;
  if not found then return; end if;
  select sum(qta_reale) into v_reale from scenario_fisico where scenario_id = c.scenario_id and articolo_id = p_articolo;
  if v_reale is null then return; end if;
  select coalesce(sum(qta), 0) into v_sis from giacenze where articolo_id = p_articolo;
  if v_sis = v_reale then
    update compiti set stato = 'completato', motivo = null, esito = jsonb_build_object('ok', true), completato_il = now() where id = c.id;
  else
    update compiti set stato = 'errore', motivo = 'dati non corretti',
      esito = jsonb_build_object('errori', jsonb_build_array(jsonb_build_object('campo', 'giacenza', 'atteso', v_reale, 'trovato', v_sis))) where id = c.id;
  end if;
end $$;
