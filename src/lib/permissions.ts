import type { AppSettings, PermissionKey, Session, User, UserRole } from '../types'
import { logActivity } from './activityLog'
import {
  getSettingsSafe,
  getUserPermissionOverridesSafe,
  safeGetItem,
  safeSetItem,
  saveSettingsSafe,
  saveUserPermissionOverridesSafe,
} from './storage/repository'

export type PermissionGroup =
  | 'order'
  | 'refund'
  | 'payment'
  | 'business_day'
  | 'product'
  | 'table_manage'
  | 'reports'
  | 'admin_only'

export interface PermissionGroupMeta {
  id: PermissionGroup
  title: string
  description: string
  icon: string
}

export const PERMISSION_GROUPS: PermissionGroupMeta[] = [
  {
    id: 'order',
    title: 'Sipariş & Masa',
    description: 'Masa ve adisyon işlemleri, ürün ekleme, sepet ve tur yönetimi.',
    icon: 'Coffee',
  },
  {
    id: 'refund',
    title: 'İade',
    description: 'Ürün ve tüm masa adisyonu iade yetkileri.',
    icon: 'RotateCcw',
  },
  {
    id: 'payment',
    title: 'Ödeme',
    description: 'Tahsilat yöntemleri, kısmi ödeme ve tutar müdahalesi.',
    icon: 'CreditCard',
  },
  {
    id: 'business_day',
    title: 'Gün & Kasa',
    description: 'Kasa açılış ve gün sonu kapatma işlemleri.',
    icon: 'Sun',
  },
  {
    id: 'product',
    title: 'Ürün & Menü',
    description: 'Menü kataloğu, fiyat değiştirme ve ürün silme.',
    icon: 'Package',
  },
  {
    id: 'table_manage',
    title: 'Masa Yönetimi',
    description: 'Kafedeki masaların eklenmesi, silinmesi ve düzenlenmesi.',
    icon: 'LayoutGrid',
  },
  {
    id: 'reports',
    title: 'Raporlar',
    description: 'Ciro, satış özetleri ve personel performans raporları.',
    icon: 'BarChart3',
  },
  {
    id: 'admin_only',
    title: 'Yalnızca Yönetici',
    description: 'Sistem güvenliği ve yapılandırma yetkileri (Garsonlara verilemez, kilitlidir).',
    icon: 'Shield',
  },
]

export interface PermissionCatalogItem {
  key: PermissionKey
  label: string
  description: string
  group: PermissionGroup
  defaultTemplateVal: boolean
  sensitive: boolean
  adminOnly?: boolean
  parentKey?: PermissionKey
}

export const PERMISSION_CATALOG: PermissionCatalogItem[] = [
  // ── Sipariş & Masa ──
  {
    key: 'order_create_add',
    label: 'Masalarda sipariş açma ve ürün ekleme',
    description: 'Menüden ürün seçerek masalara sipariş kalemi ekleyebilir.',
    group: 'order',
    defaultTemplateVal: true,
    sensitive: false,
  },
  {
    key: 'order_new_batch',
    label: 'Yeni sipariş turu başlatma',
    description: 'Sepette yeni tur başlatarak ek siparişleri gruplayabilir.',
    group: 'order',
    defaultTemplateVal: true,
    sensitive: false,
  },
  {
    key: 'order_edit_note_customer',
    label: 'Sipariş notu / müşteri adı düzenleme',
    description: 'Masaya veya siparişe özel not ve müşteri ismi yazabilir.',
    group: 'order',
    defaultTemplateVal: true,
    sensitive: false,
  },
  {
    key: 'order_view_adisyon',
    label: 'Adisyon görüntüleme / yazdırma',
    description: 'Masaya ait sipariş fişini ve adisyon dökümünü ekranda görebilir ve yazdırabilir.',
    group: 'order',
    defaultTemplateVal: true,
    sensitive: false,
  },
  {
    key: 'order_clear_cart',
    label: 'Sepeti temizleme ("Temizle")',
    description: 'Masa sepetindeki tüm ürünleri tek tuşla sıfırlar.',
    group: 'order',
    defaultTemplateVal: false,
    sensitive: true,
  },
  {
    key: 'table_transfer_merge',
    label: 'Masa taşıma / birleştirme / ayırma',
    description: 'Masalar arasında sipariş taşıyabilir, iki masayı birleştirebilir veya ayırabilir.',
    group: 'order',
    defaultTemplateVal: false,
    sensitive: false,
  },

  // ── İade ──
  {
    key: 'refund_item',
    label: 'Ürün (kalem) iadesi',
    description: 'Siparişteki belirli bir ürünü adet ve neden belirterek iade edebilir.',
    group: 'refund',
    defaultTemplateVal: false,
    sensitive: true,
  },
  {
    key: 'refund_table',
    label: 'Masa iadesi (tüm sipariş)',
    description: 'Masanın tüm siparişini tek seferde iptal / iade edebilir.',
    group: 'refund',
    defaultTemplateVal: false,
    sensitive: true,
  },

  // ── Ödeme ──
  {
    key: 'payment_take',
    label: 'Ödeme alma (ana yetki)',
    description: 'Ödeme ekranını açarak masanın hesabını kapatabilir.',
    group: 'payment',
    defaultTemplateVal: true,
    sensitive: false,
  },
  {
    key: 'payment_cash',
    label: 'Nakit ile ödeme',
    description: 'Nakit para tahsilatı yapabilir.',
    group: 'payment',
    defaultTemplateVal: true,
    sensitive: false,
    parentKey: 'payment_take',
  },
  {
    key: 'payment_card',
    label: 'Kart ile ödeme',
    description: 'Banka / kredi kartı ile tahsilat yapabilir.',
    group: 'payment',
    defaultTemplateVal: true,
    sensitive: false,
    parentKey: 'payment_take',
  },
  {
    key: 'payment_iban',
    label: 'IBAN ile ödeme',
    description: 'Havale / EFT / IBAN yöntemiyle tahsilat yapabilir.',
    group: 'payment',
    defaultTemplateVal: true,
    sensitive: false,
    parentKey: 'payment_take',
  },
  {
    key: 'payment_partial',
    label: 'Kısmi / ürün bazlı ödeme',
    description: 'Siparişin bir kısmını veya ürün bazında parça ödeme alabilir.',
    group: 'payment',
    defaultTemplateVal: true,
    sensitive: false,
    parentKey: 'payment_take',
  },
  {
    key: 'payment_custom_amount',
    label: 'Ödeme tutarını manuel değiştirme',
    description: 'Tahsilat anında klavye ile farklı bir ara tutar yazabilir.',
    group: 'payment',
    defaultTemplateVal: false,
    sensitive: true,
    parentKey: 'payment_take',
  },

  // ── Gün & Kasa ──
  {
    key: 'day_open',
    label: 'İş günü açma',
    description: 'Sabah kasa açılışı yaparak yeni iş gününü başlatabilir.',
    group: 'business_day',
    defaultTemplateVal: false,
    sensitive: false,
  },
  {
    key: 'day_close',
    label: 'İş günü kapatma (gün sonu)',
    description: 'Akşam gün sonu yaparak kasayı kapatabilir.',
    group: 'business_day',
    defaultTemplateVal: false,
    sensitive: true,
  },

  // ── Ürün & Menü ──
  {
    key: 'product_manage',
    label: 'Ürün ekleme / düzenleme',
    description: 'Menüye yeni ürün ekleyebilir veya mevcut ürün adını değiştirebilir.',
    group: 'product',
    defaultTemplateVal: false,
    sensitive: false,
  },
  {
    key: 'product_price_edit',
    label: 'Fiyat değiştirme',
    description: 'Ürünlerin satış fiyatlarını güncelleyebilir.',
    group: 'product',
    defaultTemplateVal: false,
    sensitive: true,
  },
  {
    key: 'product_delete',
    label: 'Ürün silme / pasife alma',
    description: 'Menüdeki ürünleri silebilir veya satıştan kaldırabilir.',
    group: 'product',
    defaultTemplateVal: false,
    sensitive: true,
  },

  // ── Masa Yönetimi ──
  {
    key: 'table_manage',
    label: 'Masa ekleme / silme / düzenleme',
    description: 'Kafedeki masa yerleşimini ve masa isimlerini yönetebilir.',
    group: 'table_manage',
    defaultTemplateVal: false,
    sensitive: false,
  },

  // ── Raporlar ──
  {
    key: 'reports_view_own',
    label: 'Kendi satış özetini görme',
    description: 'Giriş yapan garson kendi aldığı sipariş ve satış toplamını görebilir.',
    group: 'reports',
    defaultTemplateVal: true,
    sensitive: false,
  },
  {
    key: 'reports_view_general',
    label: 'Genel raporları görme (ciro, istatistik)',
    description: 'Kafenin toplam cirosunu, Z raporunu ve tüm istatistiklerini görebilir.',
    group: 'reports',
    defaultTemplateVal: false,
    sensitive: true,
  },

  // ── Yalnızca Yönetici (Admin Only) ──
  {
    key: 'manage_users',
    label: 'Kullanıcı & personel yönetimi ve yetki atama',
    description: 'Sistem kullanıcılarını, PIN kodlarını ve garson yetkilerini yönetebilir.',
    group: 'admin_only',
    defaultTemplateVal: false,
    sensitive: true,
    adminOnly: true,
  },
  {
    key: 'view_logs',
    label: 'İşlem Logunu görüntüleme',
    description: 'Sistemdeki tüm adisyon, yetki, iade ve oturum hareketlerini inceler.',
    group: 'admin_only',
    defaultTemplateVal: false,
    sensitive: true,
    adminOnly: true,
  },
  {
    key: 'manage_settings',
    label: 'Sistem ayarları',
    description: 'İşletme adı, IBAN, logo ve genel konfigürasyonu değiştirebilir.',
    group: 'admin_only',
    defaultTemplateVal: false,
    sensitive: true,
    adminOnly: true,
  },
  {
    key: 'reopen_order',
    label: 'Kapatılmış adisyonu masaya geri açma',
    description: 'Hesabı kapatılmış eski bir adisyonu yeniden aktif masaya dönüştürür (Yalnızca Yönetici).',
    group: 'admin_only',
    defaultTemplateVal: false,
    sensitive: true,
    adminOnly: true,
  },
]

/**
 * Returns human friendly label for a permission key.
 */
export function getPermissionLabel(key: PermissionKey | string): string {
  const item = PERMISSION_CATALOG.find((p) => p.key === key)
  if (item) return item.label

  // Fallbacks for legacy permission strings
  switch (key) {
    case 'view_tables':
      return 'Masaları Görüntüleme'
    case 'take_orders':
      return 'Sipariş Alma ve Kalem Ekleme'
    case 'take_payment':
      return 'Ödeme Alma'
    case 'view_logs':
      return 'İşlem Logunu Görüntüleme'
    case 'refund':
      return 'Ürün ve Masa İadesi'
    case 'reopen_order':
      return 'Adisyonu Geri Açma'
    case 'manage_business_day':
      return 'İş Günü Açma ve Kapatma'
    case 'view_reports':
      return 'Raporlar ve Gün Özeti'
    case 'manage_products':
      return 'Ürün ve Menü Yönetimi'
    case 'manage_tables':
      return 'Masa Planı Yönetimi'
    case 'manage_users':
      return 'Kullanıcı ve Personel Yönetimi'
    case 'manage_settings':
      return 'Sistem Ayarları'
    default:
      return String(key)
  }
}

/**
 * Build default template dictionary from PERMISSION_CATALOG
 */
export function buildDefaultTemplate(settings?: AppSettings): Record<PermissionKey, boolean> {
  const t: Partial<Record<PermissionKey, boolean>> = {}
  for (const item of PERMISSION_CATALOG) {
    if (item.adminOnly) {
      t[item.key] = false
    } else {
      t[item.key] = item.defaultTemplateVal
    }
  }

  // Preserve and migrate legacy general settings if present
  if (settings) {
    const refundVal = Boolean(settings.allowWaiterRefund || settings.allowCashierRefund)
    t.refund_item = refundVal
    t.refund_table = refundVal

    const dayVal = Boolean(settings.allowWaiterDayManagement)
    t.day_open = dayVal
    t.day_close = dayVal

    if (settings.allowWaiterReopen !== undefined) {
      t.reopen_order = Boolean(settings.allowWaiterReopen)
    }
  }

  return t as Record<PermissionKey, boolean>
}

const TEMPLATE_STORAGE_KEY = 'appPermissionTemplate'
const LEGACY_TEMPLATE_KEY = 'waitstaffPermissionTemplate'

/**
 * Get or initialize the default Waiter Permission Template from storage.
 */
export function getPermissionTemplate(settings?: AppSettings): Record<PermissionKey, boolean> {
  try {
    const raw = safeGetItem(TEMPLATE_STORAGE_KEY) || safeGetItem(LEGACY_TEMPLATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<PermissionKey, boolean>>
      const def = buildDefaultTemplate(settings)
      // Merge in case new keys were added to catalog
      return { ...def, ...parsed }
    }
  } catch (err) {
    console.error('Failed to read permission template from storage', err)
  }

  const def = buildDefaultTemplate(settings)
  try {
    safeSetItem(TEMPLATE_STORAGE_KEY, JSON.stringify(def))
    safeSetItem(LEGACY_TEMPLATE_KEY, JSON.stringify(def))
  } catch {
    // ignore
  }
  return def
}

/**
 * Save updated default Waiter Permission Template.
 */
export function savePermissionTemplate(
  template: Record<PermissionKey, boolean>,
  adminUser: { id?: string; fullName: string; role?: string },
): void {
  const oldTemplate = getPermissionTemplate()
  const json = JSON.stringify(template)
  safeSetItem(TEMPLATE_STORAGE_KEY, json)
  safeSetItem(LEGACY_TEMPLATE_KEY, json)

  // Find changed keys for logging
  const changes: string[] = []
  for (const item of PERMISSION_CATALOG) {
    if (item.adminOnly) continue
    const oldVal = Boolean(oldTemplate[item.key])
    const newVal = Boolean(template[item.key])
    if (oldVal !== newVal) {
      changes.push(`${item.label}: ${oldVal ? 'Açık' : 'Kapalı'} → ${newVal ? 'Açık' : 'Kapalı'}`)
    }
  }

  if (changes.length > 0) {
    logActivity({
      type: 'permission_template_update',
      userName: adminUser.fullName,
      userRole: adminUser.role || 'Yönetici',
      userId: adminUser.id,
      details: `Varsayılan Garson Şablonu güncellendi (${changes.length} değişiklik): ${changes.slice(0, 3).join(', ')}${
        changes.length > 3 ? ` ve ${changes.length - 3} yetki daha` : ''
      }`,
    })
  }

  // Synchronize legacy AppSettings keys so backward compatibility is 100%
  try {
    const s = getSettingsSafe()
    s.allowWaiterRefund = Boolean(template.refund_item && template.refund_table)
    s.allowWaiterDayManagement = Boolean(template.day_open && template.day_close)
    s.allowWaiterReopen = Boolean(template.reopen_order)
    saveSettingsSafe(s)
  } catch {
    // ignore
  }

  window.dispatchEvent(new CustomEvent('permissions-updated'))
}

/**
 * Get all user overrides from storage.
 * Format: Record<userId, Record<PermissionKey, boolean>>
 */
export function getAllUserOverrides(): Record<string, Record<string, boolean>> {
  return getUserPermissionOverridesSafe()
}

/**
 * Get overrides for a specific user.
 */
export function getUserOverrides(userId: string): Record<string, boolean> {
  const all = getAllUserOverrides()
  return all[userId] || {}
}

/**
 * Count how many overrides a user currently has compared to default template.
 */
export function getUserOverrideCount(userId: string): number {
  const overrides = getUserOverrides(userId)
  return Object.keys(overrides).length
}

/**
 * Save overrides for a specific user.
 * Only stores keys that actually differ from the template.
 */
export function saveUserOverrides(
  userId: string,
  newOverrides: Record<string, boolean>,
  adminUser: { id?: string; fullName: string; role?: string },
  targetUser: { id?: string; fullName: string; username: string },
): void {
  const all = getAllUserOverrides()
  const oldOverrides = all[userId] || {}
  const template = getPermissionTemplate()

  // Clean overrides: only keep keys that differ from template
  const cleanOverrides: Record<string, boolean> = {}
  for (const [k, val] of Object.entries(newOverrides)) {
    const pKey = k as PermissionKey
    const catItem = PERMISSION_CATALOG.find((p) => p.key === pKey)
    if (catItem?.adminOnly) continue // adminOnly cannot be overridden for waiters
    const templateVal = Boolean(template[pKey])
    if (val !== templateVal) {
      cleanOverrides[pKey] = val
    }
  }

  if (Object.keys(cleanOverrides).length === 0) {
    delete all[userId]
  } else {
    all[userId] = cleanOverrides
  }

  saveUserPermissionOverridesSafe(all)

  // Find changes to log
  const changes: string[] = []
  for (const item of PERMISSION_CATALOG) {
    if (item.adminOnly) continue
    const effectiveOld = oldOverrides[item.key] !== undefined ? oldOverrides[item.key] : template[item.key]
    const effectiveNew = cleanOverrides[item.key] !== undefined ? cleanOverrides[item.key] : template[item.key]
    if (effectiveOld !== effectiveNew) {
      changes.push(`${item.label}: ${effectiveOld ? 'Açık' : 'Kapalı'} → ${effectiveNew ? 'Açık' : 'Kapalı'}`)
    }
  }

  if (changes.length > 0) {
    logActivity({
      type: 'permission_override_set',
      userName: adminUser.fullName,
      userRole: adminUser.role || 'Yönetici',
      userId: adminUser.id,
      details: `${targetUser.fullName} (@${targetUser.username}) için yetkiler güncellendi: ${changes.join(', ')}`,
    })
  }

  window.dispatchEvent(new CustomEvent('permissions-updated'))
}

/**
 * Reset all custom overrides for a user (reverting them completely to template).
 */
export function resetUserOverrides(
  userId: string,
  adminUser: { id?: string; fullName: string; role?: string },
  targetUser: { id?: string; fullName: string; username: string },
): void {
  const all = getAllUserOverrides()
  if (all[userId]) {
    delete all[userId]
    saveUserPermissionOverridesSafe(all)

    logActivity({
      type: 'permission_reset',
      userName: adminUser.fullName,
      userRole: adminUser.role || 'Yönetici',
      userId: adminUser.id,
      details: `${targetUser.fullName} (@${targetUser.username}) kişisel yetkileri varsayılana sıfırlandı.`,
    })

    window.dispatchEvent(new CustomEvent('permissions-updated'))
  }
}

/**
 * Copy custom overrides from one user to one or more target users.
 */
export function copyUserOverrides(
  sourceUserId: string,
  targetUserIds: string[],
  adminUser: { id?: string; fullName: string; role?: string },
  sourceUser: { fullName: string; username: string },
  targetUsers: Array<{ id: string; fullName: string; username: string }>,
): void {
  const all = getAllUserOverrides()
  const sourceOverrides = all[sourceUserId] ? { ...all[sourceUserId] } : {}

  for (const tid of targetUserIds) {
    if (Object.keys(sourceOverrides).length === 0) {
      delete all[tid]
    } else {
      all[tid] = { ...sourceOverrides }
    }
  }

  saveUserPermissionOverridesSafe(all)

  const targetNames = targetUsers
    .filter((t) => targetUserIds.includes(t.id))
    .map((t) => `${t.fullName} (@${t.username})`)
    .join(', ')

  logActivity({
    type: 'permission_copy',
    userName: adminUser.fullName,
    userRole: adminUser.role || 'Yönetici',
    userId: adminUser.id,
    details: `${sourceUser.fullName} yetkileri şu personele kopyalandı: ${targetNames}`,
  })

  window.dispatchEvent(new CustomEvent('permissions-updated'))
}

/**
 * Log unauthorized attempt made by a user.
 */
export function logUnauthorizedAttempt(
  user: { id?: string; fullName: string; role?: string } | null | undefined,
  permission: PermissionKey | string,
  businessDayId?: string,
): void {
  if (!user) return
  const label = getPermissionLabel(permission)
  logActivity({
    businessDayId,
    type: 'unauthorized_attempt',
    userName: user.fullName || 'Bilinmeyen Personel',
    userRole: user.role === 'admin' ? 'Yönetici' : 'Garson',
    userId: user.id,
    details: `${user.fullName} (${user.role === 'admin' ? 'Yönetici' : 'Garson'}) yetkisiz işlem denemesi: ${label}`,
  })
}

/**
 * Main Central Permission Evaluator: can(user, permission, settings?)
 *
 * Evaluation rules:
 * 1. Admin always has full access to all permissions (cannot be restricted).
 * 2. If permission is adminOnly and user is not admin, returns false.
 * 3. Payment sub-permissions depend on `payment_take`. If `payment_take` is false, all payment sub-permissions evaluate to false.
 * 4. User-specific override takes precedence over template.
 * 5. If no user override, defaults to template value.
 */
export function can(
  user: User | Session | null | undefined,
  permission: PermissionKey,
  settings?: AppSettings,
): boolean {
  if (!user) return false

  // Normalize role
  const role: UserRole = user.role === 'admin' ? 'admin' : 'waiter'

  // Admin has full access to everything
  if (role === 'admin') {
    return true
  }

  const catItem = PERMISSION_CATALOG.find((p) => p.key === permission)

  // Locked admin-only features cannot be accessed by non-admins
  if (catItem?.adminOnly) {
    return false
  }

  // Payment sub-permissions rule: if parent payment_take is disabled, all sub-permissions are disabled
  if (catItem?.parentKey === 'payment_take') {
    const canTakePayment = can(user, 'payment_take', settings)
    if (!canTakePayment) {
      return false
    }
  }

  const userId = 'userId' in user ? user.userId : user.id
  const overrides = getUserOverrides(userId)

  // Check personal override
  if (overrides[permission] !== undefined) {
    return Boolean(overrides[permission])
  }

  // Fall back to template
  const template = getPermissionTemplate(settings)
  if (template[permission] !== undefined) {
    return Boolean(template[permission])
  }

  return catItem ? catItem.defaultTemplateVal : false
}

export type AppPermission =
  | 'view_tables'
  | 'take_orders'
  | 'take_payment'
  | 'view_logs'
  | 'refund'
  | 'reopen_order'
  | 'manage_business_day'
  | 'view_reports'
  | 'manage_products'
  | 'manage_tables'
  | 'manage_users'
  | 'manage_settings'
  | PermissionKey

/**
 * Backward compatibility wrapper for existing hasPermission(role, permission, settings) calls.
 * When session/user object is available, prefer calling `can(user, permission)`.
 */
export function hasPermission(
  roleOrUser: UserRole | User | Session | undefined,
  permission: AppPermission,
  settings?: AppSettings,
): boolean {
  if (!roleOrUser) return false

  // If passed an object (User or Session)
  if (typeof roleOrUser === 'object') {
    const permKey = mapLegacyPermission(permission)
    return can(roleOrUser, permKey, settings)
  }

  // Role string provided
  if (roleOrUser === 'admin') return true

  // For waiter role without a specific user, evaluate against the template
  const permKey = mapLegacyPermission(permission)
  const template = getPermissionTemplate(settings)
  const catItem = PERMISSION_CATALOG.find((p) => p.key === permKey)
  if (catItem?.adminOnly) return false
  if (catItem?.parentKey === 'payment_take') {
    if (!template.payment_take) return false
  }
  return template[permKey] ?? catItem?.defaultTemplateVal ?? false
}

function mapLegacyPermission(legacy: AppPermission): PermissionKey {
  switch (legacy) {
    case 'view_tables':
    case 'take_orders':
      return 'order_create_add'
    case 'take_payment':
      return 'payment_take'
    case 'refund':
      return 'refund_item'
    case 'reopen_order':
      return 'reopen_order'
    case 'manage_business_day':
      return 'day_open'
    case 'view_reports':
      return 'reports_view_general'
    case 'manage_products':
      return 'product_manage'
    case 'manage_tables':
      return 'table_manage'
    case 'manage_users':
      return 'manage_users'
    case 'view_logs':
      return 'view_logs'
    case 'manage_settings':
      return 'manage_settings'
    default:
      return legacy as PermissionKey
  }
}
