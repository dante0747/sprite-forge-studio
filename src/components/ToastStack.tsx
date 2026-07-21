import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export interface ToastItem {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  message?: string
}

export function ToastStack({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          {toast.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : toast.type === 'error' ? (
            <AlertTriangle size={18} />
          ) : (
            <Info size={18} />
          )}
          <span>
            <strong>{toast.title}</strong>
            {toast.message && <small>{toast.message}</small>}
          </span>
          <button type="button" onClick={() => dismiss(toast.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  )
}
