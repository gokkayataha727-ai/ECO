import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ManagementModalLayoutProps {
  isOpen: boolean
  onClose: () => void
  ariaLabel: string
  kicker: ReactNode
  title: string
  subtitle: string
  closeAriaLabel: string
  leftHeader: ReactNode
  leftList: ReactNode
  rightPanel: ReactNode
  rightPanelKey?: string
}

export function ManagementModalLayout({
  isOpen,
  onClose,
  ariaLabel,
  kicker,
  title,
  subtitle,
  closeAriaLabel,
  leftHeader,
  leftList,
  rightPanel,
  rightPanelKey,
}: ManagementModalLayoutProps) {
  const leftColRef = useRef<HTMLDivElement>(null)
  const rightColRef = useRef<HTMLDivElement>(null)
  const [leftScrolled, setLeftScrolled] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && rightColRef.current) {
      rightColRef.current.scrollTop = 0
    }
  }, [isOpen, rightPanelKey])

  if (!isOpen) return null

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
    >
      <div
        className="modal product-manager"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="section-kicker flex items-center gap-1">{kicker}</p>
            <h2 className="section-title">{title}</h2>
            <p className="muted mt-1">{subtitle}</p>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label={closeAriaLabel}
          >
            <X size={18} />
          </button>
        </div>

        <div className="manager-layout">
          <div
            ref={leftColRef}
            className="manager-list"
            onScroll={(e) => setLeftScrolled(e.currentTarget.scrollTop > 2)}
          >
            <div
              className={`manager-list-sticky ${leftScrolled ? 'is-scrolled' : ''}`}
            >
              {leftHeader}
            </div>
            {leftList}
          </div>
          <div ref={rightColRef} className="product-form">
            {rightPanel}
          </div>
        </div>
      </div>
    </div>
  )
}

