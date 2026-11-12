const {
  getTables,
  saveTables,
  getCompletedOrders,
  saveCompletedOrders,
  getBusinessDays,
  saveBusinessDays,
  getMenuProducts,
  saveMenuProducts,
  getSettings,
  saveSettings,
  getRefunds,
  saveRefunds,
  getActivityLogs,
  saveActivityLogs,
  prependActivityLog,
  archiveActivityLogs,
  getArchivedActivityLogs,
  getUsers,
  saveUsers,
  getUserPermissionOverridesMap,
  saveUserPermissionOverridesMap,
  getKvItem,
  setKvItem,
  removeKvItem,
  getMeta,
  setMeta,
  getAllDatabaseState,
  clearAllOperationalData,
} = require('./repository.cjs')
const {
  completeOrderTransaction,
  updateTablePaymentsTransaction,
  refundTransaction,
  reopenOrderTransaction,
  openBusinessDayTransaction,
  closeBusinessDayTransaction,
  transferMergeSplitTableTransaction,
} = require('./transactions.cjs')
const {
  migratePayloadToSqlite,
} = require('./migrator.cjs')

/**
 * Executes a validated SQLite repository or transaction action against the active database context.
 * Returns { success: boolean, data?: any, error?: string, ... }
 *
 * @param {object} dbContext - Result of openDatabase() ({ db, dbPath, pragmas, integrityOk, corruptionError, quarantinedDbPath, suggestedBackup })
 * @param {string} action
 * @param {any} [payload]
 */
function executeDbAction(dbContext, action, payload) {
  if (!dbContext || !dbContext.db) {
    return {
      success: false,
      error: 'SQLite veritabanı bağlantısı aktif değil.',
    }
  }

  const { db } = dbContext

  try {
    switch (action) {
      case 'status':
        return {
          success: true,
          data: {
            dbPath: dbContext.dbPath,
            pragmas: dbContext.pragmas,
            integrityOk: dbContext.integrityOk,
            corruptReplaced: Boolean(dbContext.quarantinedDbPath || !dbContext.integrityOk),
            integrityMessage: dbContext.corruptionError || null,
            corruptionError: dbContext.corruptionError,
            quarantinedDbPath: dbContext.quarantinedDbPath,
            suggestedBackup: dbContext.suggestedBackup
              ? {
                  fileName: dbContext.suggestedBackup.fileName,
                  filePath: dbContext.suggestedBackup.filePath,
                  createdAt: dbContext.suggestedBackup.createdAt,
                  type: dbContext.suggestedBackup.type,
                  backup: dbContext.suggestedBackup.backup,
                }
              : null,
            migrationStatus: getMeta(db, 'migration_status'),
            migratedAt: getMeta(db, 'migrated_at'),
          },
        }

      case 'getAllState':
        return { success: true, data: getAllDatabaseState(db) }

      case 'getTables':
        return { success: true, data: getTables(db) }

      case 'saveTables':
        saveTables(db, payload)
        return { success: true }

      case 'getCompletedOrders':
        return { success: true, data: getCompletedOrders(db) }

      case 'saveCompletedOrders':
        saveCompletedOrders(db, payload)
        return { success: true }

      case 'getBusinessDays':
        return { success: true, data: getBusinessDays(db) }

      case 'saveBusinessDays':
        saveBusinessDays(db, payload)
        return { success: true }

      case 'getMenuProducts':
        return { success: true, data: getMenuProducts(db) }

      case 'saveMenuProducts':
        saveMenuProducts(db, payload)
        return { success: true }

      case 'getSettings':
        return { success: true, data: getSettings(db, payload) }

      case 'saveSettings':
        saveSettings(db, payload)
        return { success: true }

      case 'getRefunds':
        return { success: true, data: getRefunds(db) }

      case 'saveRefunds':
        saveRefunds(db, payload)
        return { success: true }

      case 'getActivityLogs':
        return { success: true, data: getActivityLogs(db) }

      case 'saveActivityLogs':
        saveActivityLogs(db, payload)
        return { success: true }

      case 'prependActivityLog':
        return { success: true, data: prependActivityLog(db, payload) }

      case 'archiveActivityLogs':
        return { success: true, data: archiveActivityLogs(db, payload) }

      case 'getArchivedActivityLogs':
        return { success: true, data: getArchivedActivityLogs(db) }

      case 'getUsers':
        return { success: true, data: getUsers(db) }

      case 'saveUsers':
        saveUsers(db, payload)
        return { success: true }

      case 'getUserPermissionOverrides':
        return { success: true, data: getUserPermissionOverridesMap(db) }

      case 'saveUserPermissionOverrides':
        saveUserPermissionOverridesMap(db, payload?.overrides ?? payload, payload?.updatedBy)
        return { success: true }

      case 'getKvItem':
        return { success: true, data: getKvItem(db, payload?.key ?? payload) }

      case 'setKvItem':
        setKvItem(db, payload.key, payload.value)
        return { success: true }

      case 'removeKvItem':
        removeKvItem(db, payload?.key ?? payload)
        return { success: true }

      case 'getMeta':
        return { success: true, data: getMeta(db, payload?.key ?? payload) }

      case 'setMeta':
        setMeta(db, payload.key, payload.value)
        return { success: true }

      case 'clearAllOperationalData':
        clearAllOperationalData(db)
        return { success: true }

      case 'migrateFromLocalStorage':
        return migratePayloadToSqlite(db, payload?.data ?? payload, payload?.options)

      case 'tx:completeOrder':
        return completeOrderTransaction(db, payload, payload?.options)

      case 'tx:updateTablePayments':
        return updateTablePaymentsTransaction(db, payload, payload?.options)

      case 'tx:refund':
        return refundTransaction(db, payload, payload?.options)

      case 'tx:reopenOrder':
        return reopenOrderTransaction(db, payload, payload?.options)

      case 'tx:openBusinessDay':
        return openBusinessDayTransaction(db, payload, payload?.options)

      case 'tx:closeBusinessDay':
        return closeBusinessDayTransaction(db, payload, payload?.options)

      case 'tx:transferMergeSplitTable':
        return transferMergeSplitTableTransaction(db, payload, payload?.options)

      default:
        return {
          success: false,
          error: `Bilinmeyen veritabanı işlemi: ${String(action)}`,
        }
    }
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
      code: err && err.code ? err.code : 'SQLITE_ERROR',
    }
  }
}

module.exports = {
  executeDbAction,
}
