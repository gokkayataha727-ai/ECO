import { beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import { clearInMemoryCache } from '../src/lib/storage/repository'
import { setCustomSqliteDispatcher } from '../src/lib/storage/sqliteClient'

const require = createRequire(import.meta.url)
const { openDatabase, closeDatabase, executeDbAction } = require('../electron/db/index.cjs')

let activeTestDbCtx: any = null
let resetSqliteOnStorageClear = true

export function getActiveTestDbContext(): any {
  return activeTestDbCtx
}

export function setResetSqliteOnStorageClear(enabled: boolean): void {
  resetSqliteOnStorageClear = enabled
}

// Create an isolated in-memory localStorage implementation for tests
class LocalStorageMock {
  private store: Map<string, string> = new Map()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
    clearInMemoryCache()
    if (resetSqliteOnStorageClear && activeTestDbCtx && activeTestDbCtx.db) {
      try {
        executeDbAction(activeTestDbCtx, 'clearAllOperationalData')
      } catch {}
    }
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys())
    return keys[index] || null
  }
}

const mockStorage = new LocalStorageMock()

Object.defineProperty(window, 'localStorage', {
  value: mockStorage,
  writable: true,
})

Object.defineProperty(global, 'localStorage', {
  value: mockStorage,
  writable: true,
})

beforeEach(() => {
  resetSqliteOnStorageClear = true
  if (activeTestDbCtx && activeTestDbCtx.db) {
    closeDatabase(activeTestDbCtx.db)
  }
  activeTestDbCtx = openDatabase({ dbPath: ':memory:' })
  setCustomSqliteDispatcher((action, payload) =>
    executeDbAction(activeTestDbCtx, action, payload),
  )
  mockStorage.clear()
  clearInMemoryCache()
  vi.clearAllMocks()
})

afterEach(() => {
  setCustomSqliteDispatcher(null)
  if (activeTestDbCtx && activeTestDbCtx.db) {
    closeDatabase(activeTestDbCtx.db)
    activeTestDbCtx = null
  }
  vi.restoreAllMocks()
})
