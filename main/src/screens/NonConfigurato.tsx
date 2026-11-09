export default function NonConfigurato() {
  return (
    <main className="pubblica">
      <h1>
        Database non configurato<span className="dot">.</span>
      </h1>
      <p className="lead">Mancano l'indirizzo e la chiave di Supabase, quindi l'app non può collegarsi.</p>
      <section className="panel">
        <h2>Come si risolve</h2>
        <ol>
          <li>
            Copia <code>.env.example</code> in <code>.env.local</code> nella cartella <code>main</code>.
          </li>
          <li>
            In Supabase apri <strong>Project Settings, API</strong> e copia l'URL del progetto e la chiave <code>anon</code>.
          </li>
          <li>Incollali nel file, poi riavvia il server.</li>
        </ol>
        <pre>{`VITE_SUPABASE_URL=https://xxxx.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJ...`}</pre>
        <p className="hint">Nel sito pubblicato i due valori stanno in <code>.env.production</code>. Per provare l'app senza Supabase usa la cartella <code>local-demo</code>.</p>
      </section>
    </main>
  );
}
