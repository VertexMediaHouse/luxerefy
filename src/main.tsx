import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from './lib/session'
import { writeHooks } from './lib/db'
import { App } from './App'
import './index.css'

const queryClient: QueryClient = new QueryClient({
  // ponytail: every write refetches every query; fine for the mock store, switch to per-key invalidation with Supabase.
  mutationCache: new MutationCache({ onSuccess: () => queryClient.invalidateQueries() }),
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})
writeHooks.after = () => void queryClient.invalidateQueries()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
