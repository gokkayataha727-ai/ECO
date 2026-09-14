import { memo, useState, useCallback, useEffect } from 'react'
import { Delete, Keyboard, Check, X, ArrowUp } from 'lucide-react'
import { openWindowsKeyboard } from '../lib/api'
import type { KeyboardMode } from '../context/VirtualKeyboardContext'

interface VirtualKeyboardProps {
  isOpen: boolean
  onClose: () => void
  value: string
  onChange: (newValue: string) => void
  title?: string
  mode?: KeyboardMode
  onDone?: () => void
}

export const VirtualKeyboard = memo(function VirtualKeyboard({
  isOpen,
  onClose,
  value = '',
  onChange,
  title = 'Sanal Ekran Klavyesi',
  mode = 'text',
  onDone,
}: VirtualKeyboardProps) {
  const [isUppercase, setIsUppercase] = useState(true)
  const [currentVal, setCurrentVal] = useState(value ?? '')

  // Prevent scroll jump on body when keyboard opens and keep local value synced
  useEffect(() => {
    if (isOpen) {
      setCurrentVal(value ?? '')
      const activeEl = document.activeElement as HTMLElement
      if (activeEl && typeof activeEl.blur === 'function') {
        activeEl.blur()
      }
    }
  }, [isOpen, value])

  const handleKeyPress = useCallback((char: string) => {
    const nextChar = isUppercase ? char.toLocaleUpperCase('tr-TR') : char.toLocaleLowerCase('tr-TR')
    const newVal = currentVal + nextChar
    setCurrentVal(newVal)
    onChange(newVal)
  }, [currentVal, onChange, isUppercase])

  const handleBackspace = useCallback(() => {
    if (currentVal.length > 0) {
      const newVal = currentVal.slice(0, -1)
      setCurrentVal(newVal)
      onChange(newVal)
    }
  }, [currentVal, onChange])

  const handleClear = useCallback(() => {
    setCurrentVal('')
    onChange('')
  }, [onChange])

  const handleSpace = useCallback(() => {
    const newVal = currentVal + ' '
    setCurrentVal(newVal)
    onChange(newVal)
  }, [currentVal, onChange])

  const handleOpenNativeKeyboard = useCallback(() => {
    openWindowsKeyboard().catch((err) => console.warn('Native keyboard error:', err))
  }, [])

  const handleDone = useCallback(() => {
    if (onDone) onDone()
    onClose()
  }, [onDone, onClose])

  if (!isOpen) return null

  const row1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const row2 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü']
  const row3 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i']
  const row4 = ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç']

  return (
    <div className="fixed inset-x-0 bottom-0 z-[10000] pointer-events-none flex flex-col justify-end select-none animate-fade-in p-2 sm:p-4">
      <div className="w-full max-w-4xl mx-auto bg-stone-900/95 text-stone-100 rounded-2xl sm:rounded-3xl border border-amber-500/30 shadow-[0_-12px_48px_rgba(0,0,0,0.7)] p-3 sm:p-5 flex flex-col gap-2.5 transition-all duration-200 pointer-events-auto">
        
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Keyboard size={18} />
            </div>
            <span className="font-bold text-stone-200 text-sm">{title}</span>
            {mode === 'number' && (
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Sayısal Klavye
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenNativeKeyboard}
              className="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-stone-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Windows Dokunmatik Klavyeyi Başlat"
            >
              <Keyboard size={14} />
              <span className="hidden sm:inline">Windows Ekran Klavyesi</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
              aria-label="Klavyeyi Kapat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Display value preview */}
        <div className="bg-stone-800/90 rounded-xl px-3.5 py-2 border border-stone-700/70 flex items-center justify-between min-h-[44px]">
          <span className="font-semibold text-base text-amber-200 tracking-wide break-all flex items-center gap-1">
            {currentVal ? (
              <>
                {currentVal}
                <span className="w-0.5 h-5 bg-amber-400 animate-pulse inline-block" />
              </>
            ) : (
              <span className="text-stone-500 italic text-sm">Yazmak için tuşlara basın...</span>
            )}
          </span>
          {currentVal && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-rose-400 hover:text-rose-300 font-bold px-2.5 py-1 bg-rose-500/15 hover:bg-rose-500/25 rounded-lg ml-2 transition-colors flex-shrink-0"
            >
              Temizle
            </button>
          )}
        </div>

        {/* Keyboard Buttons */}
        {mode === 'number' ? (
          /* Numeric Numpad Layout */
          <div className="grid grid-cols-4 gap-2 py-1">
            {['7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-14 rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-extrabold text-xl shadow-sm transition-all"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              className="h-14 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 active:bg-rose-700 text-rose-200 font-bold flex items-center justify-center transition-all"
              title="Sil"
            >
              <Delete size={22} />
            </button>

            {['4', '5', '6'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-14 rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-extrabold text-xl shadow-sm transition-all"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-14 rounded-xl bg-stone-800 hover:bg-rose-900/50 text-rose-300 font-bold text-sm transition-all"
            >
              C
            </button>

            {['1', '2', '3'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-14 rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-extrabold text-xl shadow-sm transition-all"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleDone}
              className="row-span-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-lg shadow-lg flex flex-col items-center justify-center gap-1 transition-all"
            >
              <Check size={24} />
              <span>Tamam</span>
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="col-span-2 h-14 rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-extrabold text-xl shadow-sm transition-all"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleKeyPress(',')}
              className="h-14 rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-extrabold text-xl shadow-sm transition-all"
            >
              ,
            </button>
          </div>
        ) : (
          /* Full QWERTY Text Layout */
          <div className="flex flex-col gap-1.5">
            {/* Row 1 (Numbers + Backspace) */}
            <div className="flex gap-1 justify-center">
              {row1.map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeyPress(num)}
                  className="flex-1 min-h-[44px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-bold text-base shadow-sm transition-all"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleBackspace}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-950/60 hover:bg-rose-900/80 active:bg-rose-700 text-rose-200 font-bold flex items-center justify-center transition-all"
              >
                <Delete size={18} />
              </button>
            </div>

            {/* Row 2 */}
            <div className="flex gap-1 justify-center">
              {row2.map((char) => {
                const displayChar = isUppercase ? char.toLocaleUpperCase('tr-TR') : char
                return (
                  <button
                    key={char}
                    type="button"
                    onClick={() => handleKeyPress(char)}
                    className="flex-1 min-h-[44px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-bold text-base shadow-sm transition-all"
                  >
                    {displayChar}
                  </button>
                )
              })}
            </div>

            {/* Row 3 */}
            <div className="flex gap-1 justify-center">
              {row3.map((char) => {
                const displayChar = isUppercase ? char.toLocaleUpperCase('tr-TR') : char
                return (
                  <button
                    key={char}
                    type="button"
                    onClick={() => handleKeyPress(char)}
                    className="flex-1 min-h-[44px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-bold text-base shadow-sm transition-all"
                  >
                    {displayChar}
                  </button>
                )
              })}
            </div>

            {/* Row 4 (Shift + Letters + Backspace) */}
            <div className="flex gap-1 justify-center">
              <button
                type="button"
                onClick={() => setIsUppercase(!isUppercase)}
                className={`flex-1 min-h-[44px] rounded-xl font-bold flex items-center justify-center transition-all ${
                  isUppercase ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                }`}
                title="Büyük / Küçük Harf"
              >
                <ArrowUp size={18} />
              </button>
              {row4.map((char) => {
                const displayChar = isUppercase ? char.toLocaleUpperCase('tr-TR') : char
                return (
                  <button
                    key={char}
                    type="button"
                    onClick={() => handleKeyPress(char)}
                    className="flex-1 min-h-[44px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-bold text-base shadow-sm transition-all"
                  >
                    {displayChar}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={handleBackspace}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-950/60 hover:bg-rose-900/80 active:bg-rose-700 text-rose-200 font-bold flex items-center justify-center transition-all"
              >
                <Delete size={18} />
              </button>
            </div>

            {/* Row 5 (Space + Done) */}
            <div className="flex gap-2 justify-center mt-1">
              <button
                type="button"
                onClick={handleSpace}
                className="flex-[3] min-h-[46px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-stone-300 font-bold text-sm shadow-sm transition-all"
              >
                Boşluk
              </button>
              <button
                type="button"
                onClick={handleDone}
                className="flex-[2] min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-base shadow-md flex items-center justify-center gap-1.5 transition-all"
              >
                <Check size={18} />
                Tamam
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
})
