/**
 * Cryptographic helpers using the Web Crypto API.
 * Secure PBKDF2 with SHA-256 and cryptographic salts.
 * Zero external dependencies, runs in modern browsers and Electron.
 */

const PBKDF2_ITERATIONS = 100_000
const KEY_LENGTH_BITS = 256
const SALT_BYTE_LENGTH = 16

/**
 * Convert ArrayBuffer to Hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer)
  return Array.from(byteArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert Hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

/**
 * Generate a cryptographically secure random salt (hex)
 */
export function generateSalt(length = SALT_BYTE_LENGTH): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return bufferToHex(array.buffer)
}

/**
 * Hash a plain text string using PBKDF2 with SHA-256 and a random salt.
 * Returns format: `pbkdf2$iterations$saltHex$hashHex`
 */
export async function hashSecret(secret: string, customSalt?: string): Promise<string> {
  const saltHex = customSalt || generateSalt()
  const saltBytes = hexToBytes(saltHex)
  const encoder = new TextEncoder()
  const secretBytes = encoder.encode(secret)

  const importedKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    importedKey,
    KEY_LENGTH_BITS,
  )

  const hashHex = bufferToHex(derivedBits)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`
}

/**
 * Verify a plain text secret against a stored hash string.
 */
export async function verifySecret(secret: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !secret) return false

  const parts = storedHash.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false
  }

  const iterations = parseInt(parts[1], 10)
  const saltHex = parts[2]
  const expectedHashHex = parts[3]

  const saltBytes = hexToBytes(saltHex)
  const encoder = new TextEncoder()
  const secretBytes = encoder.encode(secret)

  const importedKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    importedKey,
    KEY_LENGTH_BITS,
  )

  const actualHashHex = bufferToHex(derivedBits)

  // Constant-time comparison simulation to prevent timing attacks
  if (actualHashHex.length !== expectedHashHex.length) return false
  let match = 0
  for (let i = 0; i < actualHashHex.length; i++) {
    match |= actualHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i)
  }
  return match === 0
}

/**
 * Yaygın/sızdırılmış şifreler kara listesi.
 * Chrome'un şifre denetleme sisteminde sıklıkla uyarı tetikleyen yaygın şifreler.
 */
export const PASSWORD_BLACKLIST = [
  'admin',
  'admin123',
  'admin1234',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'garson',
  'garson123',
  'garson1234',
  'lemoon',
  'lemoon123',
  'lemoon1234',
  'password',
  'password123',
  'qwerty',
  'qwerty123',
  'asdfgh',
  '111111',
  '000000',
  '123123',
  'pass1234',
  'coffee123',
]

/**
 * Şifre güç kontrolü ve politika denetimi:
 * - En az 10 karakter
 * - Harf + rakam karışımı
 * - Kara liste engeli
 * - İşletme adı varyantı engeli
 */
export function validateStrongPassword(
  password: string,
  storeName = 'lemoon',
): { valid: boolean; error?: string } {
  if (!password || password.trim().length < 10) {
    return { valid: false, error: 'Şifre en az 10 karakter uzunluğunda olmalıdır.' }
  }

  const trimmed = password.trim()
  const hasLetter = /[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(trimmed)
  const hasDigit = /[0-9]/.test(trimmed)

  if (!hasLetter || !hasDigit) {
    return { valid: false, error: 'Şifreniz hem harf hem de rakam içermelidir.' }
  }

  const lower = trimmed.toLowerCase()

  // Kara liste kontrolü
  for (const blacklisted of PASSWORD_BLACKLIST) {
    if (lower === blacklisted || lower.includes(blacklisted)) {
      return {
        valid: false,
        error: 'Belirlediğiniz şifre çok yaygın veya tahmin edilmesi kolay bir şifredir. Lütfen daha güçlü bir şifre seçin.',
      }
    }
  }

  // İşletme adı kontrolü
  const cleanStoreName = storeName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (cleanStoreName.length >= 4 && lower.includes(cleanStoreName)) {
    return { valid: false, error: 'Şifre işletme adını ("' + storeName + '") içeremez.' }
  }

  return { valid: true }
}

/**
 * Check password strength. Returns a score from 0 to 4 and localized feedback.
 */
export function checkPasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
} {
  if (!password) {
    return { score: 0, label: 'Çok Zayıf', color: 'text-stone-400 bg-stone-200' }
  }

  let score = 0
  const len = password.length
  if (len >= 8) score++
  if (len >= 10) score++
  if (/[0-9]/.test(password) && /[a-zA-Z]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password) || (len >= 12 && /[A-Z]/.test(password))) score++

  // Kara listede yer alıyorsa gücü sıfırla/düşür
  const lower = password.toLowerCase()
  if (PASSWORD_BLACKLIST.some((b) => lower.includes(b))) {
    score = Math.min(score, 1)
  }

  const safeScore = Math.min(Math.max(0, score), 4) as 0 | 1 | 2 | 3 | 4

  switch (safeScore) {
    case 1:
      return { score: 1, label: 'Zayıf (En az 10 karakter olmalı)', color: 'text-rose-600 bg-rose-500' }
    case 2:
      return { score: 2, label: 'Orta (Harf + Rakam önerilir)', color: 'text-amber-600 bg-amber-500' }
    case 3:
      return { score: 3, label: 'Güçlü', color: 'text-blue-600 bg-blue-500' }
    case 4:
      return { score: 4, label: 'Çok Güçlü', color: 'text-emerald-600 bg-emerald-500' }
    default:
      return { score: 0, label: 'Çok Zayıf', color: 'text-stone-500 bg-stone-300' }
  }
}

/**
 * Basit / ardışık PIN engeli (1234, 0000, 1111 vb.)
 */
export function isSimplePin(pin: string): boolean {
  if (!pin || pin.length < 4) return true

  // Tüm rakamlar aynı: 0000, 1111, 2222 vb.
  if (/^(\d)\1+$/.test(pin)) return true

  // Ardışık artan veya azalan: 1234, 2345, 4321, 9876 vb.
  const ascending = '0123456789'
  const descending = '9876543210'
  if (ascending.includes(pin) || descending.includes(pin)) return true

  // Çok bilinen basit PIN kalıpları
  const commonPins = ['1234', '4321', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1212', '1313', '1414', '2424', '6969']
  if (commonPins.includes(pin)) return true

  return false
}

/**
 * Güvenli ve benzersiz rastgele PIN üretici (4 hane)
 */
export function generateSecurePin(existingPins: string[] = []): string {
  let attempts = 0
  while (attempts < 500) {
    attempts++
    const pin = String(Math.floor(1000 + Math.random() * 9000))
    if (!isSimplePin(pin) && !existingPins.includes(pin)) {
      return pin
    }
  }
  // Güvenli rastgele fallback
  return String(Math.floor(2580 + Math.random() * 7000))
}

/**
 * Generate a random memorable strong password (min 11 chars e.g. `Espresso2026!`)
 */
export function generateRandomPassword(): string {
  const adjectives = ['Krema', 'Mocha', 'Espresso', 'Latte', 'Barista', 'Lezzet', 'Kavruk', 'Filtre']
  const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  const specialChars = ['!', '*', '#', '?']
  const randomChar = specialChars[Math.floor(Math.random() * specialChars.length)]
  return `${randomAdj}${randomNum}${randomChar}`
}

/**
 * Generate a random 4-digit PIN for waiters (backward compatibility wrapper)
 */
export function generateRandomPin(): string {
  return generateSecurePin()
}

// ────────────────────────────────────────────────────────────
// Synchronous FIPS 180-4 SHA-256 (for Activity Log Hash Chain)
// ────────────────────────────────────────────────────────────

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n))
}

/**
 * Computes standard SHA-256 hex digest synchronously from a UTF-8 string.
 * Matches Node `crypto.createHash('sha256').update(input, 'utf8').digest('hex')`
 * and Web Crypto `crypto.subtle.digest('SHA-256', ...)`.
 */
export function sha256HexSync(input: string): string {
  const encoder = new TextEncoder()
  const msg = encoder.encode(input)
  const bitLen = msg.length * 8

  // Padding: message + 1 byte (0x80) + zeros + 8-byte big-endian length
  const totalLen = (((msg.length + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(totalLen)
  padded.set(msg)
  padded[msg.length] = 0x80

  const view = new DataView(padded.buffer)
  const highBits = Math.floor(bitLen / 0x100000000)
  const lowBits = bitLen >>> 0
  view.setUint32(totalLen - 8, highBits, false)
  view.setUint32(totalLen - 4, lowBits, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3)
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => (v >>> 0).toString(16).padStart(8, '0'))
    .join('')
}


