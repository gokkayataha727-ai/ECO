import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders overlay/toast content directly under `document.body` so `position: fixed`
 * elements are never trapped by ancestor transforms, animations, or `overflow: hidden`.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  return typeof document !== 'undefined' ? createPortal(children, document.body) : children
}
