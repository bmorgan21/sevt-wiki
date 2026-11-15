import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ApiError } from './api';
import { AuthProvider } from './state/auth';
import { ToastProvider } from './state/toast';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry answers the server gave us on purpose (not found, forbidden...). Do retry network blips.
      retry: (count, err) => !(err instanceof ApiError) && count < 2,
    },
  },
});

// HashRouter: GitHub Pages has no server-side rewrites, so deep links live after the #.
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
