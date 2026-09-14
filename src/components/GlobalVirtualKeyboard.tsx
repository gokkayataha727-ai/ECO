import React from 'react'
import { useVirtualKeyboard } from '../context/VirtualKeyboardContext'
import { VirtualKeyboard } from './VirtualKeyboard'

export const GlobalVirtualKeyboard: React.FC = () => {
  const { keyboardState, closeKeyboard } = useVirtualKeyboard()

  if (!keyboardState.isOpen) return null

  return (
    <VirtualKeyboard
      isOpen={keyboardState.isOpen}
      onClose={closeKeyboard}
      value={keyboardState.value}
      onChange={keyboardState.onChange}
      mode={keyboardState.mode}
      title={keyboardState.title}
      onDone={keyboardState.onDone}
    />
  )
}
