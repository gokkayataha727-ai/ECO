import { describe, it, expect, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import {
  GENESIS_LOG_HASH,
  computeActivityLogHash,
  getActivityLogs,
  logActivity,
  verifyActivityLogChain,
  verifyChainAndReport,
  archiveOldActivityLogs,
  getArchivedActivityLogs,
  migrateActivityLogsUsers,
  cleanupSpuriousDiscountLogs,
} from '../../src/lib/activityLog'
import { sha256HexSync } from '../../src/lib/crypto'
import { createFullBackupFile, restoreFromBackup } from '../../src/lib/storage/backup'
import type { ActivityLog } from '../../src/types'

const require = createRequire(import.meta.url)
const sqliteRepo = require('../../electron/db/repository.cjs')

describe('ADIM 6A — Değiştirilemez (Hash Zincirli) Activity Log', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sha256HexSync matches Node native crypto.createHash("sha256") for ASCII and Turkish UTF-8 strings', () => {
    const samples = [
      '',
      'abc',
      'LEMOON KAFE POS - Şğüşıöç İĞÜŞİÖÇ ₺125.50',
      'a'.repeat(1000),
      JSON.stringify(['id-1', '2026-03-15T10:00:00.000Z', 'product_delete', 'Yönetici', 14550]),
    ]

    for (const sample of samples) {
      const expected = crypto.createHash('sha256').update(sample, 'utf8').digest('hex')
      expect(sha256HexSync(sample)).toBe(expected)
    }
  })

  it('Renderer computeActivityLogHash and Electron SQLite computeActivityLogHashCjs produce identical hashes', () => {
    const sampleLog: ActivityLog = {
      id: 'log-test-1',
      createdAt: '2026-04-10T12:30:00.000Z',
      type: 'item_refund',
      userId: 'u-admin',
      userName: 'Ahmet Yılmaz',
      userRole: 'Yönetici',
      tableId: 'masa-4',
      tableName: 'Bahçe 4',
      orderId: 'ord-99',
      productName: 'Filtre Kahve',
      quantity: 2,
      amount: 180.5,
      reason: 'Yanlış sipariş',
      details: '2x Filtre Kahve iade alındı',
      targetType: 'order_item',
      targetId: 'item-1',
      oldValue: '2',
      newValue: '0',
    }

    const rendererHash = computeActivityLogHash(sampleLog, GENESIS_LOG_HASH)
    const sqliteHash = sqliteRepo.computeActivityLogHashCjs(sampleLog, GENESIS_LOG_HASH)

    expect(rendererHash).toBe(sqliteHash)
    expect(rendererHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('builds a valid SHA-256 hash chain from GENESIS_LOG_HASH across multiple critical events', () => {
    const criticalEvents: Array<Omit<ActivityLog, 'id' | 'createdAt'>> = [
      {
        type: 'day_open',
        userName: 'Admin',
        userRole: 'Yönetici',
        details: 'Gün açıldı',
      },
      {
        type: 'product_delete',
        userName: 'Admin',
        userRole: 'Yönetici',
        productName: 'Eski Cheesecake',
        amount: 150,
        details: 'Ürün silindi: Eski Cheesecake',
      },
      {
        type: 'item_discount',
        userName: 'Admin',
        userRole: 'Yönetici',
        tableName: 'Masa 1',
        productName: 'Latte',
        amount: 20,
        details: '%20 ürün indirimi uygulandı',
      },
      {
        type: 'order_discount',
        userName: 'Admin',
        userRole: 'Yönetici',
        tableName: 'Masa 2',
        amount: 50,
        details: 'Adisyon indirimi uygulandı',
      },
      {
        type: 'item_refund',
        userName: 'Admin',
        userRole: 'Yönetici',
        tableName: 'Masa 3',
        productName: 'Çay',
        quantity: 1,
        amount: 30,
        details: '1x Çay iade alındı',
      },
      {
        type: 'table_refund',
        userName: 'Admin',
        userRole: 'Yönetici',
        tableName: 'Masa 5',
        amount: 320,
        details: 'Tam masa iadesi',
      },
      {
        type: 'order_reopen',
        userName: 'Admin',
        userRole: 'Yönetici',
        orderId: 'ord-123',
        tableName: 'Masa 1',
        amount: 250,
        details: 'Kapanmış adisyon geri açıldı',
      },
      {
        type: 'unauthorized_attempt',
        userName: 'Garson Ali',
        userRole: 'Garson',
        details: 'Yetkisiz indirim denemesi engellendi',
      },
      {
        type: 'day_close',
        userName: 'Admin',
        userRole: 'Yönetici',
        details: 'Gün kapatıldı',
      },
    ]

    for (const ev of criticalEvents) {
      logActivity(ev)
    }

    const logs = getActivityLogs()
    expect(logs.length).toBe(criticalEvents.length)

    // Oldest log is at the end of the array (logs.length - 1)
    const oldest = logs[logs.length - 1]
    expect(oldest.prevHash).toBe(GENESIS_LOG_HASH)
    expect(oldest.hash).toBe(computeActivityLogHash(oldest, GENESIS_LOG_HASH))

    // Each newer log's prevHash must equal the immediately older log's hash
    for (let i = logs.length - 2; i >= 0; i--) {
      const older = logs[i + 1]
      const current = logs[i]
      expect(current.prevHash).toBe(older.hash)
      expect(current.hash).toBe(computeActivityLogHash(current, older.hash!))
    }

    const verification = verifyActivityLogChain(logs)
    expect(verification.valid).toBe(true)
    expect(verification.totalChecked).toBe(criticalEvents.length)
    expect(verification.brokenLogId).toBeUndefined()
  })

  it('detects when a record in the chain is MODIFIED and pinpoints the exact record', () => {
    logActivity({ type: 'day_open', userName: 'Admin', details: 'Gün açıldı' })
    logActivity({ type: 'item_refund', userName: 'Admin', amount: 500, details: '500 TL İade' })
    logActivity({ type: 'day_close', userName: 'Admin', details: 'Gün kapandı' })

    const logs = getActivityLogs()
    // logs[1] is the middle record ('item_refund')
    const targetRecordId = logs[1].id

    // Tamper with the amount of the middle record (e.g. attacker changes 500 TL refund to 50 TL)
    const tamperedLogs = logs.map((l, idx) =>
      idx === 1 ? { ...l, amount: 50, details: '50 TL İade' } : l
    )

    const result = verifyActivityLogChain(tamperedLogs)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('hash_mismatch')
    expect(result.brokenLogId).toBe(targetRecordId)
    expect(result.brokenAtIndex).toBe(1)
  })

  it('detects when a record is DELETED from the middle of the chain and pinpoints the break', () => {
    logActivity({ type: 'day_open', userName: 'Admin', details: 'Kayıt 1' })
    logActivity({ type: 'unauthorized_attempt', userName: 'Kasiyer', details: 'Kayıt 2 (Silinecek)' })
    logActivity({ type: 'order_reopen', userName: 'Admin', details: 'Kayıt 3' })
    logActivity({ type: 'day_close', userName: 'Admin', details: 'Kayıt 4' })

    const logs = getActivityLogs()
    // logs order: [Kayıt 4 (0), Kayıt 3 (1), Kayıt 2 (2), Kayıt 1 (3)]
    const recordAfterDeletedId = logs[1].id // Kayıt 3 expects prevHash == Kayıt 2's hash

    // Delete Kayıt 2 (index 2)
    const logsWithDeletedMiddle = logs.filter((_, idx) => idx !== 2)

    const result = verifyActivityLogChain(logsWithDeletedMiddle)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('prev_hash_mismatch')
    expect(result.brokenLogId).toBe(recordAfterDeletedId)
  })

  it('detects when the oldest record is DELETED from the beginning of the chain', () => {
    logActivity({ type: 'day_open', userName: 'Admin', details: 'İlk Kayıt' })
    logActivity({ type: 'product_delete', userName: 'Admin', details: 'İkinci Kayıt' })

    const logs = getActivityLogs()
    const secondRecordId = logs[0].id

    // Remove the oldest record (logs[1])
    const remainingLogs = [logs[0]]

    const result = verifyActivityLogChain(remainingLogs)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('prev_hash_mismatch')
    expect(result.brokenLogId).toBe(secondRecordId)
  })

  it('detects when a forged record is INSERTED into the middle of the chain', () => {
    logActivity({ type: 'day_open', userName: 'Admin', details: 'Kayıt 1' })
    logActivity({ type: 'day_close', userName: 'Admin', details: 'Kayıt 2' })

    const logs = getActivityLogs()
    // logs: [Kayıt 2 (0), Kayıt 1 (1)]
    const forgedRecord: ActivityLog = {
      id: 'forged-middle',
      createdAt: new Date().toISOString(),
      type: 'order_discount',
      userName: 'Admin',
      details: 'Araya eklenen sahte kayıt',
      prevHash: logs[1].hash,
    }
    forgedRecord.hash = computeActivityLogHash(forgedRecord, forgedRecord.prevHash!)

    // Insert forgedRecord between Kayıt 2 and Kayıt 1
    const logsWithInsertedMiddle = [logs[0], forgedRecord, logs[1]]

    const result = verifyActivityLogChain(logsWithInsertedMiddle)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('prev_hash_mismatch')
    // Kayıt 2 (logs[0]) still points to Kayıt 1's hash instead of forgedRecord's hash!
    expect(result.brokenLogId).toBe(logs[0].id)
  })

  it('supports archiving old records while keeping the active chain anchored to the archive last hash', async () => {
    for (let i = 1; i <= 6; i++) {
      logActivity({
        type: 'table_open',
        userName: 'Admin',
        details: `Masa açılış #${i}`,
      })
    }

    const allBefore = getActivityLogs()
    expect(allBefore.length).toBe(6)

    // Keep latest 3, archive oldest 3
    const archiveRes = archiveOldActivityLogs(3)
    expect(archiveRes.archivedCount).toBe(3)
    expect(archiveRes.remainingCount).toBe(4) // 3 kept + 1 log_archive entry
    expect(archiveRes.archiveAnchorHash).toMatch(/^[0-9a-f]{64}$/)

    const activeLogs = getActivityLogs()
    // 3 remaining + 1 'log_archive' audit entry = 4 active logs
    expect(activeLogs.length).toBe(4)
    expect(activeLogs[0].type).toBe('log_archive')

    const archivedLogs = getArchivedActivityLogs()
    expect(archivedLogs.length).toBe(3)

    // Active chain verification must succeed using the stored archive anchor hash
    const check = verifyActivityLogChain(activeLogs)
    expect(check.valid).toBe(true)

    // If someone tampers with the archive anchor hash, verification must fail
    const badAnchorCheck = verifyActivityLogChain(activeLogs, 'f'.repeat(64))
    expect(badAnchorCheck.valid).toBe(false)
    expect(badAnchorCheck.reason).toBe('prev_hash_mismatch')
  })

  it('records backup_restore into the hash chain when restoring from backup and verifies chain report', () => {
    logActivity({ type: 'day_open', userName: 'Admin', details: 'Yedek öncesi kayıt' })
    const snapshot = createFullBackupFile('Test Yedeği')

    const restoreRes = restoreFromBackup(snapshot)
    expect(restoreRes.success).toBe(true)

    const logsAfterRestore = getActivityLogs()
    expect(logsAfterRestore[0].type).toBe('backup_restore')

    const report = verifyChainAndReport({ logIfBroken: false })
    expect(report.valid).toBe(true)
  })

  it('migrateActivityLogsUsers and cleanupSpuriousDiscountLogs never mutate sealed chain records', () => {
    logActivity({
      type: 'order_discount',
      userName: 'LEMOON',
      amount: 0.001,
      details: 'Sealed log record',
    })

    const beforeLogs = getActivityLogs()
    expect(beforeLogs.length).toBe(1)

    migrateActivityLogsUsers([
      {
        id: 'u1',
        username: 'admin',
        fullName: 'LEMOON',
        role: 'admin',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ])
    cleanupSpuriousDiscountLogs()

    const afterLogs = getActivityLogs()
    expect(afterLogs).toEqual(beforeLogs)
    expect(verifyActivityLogChain(afterLogs).valid).toBe(true)
  })
})
