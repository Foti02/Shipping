import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessione } from '../context/sessione';
import { useMutazione } from '../lib/api';
import { Badge, Button, Dialog, EmptyState, Field } from '../ui';

// api_classe_entra / api_classe_crea ritornano il magazzino: accettiamo sia l'oggetto sia il solo id.
const idDi = (r: unknown) => (typeof r === 'string' ? r : (r as { id: string }).id);

export default function SceltaMagazzino() {
  const { magazzini, profilo, ricarica } = useSessione();
  const nav = useNavigate();
  const [codice, setCodice] = useState('');
  const [nuova, setNuova] = useState(false);
  const [nomeClasse, setNomeClasse] = useState('');

  const apri = async (r: unknown) => {
    await ricarica(); // il nuovo magazzino deve comparire nella sessione prima di navigare
    nav(`/m/${idDi(r)}`);
  };
  const entra = useMutazione('api_classe_entra');
  const crea = useMutazione('api_classe_crea');

  const personale = magazzini.filter((m) => m.tipo === 'personale');
  const classi = magazzini.filter((m) => m.tipo === 'classe');
  const docente = profilo?.ruolo_globale === 'docente';

  const inviaCodice = (e: FormEvent) => {
    e.preventDefault();
    entra.mutate({ p_codice: codice.trim().toUpperCase() }, { onSuccess: apri });
  };
  const inviaClasse = (e: FormEvent) => {
    e.preventDefault();
    crea.mutate({ p_nome: nomeClasse.trim() }, { onSuccess: (r) => { setNuova(false); return apri(r); } });
  };

  return (
    <>
      <h1>
        Scegli il magazzino
      </h1>
      <div className="griglia">
        <section className="carta">
          <h2>Il mio magazzino</h2>
          <p className="muto">Tuo, per fare pratica da solo.</p>
          <ul>
            {personale.map((m) => (
              <li key={m.id}>
                <span>{m.nome}</span>
                <Button onClick={() => nav(`/m/${m.id}`)}>Entra</Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="carta">
          <h2>Le mie classi</h2>
          {classi.length === 0 ? (
            <EmptyState titolo="Nessuna classe" testo="Chiedi il codice al docente ed entra qui sotto." />
          ) : (
            <ul>
              {classi.map((m) => (
                <li key={m.id}>
                  <span>
                    {m.nome} {m.ruolo === 'docente' ? <Badge tono="blu">docente</Badge> : m.ruolo_aziendale && <Badge>{m.ruolo_aziendale}</Badge>}
                  </span>
                  <Button onClick={() => nav(`/m/${m.id}`)}>Entra</Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="carta">
          <h2>Entra con codice</h2>
          <form onSubmit={inviaCodice}>
            <Field label="Codice della classe" value={codice} onChange={(e) => setCodice(e.target.value.toUpperCase())} maxLength={6} autoCapitalize="characters" spellCheck={false} />
            <Button type="submit" variante="accento" disabled={codice.trim().length !== 6 || entra.isPending}>
              Entra
            </Button>
          </form>
          {docente && (
            <>
              <hr style={{ border: 0, height: 16 }} />
              <div className="buttons" style={{ margin: 0 }}>
                <Button variante="tenue" onClick={() => setNuova(true)}>
                  Nuova classe
                </Button>
                <Link className="btn btn-tenue" to="/docente">
                  Area docente
                </Link>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog aperto={nuova} titolo="Nuova classe" onChiudi={() => setNuova(false)}>
        <form onSubmit={inviaClasse}>
          <Field label="Nome della classe" value={nomeClasse} onChange={(e) => setNomeClasse(e.target.value)} />
          <div className="dialog-azioni">
            <Button variante="tenue" onClick={() => setNuova(false)}>
              Annulla
            </Button>
            <Button type="submit" variante="accento" disabled={!nomeClasse.trim() || crea.isPending}>
              Crea
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
