/**
 * Currency conversion helpers for SQLite storage.
 * All monetary amounts in SQLite are stored as integer kuruş (1 TL = 100 kuruş).
 */

/**
 * Converts a TL amount (number) to integer kuruş.
 * @param {number | null | undefined} tl
 * @returns {number}
 */
function toKurus(tl) {
  if (tl === null || tl === undefined || typeof tl !== 'number' || !Number.isFinite(tl)) {
    return 0
  }
  return Math.round(tl * 100)
}

/**
 * Converts an integer kuruş amount from SQLite back to TL (number with at most 2 decimals).
 * @param {number | null | undefined} kurus
 * @returns {number}
 */
function fromKurus(kurus) {
  if (kurus === null || kurus === undefined || typeof kurus !== 'number' || !Number.isFinite(kurus)) {
    return 0
  }
  return Math.round(kurus) / 100
}

/**
 * Converts optional TL number to integer kuruş or null if undefined/null.
 * @param {number | null | undefined} tl
 * @returns {number | null}
 */
function toKurusNullable(tl) {
  if (tl === null || tl === undefined || typeof tl !== 'number' || !Number.isFinite(tl)) {
    return null
  }
  return Math.round(tl * 100)
}

/**
 * Converts optional integer kuruş from SQLite back to TL or undefined if null/undefined.
 * @param {number | null | undefined} kurus
 * @returns {number | undefined}
 */
function fromKurusOptional(kurus) {
  if (kurus === null || kurus === undefined || typeof kurus !== 'number' || !Number.isFinite(kurus)) {
    return undefined
  }
  return Math.round(kurus) / 100
}

/**
 * Checks whether a TL value converts to kuruş and back without rounding drift beyond 0.005 TL.
 * @param {number} tl
 * @returns {{ exact: boolean, kurus: number, restoredTl: number, diff: number }}
 */
function checkKurusPrecision(tl) {
  if (typeof tl !== 'number' || !Number.isFinite(tl)) {
    return { exact: true, kurus: 0, restoredTl: 0, diff: 0 }
  }
  const normalizedInput = Math.round(tl * 100) / 100
  const kurus = toKurus(tl)
  const restoredTl = fromKurus(kurus)
  const diff = Math.abs(restoredTl - normalizedInput)
  return {
    exact: diff < 1e-9,
    kurus,
    restoredTl,
    diff,
  }
}

module.exports = {
  toKurus,
  fromKurus,
  toKurusNullable,
  fromKurusOptional,
  checkKurusPrecision,
}
