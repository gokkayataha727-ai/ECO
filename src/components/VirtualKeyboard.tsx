import { memo, useState, useCallback } from 'react'
import { Delete, Keyboard, Check, X, ArrowUp } from 'lucide-react'
import { openWindowsKeyboard } from '../lib/api'

interface VirtualKeyboardProps {
  isOpen: boolean
  onClose: () => void
  value: string
  onChange: (newValue: string) => void
  title?: string
  onDone?: () => void
}

export const VirtualKeyboard = memo(function VirtualKeyboard({
  isOpen,
  onClose,
  value,
  onChange,
  title = 'Sanal Ekran Klavyesi',
  onDone,
}: VirtualKeyboardProps) {
  const [isUppercase, setIsUppercase] = useState(true)

  const handleKeyPress = useCallback((char: string) => {
    const nextChar = isUppercase ? char.toLocaleUpperCase('tr-TR') : char.toLocaleLowerCase('tr-TR')
    onChange(value + nextChar)
  }, [value, onChange, isUppercase])

  const handleBackspace = useCallback(() => {
    if (value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }, [value, onChange])

  const handleClear = useCallback(() => {
    onChange('')
  }, [onChange])

  const handleSpace = useCallback(() => {
    onChange(value + ' ')
  }, [value, onChange])

  const handleOpenNativeKeyboard = useCallback(() => {
    openWindowsKeyboard().catch(err => console.warn('Native keyboard error:', err))
  }, [])

  if (!isOpen) return null

  const row1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const row2 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü']
  const row3 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i']
  const row4 = ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç']

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-5xl mx-auto bg-stone-900/95 text-stone-100 rounded-t-3xl border-t border-amber-500/20 shadow-2xl p-4 sm:p-6 mb-0 flex flex-col gap-3 transition-all duration-200">
        
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="text-amber-400" size={20} />
            <span className="font-bold text-stone-200 text-sm">{title}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenNativeKeyboard}
              className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Windows Dokunmatik Klavyeyi Başlat"
            >
              <Keyboard size={14} />
              Windows Ekran Klavyesi
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Display value preview */}
        <div className="bg-stone-800/80 rounded-xl p-3 border border-stone-700/60 flex items-center justify-between min-h-[48px]">
          <span className="font-medium text-base text-amber-100 break-all">
            {value || <span className="text-stone-500 italic">Yazmak için aşağıdaki tuşlara basın...</span>}
          </span>
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-rose-400 hover:text-rose-300 font-bold px-2 py-1 bg-rose-500/10 rounded-lg ml-2"
            >
              Temizle
            </button>
          )}
        </div>

        {/* Keyboard Buttons */}
        <div className="flex flex-col gap-2 select-none">
          {/* Row 1 (Numbers + Backspace) */}
          <div className="flex gap-1.5 justify-center">
            {row1.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="flex-1 min-h-[46px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-bold text-lg shadow-sm transition-all"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              className="flex-1 min-h-[46px] rounded-xl bg-rose-900/40 hover:bg-rose-800/60 active:bg-rose-700 text-rose-200 font-bold flex items-center justify-center transition-all"
            >
              <Delete size={20} />
            </button>
          </div>

          {/* Row 2 */}
          <div className="flex gap-1.5 justify-center">
            {row2.map((char) => {
              const displayChar = isUppercase ? char.toLocaleUpperCase('tr-TR') : char
              return (
                <button
                  key={char}
                  type="button"
                  onClick={() => handleKeyPress(char)}
                  className="flex-1 min-h-[46px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-bold text-base shadow-sm transition-all"
                >
                  {displayChar}
                </button>
              )
            })}
          </div>

          {/* Row 3 */}
          <div className="flex gap-1.5 justify-center px-3">
            {row3.map((char) => {
              const displayChar = isUppercase ? char.toLocaleUpperCase('tr-TR') : char
              return (
                <button
                  key={char}
                  type="button"
                  onClick={() => handleKeyPress(char)}
                  className="flex-1 min-h-[46px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-bold text-base shadow-sm transition-all"
                >
                  {displayChar}
                </button>
              )
            })}
          </div>

          {/* Row 4 (Shift + Letters + Backspace) */}
          <div className="flex gap-1.5 justify-center">
            <button
              type="button"
              onClick={() => setIsUppercase(!isUppercase)}
              className={`flex-1 min-h-[46px] rounded-xl font-bold flex items-center justify-center transition-all ${
                isUppercase ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
              }`}
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
                  className="flex-1 min-h-[46px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-amber-600 text-stone-100 font-bold text-base shadow-sm transition-all"
                >
                  {displayChar}
                </button>
              )
            })}
            <button
              type="button"
              onClick={handleBackspace}
              className="flex-1 min-h-[46px] rounded-xl bg-rose-900/40 hover:bg-rose-800/60 active:bg-rose-700 text-rose-200 font-bold flex items-center justify-center transition-all"
            >
              <Delete size={20} />
            </button>
          </div>

          {/* Row 5 (Space + Done) */}
          <div className="flex gap-2 justify-center mt-1">
            <button
              type="button"
              onClick={handleSpace}
              className="flex-[3] min-h-[48px] rounded-xl bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-stone-300 font-bold text-sm shadow-sm transition-all"
            >
              Boşluk
            </button>
            <button
              type="button"
              onClick={() => {
                if (onDone) onDone()
                onClose()
              }}
              className="flex-[2] min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-base shadow-md flex items-center justify-center gap-1.5 transition-all"
            >
              <Check size={18} />
              Tamam
            </button>
          </div>
        </div>

      </div>
    </div>
  )
})
