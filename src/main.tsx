import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthBootstrap } from './features/auth/components/AuthBootstrap'
import { queryClient } from './shared/api/queryClient'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthBootstrap><App /></AuthBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
