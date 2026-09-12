import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Detect Tauri environment and activate kiosk mode
if ((window as any).__TAURI_INTERNALS__) {
  document.body.classList.add('kiosk-mode')
  
  // Prevent right-click context menu in kiosk/POS mode
  document.addEventListener('contextmenu', (e) => e.preventDefault())
  
  // Prevent common escape shortcuts in POS mode
  document.addEventListener('keydown', (e) => {
    // Block Alt+F4 (Windows close), Ctrl+W (close tab), F5 (refresh), F11 (fullscreen toggle)
    if (
      (e.altKey && e.key === 'F4') ||
      (e.ctrlKey && e.key === 'w') ||
      e.key === 'F5' ||
      e.key === 'F11'
    ) {
      e.preventDefault()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

