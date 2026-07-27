import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import clsx from 'clsx'

export function Modal({
  title, subtitle, onClose, children, wide,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className={clsx('modal', wide && 'modal-wide')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({
  label, error, hint, wide, children,
}: {
  label: string
  error?: string
  hint?: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <label className={clsx('field', wide && 'field-wide', error && 'field-invalid')}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Stat({
  label, value, hint, tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'positive' | 'negative' | 'warning' | 'neutral'
}) {
  return (
    <article className={clsx('stat', tone && `stat-${tone}`)}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </article>
  )
}

export function Empty({
  title, text, action,
}: {
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function Loader({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="loader" role="status">
      <span />
      <span />
      <span />
      <em>{label}</em>
    </div>
  )
}

export function Confirm({
  title, text, confirmLabel, danger, onConfirm, onCancel,
}: {
  title: string
  text: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm">
        <p className="confirm-text">
          {danger && <AlertTriangle size={18} className="confirm-icon" />}
          {text}
        </p>
        <div className="confirm-actions">
          <button type="button" className="button ghost" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className={clsx('button', danger ? 'danger' : 'primary')}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [message, onClose])

  return (
    <button type="button" className="toast" onClick={onClose}>
      {message}
      <X size={16} />
    </button>
  )
}
