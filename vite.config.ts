import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// For a GitHub Pages project site, build with VITE_BASE=/<repo-name>/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.VITE_BASE || '/',
    plugins: [react()],
    // true only for `npm run dev:mock` (mode "mock"): production builds drop the mock and its demo data.
    define: { __USE_MOCK__: JSON.stringify(env.VITE_BACKEND === 'mock') },
    // host: true lets Codespaces / dev containers forward the port to your browser
    server: { host: true, port: 5173 },
  };
});
