/**
 * API Abstraction Layer
 * 
 * Tauri ortamında `invoke()`, tarayıcıda `fetch()` kullanır.
 * Bu sayede:
 *  - `npm run dev` (tarayıcı) → FastAPI backend'e fetch
 *  - `npm run tauri dev` (Tauri) → Rust backend'e IPC invoke
 */

import type { Product } from '../types'

// ──────────────────────────────────────────────
// Environment Detection
// ──────────────────────────────────────────────

/** Check if we're running inside Tauri */
function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

/** Dynamically import Tauri invoke (only available inside Tauri) */
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const moduleName = '@tauri-apps/api/core'
  const { invoke } = await import(/* @vite-ignore */ moduleName)
  return invoke<T>(cmd, args)
}

const API_BASE = 'http://localhost:8000/api'

// ──────────────────────────────────────────────
// Products
// ──────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  if (isTauri()) {
    const products = await tauriInvoke<any[]>('get_products')
    return products.map(formatProduct)
  }

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
  if (isTauri()) {
    let imageData: string | undefined
    let imageExt: string | undefined

    if (imageFile) {
      const buffer = await imageFile.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      imageData = uint8ArrayToBase64(bytes)
      imageExt = imageFile.name.split('.').pop() || 'png'
    }

    const result = await tauriInvoke<any>('save_product', {
      input: {
        id: product.id || null,
        name: product.name,
        category: product.category,
        price: product.price,
        description: product.description || null,
        badge: product.badge || null,
        option_groups: product.optionGroups ? JSON.stringify(product.optionGroups) : null,
        image_data: imageData || null,
        image_ext: imageExt || null,
      }
    })
    return formatProduct(result)
  }

  // Fallback: fetch to FastAPI
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
  if (isTauri()) {
    await tauriInvoke('delete_product', { productId: id })
    return
  }

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
  if (isTauri()) {
    return tauriInvoke('create_order', { input })
  }

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
  if (isTauri()) {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const data = uint8ArrayToBase64(bytes)
    const ext = file.name.split('.').pop() || 'png'
    return tauriInvoke<string>('upload_logo', { data, ext })
  }

  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/upload-logo`, { method: 'POST', body: formData })
  const result = await res.json()
  return result.url
}

// ──────────────────────────────────────────────
// Customer Display (Tauri only)
// ──────────────────────────────────────────────

export async function openCustomerDisplay(): Promise<void> {
  if (isTauri()) {
    await tauriInvoke('open_customer_display')
  }
}

export async function updateCustomerDisplay(cartJson: string): Promise<void> {
  if (isTauri()) {
    await tauriInvoke('update_customer_display', { cartJson })
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

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Check if Tauri is available — useful in UI to show/hide Tauri-only features */
export function isTauriEnvironment(): boolean {
  return isTauri()
}
