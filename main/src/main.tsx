import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { SessioneProvider } from './context/sessione';
import { nuovoQueryClient } from './lib/api';
import { ToastProvider } from './ui';
import './style.css';

const queryClient = nuovoQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HashRouter>
          <SessioneProvider>
            <App />
          </SessioneProvider>
        </HashRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
