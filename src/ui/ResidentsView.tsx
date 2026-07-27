import { useMemo, useState } from 'react'
import {
  Building2, Check, ClipboardList, MoreHorizontal, Pencil, Trash2, Wallet,
} from 'lucide-react'
import clsx from 'clsx'
import { Empty } from './primitives'
import { can } from '../lib/permissions'
import { remainingOf } from '../lib/domain'
import { depositText, formatDate, initials, methodText, money, statusText } from '../lib/format'
import type { AppRole, Property, Stay } from '../types'

interface Group {
  key: string
  title: string
  subtitle: string
  overfull: boolean
  stays: Stay[]
}

function groupByAddress(stays: Stay[], properties: Property[]): Group[] {
  const groups = new Map<string, Group>()
  for (const property of properties) {
    const own = stays.filter((stay) => stay.property_id === property.id)
    if (own.length === 0) continue
    groups.set(property.id, {
      key: property.id,
      title: property.name,
      subtitle: `${property.occupied}/${property.capacity} мест · долг ${money(property.debt)}`,
      overfull: property.occupied > property.capacity,
      stays: own,
    })
  }
  const orphans = stays.filter((stay) => !stay.property_id)
  if (orphans.length > 0) {
    groups.set('none', {
      key: 'none',
      title: 'Без адреса',
      subtitle: `${orphans.length} чел. ждут распределения`,
      overfull: false,
      stays: orphans,
    })
  }
  return [...groups.values()]
}

export function ResidentsView({
  stays, properties, role, grouped, onPay, onQuickPay, onEdit, onProfile, onDelete, emptyAction,
}: {
  stays: Stay[]
  properties: Property[]
  role: AppRole
  grouped: boolean
  onPay: (stay: Stay) => void
  onQuickPay: (stay: Stay) => void
  onEdit: (stay: Stay) => void
  onProfile: (stay: Stay) => void
  onDelete: (stay: Stay) => void
  emptyAction?: React.ReactNode
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  // Choosing an action must dismiss the menu; it would otherwise stay open
  // behind the dialog and still be there when the dialog closes.
  const choose = (handler: (stay: Stay) => void) => (stay: Stay) => {
    setOpenMenu(null)
    handler(stay)
  }
  const groups = useMemo(
    () =>
      grouped
        ? groupByAddress(stays, properties)
        : [{ key: 'all', title: '', subtitle: '', overfull: false, stays }],
    [grouped, stays, properties],
  )

  if (stays.length === 0) {
    return (
      <Empty
        title="Здесь пока пусто"
        text="Ни один жилец не подходит под выбранные фильтры этого месяца."
        action={emptyAction}
      />
    )
  }

  return (
    <div className="resident-groups" onClick={() => setOpenMenu(null)}>
      {groups.map((group) => (
        <section key={group.key} className="resident-group">
          {group.title && (
            <header className="group-head">
              <span className="group-icon">
                <Building2 size={16} />
              </span>
              <div>
                <strong>{group.title}</strong>
                <small className={clsx(group.overfull && 'danger-text')}>{group.subtitle}</small>
              </div>
              <b>{group.stays.length}</b>
            </header>
          )}
          <ul className="resident-list">
            {group.stays.map((stay) => (
              <ResidentRow
                key={stay.id}
                stay={stay}
                role={role}
                menuOpen={openMenu === stay.id}
                onToggleMenu={(event) => {
                  event.stopPropagation()
                  setOpenMenu((current) => (current === stay.id ? null : stay.id))
                }}
                onPay={choose(onPay)}
                onQuickPay={onQuickPay}
                onEdit={choose(onEdit)}
                onProfile={choose(onProfile)}
                onDelete={choose(onDelete)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ResidentRow({
  stay, role, menuOpen, onToggleMenu, onPay, onQuickPay, onEdit, onProfile, onDelete,
}: {
  stay: Stay
  role: AppRole
  menuOpen: boolean
  onToggleMenu: (event: React.MouseEvent) => void
  onPay: (stay: Stay) => void
  onQuickPay: (stay: Stay) => void
  onEdit: (stay: Stay) => void
  onProfile: (stay: Stay) => void
  onDelete: (stay: Stay) => void
}) {
  const remaining = remainingOf(stay)
  const canPay = can(role, 'manage_payments') && remaining > 0
  const departed = Boolean(stay.move_out)

  return (
    <li className={clsx('resident-row', `is-${stay.payment_status}`, departed && 'is-departed')}>
      <span className="avatar" aria-hidden="true">
        {initials(stay.full_name)}
      </span>

      <div className="resident-identity">
        <strong>{stay.full_name}</strong>
        <small>
          {stay.phone || 'Телефон не указан'}
          {' · '}
          {stay.person_kind === 'external' ? 'Внешний' : stay.workplace || 'Сотрудник'}
        </small>
      </div>

      <div className="resident-place">
        <span>{[stay.room_name, stay.bed_name].filter(Boolean).join(' · ') || 'Место не назначено'}</span>
        <small>
          {departed ? `Выехал ${formatDate(stay.move_out)}` : `С ${formatDate(stay.move_in)}`}
          {stay.deposit_status !== 'none' ? ` · ${depositText[stay.deposit_status]}` : ''}
        </small>
      </div>

      <div className="resident-money">
        <strong>{money(stay.price)}</strong>
        <small>{methodText[stay.payment_method]}</small>
      </div>

      <div className="resident-status">
        <span className={clsx('pill', stay.payment_status)}>{statusText[stay.payment_status]}</span>
        {remaining > 0 && <small className="danger-text">−{money(remaining)}</small>}
      </div>

      <div className="resident-actions">
        {canPay && (
          <>
            <button
              type="button"
              className="button tiny primary"
              onClick={() => onQuickPay(stay)}
              title={`Отметить оплату полностью: ${money(remaining)}`}
            >
              <Check size={15} /> Оплачено
            </button>
            <button type="button" className="button tiny ghost" onClick={() => onPay(stay)}>
              <Wallet size={15} /> Частично
            </button>
          </>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={`Действия: ${stay.full_name}`}
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <MoreHorizontal size={19} />
        </button>

        {menuOpen && (
          <div className="row-menu" onClick={(event) => event.stopPropagation()}>
            {can(role, 'view_private_profiles') && (
              <button type="button" onClick={() => onProfile(stay)}>
                <ClipboardList size={16} /> Анкета и печать
              </button>
            )}
            {can(role, 'manage_residents') && (
              <button type="button" onClick={() => onEdit(stay)}>
                <Pencil size={16} /> Переселить, цена, выезд
              </button>
            )}
            {can(role, 'delete') && (
              <button type="button" className="danger-text" onClick={() => onDelete(stay)}>
                <Trash2 size={16} /> Удалить запись
              </button>
            )}
          </div>
        )}
      </div>

      {stay.comment && <p className="resident-comment">{stay.comment}</p>}
    </li>
  )
}
