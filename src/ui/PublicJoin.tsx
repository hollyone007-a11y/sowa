import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, MapPin, ShieldCheck } from 'lucide-react'
import { LogoMark } from './Logo'
import { Field } from './primitives'
import { useZodForm } from './useZodForm'
import { publicApplicationSchema, type PublicApplicationInput } from '../lib/schemas'
import { today } from '../lib/format'
import type { Backend } from '../lib/backend'
import type { PublicProperty } from '../types'

/**
 * The page behind the QR code taped to a door. No session, no navigation —
 * whoever scanned it can only describe themselves and wait for a manager.
 */
export function PublicJoin({ token, backend }: { token: string; backend: Backend }) {
  const [property, setProperty] = useState<PublicProperty | null>(null)
  const [pageError, setPageError] = useState('')
  const [done, setDone] = useState(false)
  const { errors, formError, busy, submit } = useZodForm<PublicApplicationInput>(publicApplicationSchema)

  useEffect(() => {
    let alive = true
    backend
      .getPublicProperty(token)
      .then((result) => alive && setProperty(result))
      .catch((cause: unknown) => {
        if (alive) {
          setPageError(
            cause instanceof Error ? cause.message : 'Ссылка недействительна или была отключена',
          )
        }
      })
    return () => {
      alive = false
    }
  }, [backend, token])

  if (pageError) {
    return (
      <Shell>
        <div className="join-message">
          <h1>Ссылка не работает</h1>
          <p>{pageError}</p>
          <p className="muted">Попросите у представителя агентства действующий QR-код.</p>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <div className="join-message">
          <CheckCircle2 size={44} className="ok-text" />
          <h1>Заявка отправлена</h1>
          <p>
            Менеджер свяжется с вами по указанному телефону. Повторно отправлять анкету
            не нужно.
          </p>
        </div>
      </Shell>
    )
  }

  if (!property) {
    return (
      <Shell>
        <p className="muted">Загрузка…</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="join-property">
        <MapPin size={17} />
        <div>
          <strong>{property.property_name}</strong>
          <small>{property.full_address}</small>
        </div>
      </div>

      <h1>Заявка на заселение</h1>
      <p className="muted">
        Заполните анкету — она попадёт менеджеру этого адреса. Паспортные данные нужны
        для оформления проживания и хранятся отдельно от остальных сведений.
      </p>

      <form
        className="form-grid"
        onSubmit={submit(async (input) => {
          await backend.submitApplication(token, input)
          setDone(true)
        })}
      >
        <Field label="Имя" error={errors.first_name}>
          <input name="first_name" autoComplete="given-name" />
        </Field>
        <Field label="Фамилия" error={errors.last_name}>
          <input name="last_name" autoComplete="family-name" />
        </Field>
        <Field label="Телефон" error={errors.phone}>
          <input name="phone" type="tel" autoComplete="tel" placeholder="+420 …" />
        </Field>
        <Field label="Место работы" error={errors.workplace}>
          <input name="workplace" />
        </Field>
        <Field label="Серия паспорта" error={errors.passport_series}>
          <input name="passport_series" autoComplete="off" />
        </Field>
        <Field label="Номер паспорта" error={errors.passport_number}>
          <input name="passport_number" autoComplete="off" />
        </Field>
        <Field label="Прописка в Украине" error={errors.ukraine_registration} wide>
          <textarea name="ukraine_registration" rows={2} />
        </Field>
        <Field label="Желаемая дата заезда" error={errors.requested_move_in} wide>
          <input name="requested_move_in" type="date" defaultValue={today()} />
        </Field>

        {/* Honeypot: hidden from people, irresistible to form bots. */}
        <input
          className="honeypot"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <div className="field field-wide checkbox-field">
          <label>
            <input type="checkbox" name="consent" value="on" />
            <span>
              Согласен(на) на обработку персональных данных для оформления проживания
            </span>
          </label>
        </div>
        {errors.consent && <p className="form-error field-wide">{errors.consent}</p>}
        {formError && <p className="form-error field-wide">{formError}</p>}

        <div className="form-actions">
          <button type="submit" className="button primary wide" disabled={busy}>
            {busy && <Loader2 size={17} className="spin" />}
            Отправить заявку
          </button>
        </div>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="join">
      <div className="join-card">
        <header className="join-brand">
          <LogoMark size={38} />
          <span>
            SOWA <b>AGENCY</b>
          </span>
        </header>
        {children}
        <p className="join-footer">
          <ShieldCheck size={14} /> Данные видит только агентство. Никакой публичной
          страницы с вашей анкетой не создаётся.
        </p>
      </div>
    </main>
  )
}
