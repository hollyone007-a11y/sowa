import { Building2, Download, Pencil, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { Empty, Stat } from './primitives'
import { isOverfull } from '../lib/domain'
import { expensesFor } from '../lib/metrics'
import { categoryText, formatDate, money } from '../lib/format'
import type { AppRole, DashboardMetrics, Debtor, Expense, Property } from '../types'
import { can } from '../lib/permissions'

export function PropertiesView({
  properties, role, onAdd, onEdit, onOpen,
}: {
  properties: Property[]
  role: AppRole
  onAdd: () => void
  onEdit: (property: Property) => void
  onOpen: (property: Property) => void
}) {
  if (properties.length === 0) {
    return (
      <Empty
        title="Ни одного адреса"
        text="Добавьте первый объект — комнаты и места появятся вместе с жильцами."
        action={
          can(role, 'manage_properties') ? (
            <button type="button" className="button primary" onClick={onAdd}>
              <Plus size={17} /> Добавить адрес
            </button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="property-grid">
      {properties.map((property) => {
        const free = property.capacity - property.occupied
        const fill = property.capacity > 0 ? Math.min(100, (property.occupied / property.capacity) * 100) : 0
        return (
          <article key={property.id} className={clsx('property-card', isOverfull(property) && 'is-overfull')}>
            <header>
              <span className="property-icon">
                <Building2 size={18} />
              </span>
              <div>
                <strong>{property.name}</strong>
                <small>{property.full_address}</small>
              </div>
              {can(role, 'manage_properties') && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onEdit(property)}
                  aria-label={`Изменить ${property.name}`}
                >
                  <Pencil size={17} />
                </button>
              )}
            </header>

            <div className="occupancy">
              <div className="occupancy-bar">
                <span style={{ width: `${fill}%` }} />
              </div>
              <p>
                <b>{property.occupied}</b> из {property.capacity} мест
                {free > 0 ? (
                  <span className="ok-text"> · свободно {free}</span>
                ) : free < 0 ? (
                  <span className="danger-text"> · переполнено на {-free}</span>
                ) : (
                  <span className="muted"> · мест нет</span>
                )}
              </p>
            </div>

            <dl className="property-money">
              <div>
                <dt>Собрано</dt>
                <dd className="ok-text">{money(property.collected)}</dd>
              </div>
              <div>
                <dt>Долг</dt>
                <dd className={property.debt > 0 ? 'danger-text' : undefined}>{money(property.debt)}</dd>
              </div>
              <div>
                <dt>Аренда объекта</dt>
                <dd>{money(property.monthly_cost)}</dd>
              </div>
            </dl>

            {(property.contact_name || property.phone) && (
              <p className="property-contact">
                {property.contact_name}
                {property.contact_name && property.phone ? ' · ' : ''}
                {property.phone}
              </p>
            )}

            <button type="button" className="button ghost wide" onClick={() => onOpen(property)}>
              Показать жильцов
            </button>
          </article>
        )
      })}

      {can(role, 'manage_properties') && (
        <button type="button" className="property-add" onClick={onAdd}>
          <Plus size={22} />
          Добавить адрес
        </button>
      )}
    </div>
  )
}

export function FinanceView({
  metrics, properties, debtors, expenses, role, monthTitle, onExport, onAddExpense, onDeleteExpense,
}: {
  metrics: DashboardMetrics
  properties: Property[]
  debtors: Debtor[]
  expenses: Expense[]
  role: AppRole
  monthTitle: string
  onExport: () => void
  onAddExpense: () => void
  onDeleteExpense: (expense: Expense) => void
}) {
  return (
    <div className="finance">
      <section className="stat-grid">
        <Stat label="Начислено за месяц" value={money(metrics.expected)} hint={monthTitle} />
        <Stat label="Собрано" value={money(metrics.collected)} tone="positive" />
        <Stat
          label="Долг за месяц"
          value={money(metrics.monthDebt)}
          tone={metrics.monthDebt > 0 ? 'negative' : 'neutral'}
        />
        <Stat
          label="Долг за прошлые месяцы"
          value={money(metrics.historicDebt)}
          hint={debtors.length > 0 ? `${debtors.length} чел.` : 'Все рассчитались'}
          tone={metrics.historicDebt > 0 ? 'warning' : 'neutral'}
        />
        <Stat label="Наличными" value={money(metrics.cash)} />
        <Stat label="Удержания из зарплаты" value={money(metrics.salary)} />
        <Stat label="Аренда объектов" value={money(metrics.rentCost)} hint="Расход агентства" />
        <Stat label="Прочие расходы" value={money(metrics.expenses)} hint="Коммуналка, ремонт, услуги" />
        <Stat
          label="Операционный профит"
          value={money(metrics.operatingProfit)}
          hint="Начислено минус аренда и расходы"
          tone={metrics.operatingProfit >= 0 ? 'positive' : 'negative'}
        />
        <Stat
          label="Денежный поток"
          value={money(metrics.cashFlow)}
          hint="Получено минус аренда и расходы"
          tone={metrics.cashFlow >= 0 ? 'positive' : 'negative'}
        />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>По адресам</h2>
          {can(role, 'export') && (
            <button type="button" className="button ghost" onClick={onExport}>
              <Download size={17} /> Экспорт CSV
            </button>
          )}
        </header>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Адрес</th>
                <th className="num">Занято</th>
                <th className="num">Собрано</th>
                <th className="num">Долг</th>
                <th className="num">Аренда</th>
                <th className="num">Расходы</th>
                <th className="num">Разница</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => {
                const extra = expensesFor(expenses, property.id)
                const delta = property.collected - property.monthly_cost - extra
                return (
                  <tr key={property.id}>
                    <td>
                      <strong>{property.name}</strong>
                      <small>{property.full_address}</small>
                    </td>
                    <td className="num">
                      {property.occupied}/{property.capacity}
                    </td>
                    <td className="num ok-text">{money(property.collected)}</td>
                    <td className={clsx('num', property.debt > 0 && 'danger-text')}>{money(property.debt)}</td>
                    <td className="num">{money(property.monthly_cost)}</td>
                    <td className="num">{money(extra)}</td>
                    <td className={clsx('num', delta >= 0 ? 'ok-text' : 'danger-text')}>
                      {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {money(delta)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого</td>
                <td className="num">
                  {metrics.occupied}/{metrics.capacity}
                </td>
                <td className="num">{money(metrics.collected)}</td>
                <td className="num">{money(metrics.monthDebt)}</td>
                <td className="num">{money(metrics.rentCost)}</td>
                <td className="num">{money(metrics.expenses)}</td>
                <td className={clsx('num', metrics.margin >= 0 ? 'ok-text' : 'danger-text')}>
                  {money(metrics.margin)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Расходы по объектам</h2>
          {can(role, 'manage_properties') && (
            <button type="button" className="button ghost" onClick={onAddExpense}>
              <Plus size={17} /> Расход
            </button>
          )}
        </header>
        {expenses.length === 0 ? (
          <p className="muted panel-padded">
            За этот месяц расходов не записано. Коммуналка, ремонт и услуги уменьшают
            разницу по адресу.
          </p>
        ) : (
          <ul className="expense-list">
            {expenses.map((expense) => (
              <li key={expense.id}>
                <div>
                  <strong>{expense.property_name ?? 'Адрес удалён'}</strong>
                  <small>
                    {categoryText[expense.category]} · {formatDate(expense.incurred_on)}
                    {expense.description ? ` · ${expense.description}` : ''}
                  </small>
                </div>
                <b>{money(expense.amount)}</b>
                {can(role, 'manage_properties') && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Удалить расход ${money(expense.amount)}`}
                    onClick={() => onDeleteExpense(expense)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Должники за прошлые месяцы</h2>
        </header>
        {debtors.length === 0 ? (
          <p className="muted panel-padded">Долгов за прошлые периоды нет.</p>
        ) : (
          <ul className="debtor-list">
            {debtors.map((debtor) => (
              <li key={debtor.person_id}>
                <strong>{debtor.full_name}</strong>
                <small>
                  {debtor.months} мес. с задолженностью
                </small>
                <b className="danger-text">{money(debtor.amount)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Shown above the resident list when a month has not been filled in yet. */
export function CarryOverBanner({
  previousLabel, count, busy, onCarry,
}: {
  previousLabel: string
  count: number
  busy: boolean
  onCarry: () => void
}) {
  return (
    <div className="carry-banner">
      <div>
        <strong>Месяц ещё пустой</strong>
        <p>
          В {previousLabel} было {count} жильцов. Перенести их сюда с обнулёнными оплатами?
        </p>
      </div>
      <button type="button" className="button primary" onClick={onCarry} disabled={busy}>
        Перенести {count} жильцов
      </button>
    </div>
  )
}

export function StatStrip({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <section className="stat-grid compact">
      <Stat label="Занято мест" value={`${metrics.occupied} / ${metrics.capacity}`} />
      <Stat label="Свободно" value={metrics.free} tone={metrics.free > 0 ? 'positive' : 'warning'} />
      <Stat
        label="Долг за месяц"
        value={money(metrics.monthDebt)}
        tone={metrics.monthDebt > 0 ? 'negative' : 'neutral'}
      />
      <Stat
        label="Старый долг"
        value={money(metrics.historicDebt)}
        tone={metrics.historicDebt > 0 ? 'warning' : 'neutral'}
      />
    </section>
  )
}
