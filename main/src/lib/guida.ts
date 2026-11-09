/** Rotta della guida (Guida.tsx): `/guida/:sezione?`, con `sezione` = id di un titolo del manuale (public/manuale/indice.json). */
const SEZ = {
  accesso: 'accesso-e-primo-ingresso',
  articoli: 'articoli-carichi-e-scarichi',
  vendita: 'preventivi-ordini-cliente-ddt-e-fatture-di-vendita',
  acquisto: 'ordini-ai-fornitori-e-merce-in-arrivo',
  anagrafiche: 'anagrafiche-dati-azienda-e-agenda',
  inventario: 'inventario',
  analisi: 'analisi-riordino-kpi-e-valorizzazione',
  docente: 'area-docente-classi-ruoli-scenari-e-controllo',
  esercitazione: 'esercitazione-di-gruppo-compiti-scorta-condivisa-e-riordino',
} as const;

/** Tipo di documento (`/m/:id/documenti/:tipo`) -> capitolo. */
const DOCUMENTI: Record<string, string> = {
  preventivo: SEZ.vendita, ordine_cliente: SEZ.vendita, scarico: SEZ.vendita, reso_cliente: SEZ.vendita, fattura_vendita: SEZ.vendita,
  ordine_fornitore: SEZ.acquisto, carico: SEZ.acquisto, fattura_acquisto: SEZ.acquisto,
};

/** Pagina dentro un magazzino (`/m/:id/<pagina>`) -> capitolo. */
const PAGINE: Record<string, string> = {
  articoli: SEZ.articoli, anagrafiche: SEZ.anagrafiche, agenda: SEZ.anagrafiche, inventario: SEZ.inventario, analisi: SEZ.analisi,
  classe: SEZ.docente, compiti: SEZ.esercitazione, attivita: SEZ.esercitazione,
};

/** Percorso (hash router) della guida per la pagina in cui ci si trova. */
export function guidaHref(pathname: string): string {
  const [, radice, id, pagina, tipo] = pathname.split(/[?#]/)[0].split('/');
  let sezione: string | undefined;
  if (radice === undefined || radice === '' || radice === 'accedi') sezione = SEZ.accesso;
  else if (radice === 'docente') sezione = SEZ.docente;
  else if (radice === 'm' && id) sezione = pagina === 'documenti' ? DOCUMENTI[tipo ?? ''] : PAGINE[pagina ?? ''];
  return sezione ? `/guida/${sezione}` : '/guida';
}
