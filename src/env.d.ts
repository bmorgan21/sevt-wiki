/// <reference types="vite/client" />

/** true only when built/run with VITE_BACKEND=mock (see vite.config.ts). Lets production builds drop the mock. */
declare const __USE_MOCK__: boolean;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BACKEND?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
