// Carica un file come allegato di una release di un repo GitHub (quello pubblico dei download).
// fetchFn si puo' sostituire nei test.
const API = 'https://api.github.com';

export async function pubblicaAsset({ repo, token, tag, nomeFile, corpo, fetchFn = fetch }) {
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const leggi = () => fetchFn(`${API}/repos/${repo}/releases/tags/${tag}`, { headers: h });

  let rel = await leggi();
  if (rel.status === 404) {
    const crea = await fetchFn(`${API}/repos/${repo}/releases`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: tag, body: `Installer di Shipping ERP ${tag}` }),
    });
    // se Windows e macOS creano la release insieme, uno dei due riceve un errore: basta rileggerla
    rel = crea.ok ? crea : await leggi();
  }
  if (!rel.ok) throw new Error(`release ${tag} su ${repo}: ${rel.status}`);
  const r = await rel.json();

  // Il file e' grande (200 MB): la connessione puo' cadere ("fetch failed") anche dopo che e' arrivato tutto.
  // Si riprova (max 3 volte, solo per errori di rete o 5xx) e prima di ripartire si guarda se e' gia' li' completo.
  let assets = r.assets ?? [];
  for (let tentativo = 1; ; tentativo++) {
    const vecchio = assets.find((a) => a.name === nomeFile); // rilancio dello stesso tag: sostituisce
    if (vecchio) await fetchFn(`${API}/repos/${repo}/releases/assets/${vecchio.id}`, { method: 'DELETE', headers: h });
    let errore;
    let fatale = false;
    try {
      const su = await fetchFn(`https://uploads.github.com/repos/${repo}/releases/${r.id}/assets?name=${encodeURIComponent(nomeFile)}`, {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/octet-stream' },
        body: corpo,
      });
      if (su.ok) return (await su.json()).browser_download_url;
      errore = new Error(`caricamento di ${nomeFile}: ${su.status} ${(await su.text()).slice(0, 200)}`);
      fatale = su.status < 500;
    } catch (e) {
      errore = e;
    }
    if (fatale) throw errore;
    const riletta = await leggi();
    assets = riletta.ok ? ((await riletta.json()).assets ?? []) : [];
    const arrivato = assets.find((a) => a.name === nomeFile && a.state === 'uploaded' && a.size === corpo.length);
    if (arrivato) return arrivato.browser_download_url;
    if (tentativo >= 3) throw errore;
  }
}
