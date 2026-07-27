import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSupabase } from './lib/supabase.ts'

// The connection is resolved before the first render, so the app never has to
// deal with a half-initialised client.
void initSupabase().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
