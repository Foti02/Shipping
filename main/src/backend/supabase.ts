import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { passwordOk } from '../lib/account';
import { erroreDb } from '../lib/errori';
import type { Backend } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const chiave = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configurato = Boolean(url && chiave);

// createClient lancia con URL vuoto: lo creiamo solo se configurato.
const sb: SupabaseClient = configurato ? createClient(url!, chiave!) : (null as unknown as SupabaseClient);

const email = (username: string) => `${username}@shipping.local`;

// Gli errori di Supabase Auth hanno testi in inglese: li riportiamo ai codici del contratto.
function erroreAuth(message: string): Error {
  if (/invalid login credentials/i.test(message)) return new Error('credenziali_errate');
  if (/already registered|already been registered|database error saving new user/i.test(message)) return new Error('gia_esiste');
  if (/password/i.test(message) && /characters|short|weak/i.test(message)) return new Error('dato_non_valido');
  return new Error(message);
}

const impl: Backend = {
  nonConfigurato: !configurato,
  async rpc<T>(name: string, args: Record<string, unknown> = {}) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw erroreDb(error.message, error.details); // il message e' il codice, es. 'giacenza_insufficiente'; details = DETAIL di Postgres
    return data as T;
  },
  auth: {
    async registra(username, password, nome) {
      const { data, error } = await sb.auth.signUp({ email: email(username), password, options: { data: { username, nome } } });
      if (error) throw erroreAuth(error.message);
      if (!data.session) await impl.auth.accedi(username, password); // se "Confirm email" fosse acceso
    },
    async accedi(username, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email(username), password });
      if (error) throw erroreAuth(error.message);
    },
    async esci() {
      await sb.auth.signOut().catch(() => {}); // dopo l'eliminazione dell'account il server non riconosce piu' il token: la sessione locale si pulisce comunque
    },
    async sessione() {
      const { data } = await sb.auth.getSession();
      return data.session ? { userId: data.session.user.id } : null;
    },
    async cambiaPassword(vecchia, nuova) {
      if (!passwordOk(nuova)) throw new Error('dato_non_valido');
      const { data } = await sb.auth.getUser();
      const mail = data.user?.email;
      if (!mail) throw new Error('non_autenticato');
      // La verifica con signInWithPassword non cambia l'utente: rinnova solo la sessione.
      const { error: e1 } = await sb.auth.signInWithPassword({ email: mail, password: vecchia });
      if (e1) throw erroreAuth(e1.message);
      const { error: e2 } = await sb.auth.updateUser({ password: nuova });
      if (e2) throw erroreAuth(e2.message);
    },
    async creaUtente(username, password, nome) {
      // Secondo client che non salva nulla: l'admin resta collegato come prima.
      const altro = createClient(url!, chiave!, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'shipping-secondario' } });
      const { data, error } = await altro.auth.signUp({ email: email(username), password, options: { data: { username, nome } } });
      if (error) throw erroreAuth(error.message);
      // Con un'email gia' registrata Supabase non da' errore ma ritorna un utente senza identita'.
      if (!data.user || data.user.identities?.length === 0) throw new Error('gia_esiste');
      return { userId: data.user.id };
    },
  },
};

export default impl;
