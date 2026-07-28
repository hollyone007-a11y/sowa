import { useEffect, useMemo, useState } from 'react'
import { Building2, Loader2, Printer, ShieldCheck } from 'lucide-react'
import { Field } from './primitives'
import { LogoMark } from './Logo'
import { useZodForm } from './useZodForm'
import {
  approvalSchema, depositTransactionSchema, expenseSchema, propertySchema, residentSchema, stayEditSchema,
  type ApprovalInput, type DepositTransactionInput, type ExpenseInput, type PropertyInput, type ResidentInput,
  type StayEditInput,
} from '../lib/schemas'
import { remainingOf } from '../lib/domain'
import { categoryText, depositText, formatDate, methodText, money, today } from '../lib/format'
import type { Agency, HousingApplication, Property, ResidentPrivateProfile, Stay } from '../types'

/** Room and bed names already used at an address, so nobody retypes them. */
function placementSuggestions(stays: Stay[], propertyId: string) {
  const rooms = new Set<string>()
  const beds = new Set<string>()
  for (const stay of stays) {
    if (stay.property_id !== propertyId) continue
    if (stay.room_name) rooms.add(stay.room_name)
    if (stay.bed_name) beds.add(stay.bed_name)
  }
  return {
    rooms: [...rooms].sort((a, b) => a.localeCompare(b, 'ru')),
    beds: [...beds].sort((a, b) => a.localeCompare(b, 'ru')),
  }
}

function PlacementFields({
  properties, stays, defaultPropertyId = '', defaultRoom = '', defaultBed = '',
}: {
  properties: Property[]
  agencies: Agency[]
  stays: Stay[]
  defaultPropertyId?: string
  defaultRoom?: string
  defaultBed?: string
}) {
  const [propertyId, setPropertyId] = useState(defaultPropertyId)
  const suggestions = useMemo(() => placementSuggestions(stays, propertyId), [stays, propertyId])
  const selected = properties.find((property) => property.id === propertyId)
  const free = selected ? selected.capacity - selected.occupied : null

  return (
    <>
      <Field
        label="Адрес"
        wide
        hint={
          selected
            ? free! > 0
              ? `Свободно мест: ${free}`
              : 'Мест нет — заселение сделает адрес переполненным'
            : 'Можно оставить пустым и распределить позже'
        }
      >
        <select name="property_id" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
          <option value="">Без адреса</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name} — {property.occupied}/{property.capacity}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Комната">
        <input name="room_name" defaultValue={defaultRoom} list="room-options" placeholder="Комната 1" />
        <datalist id="room-options">
          {suggestions.rooms.map((room) => (
            <option key={room} value={room} />
          ))}
        </datalist>
      </Field>
      <Field label="Место">
        <input name="bed_name" defaultValue={defaultBed} list="bed-options" placeholder="Место A" />
        <datalist id="bed-options">
          {suggestions.beds.map((bed) => (
            <option key={bed} value={bed} />
          ))}
        </datalist>
      </Field>
    </>
  )
}

function SubmitRow({ busy, label, error }: { busy: boolean; label: string; error: string }) {
  return (
    <>
      {error && <p className="form-error field-wide">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button primary wide" disabled={busy}>
          {busy && <Loader2 size={17} className="spin" />}
          {label}
        </button>
      </div>
    </>
  )
}

export function PropertyForm({
  property, onSave,
}: {
  property?: Property
  onSave: (input: PropertyInput) => Promise<void>
}) {
  const { errors, formError, busy, submit } = useZodForm<PropertyInput>(propertySchema)
  return (
    <form className="form-grid" onSubmit={submit(onSave)}>
      <Field label="Название" error={errors.name} wide>
        <input name="name" defaultValue={property?.name ?? ''} placeholder="Praha 4 · Modřany" autoFocus />
      </Field>
      <Field label="Полный адрес" error={errors.full_address} wide>
        <input name="full_address" defaultValue={property?.full_address ?? ''} placeholder="Komořanská 42, Praha 4" />
      </Field>
      <Field label="Контактное лицо">
        <input name="contact_name" defaultValue={property?.contact_name ?? ''} />
      </Field>
      <Field label="Телефон">
        <input name="phone" defaultValue={property?.phone ?? ''} />
      </Field>
      <Field label="E-mail" error={errors.email}>
        <input name="email" defaultValue={property?.email ?? ''} />
      </Field>
      <Field label="Вместимость, мест" error={errors.capacity}>
        <input name="capacity" type="number" min="1" defaultValue={property?.capacity ?? 1} />
      </Field>
      <Field
        label="Аренда объекта в месяц"
        error={errors.monthly_cost}
        hint="Сколько агентство платит владельцу"
        wide
      >
        <input name="monthly_cost" type="number" min="0" step="100" defaultValue={property?.monthly_cost ?? 0} />
      </Field>
      <Field label="Хранение анкет, дней" error={errors.application_retention_days}>
        <input name="application_retention_days" type="number" min="30" max="730" defaultValue={property?.application_retention_days ?? 90} />
      </Field>
      <div className="field checkbox-field"><label><input name="qr_auto_approve" type="checkbox" defaultChecked={property?.qr_auto_approve ?? false} /> Автоматически принимать QR-заявки при наличии места</label></div>
      <SubmitRow busy={busy} error={formError} label={property ? 'Сохранить адрес' : 'Создать адрес'} />
    </form>
  )
}

export function ResidentForm({
  properties, agencies, stays, defaultPropertyId, defaultMoveIn, onSave,
}: {
  properties: Property[]
  agencies: Agency[]
  stays: Stay[]
  defaultPropertyId?: string
  defaultMoveIn: string
  onSave: (input: ResidentInput) => Promise<void>
}) {
  const { errors, formError, busy, submit } = useZodForm<ResidentInput>(residentSchema)
  return (
    <form className="form-grid" onSubmit={submit(onSave)}>
      <Field label="Имя" error={errors.first_name}>
        <input name="first_name" autoFocus />
      </Field>
      <Field label="Фамилия" error={errors.last_name}>
        <input name="last_name" />
      </Field>
      <Field label="Телефон">
        <input name="phone" placeholder="+420 …" />
      </Field>
      <Field label="Место работы">
        <input name="workplace" />
      </Field>
      <Field label="Тип">
        <select name="person_kind" defaultValue="employee">
          <option value="employee">Сотрудник</option>
          <option value="external">Внешний человек</option>
        </select>
      </Field>
      <Field label="Агентура">
        <select name="agency_id" defaultValue=""><option value="">Без агентуры</option>{agencies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </Field>
      <Field label="Дата заезда" error={errors.move_in}>
        <input name="move_in" type="date" defaultValue={defaultMoveIn} />
      </Field>

      <PlacementFields properties={properties} stays={stays} defaultPropertyId={defaultPropertyId} />

      <Field label="Стоимость в месяц" error={errors.price}>
        <input name="price" type="number" min="0" step="100" defaultValue={0} />
      </Field>
      <Field label="Способ оплаты">
        <select name="payment_method" defaultValue="salary">
          <option value="salary">Из зарплаты</option>
          <option value="cash">Наличные</option>
          <option value="free">Не взимать</option>
        </select>
      </Field>
      <Field label="Залог">
        <select name="deposit_status" defaultValue="none">
          {Object.entries(depositText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <p className="form-divider field-wide">
        <ShieldCheck size={16} /> Анкета создаётся вместе с жильцом и хранится отдельно от общих данных
      </p>
      <Field label="Серия паспорта" error={errors.passport_series}>
        <input name="passport_series" autoComplete="off" />
      </Field>
      <Field label="Номер паспорта" error={errors.passport_number}>
        <input name="passport_number" autoComplete="off" />
      </Field>
      <Field label="Прописка в Украине" error={errors.ukraine_registration} wide>
        <textarea name="ukraine_registration" rows={2} />
      </Field>
      <Field label="Комментарий" error={errors.comment} wide>
        <textarea name="comment" rows={2} />
      </Field>

      <SubmitRow busy={busy} error={formError} label="Добавить жильца" />
    </form>
  )
}

export function StayEditForm({
  stay, properties, agencies, stays, onSave,
}: {
  stay: Stay
  properties: Property[]
  agencies: Agency[]
  stays: Stay[]
  onSave: (input: StayEditInput) => Promise<void>
}) {
  const { errors, formError, busy, submit } = useZodForm<StayEditInput>(stayEditSchema)
  const [movedOut, setMovedOut] = useState(Boolean(stay.move_out))

  return (
    <form className="form-grid" onSubmit={submit(onSave)}>
      <PlacementFields
        properties={properties}
        stays={stays}
        defaultPropertyId={stay.property_id ?? ''}
        defaultRoom={stay.room_name ?? ''}
        defaultBed={stay.bed_name ?? ''}
      />

      <Field label="Агентура">
        <select name="agency_id" defaultValue={stay.agency_id ?? ''}><option value="">Без агентуры</option>{agencies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </Field>
      <Field label="Стоимость в месяц" error={errors.price}>
        <input name="price" type="number" min="0" step="100" defaultValue={stay.price} />
      </Field>
      <Field label="Способ оплаты">
        <select name="payment_method" defaultValue={stay.payment_method}>
          <option value="salary">Из зарплаты</option>
          <option value="cash">Наличные</option>
          <option value="free">Не взимать</option>
        </select>
      </Field>
      <Field label="Залог">
        <select name="deposit_status" defaultValue={stay.deposit_status}>
          {Object.entries(depositText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="field field-wide checkbox-field">
        <label>
          <input
            type="checkbox"
            checked={movedOut}
            onChange={(event) => setMovedOut(event.target.checked)}
          />
          <span>Жилец выехал</span>
        </label>
        <input
          name="move_out"
          type="date"
          defaultValue={stay.move_out ?? today()}
          disabled={!movedOut}
          key={movedOut ? 'on' : 'off'}
        />
      </div>

      <Field label="Комментарий" error={errors.comment} wide>
        <textarea name="comment" rows={2} defaultValue={stay.comment ?? ''} />
      </Field>

      <SubmitRow busy={busy} error={formError} label="Сохранить изменения" />
    </form>
  )
}

export function PaymentForm({
  stay, onSave,
}: {
  stay: Stay
  onSave: (amount: number) => Promise<void>
}) {
  const remaining = remainingOf(stay)
  const [amount, setAmount] = useState(remaining)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (amount <= 0) {
      setError('Сумма должна быть больше нуля')
      return
    }
    if (amount > remaining) {
      setError(`Максимум ${money(remaining)}`)
      return
    }
    setError('')
    setBusy(true)
    try {
      await onSave(amount)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось записать оплату')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="payment-form"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <div className="payment-summary">
        <div>
          <span>Начислено</span>
          <strong>{money(stay.price)}</strong>
        </div>
        <div>
          <span>Уже внесено</span>
          <strong>{money(stay.paid_amount)}</strong>
        </div>
        <div className="payment-remaining">
          <span>Остаток</span>
          <strong>{money(remaining)}</strong>
        </div>
      </div>

      <Field label="Сумма оплаты" error={error}>
        <input
          type="number"
          min="0"
          max={remaining}
          step="100"
          value={amount}
          autoFocus
          onChange={(event) => setAmount(Number(event.target.value))}
        />
      </Field>

      <div className="quick-amounts">
        <button type="button" onClick={() => setAmount(Math.round(remaining / 2))}>
          Половина
        </button>
        <button type="button" onClick={() => setAmount(remaining)}>
          Весь остаток
        </button>
      </div>

      <p className="muted">Способ: {methodText[stay.payment_method]}</p>

      <button type="submit" className="button primary wide" disabled={busy}>
        {busy && <Loader2 size={17} className="spin" />}
        Записать оплату
      </button>
    </form>
  )
}

/** Turns an application from the QR form into a real stay for this month. */
export function ApprovalForm({
  application, stays, onSave,
}: {
  application: HousingApplication
  stays: Stay[]
  onSave: (input: ApprovalInput) => Promise<void>
}) {
  const { errors, formError, busy, submit } = useZodForm<ApprovalInput>(approvalSchema)
  const suggestions = placementSuggestions(stays, application.property_id)

  return (
    <form className="form-grid" onSubmit={submit(onSave)}>
      <p className="form-summary field-wide">
        <strong>
          {application.first_name} {application.last_name}
        </strong>
        <span>
          {application.phone} · {application.property_name ?? 'адрес удалён'} · заезд{' '}
          {formatDate(application.requested_move_in)}
        </span>
      </p>

      <Field label="Комната">
        <input name="room_name" list="approve-rooms" autoFocus placeholder="Комната 1" />
        <datalist id="approve-rooms">
          {suggestions.rooms.map((room) => (
            <option key={room} value={room} />
          ))}
        </datalist>
      </Field>
      <Field label="Место">
        <input name="bed_name" list="approve-beds" placeholder="Место A" />
        <datalist id="approve-beds">
          {suggestions.beds.map((bed) => (
            <option key={bed} value={bed} />
          ))}
        </datalist>
      </Field>
      <Field label="Стоимость в месяц" error={errors.price}>
        <input name="price" type="number" min="0" step="100" defaultValue={0} />
      </Field>
      <Field label="Способ оплаты">
        <select name="payment_method" defaultValue="cash">
          <option value="cash">Наличные</option>
          <option value="salary">Из зарплаты</option>
          <option value="free">Не взимать</option>
        </select>
      </Field>

      <SubmitRow busy={busy} error={formError} label="Заселить и закрыть заявку" />
    </form>
  )
}

export function ExpenseForm({
  properties, defaultPropertyId, onSave,
}: {
  properties: Property[]
  defaultPropertyId?: string
  onSave: (input: ExpenseInput) => Promise<void>
}) {
  const { errors, formError, busy, submit } = useZodForm<ExpenseInput>(expenseSchema)

  return (
    <form className="form-grid" onSubmit={submit(onSave)}>
      <Field label="Адрес" error={errors.property_id} wide>
        <select name="property_id" defaultValue={defaultPropertyId ?? ''}>
          <option value="">Выберите адрес</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Категория">
        <select name="category" defaultValue="utilities">
          {Object.entries(categoryText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Сумма" error={errors.amount}>
        <input name="amount" type="number" min="1" step="100" autoFocus />
      </Field>
      <Field label="Дата" error={errors.incurred_on}>
        <input name="incurred_on" type="date" defaultValue={today()} />
      </Field>
      <Field label="Комментарий" error={errors.description} wide>
        <input name="description" placeholder="Электричество за месяц" />
      </Field>

      <SubmitRow busy={busy} error={formError} label="Записать расход" />
    </form>
  )
}


export function DepositTransactionForm({
  stay, onSave,
}: {
  stay: Stay
  onSave: (input: DepositTransactionInput) => Promise<void>
}) {
  const { errors, formError, busy, submit } = useZodForm<DepositTransactionInput>(depositTransactionSchema)
  return <form className="form-grid" onSubmit={submit(onSave)}>
    <p className="hint-bar field-wide">Операция по залогу для {stay.full_name}. История сохраняется отдельно от статуса.</p>
    <Field label="Операция"><select name="kind" defaultValue="paid"><option value="paid">Залог внесён</option><option value="refunded">Залог возвращён</option><option value="applied">Залог зачтён</option></select></Field>
    <Field label="Сумма" error={errors.amount}><input name="amount" type="number" min="1" step="1"/></Field>
    <Field label="Дата" error={errors.occurred_on}><input name="occurred_on" type="date" defaultValue={today()}/></Field>
    <Field label="Комментарий"><input name="note"/></Field>
    <SubmitRow busy={busy} error={formError} label="Записать операцию" />
  </form>
}

export function ProfileSheet({
  stay, canView, load,
}: {
  stay: Stay
  canView: boolean
  load: (personId: string) => Promise<ResidentPrivateProfile>
}) {
  const [profile, setProfile] = useState<ResidentPrivateProfile | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canView) return
    let alive = true
    load(stay.person_id)
      .then((result) => alive && setProfile(result))
      .catch((cause: unknown) => alive && setError(cause instanceof Error ? cause.message : 'Не удалось загрузить анкету'))
    return () => {
      alive = false
    }
  }, [canView, load, stay.person_id])

  if (!canView) {
    return (
      <div className="access-denied">
        <ShieldCheck size={32} />
        <h3>Доступ ограничен</h3>
        <p>Паспортные данные видят только администратор и менеджер.</p>
      </div>
    )
  }

  if (error) return <p className="form-error">{error}</p>
  if (!profile) return <p className="muted">Загрузка анкеты…</p>

  return (
    <div className="profile-sheet">
      <div className="print-area">
        <header className="sheet-head">
          <LogoMark size={40} />
          <div>
            <strong>SOWA AGENSY</strong>
            <small>Анкета проживающего</small>
          </div>
        </header>
        <dl className="sheet-list">
          <div>
            <dt>Имя и фамилия</dt>
            <dd>
              {profile.first_name} {profile.last_name}
            </dd>
          </div>
          <div>
            <dt>Телефон</dt>
            <dd>{stay.phone || '—'}</dd>
          </div>
          <div>
            <dt>Место работы</dt>
            <dd>{stay.workplace || '—'}</dd>
          </div>
          <div>
            <dt>Проживание</dt>
            <dd>
              <Building2 size={14} /> {stay.property_name || 'Без адреса'}
              {stay.room_name ? `, ${stay.room_name}` : ''}
              {stay.bed_name ? `, ${stay.bed_name}` : ''}
            </dd>
          </div>
          <div>
            <dt>Период проживания</dt>
            <dd>
              с {formatDate(stay.move_in)} {stay.move_out ? `по ${formatDate(stay.move_out)}` : '— по настоящее время'}
            </dd>
          </div>
          <div>
            <dt>Серия и номер паспорта</dt>
            <dd>
              {profile.passport_series || '—'} {profile.passport_number || ''}
            </dd>
          </div>
          <div>
            <dt>Прописка в Украине</dt>
            <dd>{profile.ukraine_registration || '—'}</dd>
          </div>
          <div>
            <dt>Стоимость и способ оплаты</dt>
            <dd>
              {money(stay.price)} · {methodText[stay.payment_method]} · {depositText[stay.deposit_status]}
            </dd>
          </div>
        </dl>
        <div className="sheet-signatures">
          <span>Подпись проживающего</span>
          <span>Подпись представителя SOWA AGENSY</span>
        </div>
      </div>
      <button type="button" className="button primary wide no-print" onClick={() => window.print()}>
        <Printer size={17} /> Печать или сохранение в PDF
      </button>
    </div>
  )
}
