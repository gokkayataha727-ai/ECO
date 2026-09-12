import { useState, useEffect } from 'react'

interface AppLogoProps {
  className?: string
  alt?: string
}

export function AppLogo({ className = "w-10 h-10 object-contain", alt = "Eco Coffee Logo" }: AppLogoProps) {
  const [logoSrc, setLogoSrc] = useState<string>(() => {
    return localStorage.getItem('customAppLogo') || '/logo.png'
  })
  const [fallbackIndex, setFallbackIndex] = useState(0)

  const fallbacks = ['/logo.png', '/logo.jpg', '/logo.jpeg', '/logo.webp', '/logo.svg']

  useEffect(() => {
    const handleUpdate = () => {
      const custom = localStorage.getItem('customAppLogo')
      if (custom) {
        setLogoSrc(custom)
      } else {
        setLogoSrc('/logo.png')
        setFallbackIndex(0)
      }
    }
    window.addEventListener('storage', handleUpdate)
    window.addEventListener('logoUpdated', handleUpdate)
    return () => {
      window.removeEventListener('storage', handleUpdate)
      window.removeEventListener('logoUpdated', handleUpdate)
    }
  }, [])

  const handleError = () => {
    const custom = localStorage.getItem('customAppLogo')
    if (custom && logoSrc === custom) {
      setLogoSrc(fallbacks[0])
      setFallbackIndex(0)
      return
    }

    if (fallbackIndex < fallbacks.length - 1) {
      const nextIndex = fallbackIndex + 1
      setFallbackIndex(nextIndex)
      setLogoSrc(fallbacks[nextIndex])
    }
  }

  return (
    <div className={`rounded-full overflow-hidden flex items-center justify-center bg-white shadow-sm border border-stone-200/50 ${className.replace('object-contain', '')}`}>
      <img
        src={logoSrc}
        alt={alt}
        className="w-full h-full object-cover"
        onError={handleError}
      />
    </div>
  )
}
