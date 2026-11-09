-- 0010_admin.sql
-- Ruolo globale ADMIN (superadmin) e impostazioni account.
-- Incrementale: gira su un database con 0001-0009 (e 0099) gia' applicate, oppure in ordine PRIMA di 0099 su uno nuovo.
-- Tutti i create sono "or replace" / "if not exists": si puo' rieseguire.
-- Richiede pgcrypto nello schema `extensions` (su Supabase c'e' gia'): api_admin_reimposta_password usa extensions.crypt.
--
-- Regole:
--  - L'admin funziona da docente su QUALSIASI classe (magazzini.tipo = 'classe'), mai sui magazzini personali altrui:
--    l'override sta in _sono_docente, _membro e _puo, quindi vale per tutte le api_* che li usano.
--  - Il ruolo globale cambia solo con api_admin_imposta_ruolo. _nuovo_utente continua a creare solo studenti
--    e accetta solo email <username>@shipping.local (lo username deriva dall'email: nessun altro dominio puo' sceglierlo).
--  - Il primo admin NON si assegna da qui: vedi in fondo.
--  - Errori col contratto: non_autenticato, permesso_negato, non_trovato, dato_non_valido, stato_non_valido
--    (con DETAIL 'possiede_classi' | 'ultimo_admin'), conferma_errata.

-- ---------- ruolo_globale ammette 'admin' ----------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profili'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%ruolo_globale%' loop
    execute format('alter table profili drop constraint %I', c);
  end loop;
  alter table profili add constraint profili_ruolo_globale_check check (ruolo_globale in ('studente', 'docente', 'admin'));
end $$;

-- ---------- registrazione ----------
-- Ridefinisce _nuovo_utente (0002): solo email <username>@shipping.local (altrimenti dato_non_valido), nome senza caratteri
-- di controllo e al massimo 60 caratteri (come api_account_nome).
create or replace function _nuovo_utente() returns trigger language plpgsql security definer set search_path = public as $$
declare u text;
begin
  if new.email is null or new.email !~* '^[^@]+@shipping\.local$' then raise exception 'dato_non_valido'; end if;
  u := lower(split_part(new.email, '@', 1));
  insert into profili (user_id, username, nome)
  values (new.id, u, left(regexp_replace(btrim(coalesce(new.raw_user_meta_data->>'nome', '')), '[[:cntrl:]]', '', 'g'), 60));
  return new;
end $$;

-- ---------- registro admin ----------
-- user_id / bersaglio_id senza fk: il registro sopravvive all'eliminazione degli utenti (gli username restano in dettagli).
create table if not exists registro_admin (
  id bigint generated always as identity primary key,
  user_id uuid,
  azione text not null,
  bersaglio_id uuid,
  dettagli jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table registro_admin enable row level security;  -- senza policy: nessun accesso diretto
revoke all on registro_admin from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- helper interni ----------
create or replace function _e_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from profili where user_id = _uid() and ruolo_globale = 'admin');
end $$;

-- vero se chi chiama e' admin E il magazzino e' una classe (mai per i magazzini personali)
create or replace function _e_admin_classe(p_magazzino uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from profili p, magazzini m
                 where p.user_id = _uid() and p.ruolo_globale = 'admin' and m.id = p_magazzino and m.tipo = 'classe');
end $$;

create or replace function _richiedi_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not _e_admin() then raise exception 'permesso_negato'; end if;
end $$;

-- vero se p_user e' admin e non ce ne sono altri. Blocca le righe degli admin: due operazioni insieme non li azzerano.
create or replace function _e_ultimo_admin(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from profili where ruolo_globale = 'admin' order by user_id for update;
  return exists (select 1 from profili where user_id = p_user and ruolo_globale = 'admin')
     and not exists (select 1 from profili where ruolo_globale = 'admin' and user_id <> p_user);
end $$;

-- Mai la password in p_dettagli. Chiamare PRIMA di eliminare il bersaglio (gli username si leggono qui).
create or replace function _registra_admin(p_azione text, p_bersaglio uuid, p_dettagli jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into registro_admin (user_id, azione, bersaglio_id, dettagli)
  values (_uid(), p_azione, p_bersaglio,
          coalesce(p_dettagli, '{}') || jsonb_strip_nulls(jsonb_build_object(
            'autore_username', (select username from profili where user_id = _uid()),
            'bersaglio_username', (select username from profili where user_id = p_bersaglio))));
end $$;

-- Cancella l'utente da auth.users: a cascata profilo, magazzino personale e dati. Chi chiama controlla prima classi e ultimo admin.
-- compiti e documenti prima: hanno fk "restrict" verso articoli e anagrafiche (come in api_classe_elimina).
create or replace function _elimina_utente(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from compiti where magazzino_id in (select id from magazzini where proprietario_id = p_user);
  delete from documenti where magazzino_id in (select id from magazzini where proprietario_id = p_user);
  delete from auth.users where id = p_user;
end $$;

-- Chiude le sessioni di Supabase Auth di p_user. SQL dinamico solo perche' le tabelle possono non esistere (dev locale):
-- nomi fissi, valore legato. Sta qui e non in api_* (nessun execute dentro le api_*).
create or replace function _chiudi_sessioni(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_user;
  end if;
end $$;

-- ---------- override admin sulle classi ----------
create or replace function _sono_docente(p_magazzino uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if _e_admin_classe(p_magazzino) then return true; end if;
  return exists (select 1 from membri where magazzino_id = p_magazzino and user_id = _uid() and ruolo = 'docente');
end $$;

-- admin su una classe: la sua riga (o una sintetica se non e' iscritto) con ruolo 'docente'
create or replace function _membro(p_magazzino uuid) returns membri
language plpgsql stable security definer set search_path = public as $$
declare m membri;
begin
  select * into m from membri where magazzino_id = p_magazzino and user_id = _uid();
  if _e_admin_classe(p_magazzino) then
    m.magazzino_id := p_magazzino; m.user_id := _uid(); m.ruolo := 'docente'; m.ruolo_aziendale := null;
    m.entrato_il := coalesce(m.entrato_il, now());
    return m;
  end if;
  if not found then raise exception 'permesso_negato'; end if;
  return m;
end $$;

create or replace function _puo(p_magazzino uuid, p_azione text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m membri; tipo_m text;
begin
  if _e_admin_classe(p_magazzino) then return true; end if;
  select * into m from membri where magazzino_id = p_magazzino and user_id = _uid();
  if not found then return false; end if;
  if m.ruolo = 'docente' then return true; end if;
  select tipo into tipo_m from magazzini where id = p_magazzino;
  if tipo_m = 'personale' or m.ruolo_aziendale is null then return true; end if;
  return exists (select 1 from permessi_ruolo where ruolo_aziendale = m.ruolo_aziendale and azione = p_azione);
end $$;

-- ---------- funzioni esistenti che leggevano ruolo_globale / membri ----------
-- ritorna: {id, nome, tipo:'classe', codice_ingresso, codice_attivo}
-- Docente o admin. Massimo 50 classi per proprietario e nome di al massimo 500 caratteri, altrimenti dato_non_valido.
create or replace function api_classe_crea(p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); v_nome text := btrim(coalesce(p_nome, '')); mid uuid; cod text; v_admin boolean;
begin
  -- il blocco sulla riga del profilo mette in fila due creazioni insieme (il limite non si supera)
  perform 1 from profili where user_id = u and ruolo_globale in ('docente', 'admin') for update;
  if not found then raise exception 'permesso_negato'; end if;
  v_admin := _e_admin();
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
  if v_admin then perform _registra_admin('classe_crea', null, jsonb_build_object('magazzino_id', mid, 'nome', v_nome)); end if;
  return jsonb_build_object('id', mid, 'nome', v_nome, 'tipo', 'classe', 'codice_ingresso', cod, 'codice_attivo', true);
end $$;

-- ritorna: [{id, nome, codice_ingresso, codice_attivo, n_iscritti, n_online, created_at}]  (classi in cui sono docente, per l'admin TUTTE le classi; n_iscritti/n_online contano solo gli studenti, online = battito < 45 s)
create or replace function api_docente_classi() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); adm boolean := _e_admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'nome', m.nome, 'codice_ingresso', m.codice_ingresso, 'codice_attivo', m.codice_attivo,
      'n_iscritti', (select count(*) from membri s where s.magazzino_id = m.id and s.ruolo = 'studente'),
      'n_online', (select count(*) from membri s join presenze pz on pz.user_id = s.user_id
                   where s.magazzino_id = m.id and s.ruolo = 'studente' and pz.visto_il > now() - interval '45 seconds'),
      'created_at', m.created_at) order by m.nome, m.created_at)
    from magazzini m
    where m.tipo = 'classe'
      and (adm or exists (select 1 from membri d where d.magazzino_id = m.id and d.user_id = u and d.ruolo = 'docente'))
  ), '[]'::jsonb);
end $$;

-- ---------- account di chi chiama ----------
-- ritorna: {user_id, username, nome, ruolo_globale, creato_il, n_classi_possedute}
create or replace function api_account() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p profili;
begin
  select * into p from profili where user_id = u;
  if not found then raise exception 'non_trovato'; end if;
  return jsonb_build_object('user_id', p.user_id, 'username', p.username, 'nome', p.nome,
                            'ruolo_globale', p.ruolo_globale, 'creato_il', p.created_at,
                            'n_classi_possedute', (select count(*) from magazzini where proprietario_id = u and tipo = 'classe'));
end $$;

-- ritorna: {user_id, username, nome, ruolo_globale, created_at, updated_at}  (profilo aggiornato; nome 1-60 caratteri senza spazi ai bordi e senza caratteri di controllo)
create or replace function api_account_nome(p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); v text := regexp_replace(coalesce(p_nome, ''), '^\s+|\s+$', '', 'g'); p profili;
begin
  if char_length(v) not between 1 and 60 or v ~ '[[:cntrl:]]' then raise exception 'dato_non_valido'; end if;
  update profili set nome = v where user_id = u returning * into p;
  if not found then raise exception 'non_trovato'; end if;
  return to_jsonb(p);
end $$;

-- ritorna: {ok:true}   (p_conferma = il proprio username, altrimenti conferma_errata; cancella da auth.users: a cascata profilo, magazzino personale e dati)
-- stato_non_valido con DETAIL 'possiede_classi' (prima va eliminata o trasferita ogni classe) o 'ultimo_admin'.
create or replace function api_account_elimina(p_conferma text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p profili;
begin
  select * into p from profili where user_id = u for update;
  if not found then raise exception 'non_trovato'; end if;
  if p_conferma is distinct from p.username then raise exception 'conferma_errata'; end if;
  if exists (select 1 from magazzini where proprietario_id = u and tipo = 'classe') then
    raise exception 'stato_non_valido' using detail = 'possiede_classi';
  end if;
  if p.ruolo_globale = 'admin' then
    if _e_ultimo_admin(u) then raise exception 'stato_non_valido' using detail = 'ultimo_admin'; end if;
    perform _registra_admin('account_elimina', u, '{}');
  end if;
  perform _elimina_utente(u);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- funzioni admin ----------
-- ritorna: [{user_id, username, nome, ruolo_globale, creato_il, ultimo_accesso, n_classi_possedute, n_classi_iscritto}]
-- Solo admin, max 200 ordinati per username. p_cerca: testo (max 100) cercato in username e nome; p_ruolo: studente|docente|admin. n_classi_iscritto = classi in cui e' studente.
create or replace function api_admin_utenti(p_cerca text default null, p_ruolo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cerca text := lower(btrim(coalesce(p_cerca, '')));
begin
  perform _richiedi_admin();
  if char_length(v_cerca) > 100 or (p_ruolo is not null and p_ruolo not in ('studente', 'docente', 'admin')) then
    raise exception 'dato_non_valido';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', x.user_id, 'username', x.username, 'nome', x.nome, 'ruolo_globale', x.ruolo_globale,
      'creato_il', x.created_at, 'ultimo_accesso', x.visto_il,
      'n_classi_possedute', (select count(*) from magazzini m where m.proprietario_id = x.user_id and m.tipo = 'classe'),
      'n_classi_iscritto', (select count(*) from membri b join magazzini m on m.id = b.magazzino_id
                            where b.user_id = x.user_id and b.ruolo = 'studente' and m.tipo = 'classe')
    ) order by x.username)
    from (select pr.user_id, pr.username, pr.nome, pr.ruolo_globale, pr.created_at, pz.visto_il
          from profili pr left join presenze pz on pz.user_id = pr.user_id
          where (p_ruolo is null or pr.ruolo_globale = p_ruolo)
            and (v_cerca = '' or position(v_cerca in lower(pr.username)) > 0 or position(v_cerca in lower(pr.nome)) > 0)
          order by pr.username limit 200) x
  ), '[]'::jsonb);
end $$;

-- ritorna: {user_id, username, nome, ruolo_globale, created_at, updated_at}  (profilo aggiornato)
-- Solo admin. Ruoli studente|docente|admin. L'ultimo admin non puo' perdere il ruolo (stato_non_valido, DETAIL 'ultimo_admin').
-- Retrocessione a 'studente': le sue appartenenze 'docente' nelle classi che NON possiede diventano 'studente'. Le classi che
-- possiede restano sue (e lui docente) finche' non sono trasferite con api_admin_classe_trasferisci, che lo porta a studente:
-- scelta voluta, cosi' la retrocessione non e' bloccata e una classe non resta con un proprietario senza ruolo docente.
create or replace function api_admin_imposta_ruolo(p_user uuid, p_ruolo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profili; v_prima text; v_ultimo boolean;
begin
  perform _richiedi_admin();
  if p_ruolo is null or p_ruolo not in ('studente', 'docente', 'admin') then raise exception 'dato_non_valido'; end if;
  select * into p from profili where user_id = p_user for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi_admin();  -- di nuovo dopo il blocco: chi chiama puo' aver perso il ruolo nell'attesa
  if p.ruolo_globale = p_ruolo then return to_jsonb(p); end if;
  if p.ruolo_globale = 'admin' then
    v_ultimo := _e_ultimo_admin(p_user);  -- blocca le righe degli admin
    perform _richiedi_admin();
    if v_ultimo then raise exception 'stato_non_valido' using detail = 'ultimo_admin'; end if;
  end if;
  v_prima := p.ruolo_globale;
  update profili set ruolo_globale = p_ruolo where user_id = p_user returning * into p;
  if p_ruolo = 'studente' then
    update membri set ruolo = 'studente'
    where user_id = p_user and ruolo = 'docente'
      and magazzino_id not in (select id from magazzini where proprietario_id = p_user);
  end if;
  perform _registra_admin('ruolo', p_user, jsonb_build_object('da', v_prima, 'a', p_ruolo));
  return to_jsonb(p);
end $$;

-- ritorna: {ok:true}   (solo admin; p_conferma = username del bersaglio, altrimenti conferma_errata)
-- stato_non_valido con DETAIL 'possiede_classi' o 'ultimo_admin' (vale anche se l'admin elimina se stesso).
create or replace function api_admin_elimina_utente(p_user uuid, p_conferma text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profili; v_ultimo boolean;
begin
  perform _richiedi_admin();
  select * into p from profili where user_id = p_user for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi_admin();  -- di nuovo dopo il blocco: chi chiama puo' aver perso il ruolo nell'attesa
  if p_conferma is distinct from p.username then raise exception 'conferma_errata'; end if;
  if exists (select 1 from magazzini where proprietario_id = p_user and tipo = 'classe') then
    raise exception 'stato_non_valido' using detail = 'possiede_classi';
  end if;
  if p.ruolo_globale = 'admin' then
    v_ultimo := _e_ultimo_admin(p_user);  -- blocca le righe degli admin
    perform _richiedi_admin();
    if v_ultimo then raise exception 'stato_non_valido' using detail = 'ultimo_admin'; end if;
  end if;
  perform _registra_admin('utente_elimina', p_user, jsonb_build_object('ruolo_globale', p.ruolo_globale));
  perform _elimina_utente(p_user);
  return jsonb_build_object('ok', true);
end $$;

-- ritorna: {ok:true}   (solo admin; password da 6 caratteri e al massimo 72 BYTE, bcrypt ignora il resto; il registro non contiene mai la password)
-- Scrive in auth.users.encrypted_password un hash bcrypt (extensions.crypt), come fa Supabase, e chiude tutte le sessioni
-- del bersaglio (auth.sessions / auth.refresh_tokens): la vecchia password o un token rubato non restano validi.
create or replace function api_admin_reimposta_password(p_user uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_admin();
  if p_password is null or char_length(p_password) < 6 or octet_length(p_password) > 72 then raise exception 'dato_non_valido'; end if;
  if not exists (select 1 from profili where user_id = p_user) then raise exception 'non_trovato'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now()
  where id = p_user;
  if not found then raise exception 'non_trovato'; end if;
  perform _chiudi_sessioni(p_user);
  perform _registra_admin('password_reimposta', p_user, '{}');
  return jsonb_build_object('ok', true);
end $$;

-- ritorna: [{id, nome, created_at, proprietario:{user_id, username}, n_iscritti, n_online}]   (solo admin; tutte le classi; n_iscritti/n_online contano solo gli studenti)
create or replace function api_admin_classi() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'nome', m.nome, 'created_at', m.created_at,
      'proprietario', jsonb_build_object('user_id', m.proprietario_id, 'username', pr.username),
      'n_iscritti', (select count(*) from membri s where s.magazzino_id = m.id and s.ruolo = 'studente'),
      'n_online', (select count(*) from membri s join presenze pz on pz.user_id = s.user_id
                   where s.magazzino_id = m.id and s.ruolo = 'studente' and pz.visto_il > now() - interval '45 seconds')
    ) order by m.nome, m.created_at)
    from magazzini m join profili pr on pr.user_id = m.proprietario_id
    where m.tipo = 'classe'), '[]'::jsonb);
end $$;

-- ritorna: {id, nome, tipo:'classe', codice_ingresso, codice_attivo, created_at, proprietario:{user_id, username}}
-- Solo admin. Il nuovo proprietario deve essere docente o admin (dato_non_valido) e diventa membro docente;
-- il vecchio proprietario resta membro ma come 'studente' (se e' admin resta com'e': agisce comunque da override).
create or replace function api_admin_classe_trasferisci(p_magazzino uuid, p_nuovo_proprietario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m magazzini; n profili; v_prima uuid;
begin
  perform _richiedi_admin();
  select * into m from magazzini where id = p_magazzino and tipo = 'classe' for update;
  if not found then raise exception 'non_trovato'; end if;
  perform _richiedi_admin();  -- di nuovo dopo il blocco
  select * into n from profili where user_id = p_nuovo_proprietario;
  if not found then raise exception 'non_trovato'; end if;
  if n.ruolo_globale not in ('docente', 'admin') then raise exception 'dato_non_valido'; end if;
  if m.proprietario_id <> n.user_id then
    if (select count(*) from magazzini where proprietario_id = n.user_id and tipo = 'classe') >= 50 then
      raise exception 'dato_non_valido';
    end if;
    v_prima := m.proprietario_id;
    update magazzini set proprietario_id = n.user_id where id = p_magazzino returning * into m;
    insert into membri (magazzino_id, user_id, ruolo) values (p_magazzino, n.user_id, 'docente')
    on conflict (magazzino_id, user_id) do update set ruolo = 'docente', ruolo_aziendale = null;
    update membri set ruolo = 'studente'
    where magazzino_id = p_magazzino and user_id = v_prima
      and not exists (select 1 from profili where user_id = v_prima and ruolo_globale = 'admin');
    perform _registra_admin('classe_trasferisci', n.user_id,
                            jsonb_build_object('magazzino_id', p_magazzino, 'nome', m.nome, 'da', v_prima));
  end if;
  return jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'codice_ingresso', m.codice_ingresso,
                            'codice_attivo', m.codice_attivo, 'created_at', m.created_at,
                            'proprietario', jsonb_build_object('user_id', n.user_id, 'username', n.username));
end $$;

-- ritorna: {utenti:{studenti, docenti, admin}, classi, magazzini_personali, online_ora}   (solo admin; online_ora = battito < 45 s)
create or replace function api_admin_statistiche() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_admin();
  return jsonb_build_object(
    'utenti', jsonb_build_object(
      'studenti', (select count(*) from profili where ruolo_globale = 'studente'),
      'docenti', (select count(*) from profili where ruolo_globale = 'docente'),
      'admin', (select count(*) from profili where ruolo_globale = 'admin')),
    'classi', (select count(*) from magazzini where tipo = 'classe'),
    'magazzini_personali', (select count(*) from magazzini where tipo = 'personale'),
    'online_ora', (select count(*) from presenze where visto_il > now() - interval '45 seconds'));
end $$;

-- ritorna: [{id, username, azione, bersaglio, dettagli, created_at}]   (solo admin; dal piu' recente; p_limite 1-200, default 50; username = autore, bersaglio = username o null)
create or replace function api_admin_registro(p_limite int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _richiedi_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'username', x.username, 'azione', x.azione, 'bersaglio', x.bersaglio,
      'dettagli', x.dettagli, 'created_at', x.created_at) order by x.id desc)
    from (select r.id, coalesce(pa.username, r.dettagli ->> 'autore_username') as username, r.azione,
                 case when r.bersaglio_id is not null
                      then coalesce(pb.username, r.dettagli ->> 'bersaglio_username') end as bersaglio,
                 r.dettagli, r.created_at
          from registro_admin r
          left join profili pa on pa.user_id = r.user_id
          left join profili pb on pb.user_id = r.bersaglio_id
          order by r.id desc limit greatest(1, least(coalesce(p_limite, 50), 200))) x), '[]'::jsonb);
end $$;

-- ---------- primo admin ----------
-- Nessuna promozione automatica (per username la otterrebbe chi si registra per primo con quel nome).
-- Dopo aver applicato questa migrazione E dopo che l'utente vero si e' registrato, il proprietario esegue A MANO,
-- una volta, nell'SQL Editor di Supabase (ruolo postgres):
--   update profili set ruolo_globale = 'admin' where username = 'francesco_foti';

-- ---------- privilegi (stesso blocco di 0099, ripetuto: le funzioni create qui devono risultare chiamabili) ----------
revoke execute on all functions in schema public from public, anon, authenticated;
do $$
declare f record;
begin
  for f in select oid::regprocedure as sig from pg_proc
           where pronamespace = 'public'::regnamespace and proname like 'api\_%' loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
