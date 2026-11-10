import { useState } from 'react';
import { formattaNome, usernameDa, validaNominativo, type ErroriNominativo } from '../lib/nomi';
import { Field } from '../ui';

/** Stato dei tre campi: nome e cognome compilano da soli il nome account (nome_cognome) finche' non lo si modifica a mano. */
export function useNominativo() {
  const [nome, setNomeVal] = useState('');
  const [cognome, setCognomeVal] = useState('');
  const [username, setUsernameVal] = useState('');
  const [manuale, setManuale] = useState(false);
  const [errori, setErrori] = useState<ErroriNominativo>({});

  const aggiorna = (n: string, c: string) => {
    setNomeVal(n);
    setCognomeVal(c);
    if (!manuale) setUsernameVal(usernameDa(n, c));
  };
  return {
    nome, cognome, username, errori,
    setNome: (n: string) => aggiorna(n, cognome),
    setCognome: (c: string) => aggiorna(nome, c),
    setUsername: (u: string) => { setManuale(true); setUsernameVal(u.toLowerCase()); },
    /** Nominativo da salvare ("Mario Rossi"). */
    nominativo: () => `${formattaNome(nome)} ${formattaNome(cognome)}`,
    /** Controlla i campi e mostra gli errori; vero se tutto ok. */
    controlla: () => {
      const e = validaNominativo(nome, cognome, username);
      setErrori(e);
      return !e.nome && !e.cognome && !e.username;
    },
    azzera: () => { setNomeVal(''); setCognomeVal(''); setUsernameVal(''); setManuale(false); setErrori({}); },
    setErrori,
  };
}

export function CampiNominativo({ v }: { v: ReturnType<typeof useNominativo> }) {
  return (
    <>
      <Field label="Nome" value={v.nome} onChange={(e) => v.setNome(e.target.value)} errore={v.errori.nome} maxLength={30} autoComplete="given-name" />
      <Field label="Cognome" value={v.cognome} onChange={(e) => v.setCognome(e.target.value)} errore={v.errori.cognome} maxLength={30} autoComplete="family-name" />
      <Field
        label="Nome account"
        value={v.username}
        onChange={(e) => v.setUsername(e.target.value)}
        errore={v.errori.username}
        nota="Si compila da solo come nome_cognome. Se esiste già un omonimo, aggiungi un numero (mario_rossi2)."
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
      />
    </>
  );
}
