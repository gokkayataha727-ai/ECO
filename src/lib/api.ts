/**
 * API Abstraction Layer
 * 
 * Electron ortamında ve tarayıcıda aynı şekilde `fetch()` kullanır.
 * FastAPI backend'e bağlanır.
 * 
 * Electron-only özellikler (müşteri ekranı vb.) preload script
 * tarafından expose edilen `window.electronAPI` üzerinden erişilir.
 */

import type { Product } from '../types'

// ──────────────────────────────────────────────
// Environment Detection
// ──────────────────────────────────────────────

/** Check if we're running inside Electron */
function isElectron(): boolean {
  return !!(window as any).electronAPI
}

const API_BASE = 'http://localhost:8000/api'

// ──────────────────────────────────────────────
// Products
// ──────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products`)
  if (!res.ok) throw new Error('Failed to fetch products')
  const data = await res.json()
  return data.map((item: any) => ({
    ...item,
    optionGroups: item.optionGroups || (item.option_groups ? JSON.parse(item.option_groups) : undefined)
  }))
}

export async function saveProduct(
  product: Product,
  imageFile?: File | null
): Promise<Product> {
  const formData = new FormData()
  if (product.id) formData.append('id', product.id)
  formData.append('name', product.name)
  formData.append('category', product.category)
  formData.append('price', String(product.price))
  if (product.description) formData.append('description', product.description)
  if (product.badge) formData.append('badge', product.badge)
  if (product.optionGroups) formData.append('option_groups', JSON.stringify(product.optionGroups))
  if (imageFile) formData.append('image', imageFile)

  const res = await fetch(`${API_BASE}/products`, { method: 'POST', body: formData })
  const saved = await res.json()
  return formatProduct(saved)
}

export async function deleteProductApi(id: string): Promise<void> {
  await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' })
}

// ──────────────────────────────────────────────
// Orders
// ──────────────────────────────────────────────

export interface CreateOrderInput {
  total_amount: number
  discount_amount: number
  payment_type: string
  cashier: string
  items: {
    product_id: string
    quantity: number
    unit_price: number
    line_total: number
  }[]
}

export async function createOrder(input: CreateOrderInput): Promise<any> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return res.json()
}

// ──────────────────────────────────────────────
// Logo
// ──────────────────────────────────────────────

export async function uploadLogo(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/upload-logo`, { method: 'POST', body: formData })
  const result = await res.json()
  return result.url
}

// ──────────────────────────────────────────────
// Customer Display (Electron only)
// ──────────────────────────────────────────────

export async function openCustomerDisplay(): Promise<void> {
  if (isElectron()) {
    await (window as any).electronAPI.openCustomerDisplay()
  }
}

export async function updateCustomerDisplay(cartJson: string): Promise<void> {
  if (isElectron()) {
    await (window as any).electronAPI.updateCustomerDisplay(cartJson)
  }
}

export async function quitApp(): Promise<void> {
  if (isElectron()) {
    await (window as any).electronAPI.quitApp()
  }
}

export async function minimizeApp(): Promise<void> {
  if (isElectron()) {
    await (window as any).electronAPI.minimizeApp()
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (isElectron()) {
    await (window as any).electronAPI.toggleFullscreen()
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatProduct(raw: any): Product {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    price: raw.price,
    description: raw.description || '',
    image_url: raw.image_url,
    badge: raw.badge,
    optionGroups: raw.option_groups_parsed || raw.optionGroups || 
      (raw.option_groups ? safeJsonParse(raw.option_groups) : undefined),
  }
}

function safeJsonParse(str: string): any {
  try { return JSON.parse(str) } catch { return undefined }
}

/** Check if Electron is available — useful in UI to show/hide Electron-only features */
export function isElectronEnvironment(): boolean {
  return isElectron()
}
