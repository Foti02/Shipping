import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend } from '../backend';
import { useToast } from '../ui/Toast';
import { messaggioErrore } from './errori';

// Tutte le chiamate al database passano da useApi / useMutazione: chiave ['api', nome, args].
export const nuovoQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 2000 } } });

interface OpzioniApi {
  /** Ripete la chiamata ogni `poll` millisecondi (notifiche e compiti: 5000). */
  poll?: number;
  enabled?: boolean;
}

/** Lettura: `useApi<Articolo[]>('api_articoli_elenco', { p_magazzino: id })`. */
export function useApi<T = unknown>(nome: string, args: Record<string, unknown> = {}, { poll, enabled = true }: OpzioniApi = {}) {
  return useQuery({
    queryKey: ['api', nome, args],
    queryFn: () => backend.rpc<T>(nome, args),
    refetchInterval: poll,
    enabled,
  });
}

/** Scrittura: `const salva = useMutazione('api_articolo_salva'); salva.mutate({ ... })`.
 *  Dopo il successo invalida tutte le letture; in caso di errore mostra un Toast con il testo italiano. */
export function useMutazione<T = unknown>(nome: string, opzioni: { ok?: string } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (args: Record<string, unknown> = {}) => backend.rpc<T>(nome, args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['api'] });
      if (opzioni.ok) toast(opzioni.ok, 'ok');
    },
    onError: (e) => toast(messaggioErrore(e), 'errore'),
  });
}
