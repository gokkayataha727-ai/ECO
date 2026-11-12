import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import {
  evaluateSystemHealth,
  detectClockDrift,
  redactSensitiveText,
  type SystemHealthInput,
} from '../../src/lib/systemHealth'

const require = createRequire(import.meta.url)
const loggerMod = require('../../electron/logger.cjs')
const crashRecoveryMod = require('../../electron/crashRecovery.cjs')

describe('ADIM 5 — Sistem Sağlık Göstergesi, Dosya Logu ve Çökme Toparlama', () => {
  const baseNow = new Date('2026-05-10T14:00:00.000Z').getTime()

  const healthyInput: SystemHealthInput = {
    nowMs: baseNow,
    lastBackupAt: new Date(baseNow - 2 * 60 * 60 * 1000).toISOString(), // 2 saat önce
    dbSizeBytes: 12 * 1024 * 1024, // 12 MB
    freeDiskBytes: 50 * 1024 * 1024 * 1024, // 50 GB
    totalDiskBytes: 100 * 1024 * 1024 * 1024, // 100 GB (%50 boş)
    lastWriteError: null,
    secondaryBackupDir: 'D:\\Yedekler',
    secondaryDirAccessible: true,
    secondaryBackupWarning: null,
    clockDriftDetected: false,
    logChainValid: true,
  }

  describe('5.3 Sistem Sağlık Durumu Hesaplama (evaluateSystemHealth)', () => {
    it('returns overall green when all 6 health indicators are healthy', () => {
      const report = evaluateSystemHealth(healthyInput)
      expect(report.overallStatus).toBe('green')
      expect(report.items).toHaveLength(6)
      expect(report.items.every((item) => item.status === 'green')).toBe(true)
    })

    it('turns RED when last backup is older than 24 hours', () => {
      const report = evaluateSystemHealth({
        ...healthyInput,
        lastBackupAt: new Date(baseNow - 26 * 60 * 60 * 1000).toISOString(), // 26 saat önce
      })
      expect(report.checks.backupRecency.status).toBe('red')
      expect(report.overallStatus).toBe('red')
    })

    it('turns YELLOW when free disk space drops below 10%', () => {
      const report = evaluateSystemHealth({
        ...healthyInput,
        freeDiskBytes: 8 * 1024 * 1024 * 1024, // 8 GB / 100 GB = %8
        totalDiskBytes: 100 * 1024 * 1024 * 1024,
      })
      expect(report.checks.diskAndDb.status).toBe('yellow')
      expect(report.overallStatus).toBe('yellow')
    })

    it('turns RED when there is a recent database/storage write error', () => {
      const report = evaluateSystemHealth({
        ...healthyInput,
        lastWriteError: 'SQLITE_FULL: database or disk is full',
      })
      expect(report.checks.writeError.status).toBe('red')
      expect(report.overallStatus).toBe('red')
    })

    it('turns YELLOW when secondary backup directory is configured but inaccessible', () => {
      const report = evaluateSystemHealth({
        ...healthyInput,
        secondaryBackupDir: 'E:\\USB_Yedek',
        secondaryDirAccessible: false,
      })
      expect(report.checks.secondaryBackupDir.status).toBe('yellow')
      expect(report.overallStatus).toBe('yellow')
    })

    it('detects clock drift when system clock is behind latest recorded timestamp and marks YELLOW', () => {
      const futureRecordIso = new Date(baseNow + 45 * 60 * 1000).toISOString() // 45 dk ileride
      const drift = detectClockDrift({
        nowMs: baseNow,
        latestKnownTimestamps: [futureRecordIso],
      })
      expect(drift.driftDetected).toBe(true)

      const report = evaluateSystemHealth({
        ...healthyInput,
        clockDriftDetected: drift.driftDetected,
        clockDriftMessage: drift.message,
      })
      expect(report.checks.clockDrift.status).toBe('yellow')
      expect(report.overallStatus).toBe('yellow')
    })

    it('turns RED when activity log hash chain is broken (Adım 6A integration)', () => {
      const report = evaluateSystemHealth({
        ...healthyInput,
        logChainValid: false,
        logChainBrokenRecordId: 'log-tampered-99',
      })
      expect(report.checks.logIntegrity.status).toBe('red')
      expect(report.checks.logIntegrity.detail).toContain('log-tampered-99')
      expect(report.overallStatus).toBe('red')
    })
  })

  describe('5.2 Dosya Tabanlı Hata Logu, Döngüsel Kayıt ve Hassas Veri Gizleme', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemoon-logger-test-'))
    })

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {}
    })

    it('never logs passwords, PINs, or PBKDF2 hashes in file logs or renderer text redaction', () => {
      const writeRes = loggerMod.writeLogEntry(
        {
          level: 'error',
          category: 'AUTH_FAILURE',
          message: 'Kullanıcı giriş hatası password=MySecretPass123! pin: 4829',
          meta: {
            username: 'kasiyer1',
            password: 'SuperSecretPassword',
            pin: '1234',
            passwordHash: 'pbkdf2$120000$abcdef123456$9876543210abcdef',
            pinHash: 'pbkdf2$120000$11223344$55667788',
            adminPassword: 'secret-exit-password',
          },
        },
        { logsDir: tempDir }
      )

      expect(writeRes.success).toBe(true)
      const content = fs.readFileSync(writeRes.logPath, 'utf8')
      expect(content).toContain('AUTH_FAILURE')
      expect(content).toContain('kasiyer1')
      expect(content).not.toContain('MySecretPass123!')
      expect(content).not.toContain('SuperSecretPassword')
      expect(content).not.toContain('4829')
      expect(content).not.toContain('pbkdf2$120000')
      expect(content).not.toContain('secret-exit-password')
      expect(content).toContain('[REDACTED]')

      const rendererSample = redactSensitiveText(
        'Hata: {"password":"gizli","pin":"9999","hash":"pbkdf2$1000$aa$bb"}'
      )
      expect(rendererSample).not.toContain('gizli')
      expect(rendererSample).not.toContain('9999')
      expect(rendererSample).not.toContain('pbkdf2$1000')
    })

    it('rotates log files and keeps at most maxFiles (10) files, and exports a valid .zip bundle', () => {
      for (let i = 0; i < 60; i++) {
        loggerMod.writeLogEntry(
          {
            level: 'info',
            category: 'ROTATION_TEST',
            message: `Test log satırı numarası #${i} - ${'X'.repeat(80)}`,
          },
          {
            logsDir: tempDir,
            maxFileSizeBytes: 512, // 512 bytes for fast rotation test
            maxFiles: 10,
          }
        )
      }

      const files = loggerMod.listLogFiles({ logsDir: tempDir })
      expect(files.length).toBeGreaterThan(1)
      expect(files.length).toBeLessThanOrEqual(10)

      const bundle = loggerMod.createLogsZipBundle({ logsDir: tempDir })
      expect(bundle.fileCount).toBe(files.length)
      expect(Buffer.isBuffer(bundle.zipBuffer)).toBe(true)
      // PK\x03\x04 local file header signature
      expect(bundle.zipBuffer[0]).toBe(0x50)
      expect(bundle.zipBuffer[1]).toBe(0x4b)
    })
  })

  describe('5.1 Çökme Toparlama (Crash Recovery Manager)', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemoon-crash-test-'))
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {}
    })

    it('auto-reloads renderer within 1.5s on first 2 crashes and shows error screen on 3rd consecutive crash', () => {
      const manager = crashRecoveryMod.createCrashRecoveryManager({
        userDataDir: tempDir,
        reloadDelayMs: 1500,
        maxConsecutiveCrashes: 3,
      })

      const listeners: Record<string, Function> = {}
      const mockWin = {
        isDestroyed: () => false,
        reload: vi.fn(),
        loadURL: vi.fn(() => Promise.resolve()),
        webContents: {
          on: (event: string, cb: Function) => {
            listeners[event] = cb
          },
        },
      }

      manager.attachToWindow(mockWin)

      // 1st crash -> reloads after 1500ms
      listeners['render-process-gone']({}, { reason: 'crashed', exitCode: 1 })
      vi.advanceTimersByTime(1500)
      expect(mockWin.reload).toHaveBeenCalledTimes(1)
      expect(mockWin.loadURL).not.toHaveBeenCalled()

      // 2nd crash -> reloads after 1500ms
      listeners['render-process-gone']({}, { reason: 'oom', exitCode: 2 })
      vi.advanceTimersByTime(1500)
      expect(mockWin.reload).toHaveBeenCalledTimes(2)
      expect(mockWin.loadURL).not.toHaveBeenCalled()

      // 3rd consecutive crash -> stops reloading and displays friendly error screen
      listeners['render-process-gone']({}, { reason: 'crashed', exitCode: 1 })
      vi.advanceTimersByTime(1500)
      expect(mockWin.reload).toHaveBeenCalledTimes(2) // Not incremented!
      expect(mockWin.loadURL).toHaveBeenCalledTimes(1)
      expect(String(mockWin.loadURL.mock.calls[0][0])).toContain('data:text/html;charset=utf-8,')
    })

    it('detects dirty shutdown on startup, runs database integrity check, and sets recovery message', () => {
      // First session starts and crashes without markCleanShutdown()
      const firstSession = crashRecoveryMod.createCrashRecoveryManager({
        userDataDir: tempDir,
      })
      firstSession.initializeSession(null)

      // Second session starts after unexpected shutdown
      let integrityChecked = false
      const mockDb = {
        pragma: (stmt: string) => {
          if (stmt === 'integrity_check') {
            integrityChecked = true
            return [{ integrity_check: 'ok' }]
          }
          return []
        },
      }

      const secondSession = crashRecoveryMod.createCrashRecoveryManager({
        userDataDir: tempDir,
      })

      const status = secondSession.initializeSession(mockDb)
      expect(status.recovered).toBe(true)
      expect(integrityChecked).toBe(true)
      expect(status.integrityOk).toBe(true)
      expect(status.message).toContain('Uygulama beklenmedik şekilde kapandı, veriler kontrol edildi')

      // Clean exit clears dirty state for next startup
      secondSession.markCleanShutdown()
      const thirdSession = crashRecoveryMod.createCrashRecoveryManager({
        userDataDir: tempDir,
      })
      expect(thirdSession.initializeSession(mockDb).recovered).toBe(false)
    })
  })
})
