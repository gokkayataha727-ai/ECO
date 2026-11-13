import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TopBar } from '../../src/components/TopBar'
import { DEFAULT_SETTINGS } from '../../src/types/settings'
import type { Session } from '../../src/types'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const createSession = (role: 'admin' | 'waiter'): Session => ({
  id: `sess-${role}`,
  userId: `user-${role}`,
  username: role,
  fullName: role === 'admin' ? 'Yönetici' : 'Garson Ali',
  role,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  lastActivityAt: new Date().toISOString(),
})

describe('TopBar Alta Al (Minimize) Button Suite', () => {
  let rootContainer: HTMLDivElement | null = null
  let root: Root | null = null
  const originalElectronAPI = (window as any).electronAPI

  beforeEach(() => {
    rootContainer = document.createElement('div')
    document.body.appendChild(rootContainer)
    root = createRoot(rootContainer)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    if (rootContainer && rootContainer.parentNode) {
      rootContainer.parentNode.removeChild(rootContainer)
      rootContainer = null
    }
    if (originalElectronAPI === undefined) {
      delete (window as any).electronAPI
    } else {
      (window as any).electronAPI = originalElectronAPI
    }
  })

  function renderTopBar(role: 'admin' | 'waiter') {
    act(() => {
      root!.render(
        <TopBar
          view="home"
          onViewChange={vi.fn()}
          onOpenSummary={vi.fn()}
          onOpenHelp={vi.fn()}
          onOpenProducts={vi.fn()}
          settings={DEFAULT_SETTINGS}
          currentSession={createSession(role)}
          onRequestAdminExit={vi.fn()}
        />,
      )
    })
  }

  it('does not render Alta Al button in browser mode (without electronAPI)', () => {
    delete (window as any).electronAPI
    renderTopBar('admin')
    const btn = rootContainer!.querySelector('button[aria-label="Pencereyi alta al"]')
    expect(btn).toBeNull()
  })

  it('renders Alta Al button for both waiter and admin roles in Electron and calls minimizeApp', async () => {
    const minimizeMock = vi.fn().mockResolvedValue({ success: true })
    ;(window as any).electronAPI = {
      isElectron: true,
      minimizeApp: minimizeMock,
    }

    renderTopBar('waiter')
    const waiterBtn = rootContainer!.querySelector('button[aria-label="Pencereyi alta al"]') as HTMLButtonElement | null
    expect(waiterBtn).not.toBeNull()
    expect(waiterBtn?.getAttribute('title')).toBe('Alta Al')
    expect(waiterBtn?.className).toContain('header-icon')
    expect(waiterBtn?.className).not.toContain('hidden')

    await act(async () => {
      waiterBtn?.click()
    })
    expect(minimizeMock).toHaveBeenCalledTimes(1)

    renderTopBar('admin')
    const adminBtn = rootContainer!.querySelector('button[aria-label="Pencereyi alta al"]') as HTMLButtonElement | null
    expect(adminBtn).not.toBeNull()
  })

  it('swallows { success: false } or rejected minimizeApp calls without throwing', async () => {
    const minimizeMock = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'Blocked' })
      .mockRejectedValueOnce(new Error('IPC error'))
    ;(window as any).electronAPI = {
      isElectron: true,
      minimizeApp: minimizeMock,
    }

    renderTopBar('waiter')
    const btn = rootContainer!.querySelector('button[aria-label="Pencereyi alta al"]') as HTMLButtonElement

    await expect(
      act(async () => {
        btn.click()
        await Promise.resolve()
      }),
    ).resolves.not.toThrow()

    await expect(
      act(async () => {
        btn.click()
        await Promise.resolve()
      }),
    ).resolves.not.toThrow()

    expect(minimizeMock).toHaveBeenCalledTimes(2)
  })
})
