import { useState, useEffect, useRef } from 'react'
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  HardDrive,
  Download,
  X,
} from 'lucide-react'
import type { SystemHealthReport, HealthLevel } from '../lib/systemHealth'

interface SystemHealthIndicatorProps {
  report: SystemHealthReport
  onRefreshHealth?: () => void
  onTriggerBackup?: () => void
  onVerifyChain?: () => void
  onExportLogs?: () => void
}

const STATUS_STYLES: Record<
  HealthLevel,
  {
    buttonClass: string
    dotClass: string
    badgeClass: string
    label: string
  }
> = {
  green: {
    buttonClass:
      'text-stone-400 hover:text-emerald-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-emerald-400 dark:hover:bg-stone-800 border-transparent',
    dotClass: 'bg-emerald-500',
    badgeClass:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    label: 'Sistem Sağlıklı',
  },
  yellow: {
    buttonClass:
      'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700',
    dotClass: 'bg-amber-500 animate-pulse',
    badgeClass:
      'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border-amber-300 dark:border-amber-700',
    label: 'Dikkat Gerektiren Durum',
  },
  red: {
    buttonClass:
      'bg-rose-600 text-white border-rose-700 hover:bg-rose-700 animate-pulse shadow-sm',
    dotClass: 'bg-white',
    badgeClass:
      'bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200 border-rose-300 dark:border-rose-700',
    label: 'Kritik Sistem Uyarısı',
  },
}

export function SystemHealthIndicator({
  report,
  onRefreshHealth,
  onTriggerBackup,
  onVerifyChain,
  onExportLogs,
}: SystemHealthIndicatorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const style = STATUS_STYLES[report.overallStatus]

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next && onRefreshHealth) {
            onRefreshHealth()
          }
        }}
        data-testid="system-health-indicator-btn"
        data-health-status={report.overallStatus}
        title={`Sistem Sağlığı: ${style.label}`}
        className={`relative flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-extrabold transition-colors ${style.buttonClass}`}
      >
        <Activity size={15} />
        <span className={`w-2 h-2 rounded-full ${style.dotClass}`} />
        {report.overallStatus !== 'green' && (
          <span className="hidden xl:inline">
            {report.criticalCount > 0
              ? `${report.criticalCount} Kritik`
              : `${report.warningCount} Uyarı`}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="system-health-popover"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-stone-50 dark:bg-stone-800/80 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-black border ${style.badgeClass}`}
              >
                {style.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {onRefreshHealth && (
                <button
                  type="button"
                  onClick={onRefreshHealth}
                  title="Yenile"
                  className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200/70 dark:hover:bg-stone-700"
                >
                  <RefreshCw size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200/70 dark:hover:bg-stone-700"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 6 Health Checks */}
          <div className="p-3 space-y-2 max-h-96 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
            {report.items.map((item) => {
              const Icon =
                item.status === 'green'
                  ? CheckCircle2
                  : item.status === 'yellow'
                    ? AlertTriangle
                    : ShieldAlert
              const iconColor =
                item.status === 'green'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : item.status === 'yellow'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'

              return (
                <div
                  key={item.id}
                  data-testid={`health-item-${item.id}`}
                  data-item-status={item.status}
                  className="pt-2 first:pt-0 flex items-start gap-2.5"
                >
                  <Icon size={16} className={`mt-0.5 shrink-0 ${iconColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-stone-900 dark:text-stone-100">
                        {item.title}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          item.status === 'green'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : item.status === 'yellow'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {item.status === 'green'
                          ? 'Normal'
                          : item.status === 'yellow'
                            ? 'Uyarı'
                            : 'Kritik'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-stone-700 dark:text-stone-300 mt-0.5">
                      {item.summary}
                    </div>
                    {item.detail && (
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 break-words">
                        {item.detail}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Quick Actions Footer */}
          <div className="px-3 py-2.5 bg-stone-50 dark:bg-stone-800/80 border-t border-stone-200 dark:border-stone-700 flex flex-wrap items-center justify-between gap-2">
            {onTriggerBackup && (
              <button
                type="button"
                onClick={() => {
                  onTriggerBackup()
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-800 text-white hover:bg-amber-900 text-[11px] font-bold"
              >
                <HardDrive size={12} />
                <span>Şimdi Yedek Al</span>
              </button>
            )}
            {onVerifyChain && (
              <button
                type="button"
                onClick={() => {
                  onVerifyChain()
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 hover:bg-stone-300 text-[11px] font-bold"
              >
                <RefreshCw size={12} />
                <span>Zinciri Doğrula</span>
              </button>
            )}
            {onExportLogs && (
              <button
                type="button"
                onClick={() => {
                  onExportLogs()
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 hover:bg-stone-300 text-[11px] font-bold"
              >
                <Download size={12} />
                <span>Hata Kayıtları</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
