import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
    if (error) throw new Error(error.message); // il message e' il codice, es. 'giacenza_insufficiente'
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
      await sb.auth.signOut();
    },
    async sessione() {
      const { data } = await sb.auth.getSession();
      return data.session ? { userId: data.session.user.id } : null;
    },
  },
};

export default impl;
