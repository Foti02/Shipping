// Unisce gli esiti delle costruzioni (uno per piattaforma) al latest.json precedente.
// Se una piattaforma non e' stata costruita (es. il runner macOS non e' disponibile) resta la voce di prima.
export function unisci(precedente, esiti) {
  const out = { windows: precedente?.windows, mac: precedente?.mac };
  for (const e of esiti) {
    out[e.piattaforma] = { versione: e.versione, file: e.file, url: e.url };
  }
  const pulito = Object.fromEntries(Object.entries(out).filter(([, v]) => v));
  return { aggiornato: new Date().toISOString(), ...pulito };
}
