-- 0009_scenari_elenco.sql
-- Elenco degli scenari di una classe (mancava nel catalogo): serve alla schermata del docente.

-- ritorna: [{id, nome, descrizione, stato, seed, config, created_at, compiti:{totale, completati, errori, bloccati}}], dal piu' recente
-- Solo il docente della classe.
create function api_scenari_elenco(p_magazzino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _uid();
  if not _sono_docente(p_magazzino) then raise exception 'permesso_negato'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'nome', s.nome, 'descrizione', s.descrizione, 'stato', s.stato, 'seed', s.seed,
      'config', s.config, 'created_at', s.created_at,
      'compiti', jsonb_build_object(
        'totale', (select count(*) from compiti c where c.scenario_id = s.id),
        'completati', (select count(*) from compiti c where c.scenario_id = s.id and c.stato = 'completato'),
        'errori', (select count(*) from compiti c where c.scenario_id = s.id and c.stato = 'errore'),
        'bloccati', (select count(*) from compiti c where c.scenario_id = s.id and c.stato = 'bloccato'))
    ) order by s.created_at desc)
    from scenari s where s.magazzino_id = p_magazzino
  ), '[]'::jsonb);
end $$;
