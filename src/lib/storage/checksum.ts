/**
 * Deterministic checksum utility for backup payloads.
 * Implements a 64-bit FNV-1a hash algorithm combined with Murmur-like mixing.
 * Works synchronously and identically across Node, Vitest, Electron, and browser environments.
 */
export function computeChecksum(content: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0xcbf29ce4

  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i)
    h1 ^= ch
    h1 = Math.imul(h1, 0x01000193)

    h2 ^= ch
    h2 = Math.imul(h2, 0x01000193)
    h2 = (h2 << 5) | (h2 >>> 27)
  }

  // Final avalanche mixing
  h1 ^= h2 >>> 16
  h1 = Math.imul(h1, 0x85ebca6b)
  h1 ^= h1 >>> 13
  h1 = Math.imul(h1, 0xc2b2ae35)
  h1 ^= h1 >>> 16

  h2 ^= h1 >>> 16
  h2 = Math.imul(h2, 0x85ebca6b)
  h2 ^= h2 >>> 13
  h2 = Math.imul(h2, 0xc2b2ae35)
  h2 ^= h2 >>> 16

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0')
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0')
  return `${hex1}${hex2}`
}

/**
 * Validates whether the checksum matches the content.
 */
export function verifyChecksum(content: string, expectedChecksum: string): boolean {
  if (!content || !expectedChecksum) return false
  const actual = computeChecksum(content)
  return actual.toLowerCase() === expectedChecksum.trim().toLowerCase()
}

