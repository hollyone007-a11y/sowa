import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Printer, QrCode, RefreshCw, X } from 'lucide-react'
import clsx from 'clsx'
import { Empty } from './primitives'
import { formatDate, joinUrl } from '../lib/format'
import type { HousingApplication, Property } from '../types'

const statusText = {
  pending: 'Ждёт решения',
  approved: 'Одобрена',
  rejected: 'Отклонена',
} as const

export function ApplicationsView({
  applications, canReview, onApprove, onReject,
}: {
  applications: HousingApplication[]
  canReview: boolean
  onApprove: (application: HousingApplication) => void
  onReject: (application: HousingApplication) => void
}) {
  const pending = applications.filter((item) => item.status === 'pending')
  const handled = applications.filter((item) => item.status !== 'pending')

  if (applications.length === 0) {
    return (
      <Empty
        title="Заявок пока нет"
        text="Заявки появляются здесь, когда кто-то заполняет анкету по QR-коду адреса."
      />
    )
  }

  return (
    <div className="applications">
      {pending.length > 0 && (
        <section className="panel">
          <header className="panel-head">
            <h2>Ждут решения</h2>
            <span className="count-badge">{pending.length}</span>
          </header>
          <ul className="application-list">
            {pending.map((application) => (
              <ApplicationRow
                key={application.id}
                application={application}
                canReview={canReview}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
          </ul>
        </section>
      )}

      {handled.length > 0 && (
        <section className="panel">
          <header className="panel-head">
            <h2>Обработанные</h2>
          </header>
          <ul className="application-list">
            {handled.map((application) => (
              <ApplicationRow key={application.id} application={application} canReview={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ApplicationRow({
  application, canReview, onApprove, onReject,
}: {
  application: HousingApplication
  canReview: boolean
  onApprove?: (application: HousingApplication) => void
  onReject?: (application: HousingApplication) => void
}) {
  const [passportVisible, setPassportVisible] = useState(false)
  const maskedPassport = `•••• ${application.passport_number.slice(-4)}`

  return (
    <li className={clsx('application-row', `is-${application.status}`)}>
      <div className="application-identity">
        <strong>
          {application.first_name} {application.last_name}
        </strong>
        <small>
          {application.phone}
          {application.workplace ? ` · ${application.workplace}` : ''}
        </small>
      </div>

      <div className="application-place">
        <span>{application.property_name ?? 'Адрес удалён'}</span>
        <small>Заезд с {formatDate(application.requested_move_in)}</small>
      </div>

      <div className="application-doc">
        <span>Паспорт {application.passport_series ?? ''} {passportVisible ? application.passport_number : maskedPassport}</span>
        <button type="button" className="link-button" onClick={() => setPassportVisible(value => !value)}>{passportVisible ? 'Скрыть' : 'Показать'}</button>
        <small>{application.ukraine_registration}</small>
      </div>

      <span className={clsx('pill', application.status === 'approved' ? 'paid' : application.status === 'rejected' ? 'unpaid' : 'partial')}>
        {statusText[application.status]}
      </span>

      {canReview && onApprove && onReject && (
        <div className="application-actions">
          <button type="button" className="button tiny primary" onClick={() => onApprove(application)}>
            <Check size={15} /> Заселить
          </button>
          <button type="button" className="button tiny ghost" onClick={() => onReject(application)}>
            <X size={15} /> Отклонить
          </button>
        </div>
      )}

      {application.rejection_reason && (
        <p className="application-note">Причина: {application.rejection_reason}</p>
      )}
    </li>
  )
}

export function QrView({
  properties, onRotate,
}: {
  properties: Property[]
  onRotate: (property: Property) => void
}) {
  const linked = properties.filter((property) => property.public_token)

  if (linked.length === 0) {
    return (
      <Empty
        title="Ссылок пока нет"
        text="QR-код создаётся вместе с адресом. Добавьте адрес — и он появится здесь."
      />
    )
  }

  return (
    <>
      <p className="hint-bar">
        <QrCode size={16} /> Распечатайте код и повесьте у входа. Кто его отсканирует,
        заполнит анкету, а она придёт во вкладку «Заявки». Если код попал не туда —
        обновите его, старый сразу перестанет работать.
      </p>
      <div className="qr-grid">
        {linked.map((property) => (
          <QrCard key={property.id} property={property} onRotate={onRotate} />
        ))}
      </div>
    </>
  )
}

function QrCard({ property, onRotate }: { property: Property; onRotate: (property: Property) => void }) {
  const url = joinUrl(property.public_token!)
  const [image, setImage] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      .then((result) => alive && setImage(result))
      .catch(() => alive && setImage(''))
    return () => {
      alive = false
    }
  }, [url])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked without https; the link stays selectable below.
    }
  }

  return (
    <article className="qr-card">
      <header>
        <strong>{property.name}</strong>
        <small>{property.full_address}</small>
      </header>
      {image ? (
        <img src={image} alt={`QR-код для ${property.name}`} />
      ) : (
        <div className="qr-placeholder" />
      )}
      <code className="qr-link">{url}</code>
      <div className="qr-actions no-print">
        <button type="button" className="button tiny ghost" onClick={() => void copy()}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Скопировано' : 'Ссылка'}
        </button>
        <button type="button" className="button tiny ghost" onClick={() => window.print()}>
          <Printer size={15} /> Печать
        </button>
        <button type="button" className="button tiny ghost" onClick={() => onRotate(property)}>
          <RefreshCw size={15} /> Обновить
        </button>
      </div>
    </article>
  )
}
