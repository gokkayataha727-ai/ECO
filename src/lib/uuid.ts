/**
 * Universal UUID generator
 * Compatible with Secure Contexts (HTTPS, localhost) and Non-Secure Contexts (HTTP on LAN IP e.g. 192.168.1.x)
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // Fallback if browser security policy blocks it
    }
  }

  // Cryptographically strong fallback using getRandomValues if available
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 0x0f) | 0x40 // RFC4122 version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC4122 variant
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    } catch {
      // Fallback if getRandomValues fails
    }
  }

  // Math.random RFC4122 v4 fallback for non-secure / legacy environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

