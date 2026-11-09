import impl from '@backend-impl';
import type { Backend } from './types';

// L'interfaccia importa sempre da qui, mai da supabase.ts o da PGlite.
export const backend: Backend = impl;
export type { Backend } from './types';
