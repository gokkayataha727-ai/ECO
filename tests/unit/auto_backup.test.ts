import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createRequire } from 'module'
import {
  createFullBackupFile,
  triggerAutomatedBackup,
  listDiskBackups,
  readDiskBackupForRestore,
  restoreFromBackup,
  getPreRestoreBackup,
} from '../../src/lib/storage/backup'
import { computeChecksum } from '../../src/lib/storage/checksum'
import {
  saveTablesSafe,
  saveCompletedOrdersSafe,
  saveSettingsSafe,
  getTablesSafe,
  clearInMemoryCache,
} from '../../src/lib/storage/repository'
import {
  createMockTable,
  createMockOrder,
  createMockSettings,
} from '../fixtures/factories'

const require = createRequire(import.meta.url)
const backupManager = require('../../electron/backupManager.cjs')

describe('D. Automated Dual-Location Backup & Retention Suite', () => {
  let tempRoot: string
  let primaryDir: string
  let secondaryDir: string

  beforeEach(() => {
    localStorage.clear()
    clearInMemoryCache()
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lemoon-backup-test-'))
    primaryDir = path.join(tempRoot, 'LemoonYedek')
    secondaryDir = path.join(tempRoot, 'USB_Yedek')
  })

  afterEach(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } catch {}
    delete (window as any).electronAPI
    vi.restoreAllMocks()
  })

  it('D.1: Checksum parity between renderer checksum.ts and main process backupManager.cjs', () => {
    const sample = JSON.stringify({ tables: [{ id: 't1', name: 'Bahçe 1' }], total: 125.5 })
    const rendererHash = computeChecksum(sample)
    const mainHash = backupManager.computeChecksum(sample)
    expect(mainHash).toBe(rendererHash)
    expect(backupManager.verifyChecksum(sample, rendererHash)).toBe(true)
    expect(backupManager.verifyChecksum(sample, '0000000000000000')).toBe(false)
  })

  it('D.2: Atomic write (.tmp -> fsync -> rename) and read-back verification', () => {
    saveTablesSafe([createMockTable({ name: 'Masa Atomik' })])
    const backup = createFullBackupFile('Atomik test')

    const fsyncSpy = vi.spyOn(fs, 'fsyncSync')
    const renameSpy = vi.spyOn(fs, 'renameSync')

    const now = new Date(2026, 10, 11, 14, 0, 0) // 2026-11-11 14:00:00
    const res = backupManager.performBackupWrite(
      {
        backup,
        type: 'saatlik',
        primaryDir,
        now,
      },
      fs,
    )

    expect(res.success).toBe(true)
    expect(res.fileName).toBe('lemoon-20261111-140000-saatlik.json')
    expect(fs.existsSync(res.filePath)).toBe(true)
    // .tmp file must not remain after rename
    expect(fs.existsSync(`${res.filePath}.tmp`)).toBe(false)
    expect(fsyncSpy).toHaveBeenCalled()
    expect(renameSpy).toHaveBeenCalled()

    // Read-back verification: file on disk is valid and matches checksum
    const readRes = backupManager.readBackupForRestore(primaryDir, res.fileName, fs)
    expect(readRes.success).toBe(true)
    expect(readRes.backup.checksum).toBe(backup.checksum)
  })

  it('D.3: Retention policy keeps last 48h of hourly backups and last 30d of daily backups, deleting older ones', () => {
    const backup = createFullBackupFile('Saklama politikası testi')
    const baseNow = new Date(2026, 10, 11, 18, 0, 0) // 2026-11-11 18:00:00

    // 1) Create hourly backups:
    // - 1 hour ago (keep)
    // - 24 hours ago (keep)
    // - 47 hours ago (keep)
    // - 49 hours ago (MUST DELETE - older than 48h)
    // - 72 hours ago (MUST DELETE - older than 48h)
    const hourlyOffsetsHours = [1, 24, 47, 49, 72]
    for (const h of hourlyOffsetsHours) {
      const d = new Date(baseNow.getTime() - h * 60 * 60 * 1000)
      const fileName = backupManager.formatBackupFilename(d, 'saatlik')
      backupManager.writeBackupFileAtomic(primaryDir, fileName, backup, fs)
    }

    // 2) Create daily backups:
    // - 1 day ago (keep)
    // - 15 days ago (keep)
    // - 29 days ago (keep)
    // - 31 days ago (MUST DELETE - older than 30d)
    // - 45 days ago (MUST DELETE - older than 30d)
    const dailyOffsetsDays = [1, 15, 29, 31, 45]
    for (const days of dailyOffsetsDays) {
      const d = new Date(baseNow.getTime() - days * 24 * 60 * 60 * 1000)
      const fileName = backupManager.formatBackupFilename(d, 'gunluk')
      backupManager.writeBackupFileAtomic(primaryDir, fileName, backup, fs)
    }

    // Apply retention policy at baseNow
    const deleted = backupManager.applyRetentionPolicy(primaryDir, { now: baseNow }, fs)
    expect(deleted.length).toBe(4) // 2 expired hourly + 2 expired daily

    const listRes = backupManager.listBackupsInDir(primaryDir, fs)
    expect(listRes.success).toBe(true)

    const remainingHourly = listRes.backups.filter((b: any) => b.type === 'saatlik')
    const remainingDaily = listRes.backups.filter((b: any) => b.type === 'gunluk')

    expect(remainingHourly).toHaveLength(3)
    expect(remainingDaily).toHaveLength(3)
  })

  it('D.4: Corrupt backup detection in main process (write rejection & tampered disk file detection)', () => {
    const validBackup = createFullBackupFile('Bozuk yedek testi')

    // Case 1: Tampered checksum sent over IPC to backup:write is rejected
    const tamperedBackup = {
      ...validBackup,
      checksum: 'deadbeefdeadbeef',
    }
    const writeRes = backupManager.performBackupWrite(
      {
        backup: tamperedBackup,
        type: 'manuel',
        primaryDir,
      },
      fs,
    )
    expect(writeRes.success).toBe(false)
    expect(writeRes.error).toContain('checksum')

    // Case 2: Valid backup written to disk, then corrupted on disk before restore-read
    const goodWrite = backupManager.performBackupWrite(
      {
        backup: validBackup,
        type: 'manuel',
        primaryDir,
      },
      fs,
    )
    expect(goodWrite.success).toBe(true)

    // Corrupt the file on disk (modify data without updating checksum)
    const rawOnDisk = JSON.parse(fs.readFileSync(goodWrite.filePath, 'utf8'))
    rawOnDisk.data.tables = [{ id: 'hacked', name: 'Hacked Table', status: 'empty', cart: [] }]
    fs.writeFileSync(goodWrite.filePath, JSON.stringify(rawOnDisk), 'utf8')

    const restoreReadRes = backupManager.readBackupForRestore(primaryDir, goodWrite.fileName, fs)
    expect(restoreReadRes.success).toBe(false)
    expect(restoreReadRes.error).toContain('checksum')

    // Case 3: Path traversal attempt in restore-read is blocked
    const traversalRes = backupManager.readBackupForRestore(primaryDir, '../outside.json', fs)
    expect(traversalRes.success).toBe(false)
  })

  it('D.5: Dual-location backup copies to secondary folder when accessible, and continues with warning when USB/secondary folder is unreachable', async () => {
    saveTablesSafe([createMockTable({ name: 'Masa İki Konumlu' })])
    saveCompletedOrdersSafe([createMockOrder({ orderNumber: 'DUAL-101' })])

    // Scenario A: Both primary and secondary folders are accessible
    const backup = createFullBackupFile('İki konumlu yedek')
    const resBoth = backupManager.performBackupWrite(
      {
        backup,
        type: 'saatlik',
        primaryDir,
        secondaryDir,
      },
      fs,
    )
    expect(resBoth.success).toBe(true)
    expect(resBoth.secondaryCopied).toBe(true)
    expect(resBoth.secondaryWarning).toBeUndefined()
    expect(fs.existsSync(resBoth.filePath)).toBe(true)
    expect(fs.existsSync(resBoth.secondaryFilePath)).toBe(true)

    // Scenario B: Secondary folder is inaccessible (e.g. unplugged USB drive or permission/IO error)
    // Simulate a file at the path where secondary directory expects a directory (causes ENOTDIR/EEXIST error)
    const brokenSecondaryPath = path.join(tempRoot, 'unplugged_usb_file')
    fs.writeFileSync(brokenSecondaryPath, 'not-a-directory', 'utf8')

    const resUnreachable = backupManager.performBackupWrite(
      {
        backup,
        type: 'gunluk',
        primaryDir,
        secondaryDir: path.join(brokenSecondaryPath, 'LemoonYedek'),
      },
      fs,
    )

    // Primary backup MUST succeed and application flow MUST NOT fail
    expect(resUnreachable.success).toBe(true)
    expect(fs.existsSync(resUnreachable.filePath)).toBe(true)
    expect(resUnreachable.secondaryCopied).toBe(false)
    expect(resUnreachable.secondaryWarning).toBeDefined()
    expect(resUnreachable.secondaryWarning).toContain('İkinci yedek klasörüne')

    // Scenario C: End-to-end renderer triggerAutomatedBackup emits pos-backup-warning without throwing
    saveSettingsSafe(
      createMockSettings({
        secondaryBackupDir: path.join(brokenSecondaryPath, 'LemoonYedek'),
      }),
    )

    ;(window as any).electronAPI = {
      backupWrite: (payload: any) =>
        Promise.resolve(
          backupManager.performBackupWrite(
            {
              ...payload,
              primaryDir,
            },
            fs,
          ),
        ),
      backupList: () => Promise.resolve(backupManager.listBackupsInDir(primaryDir, fs)),
      backupRestoreRead: (fileName: string) =>
        Promise.resolve(backupManager.readBackupForRestore(primaryDir, fileName, fs)),
    }

    const warningEvents: string[] = []
    const onWarning = (e: Event) => {
      const ce = e as CustomEvent
      warningEvents.push(ce.detail?.warning)
    }
    window.addEventListener('pos-backup-warning', onWarning)

    const ipcWriteRes = await triggerAutomatedBackup('manuel')
    expect(ipcWriteRes.success).toBe(true)
    expect(ipcWriteRes.secondaryCopied).toBe(false)
    expect(warningEvents).toHaveLength(1)

    window.removeEventListener('pos-backup-warning', onWarning)

    // Verify listDiskBackups & readDiskBackupForRestore + pre-restore snapshot flow
    const listResult = await listDiskBackups()
    expect(listResult.success).toBe(true)
    expect(listResult.backups.length).toBeGreaterThanOrEqual(3)

    // Mutate current state, then restore from disk backup and verify pre-restore snapshot is created
    saveTablesSafe([createMockTable({ name: 'Geçici Masa' })])
    const readForRestore = await readDiskBackupForRestore(ipcWriteRes.fileName!)
    expect(readForRestore.success).toBe(true)
    expect(readForRestore.backup).toBeDefined()

    const restoreRes = restoreFromBackup(readForRestore.backup)
    expect(restoreRes.success).toBe(true)
    expect(getTablesSafe().some((t) => t.name === 'Masa İki Konumlu')).toBe(true)
    expect(getPreRestoreBackup()?.data.tables.some((t) => t.name === 'Geçici Masa')).toBe(true)
  })
})
