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

  const vecchio = (r.assets ?? []).find((a) => a.name === nomeFile); // rilancio dello stesso tag: sostituisce
  if (vecchio) await fetchFn(`${API}/repos/${repo}/releases/assets/${vecchio.id}`, { method: 'DELETE', headers: h });

  const su = await fetchFn(`https://uploads.github.com/repos/${repo}/releases/${r.id}/assets?name=${encodeURIComponent(nomeFile)}`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/octet-stream' },
    body: corpo,
  });
  if (!su.ok) throw new Error(`caricamento di ${nomeFile}: ${su.status} ${(await su.text()).slice(0, 200)}`);
  return (await su.json()).browser_download_url;
}
