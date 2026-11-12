import type { Session, User } from '../types'
import { generateUUID } from './uuid'
import {
  hashSecret,
  verifySecret,
  validateStrongPassword,
  generateSecurePin,
  generateRandomPassword,
  isSimplePin,
} from './crypto'
import { logActivity } from './activityLog'
import { getUsersSafe, saveUsersSafe, safeGetItem, safeSetItem, safeRemoveItem } from './storage/repository'

const SESSION_STORAGE_KEY = 'appSession'
const FAILED_ATTEMPTS_KEY = 'appLoginFailedAttempts'
const INITIAL_PINS_KEY = 'initialWaitstaffPins'

// Default session timeout: 30 minutes
export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30
export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_DURATION_MS = 60 * 1000 // 1 minute

export interface LoginAttemptState {
  count: number
  lockedUntil: number | null
}

export interface WaitstaffPinRecord {
  userId: string
  fullName: string
  username: string
  pin: string
}

/**
 * Read all users from storage (SQLite when active, localStorage fallback).
 */
export function getAllUsers(): User[] {
  return getUsersSafe()
}

/**
 * Save users to storage (SQLite when active, localStorage fallback).
 */
export function saveUsers(users: User[]): void {
  saveUsersSafe(users)
}

/**
 * Get stored initial waitstaff PIN credentials (if any).
 */
export function getInitialWaitstaffPins(): WaitstaffPinRecord[] | null {
  try {
    const raw = safeGetItem(INITIAL_PINS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Clear stored initial waitstaff PIN credentials.
 */
export function clearInitialWaitstaffPins(): void {
  safeRemoveItem(INITIAL_PINS_KEY)
}

/**
 * Check if there is at least one active, non-deleted admin in the system.
 */
export function hasAnyAdmin(): boolean {
  const users = getAllUsers()
  return users.some((u) => !u.isDeleted && u.status === 'active' && u.role === 'admin')
}

/**
 * Initialize and migrate auth system:
 * 1. Pasife al: Eski 'garson' kullanıcısını (status: 'inactive') yap ki 1234 ile giriş yapılamasın ama kayıtlar korunsun.
 * 2. Eski admin kullanıcısı varsa mustChangePassword: true zorunlu kıl.
 * 3. Garson 1 - Garson 4 kullanıcılarını benzersiz rastgele PIN'lerle oluştur.
 */
export async function initializeAuthSystem(): Promise<{
  activeAdmin: User | null
  initialPins: WaitstaffPinRecord[] | null
}> {
  let users = getAllUsers()
  let hasChanges = false
  const generatedPins: WaitstaffPinRecord[] = []

  // 1. Eski varsayılan 'garson' hesabını ve PIN 1234'ü devre dışı bırak (pasife al)
  const legacyGarson = users.find(
    (u) => !u.isDeleted && u.username.toLowerCase() === 'garson' && u.status === 'active',
  )
  if (legacyGarson) {
    users = users.map((u) => (u.id === legacyGarson.id ? { ...u, status: 'inactive' } : u))
    hasChanges = true
  }

  // 2. Varsayılan yönetici hesabı varsa ilk girişte zorunlu şifre değiştirme uygula
  let activeAdmin = users.find(
    (u) => !u.isDeleted && u.status === 'active' && u.role === 'admin',
  )
  if (activeAdmin && activeAdmin.username.toLowerCase() === 'admin' && activeAdmin.mustChangePassword === undefined) {
    activeAdmin = { ...activeAdmin, mustChangePassword: true }
    users = users.map((u) => (u.id === activeAdmin!.id ? activeAdmin! : u))
    hasChanges = true
  }

  // 3. Garson 1, Garson 2, Garson 3, Garson 4 kullanıcılarını oluştur
  const existingPinsList: string[] = []

  for (let i = 1; i <= 4; i++) {
    const waiterUsername = `garson${i}`
    const waiterFullName = `Garson ${i}`
    const alreadyExists = users.some(
      (u) => !u.isDeleted && (u.username.toLowerCase() === waiterUsername || u.fullName === waiterFullName),
    )

    if (!alreadyExists) {
      const pin = generateSecurePin(existingPinsList)
      existingPinsList.push(pin)
      const pinHash = await hashSecret(pin)
      const randomPassword = generateRandomPassword()
      const passwordHash = await hashSecret(randomPassword)

      const newWaiter: User = {
        id: generateUUID(),
        fullName: waiterFullName,
        username: waiterUsername,
        role: 'waiter',
        passwordHash,
        pinHash,
        status: 'active',
        isDeleted: false,
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
        createdBy: 'Sistem Kurulumu',
      }

      users.push(newWaiter)
      generatedPins.push({
        userId: newWaiter.id,
        fullName: newWaiter.fullName,
        username: newWaiter.username,
        pin,
      })
      hasChanges = true
    }
  }

  if (generatedPins.length > 0) {
    safeSetItem(INITIAL_PINS_KEY, JSON.stringify(generatedPins))
  }

  if (hasChanges) {
    saveUsers(users)
  }

  return {
    activeAdmin: activeAdmin || null,
    initialPins: generatedPins.length > 0 ? generatedPins : getInitialWaitstaffPins(),
  }
}

/**
 * Backward compatibility wrapper for initializeDefaultAdmin.
 */
export async function initializeDefaultAdmin(): Promise<User | null> {
  const init = await initializeAuthSystem()
  return init.activeAdmin
}

/**
 * Create initial admin during first-setup wizard.
 */
export async function createInitialAdmin(data: {
  fullName: string
  username: string
  password: string
}): Promise<{ success: boolean; user?: User; error?: string; initialPins?: WaitstaffPinRecord[] }> {
  const fullName = data.fullName.trim()
  const username = data.username.trim().toLowerCase()

  if (!fullName) {
    return { success: false, error: 'Yönetici Ad Soyad alanı zorunludur.' }
  }
  if (!username || username.length < 3) {
    return { success: false, error: 'Kullanıcı adı en az 3 karakter olmalıdır.' }
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return {
      success: false,
      error: 'Kullanıcı adı yalnızca harf, rakam, nokta ve alt çizgi içerebilir.',
    }
  }

  // Strong password check
  const passCheck = validateStrongPassword(data.password)
  if (!passCheck.valid) {
    return { success: false, error: passCheck.error }
  }

  const passwordHash = await hashSecret(data.password.trim())
  const adminUser: User = {
    id: generateUUID(),
    fullName,
    username,
    role: 'admin',
    passwordHash,
    status: 'active',
    isDeleted: false,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    createdBy: 'İlk Kurulum',
  }

  let users = getAllUsers()
  users = [adminUser, ...users]
  saveUsers(users)

  // Provision Garson 1 - 4
  const authInit = await initializeAuthSystem()

  logActivity({
    type: 'user_create',
    userName: fullName,
    userRole: 'Yönetici',
    userId: adminUser.id,
    details: `Sistem ilk kurulumu tamamlandı. Yönetici hesabı oluşturuldu (@${username}).`,
  })

  return {
    success: true,
    user: adminUser,
    initialPins: authInit.initialPins ?? undefined,
  }
}

/**
 * Read failed attempts tracker for rate limiting. Supports per-user tracking.
 */
export function getLoginAttemptState(userId?: string): LoginAttemptState {
  const key = userId ? `${FAILED_ATTEMPTS_KEY}_${userId}` : FAILED_ATTEMPTS_KEY
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { count: 0, lockedUntil: null }
    const parsed = JSON.parse(raw)
    const now = Date.now()
    if (parsed.lockedUntil && parsed.lockedUntil <= now) {
      // Lockout expired, reset
      const resetState = { count: 0, lockedUntil: null }
      localStorage.setItem(key, JSON.stringify(resetState))
      return resetState
    }
    return parsed
  } catch {
    return { count: 0, lockedUntil: null }
  }
}

/**
 * Record a failed login attempt. Supports per-user tracking.
 */
function recordFailedAttempt(userId?: string): { locked: boolean; remainingSeconds: number; count: number } {
  const key = userId ? `${FAILED_ATTEMPTS_KEY}_${userId}` : FAILED_ATTEMPTS_KEY
  const current = getLoginAttemptState(userId)
  const newCount = current.count + 1
  let lockedUntil = current.lockedUntil

  if (newCount >= MAX_FAILED_ATTEMPTS) {
    lockedUntil = Date.now() + LOCKOUT_DURATION_MS
  }

  const updated: LoginAttemptState = {
    count: newCount,
    lockedUntil,
  }
  localStorage.setItem(key, JSON.stringify(updated))

  const remainingSeconds = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)) : 0
  return {
    locked: Boolean(lockedUntil && remainingSeconds > 0),
    remainingSeconds,
    count: newCount,
  }
}

/**
 * Reset failed login attempts on successful login.
 */
function resetFailedAttempts(userId?: string): void {
  const key = userId ? `${FAILED_ATTEMPTS_KEY}_${userId}` : FAILED_ATTEMPTS_KEY
  localStorage.removeItem(key)
}

/**
 * Get current session. Returns null if expired, invalid, or terminated by a new login.
 */
export function getActiveSession(timeoutMinutes = DEFAULT_SESSION_TIMEOUT_MINUTES): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const session: Session = JSON.parse(raw)

    const now = Date.now()
    const lastActivity = new Date(session.lastActivityAt || session.createdAt).getTime()
    const timeoutMs = timeoutMinutes * 60 * 1000

    if (now - lastActivity > timeoutMs) {
      // Inactivity timeout reached!
      clearActiveSession()
      return null
    }

    // Verify user is still active and not deleted
    const users = getAllUsers()
    const user = users.find((u) => u.id === session.userId)
    if (!user || user.isDeleted || user.status !== 'active') {
      clearActiveSession()
      return null
    }

    // Single active session check: verify this session is the registered active session for this user
    const currentActiveSessionId = localStorage.getItem('userActiveSession_' + session.userId)
    if (currentActiveSessionId && currentActiveSessionId !== session.id) {
      clearActiveSession()
      return null
    }

    return session
  } catch (err) {
    console.error('Failed to get active session', err)
    return null
  }
}

/**
 * Save or clear current session.
 */
export function saveActiveSession(session: Session | null): void {
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }
  window.dispatchEvent(new CustomEvent('auth-session-changed', { detail: session }))
}

/**
 * Clear current session.
 */
export function clearActiveSession(): void {
  saveActiveSession(null)
}

/**
 * Touch session to update lastActivityAt.
 */
export function touchSession(): void {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return
    const session: Session = JSON.parse(raw)
    session.lastActivityAt = new Date().toISOString()
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Ignore error
  }
}

export interface LoginResult {
  success: boolean
  user?: User
  session?: Session
  error?: string
  isLocked?: boolean
  lockRemainingSeconds?: number
  mustChangePassword?: boolean
}

/**
 * Login with username and password.
 */
export async function loginWithPassword(
  rawUsername: string,
  rawPassword: string,
  selectedRole: 'admin' | 'waiter',
  timeoutMinutes = DEFAULT_SESSION_TIMEOUT_MINUTES,
): Promise<LoginResult> {
  const attemptState = getLoginAttemptState()
  const now = Date.now()
  if (attemptState.lockedUntil && attemptState.lockedUntil > now) {
    const remainingSeconds = Math.ceil((attemptState.lockedUntil - now) / 1000)
    return {
      success: false,
      isLocked: true,
      lockRemainingSeconds: remainingSeconds,
      error: `Çok sayıda hatalı deneme yapıldı. Lütfen ${remainingSeconds} saniye bekleyin.`,
    }
  }

  const username = rawUsername.trim().toLowerCase()
  const password = rawPassword.trim()

  if (!username || !password) {
    return {
      success: false,
      error: 'Lütfen kullanıcı adı ve şifrenizi girin.',
    }
  }

  const users = getAllUsers()
  const user = users.find(
    (u) => !u.isDeleted && u.username.toLowerCase() === username,
  )

  // Non-leaking generic error helper
  const fail = (reason: string, details?: string): LoginResult => {
    const rateLimit = recordFailedAttempt()
    logActivity({
      type: 'login_failed',
      userName: rawUsername || 'Bilinmeyen Kullanıcı',
      userRole: selectedRole === 'admin' ? 'Yönetici' : 'Garson',
      details: `Başarısız giriş denemesi (${selectedRole === 'admin' ? 'Yönetici' : 'Garson'} modu). ${details || reason}`,
    })

    if (rateLimit.locked) {
      logActivity({
        type: 'account_lockout',
        userName: rawUsername || 'Bilinmeyen Kullanıcı',
        userRole: selectedRole === 'admin' ? 'Yönetici' : 'Garson',
        details: `5 kez hatalı giriş nedeniyle sistem geçici olarak kilitlendi (${rateLimit.remainingSeconds} sn).`,
      })
      return {
        success: false,
        isLocked: true,
        lockRemainingSeconds: rateLimit.remainingSeconds,
        error: `5 kez hatalı giriş yapıldı. Güvenlik nedeniyle hesap ${rateLimit.remainingSeconds} saniye kilitlendi.`,
      }
    }

    return {
      success: false,
      error: 'Kullanıcı adı veya şifre hatalı.',
    }
  }

  if (!user) {
    return fail('Kullanıcı bulunamadı')
  }

  // Check user status
  if (user.status !== 'active') {
    return {
      success: false,
      error: 'Bu hesap pasife alınmıştır. Sisteme giriş yapamaz.',
    }
  }

  // Check selected role matching
  if (user.role !== selectedRole) {
    return fail(
      'Rol uyuşmazlığı',
      `Hesap rolü (${user.role === 'admin' ? 'Yönetici' : 'Garson'}) seçilen mod (${selectedRole === 'admin' ? 'Yönetici' : 'Garson'}) ile uyuşmuyor.`,
    )
  }

  // Verify password hash (Sabit kodlanmış şifre baypası kaldırıldı)
  const isValid = await verifySecret(password, user.passwordHash)
  if (!isValid) {
    return fail('Geçersiz şifre')
  }

  // Successful login!
  resetFailedAttempts()

  // Single active session enforcement: aynı kullanıcı başka bir oturum açarsa önceki oturumu sonlandır
  const previousSessionId = localStorage.getItem('userActiveSession_' + user.id)

  // Update user lastLoginAt
  const updatedUser: User = {
    ...user,
    lastLoginAt: new Date().toISOString(),
  }
  saveUsers(users.map((u) => (u.id === user.id ? updatedUser : u)))

  // Create session
  const session: Session = {
    id: generateUUID(),
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString(),
    lastActivityAt: new Date().toISOString(),
  }

  if (previousSessionId && previousSessionId !== session.id) {
    logActivity({
      type: 'logout',
      userName: user.fullName,
      userRole: user.role === 'admin' ? 'Yönetici' : 'Garson',
      userId: user.id,
      details: `${user.fullName} başka bir oturum açtığı için önceki oturumu sonlandırıldı.`,
    })
  }
  localStorage.setItem('userActiveSession_' + user.id, session.id)

  saveActiveSession(session)

  // Log successful login
  logActivity({
    type: 'login',
    userName: user.fullName,
    userRole: user.role === 'admin' ? 'Yönetici' : 'Garson',
    userId: user.id,
    details: `${user.fullName} (${user.role === 'admin' ? 'Yönetici' : 'Garson'}) sisteme giriş yaptı.`,
  })

  return {
    success: true,
    user: updatedUser,
    session,
    mustChangePassword: Boolean(user.mustChangePassword),
  }
}

/**
 * Login with PIN (Garson Kart Seçimi + PIN).
 */
export async function loginWithPin(
  rawPin: string,
  targetUserId?: string,
  timeoutMinutes = DEFAULT_SESSION_TIMEOUT_MINUTES,
): Promise<LoginResult> {
  const attemptState = getLoginAttemptState(targetUserId)
  const now = Date.now()
  if (attemptState.lockedUntil && attemptState.lockedUntil > now) {
    const remainingSeconds = Math.ceil((attemptState.lockedUntil - now) / 1000)
    return {
      success: false,
      isLocked: true,
      lockRemainingSeconds: remainingSeconds,
      error: `Çok sayıda hatalı PIN girildi. Lütfen ${remainingSeconds} saniye bekleyin.`,
    }
  }

  const pin = rawPin.trim()
  if (!pin) {
    return { success: false, error: 'Lütfen PIN kodunuzu girin.' }
  }

  const activeWaiters = getAllUsers().filter(
    (u) => !u.isDeleted && u.status === 'active' && u.role === 'waiter' && u.pinHash,
  )

  let matchedUser: User | null = null

  if (targetUserId) {
    const specificUser = activeWaiters.find((u) => u.id === targetUserId)
    if (specificUser && specificUser.pinHash) {
      const match = await verifySecret(pin, specificUser.pinHash)
      if (match) matchedUser = specificUser
    }
  } else {
    // Check all active waiters with PINs
    for (const u of activeWaiters) {
      if (u.pinHash) {
        const match = await verifySecret(pin, u.pinHash)
        if (match) {
          matchedUser = u
          break
        }
      }
    }
  }

  if (!matchedUser) {
    const rateLimit = recordFailedAttempt(targetUserId)
    const targetUser = targetUserId ? getAllUsers().find((u) => u.id === targetUserId) : null
    const waiterName = targetUser?.fullName || 'Garson Kartı'

    logActivity({
      type: 'login_failed',
      userName: waiterName,
      userRole: 'Garson',
      userId: targetUserId,
      details: `${waiterName} için hatalı PIN kodu girildi. (Deneme: ${rateLimit.count}/${MAX_FAILED_ATTEMPTS})`,
    })

    if (rateLimit.locked) {
      logActivity({
        type: 'account_lockout',
        userName: waiterName,
        userRole: 'Garson',
        userId: targetUserId,
        details: `${waiterName} 5 kez hatalı PIN denemesi nedeniyle ${rateLimit.remainingSeconds} saniye kilitlendi.`,
      })
      return {
        success: false,
        isLocked: true,
        lockRemainingSeconds: rateLimit.remainingSeconds,
        error: `${waiterName} 5 kez hatalı PIN girildiği için ${rateLimit.remainingSeconds} saniye kilitlendi.`,
      }
    }

    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - rateLimit.count)
    return {
      success: false,
      error: `Hatalı PIN kodu. (Kalan deneme hakkı: ${remaining})`,
    }
  }

  // Successful PIN login
  resetFailedAttempts(targetUserId)

  const updatedUser: User = {
    ...matchedUser,
    lastLoginAt: new Date().toISOString(),
  }
  const allUsers = getAllUsers()
  saveUsers(allUsers.map((u) => (u.id === matchedUser!.id ? updatedUser : u)))

  const session: Session = {
    id: generateUUID(),
    userId: matchedUser.id,
    username: matchedUser.username,
    fullName: matchedUser.fullName,
    role: matchedUser.role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString(),
    lastActivityAt: new Date().toISOString(),
  }

  // Single active session enforcement
  const previousSessionId = localStorage.getItem('userActiveSession_' + matchedUser.id)
  if (previousSessionId && previousSessionId !== session.id) {
    logActivity({
      type: 'logout',
      userName: matchedUser.fullName,
      userRole: 'Garson',
      userId: matchedUser.id,
      details: `${matchedUser.fullName} başka bir oturum açtığı için önceki oturumu sonlandırıldı.`,
    })
  }
  localStorage.setItem('userActiveSession_' + matchedUser.id, session.id)

  saveActiveSession(session)

  logActivity({
    type: 'login',
    userName: matchedUser.fullName,
    userRole: 'Garson',
    userId: matchedUser.id,
    details: `${matchedUser.fullName} (Garson) PIN ile oturum açtı.`,
  })

  return {
    success: true,
    user: updatedUser,
    session,
    mustChangePassword: Boolean(matchedUser.mustChangePassword),
  }
}

/**
 * Logout the currently logged in user.
 */
export function logoutUser(reason: 'manual' | 'timeout' = 'manual'): void {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY)
  if (raw) {
    try {
      const session: Session = JSON.parse(raw)
      localStorage.removeItem('userActiveSession_' + session.userId)
      logActivity({
        type: reason === 'timeout' ? 'session_timeout' : 'logout',
        userName: session.fullName,
        userRole: session.role === 'admin' ? 'Yönetici' : 'Garson',
        userId: session.userId,
        details:
          reason === 'timeout'
            ? `${session.fullName} (${session.role === 'admin' ? 'Yönetici' : 'Garson'}) boşta kalma süresi dolduğu için oturum otomatik kapatıldı.`
            : `${session.fullName} (${session.role === 'admin' ? 'Yönetici' : 'Garson'}) oturumu kapattı.`,
      })
    } catch {
      // Ignore parse error
    }
  }
  clearActiveSession()
}

/**
 * Create a new user.
 */
export async function createUser(
  data: {
    fullName: string
    username: string
    password?: string
    pin?: string
    role: 'admin' | 'waiter'
  },
  actingSession?: Session | null,
): Promise<{ success: boolean; user?: User; error?: string }> {
  const fullName = data.fullName.trim()
  const username = data.username.trim().toLowerCase()

  if (!fullName) {
    return { success: false, error: 'Ad Soyad alanı zorunludur.' }
  }
  if (!username || username.length < 3) {
    return { success: false, error: 'Kullanıcı adı en az 3 karakter olmalıdır.' }
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return {
      success: false,
      error: 'Kullanıcı adı yalnızca harf, rakam, nokta ve alt çizgi içerebilir.',
    }
  }

  const existingUsers = getAllUsers()
  const duplicate = existingUsers.find(
    (u) => !u.isDeleted && u.username.toLowerCase() === username,
  )
  if (duplicate) {
    return { success: false, error: `"${username}" kullanıcı adı zaten kullanımda.` }
  }

  let passwordHash = ''
  if (data.role === 'admin') {
    if (!data.password) {
      return { success: false, error: 'Yönetici hesabı için güçlü bir şifre belirlenmesi zorunludur.' }
    }
    const val = validateStrongPassword(data.password)
    if (!val.valid) {
      return { success: false, error: val.error }
    }
    passwordHash = await hashSecret(data.password.trim())
  } else {
    // Garson hesabı
    if (data.password && data.password.trim()) {
      const val = validateStrongPassword(data.password)
      if (!val.valid) {
        return { success: false, error: val.error }
      }
      passwordHash = await hashSecret(data.password.trim())
    } else {
      passwordHash = await hashSecret(generateRandomPassword())
    }
  }

  let pinHash: string | undefined = undefined
  if (data.pin && data.pin.trim().length >= 4) {
    if (isSimplePin(data.pin.trim())) {
      return {
        success: false,
        error: 'Basit veya ardışık PIN kodları (1234, 0000, 1111 vb.) kullanılamaz. Lütfen tahmin edilmesi zor bir PIN belirleyin.',
      }
    }
    pinHash = await hashSecret(data.pin.trim())
  }

  const newUser: User = {
    id: generateUUID(),
    fullName,
    username,
    role: data.role,
    passwordHash,
    pinHash,
    status: 'active',
    isDeleted: false,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    createdBy: actingSession?.fullName || 'Yönetici',
  }

  saveUsers([newUser, ...existingUsers])

  logActivity({
    type: 'user_create',
    userName: actingSession?.fullName || 'Yönetici',
    userRole: 'Yönetici',
    userId: actingSession?.userId,
    details: `Yeni personel eklendi: ${fullName} (@${username}, Rol: ${data.role === 'admin' ? 'Yönetici' : 'Garson'})`,
  })

  return { success: true, user: newUser }
}

/**
 * Update user details (Full name, username, role).
 */
export async function updateUser(
  userId: string,
  data: {
    fullName: string
    username: string
    role: 'admin' | 'waiter'
  },
  actingSession?: Session | null,
): Promise<{ success: boolean; user?: User; error?: string }> {
  const users = getAllUsers()
  const target = users.find((u) => u.id === userId && !u.isDeleted)
  if (!target) {
    return { success: false, error: 'Kullanıcı bulunamadı.' }
  }

  const fullName = data.fullName.trim()
  const username = data.username.trim().toLowerCase()

  if (!fullName) {
    return { success: false, error: 'Ad Soyad alanı zorunludur.' }
  }
  if (!username || username.length < 3) {
    return { success: false, error: 'Kullanıcı adı en az 3 karakter olmalıdır.' }
  }

  // Check duplicate username if changed
  if (username !== target.username.toLowerCase()) {
    const dup = users.find(
      (u) => u.id !== userId && !u.isDeleted && u.username.toLowerCase() === username,
    )
    if (dup) {
      return { success: false, error: `"${username}" kullanıcı adı başka bir kullanıcıya ait.` }
    }
  }

  // Safety: Cannot demote the last active admin
  if (target.role === 'admin' && data.role === 'waiter') {
    const activeAdmins = users.filter(
      (u) => u.id !== userId && !u.isDeleted && u.status === 'active' && u.role === 'admin',
    )
    if (activeAdmins.length === 0) {
      return {
        success: false,
        error: 'Sistemde en az bir aktif yönetici bulunmalıdır. Bu yöneticinin rolü değiştirilemez.',
      }
    }
  }

  const updatedUser: User = {
    ...target,
    fullName,
    username,
    role: data.role,
  }

  saveUsers(users.map((u) => (u.id === userId ? updatedUser : u)))

  logActivity({
    type: 'user_update',
    userName: actingSession?.fullName || 'Yönetici',
    userRole: 'Yönetici',
    userId: actingSession?.userId,
    details: `Kullanıcı güncellendi: ${fullName} (@${username}, Rol: ${data.role === 'admin' ? 'Yönetici' : 'Garson'})`,
  })

  // If the updated user is currently logged in, update their session
  const activeSession = getActiveSession()
  if (activeSession && activeSession.userId === userId) {
    saveActiveSession({
      ...activeSession,
      fullName,
      username,
      role: data.role,
    })
  }

  return { success: true, user: updatedUser }
}

/**
 * Reset user password and/or PIN.
 */
export async function resetUserPassword(
  userId: string,
  newPassword?: string,
  newPin?: string,
  mustChangePassword = false,
  actingSession?: Session | null,
): Promise<{ success: boolean; error?: string }> {
  const users = getAllUsers()
  const target = users.find((u) => u.id === userId && !u.isDeleted)
  if (!target) {
    return { success: false, error: 'Kullanıcı bulunamadı.' }
  }

  let passwordHash = target.passwordHash
  if (newPassword && newPassword.trim()) {
    const val = validateStrongPassword(newPassword)
    if (!val.valid) {
      return { success: false, error: val.error }
    }
    passwordHash = await hashSecret(newPassword.trim())
  }

  let pinHash = target.pinHash
  if (newPin !== undefined) {
    if (newPin.trim().length >= 4) {
      if (isSimplePin(newPin.trim())) {
        return {
          success: false,
          error: 'Basit veya ardışık PIN kodları (1234, 0000, 1111 vb.) kullanılamaz.',
        }
      }
      pinHash = await hashSecret(newPin.trim())
    } else if (newPin.trim() === '') {
      pinHash = undefined
    }
  }

  const updatedUser: User = {
    ...target,
    passwordHash,
    pinHash,
    mustChangePassword,
  }

  saveUsers(users.map((u) => (u.id === userId ? updatedUser : u)))

  logActivity({
    type: 'password_reset',
    userName: actingSession?.fullName || 'Yönetici',
    userRole: 'Yönetici',
    userId: actingSession?.userId,
    details: `${target.fullName} (@${target.username}) için şifre/PIN sıfırlandı.`,
  })

  return { success: true }
}

/**
 * Toggle user active/inactive status.
 */
export function toggleUserStatus(
  userId: string,
  actingSession?: Session | null,
): { success: boolean; user?: User; error?: string } {
  const users = getAllUsers()
  const target = users.find((u) => u.id === userId && !u.isDeleted)
  if (!target) {
    return { success: false, error: 'Kullanıcı bulunamadı.' }
  }

  // Safety: Cannot deactivate own account
  if (actingSession && actingSession.userId === userId) {
    return { success: false, error: 'Kendi hesabınızı pasife alamazsınız.' }
  }

  // Safety: Cannot deactivate the last active admin
  if (target.role === 'admin' && target.status === 'active') {
    const remainingActiveAdmins = users.filter(
      (u) => u.id !== userId && !u.isDeleted && u.status === 'active' && u.role === 'admin',
    )
    if (remainingActiveAdmins.length === 0) {
      return {
        success: false,
        error: 'Sistemde en az bir aktif yönetici kalmalıdır. Bu hesap pasife alınamaz.',
      }
    }
  }

  const newStatus = target.status === 'active' ? 'inactive' : 'active'
  const updatedUser: User = {
    ...target,
    status: newStatus,
  }

  saveUsers(users.map((u) => (u.id === userId ? updatedUser : u)))

  // If user was deactivated and is currently logged in, revoke their session immediately!
  const currentSession = getActiveSession()
  if (currentSession && currentSession.userId === userId && newStatus === 'inactive') {
    clearActiveSession()
  }

  logActivity({
    type: 'user_status_change',
    userName: actingSession?.fullName || 'Yönetici',
    userRole: 'Yönetici',
    userId: actingSession?.userId,
    details: `${target.fullName} (@${target.username}) ${newStatus === 'active' ? 'aktif edildi' : 'pasife alındı'}.`,
  })

  return { success: true, user: updatedUser }
}

/**
 * Soft delete user.
 */
export function softDeleteUser(
  userId: string,
  actingSession?: Session | null,
): { success: boolean; error?: string } {
  const users = getAllUsers()
  const target = users.find((u) => u.id === userId && !u.isDeleted)
  if (!target) {
    return { success: false, error: 'Kullanıcı bulunamadı.' }
  }

  // Safety: Cannot delete own account
  if (actingSession && actingSession.userId === userId) {
    return { success: false, error: 'Kendi hesabınızı silemezsiniz.' }
  }

  // Safety: Cannot delete the last active admin
  if (target.role === 'admin') {
    const remainingActiveAdmins = users.filter(
      (u) => u.id !== userId && !u.isDeleted && u.status === 'active' && u.role === 'admin',
    )
    if (remainingActiveAdmins.length === 0) {
      return {
        success: false,
        error: 'Sistemde en az bir aktif yönetici kalmalıdır. Bu hesap silinemez.',
      }
    }
  }

  const updatedUser: User = {
    ...target,
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    status: 'inactive',
  }

  saveUsers(users.map((u) => (u.id === userId ? updatedUser : u)))

  // Terminate any active session for this user
  const currentSession = getActiveSession()
  if (currentSession && currentSession.userId === userId) {
    clearActiveSession()
  }

  logActivity({
    type: 'user_delete',
    userName: actingSession?.fullName || 'Yönetici',
    userRole: 'Yönetici',
    userId: actingSession?.userId,
    details: `Kullanıcı silindi (arşivlendi): ${target.fullName} (@${target.username})`,
  })

  return { success: true }
}

/**
 * Force password change (used when mustChangePassword is true on login).
 */
export async function forceChangePassword(
  userId: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const users = getAllUsers()
  const target = users.find((u) => u.id === userId && !u.isDeleted)
  if (!target) {
    return { success: false, error: 'Kullanıcı bulunamadı.' }
  }

  const val = validateStrongPassword(newPassword)
  if (!val.valid) {
    return { success: false, error: val.error }
  }

  const passwordHash = await hashSecret(newPassword.trim())
  const updatedUser: User = {
    ...target,
    passwordHash,
    mustChangePassword: false,
  }

  saveUsers(users.map((u) => (u.id === userId ? updatedUser : u)))

  logActivity({
    type: 'password_reset',
    userName: target.fullName,
    userRole: target.role === 'admin' ? 'Yönetici' : 'Garson',
    userId: target.id,
    details: `${target.fullName} ilk giriş zorunlu şifre değişikliğini başarıyla tamamladı.`,
  })

  return { success: true }
}

/**
 * Verify an active administrator's password to authorize exiting Kiosk / POS application.
 * Protected by rate-limiting (5 failed attempts -> 60s lockout) and activity logging.
 */
export async function verifyAdminPasswordForExit(
  rawPassword: string,
  actingSession?: Session | null,
): Promise<{
  success: boolean
  adminUser?: User
  error?: string
  isLocked?: boolean
  lockRemainingSeconds?: number
}> {
  const lockKey = '__kiosk_admin_exit__'
  const attemptState = getLoginAttemptState(lockKey)
  const now = Date.now()

  if (attemptState.lockedUntil && attemptState.lockedUntil > now) {
    const remainingSeconds = Math.ceil((attemptState.lockedUntil - now) / 1000)
    return {
      success: false,
      isLocked: true,
      lockRemainingSeconds: remainingSeconds,
      error: `Çok sayıda hatalı yönetici şifresi girildi. Lütfen ${remainingSeconds} saniye bekleyin.`,
    }
  }

  const password = typeof rawPassword === 'string' ? rawPassword.trim() : ''
  if (!password) {
    return {
      success: false,
      error: 'Lütfen yönetici şifresini girin.',
    }
  }

  const activeAdmins = getAllUsers().filter(
    (u) => !u.isDeleted && u.status === 'active' && u.role === 'admin' && Boolean(u.passwordHash),
  )

  if (activeAdmins.length === 0) {
    return {
      success: false,
      error: 'Sistemde tanımlı aktif bir yönetici hesabı bulunamadı.',
    }
  }

  let matchedAdmin: User | null = null
  for (const admin of activeAdmins) {
    const isMatch = await verifySecret(password, admin.passwordHash)
    if (isMatch) {
      matchedAdmin = admin
      break
    }
  }

  if (!matchedAdmin) {
    const rateLimit = recordFailedAttempt(lockKey)
    logActivity({
      type: 'unauthorized_attempt',
      userName: actingSession?.fullName || 'Bilinmeyen Kullanıcı',
      userRole: actingSession?.role === 'admin' ? 'Yönetici' : 'Garson',
      userId: actingSession?.userId,
      details: `Uygulamadan çıkış için hatalı yönetici şifresi girildi. (Deneme: ${rateLimit.count}/${MAX_FAILED_ATTEMPTS})`,
    })

    if (rateLimit.locked) {
      return {
        success: false,
        isLocked: true,
        lockRemainingSeconds: rateLimit.remainingSeconds,
        error: `5 kez hatalı şifre girildiği için çıkış işlemi ${rateLimit.remainingSeconds} saniye kilitlendi.`,
      }
    }

    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - rateLimit.count)
    return {
      success: false,
      error: `Yönetici şifresi hatalı. (Kalan deneme hakkı: ${remaining})`,
    }
  }

  resetFailedAttempts(lockKey)

  logActivity({
    type: 'logout',
    userName: matchedAdmin.fullName,
    userRole: 'Yönetici',
    userId: matchedAdmin.id,
    details: `${matchedAdmin.fullName} (@${matchedAdmin.username}) yönetici şifresi onayı ile POS uygulamasından çıkış yaptı.`,
  })

  return {
    success: true,
    adminUser: matchedAdmin,
  }
}

