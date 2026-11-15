import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// For a GitHub Pages project site, build with VITE_BASE=/<repo-name>/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.VITE_BASE || '/',
    plugins: [react()],
    // host: true lets Codespaces / dev containers forward the port to your browser
    server: { host: true, port: 5173 },
  };
});
