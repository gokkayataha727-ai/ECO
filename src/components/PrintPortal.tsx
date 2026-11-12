import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PrintPortalProps {
  children: ReactNode
}

/**
 * PrintPortal renders printable documents directly into a dedicated root-level
 * DOM element (#print-portal) outside the main React root (#root).
 *
 * This completely isolates printable views from screen wrappers, modal overlays,
 * and overflow-hidden scroll containers, enabling seamless multi-page A4 printing
 * and native browser pagination (avoiding single-page truncation).
 */
export function PrintPortal({ children }: PrintPortalProps) {
  const [container] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null
    let el = document.getElementById('print-portal')
    if (!el) {
      el = document.createElement('div')
      el.id = 'print-portal'
      document.body.appendChild(el)
    }
    return el
  })

  useEffect(() => {
    const handleBeforePrint = () => {
      document.body.classList.add('is-printing-portal')
    }
    const handleAfterPrint = () => {
      document.body.classList.remove('is-printing-portal')
    }

    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
      document.body.classList.remove('is-printing-portal')
    }
  }, [container])

  if (!container) return null
  return createPortal(children, container)
}
