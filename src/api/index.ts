import type { WikiApi } from './types';
import { createMockApi } from './mockApi';
import { createSupabaseApi } from './supabaseApi';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Shown instead of the app when the build has no backend configured. */
export const configError: string | null =
  __USE_MOCK__ || (url && anonKey)
    ? null
    : 'This build has no backend configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (copy .env.example to .env.local), or run "npm run dev:mock".';

// __USE_MOCK__ is a compile-time constant, so production builds contain no mock code or demo data.
export const api: WikiApi = __USE_MOCK__
  ? createMockApi()
  : url && anonKey
    ? createSupabaseApi(url, anonKey)
    : (null as unknown as WikiApi);

export { ApiError, errorMessage } from './errors';
