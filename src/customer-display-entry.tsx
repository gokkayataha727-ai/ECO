import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CustomerDisplay } from './components/CustomerDisplay'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerDisplay />
  </StrictMode>,
)
