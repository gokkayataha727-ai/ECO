import React, { createContext, useContext, useState, useCallback } from 'react'

export type KeyboardMode = 'text' | 'number'

interface KeyboardState {
  isOpen: boolean
  value: string
  onChange: (val: string) => void
  mode: KeyboardMode
  title: string
  onDone?: () => void
}

interface VirtualKeyboardContextType {
  keyboardState: KeyboardState
  openKeyboard: (options: {
    value: string
    onChange: (val: string) => void
    mode?: KeyboardMode
    title?: string
    onDone?: () => void
  }) => void
  closeKeyboard: () => void
}

const VirtualKeyboardContext = createContext<VirtualKeyboardContextType | null>(null)

export const VirtualKeyboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [keyboardState, setKeyboardState] = useState<KeyboardState>({
    isOpen: false,
    value: '',
    onChange: () => {},
    mode: 'text',
    title: 'Sanal Ekran Klavyesi',
  })

  const openKeyboard = useCallback(
    ({
      value,
      onChange,
      mode = 'text',
      title = 'Sanal Ekran Klavyesi',
      onDone,
    }: {
      value: string
      onChange: (val: string) => void
      mode?: KeyboardMode
      title?: string
      onDone?: () => void
    }) => {
      setKeyboardState({
        isOpen: true,
        value: value ?? '',
        onChange,
        mode,
        title,
        onDone,
      })
    },
    []
  )

  const closeKeyboard = useCallback(() => {
    setKeyboardState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  return (
    <VirtualKeyboardContext.Provider value={{ keyboardState, openKeyboard, closeKeyboard }}>
      {children}
    </VirtualKeyboardContext.Provider>
  )
}

export function useVirtualKeyboard() {
  const context = useContext(VirtualKeyboardContext)
  if (!context) {
    throw new Error('useVirtualKeyboard must be used within a VirtualKeyboardProvider')
  }
  return context
}
