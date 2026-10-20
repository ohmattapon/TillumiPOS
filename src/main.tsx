import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './app/i18n'
import './index.css'
import App from './app/App'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { queryClient } from './lib/query-client'
import { ThemeProvider } from './app/theme'

if (import.meta.env.MODE === 'demo-static') {
  // The showcase has no server: every request must meet the mocks, including the
  // first queries on mount, so the app waits for the worker before it renders.
  // Any other MODE skips this entirely and boots as usual.
  await import('../demo/worker').then((module) => module.startDemoWorker())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
