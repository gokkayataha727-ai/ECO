import type { QuarantineRecord } from './types'

const QUARANTINE_LOG_KEY = 'storage_quarantine_log'

/**
 * Quarantines a corrupted or unparseable raw storage value instead of silently discarding it.
 * Preserves the exact payload in localStorage under a dated key for forensic/recovery purposes.
 */
export function quarantineCorruptPayload(
  originalKey: string,
  rawContent: string,
  reason: string,
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const quarantineKey = `quarantine_${originalKey}_${timestamp}`

  try {
    localStorage.setItem(quarantineKey, rawContent)
  } catch (err) {
    console.error(`Failed to store quarantine payload for ${originalKey}`, err)
  }

  // Update quarantine index
  try {
    const record: QuarantineRecord = {
      key: quarantineKey,
      timestamp: new Date().toISOString(),
      rawLength: rawContent.length,
      error: reason,
      rawPreview: rawContent.slice(0, 150),
    }
    const rawIndex = localStorage.getItem(QUARANTINE_LOG_KEY)
    const records: QuarantineRecord[] = rawIndex ? JSON.parse(rawIndex) : []
    records.unshift(record)
    // Keep last 50 quarantine records
    localStorage.setItem(QUARANTINE_LOG_KEY, JSON.stringify(records.slice(0, 50)))
  } catch {
    // Non-blocking
  }

  console.warn(`[Storage Safety] Quarantined corrupted key "${originalKey}" to "${quarantineKey}". Reason: ${reason}`)
  return quarantineKey
}

/**
 * Lists all quarantined records.
 */
export function getQuarantinedRecords(): QuarantineRecord[] {
  try {
    const raw = localStorage.getItem(QUARANTINE_LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Clears a specific quarantined item once recovered or acknowledged.
 */
export function removeQuarantinedItem(quarantineKey: string): void {
  try {
    localStorage.removeItem(quarantineKey)
    const records = getQuarantinedRecords().filter((r) => r.key !== quarantineKey)
    localStorage.setItem(QUARANTINE_LOG_KEY, JSON.stringify(records))
  } catch {
    // Non-blocking
  }
}

