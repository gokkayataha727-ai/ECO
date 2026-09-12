import { useEffect, useState } from 'react'
import { AppLogo } from './AppLogo'

interface SplashScreenProps {
  onComplete: () => void
}

// Falling icon items — small emoji-style symbols
const fallingIcons = [
  // Left region
  { symbol: '☕', left: '2%', delay: '0s', duration: '2.8s', size: 36 },
  { symbol: '🍪', left: '9%', delay: '0.3s', duration: '3.2s', size: 30 },
  { symbol: '🫘', left: '5%', delay: '0.6s', duration: '2.5s', size: 26 },
  { symbol: '🥐', left: '16%', delay: '0.15s', duration: '3s', size: 34 },
  { symbol: '☕', left: '22%', delay: '0.5s', duration: '2.6s', size: 28 },
  { symbol: '🍰', left: '1%', delay: '0.8s', duration: '3.4s', size: 30 },
  { symbol: '🫘', left: '13%', delay: '0.4s', duration: '2.9s', size: 24 },
  { symbol: '🍪', left: '25%', delay: '0.7s', duration: '3.1s', size: 28 },
  { symbol: '🥐', left: '7%', delay: '0.2s', duration: '2.7s', size: 32 },
  { symbol: '☕', left: '19%', delay: '0.55s', duration: '3.3s', size: 26 },
  { symbol: '🍰', left: '11%', delay: '0.1s', duration: '2.4s', size: 38 },
  { symbol: '🍪', left: '27%', delay: '0.65s', duration: '3s', size: 24 },
  { symbol: '🫘', left: '3%', delay: '0.45s', duration: '2.8s', size: 28 },
  { symbol: '☕', left: '15%', delay: '0.75s', duration: '3.1s', size: 32 },
  { symbol: '🥐', left: '24%', delay: '0.35s', duration: '2.6s', size: 26 },
  { symbol: '🍰', left: '20%', delay: '0.9s', duration: '3.4s', size: 30 },

  // Right region
  { symbol: '☕', left: '75%', delay: '0.2s', duration: '3s', size: 36 },
  { symbol: '🍰', left: '83%', delay: '0.45s', duration: '2.7s', size: 32 },
  { symbol: '🥐', left: '91%', delay: '0.1s', duration: '3.3s', size: 34 },
  { symbol: '🫘', left: '80%', delay: '0.65s', duration: '2.8s', size: 26 },
  { symbol: '🍪', left: '96%', delay: '0.35s', duration: '3.1s', size: 28 },
  { symbol: '☕', left: '73%', delay: '0.55s', duration: '2.5s', size: 30 },
  { symbol: '🥐', left: '88%', delay: '0.8s', duration: '3.2s', size: 26 },
  { symbol: '🍰', left: '77%', delay: '0.25s', duration: '2.9s', size: 28 },
  { symbol: '🍪', left: '85%', delay: '0s', duration: '2.6s', size: 40 },
  { symbol: '🫘', left: '93%', delay: '0.5s', duration: '3.4s', size: 30 },
  { symbol: '☕', left: '78%', delay: '0.7s', duration: '2.4s', size: 34 },
  { symbol: '🥐', left: '95%', delay: '0.15s', duration: '3s', size: 24 },
  { symbol: '🍰', left: '82%', delay: '0.4s', duration: '2.7s', size: 32 },
  { symbol: '🫘', left: '72%', delay: '0.6s', duration: '3.2s', size: 28 },
  { symbol: '🍪', left: '90%', delay: '0.85s', duration: '2.9s', size: 26 },
  { symbol: '☕', left: '87%', delay: '0.3s', duration: '3.1s', size: 30 },
]

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'logo' | 'text' | 'hold' | 'fadeout'>('logo')

  useEffect(() => {
    const textTimer = setTimeout(() => setPhase('text'), 600)
    const holdTimer = setTimeout(() => setPhase('hold'), 1000)
    const fadeTimer = setTimeout(() => setPhase('fadeout'), 3300)
    const completeTimer = setTimeout(() => onComplete(), 3800)

    return () => {
      clearTimeout(textTimer)
      clearTimeout(holdTimer)
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  return (
    <div className={`splash-screen ${phase === 'fadeout' ? 'splash-fadeout' : ''}`}>
      {/* Falling icon particles */}
      {fallingIcons.map((icon, i) => (
        <span
          key={i}
          className="splash-falling-icon"
          style={{
            left: icon.left,
            fontSize: `${icon.size}px`,
            animationDelay: icon.delay,
            animationDuration: icon.duration,
          }}
          aria-hidden="true"
        >
          {icon.symbol}
        </span>
      ))}

      <div className="splash-content">
        <div className="splash-logo">
          <AppLogo className="w-56 h-56 object-contain" alt="Eco Coffee Logo" />
        </div>
        <h1 className={`splash-title ${phase !== 'logo' ? 'splash-title-visible' : ''}`}>
          Eco Coffee Yönetim Sistemine Hoşgeldiniz
        </h1>
      </div>
    </div>
  )
}
