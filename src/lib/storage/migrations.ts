import type { Product } from '../../types'
import { products as initialProducts } from '../../data/products'

export const CURRENT_MENU_CATALOG_VERSION = '2026_10_23_new_menu_v1'

/**
 * Migrates legacy localStorage demo keys to standard keys without data loss.
 */
export function migrateLegacyKeys(): void {
  try {
    // 1. Tables
    if (!localStorage.getItem('tables') && localStorage.getItem('demoTables')) {
      const demo = localStorage.getItem('demoTables')!
      localStorage.setItem('tables', demo)
    }

    // 2. Completed Orders
    if (!localStorage.getItem('completedOrders') && localStorage.getItem('demoCompletedOrders')) {
      const demo = localStorage.getItem('demoCompletedOrders')!
      localStorage.setItem('completedOrders', demo)
    }

    // 3. Settings
    if (!localStorage.getItem('appSettings') && localStorage.getItem('demoAppSettings')) {
      const demo = localStorage.getItem('demoAppSettings')!
      localStorage.setItem('appSettings', demo)
    }

    // 4. Menu Products
    if (!localStorage.getItem('menuProducts') && localStorage.getItem('demoMenuProducts')) {
      const demo = localStorage.getItem('demoMenuProducts')!
      localStorage.setItem('menuProducts', demo)
    }
  } catch (err) {
    console.error('Failed to run legacy keys migration', err)
  }
}

/**
 * Safely migrates menu catalog without destroying user-created products.
 * If catalog version changed, creates a dated backup and merges user products into new catalog.
 */
export function migrateMenuProductsSafely(
  existingProducts: Product[],
  targetVersion: string = CURRENT_MENU_CATALOG_VERSION,
  defaultCatalog: Product[] = initialProducts,
): { products: Product[]; migrated: boolean } {
  try {
    const currentVersion = localStorage.getItem('menuCatalogVersion')
    if (currentVersion === targetVersion && existingProducts.length > 0) {
      return { products: existingProducts, migrated: false }
    }

    // If version changed and user already had products, preserve user-created items!
    if (existingProducts.length > 0) {
      // 1. Create a pre-migration backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupKey = `menuProducts_pre_migrate_${currentVersion || 'legacy'}_${timestamp}`
      try {
        localStorage.setItem(backupKey, JSON.stringify(existingProducts))
      } catch {
        // Continue safely
      }

      // 2. Identify default product IDs
      const defaultIds = new Set(defaultCatalog.map((p) => p.id))
      const defaultNames = new Set(defaultCatalog.map((p) => p.name.toLowerCase().trim()))

      // 3. Keep user-created products (products not in standard catalog)
      const userCreatedProducts = existingProducts.filter(
        (p) => !defaultIds.has(p.id) && !defaultNames.has(p.name.toLowerCase().trim()),
      )

      // 4. Merge default catalog + user products
      const merged: Product[] = [...defaultCatalog, ...userCreatedProducts]

      localStorage.setItem('menuCatalogVersion', targetVersion)
      localStorage.setItem('menuProducts', JSON.stringify(merged))

      console.info(
        `[Menu Migration] Migrated menu catalog to ${targetVersion}. Preserved ${userCreatedProducts.length} custom user products.`,
      )
      return { products: merged, migrated: true }
    }

    // First initialization
    localStorage.setItem('menuCatalogVersion', targetVersion)
    localStorage.setItem('menuProducts', JSON.stringify(defaultCatalog))
    return { products: defaultCatalog, migrated: true }
  } catch (err) {
    console.error('Menu migration error, falling back to safe existing or defaults', err)
    return { products: existingProducts.length > 0 ? existingProducts : defaultCatalog, migrated: false }
  }
}
