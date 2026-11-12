import { ShieldAlert } from 'lucide-react'

interface PermissionDeniedModalProps {
  isOpen: boolean
  onClose: () => void
  actionName: string
  onSwitchUser?: () => void
}

export function PermissionDeniedModal({
  isOpen,
  onClose,
  actionName,
  onSwitchUser,
}: PermissionDeniedModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Yetkisiz İşlem"
      onClick={onClose}
    >
      <div
        className="modal max-w-sm w-full bg-white dark:bg-stone-900 rounded-2xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto grid place-items-center">
          <ShieldAlert size={24} />
        </div>

        <div>
          <h3 className="text-base font-extrabold text-[#3b291f] dark:text-stone-100">
            Yönetici Yetkisi Gereklidir
          </h3>
          <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
            <strong>{actionName}</strong> işlemi için yönetici yetkisi gerekmektedir. Garson rolündeki kullanıcılar varsayılan olarak bu işlemi yapamaz.
          </p>
          <p className="text-[11px] text-stone-500 dark:text-stone-500 mt-2">
            Ayarlar &gt; Kullanıcılar menüsünden bu yetkiyi garsonlar için açabilir veya Yönetici hesabıyla giriş yapabilirsiniz.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            className="outline-action flex-1"
            onClick={onClose}
          >
            Kapat
          </button>
          {onSwitchUser && (
            <button
              type="button"
              className="solid-action flex-1 bg-amber-800 hover:bg-amber-900 text-white font-bold"
              onClick={() => {
                onSwitchUser()
                onClose()
              }}
            >
              Yöneticiyle Giriş Yap
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
