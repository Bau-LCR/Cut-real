import { useUi } from '../store/ui'
import { X } from './icons'
export function Toasts() {
  const { toasts, dismiss } = useUi()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}><span>{t.text}</span><button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => dismiss(t.id)} aria-label="Cerrar"><X className="sm" /></button></div>
      ))}
    </div>
  )
}
