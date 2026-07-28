import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BedDouble, Building2, ChevronLeft, ChevronRight, CircleDollarSign, Download, FileInput, FileSpreadsheet,
  LogOut, Moon, Plus, QrCode, Search, Settings, Sun, UsersRound,
} from 'lucide-react'
import clsx from 'clsx'
import { Wordmark } from './ui/Logo'
import { Login } from './ui/Login'
import { Setup } from './ui/Setup'
import { PublicJoin } from './ui/PublicJoin'
import { Confirm, Loader, Modal, Toast } from './ui/primitives'
import {
  ApprovalForm, DepositTransactionForm, ExpenseForm, PaymentForm, ProfileSheet, PropertyForm,
  ResidentForm, StayEditForm,
} from './ui/forms'
import { ResidentsView } from './ui/ResidentsView'
import { ApplicationsView, QrView } from './ui/onboarding'
import { AgencyStatementsView } from './ui/AgencyStatementsView'
import { AdministrationView, InventoryView } from './ui/OperationsView'
import { CarryOverBanner, FinanceView, PropertiesView, StatStrip } from './ui/views'
import { backend, configured } from './lib/backend'
import { can, roleLabels } from './lib/permissions'
import { calculateMetrics } from './lib/metrics'
import { remainingOf } from './lib/domain'
import { downloadStaysCsv } from './lib/csv'
import { currentMonth, firstDayOf, monthLabel, shiftMonth } from './lib/format'
import type { Permission } from './lib/permissions'
import type { AgencyAllocation, AppProfile, AuditEntry, AuthUser, Expense, HousingApplication, Property, Stay, Workspace } from './types'

type Tab = 'residents' | 'properties' | 'inventory' | 'applications' | 'finance' | 'agencies' | 'qr' | 'admin'
type FilterKey = 'all' | 'debt' | 'unassigned' | 'cash' | 'salary' | 'external' | 'departed'

type ModalState =
  | { kind: 'property'; property?: Property }
  | { kind: 'resident' }
  | { kind: 'payment'; stay: Stay }
  | { kind: 'edit'; stay: Stay }
  | { kind: 'deposit'; stay: Stay }
  | { kind: 'profile'; stay: Stay }
  | { kind: 'delete'; stay: Stay }
  | { kind: 'approve'; application: HousingApplication }
  | { kind: 'reject'; application: HousingApplication }
  | { kind: 'expense' }
  | { kind: 'delete-expense'; expense: Expense }
  | { kind: 'delete-allocation'; allocation: AgencyAllocation }
  | null

/** The token in a QR link, wherever the app is mounted. */
function readJoinToken(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get('join')
  if (fromQuery) return fromQuery
  return window.location.pathname.match(/\/join\/([0-9a-zA-Z-]{8,})\/?$/)?.[1] ?? null
}

const FILTERS: Array<[FilterKey, string]> = [
  ['all', 'Все'],
  ['debt', 'С долгом'],
  ['unassigned', 'Без адреса'],
  ['cash', 'Наличные'],
  ['salary', 'Из зарплаты'],
  ['external', 'Внешние'],
  ['departed', 'Съехали'],
]

const TABS: Array<[Tab, string, typeof UsersRound, Permission]> = [
  ['residents', 'Жильцы', UsersRound, 'view'],
  ['properties', 'Адреса', Building2, 'view'],
  ['inventory', 'Комнаты', BedDouble, 'view'],
  ['applications', 'Заявки', FileInput, 'manage_residents'],
  ['finance', 'Финансы', CircleDollarSign, 'view_finance'],
  ['agencies', 'Агентуры', FileSpreadsheet, 'view_finance'],
  ['qr', 'QR-коды', QrCode, 'manage_properties'],
  ['admin', 'Управление', Settings, 'manage_users'],
]

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('sowa.theme')
      if (stored === 'light' || stored === 'dark') return stored
    } catch {
      // Fall through to the system preference.
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('sowa.theme', theme)
    } catch {
      // Theme simply resets on the next visit.
    }
  }, [theme])

  return [theme, () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))] as const
}

export default function App() {
  const [joinToken] = useState(readJoinToken)

  const [user, setUser] = useState<AuthUser | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [month, setMonth] = useState(currentMonth)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [tab, setTab] = useState<Tab>('residents')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [query, setQuery] = useState('')
  const [selectedProperty, setSelectedProperty] = useState('all')
  const [modal, setModal] = useState<ModalState>(null)
  const [previousCount, setPreviousCount] = useState(0)
  const [applications, setApplications] = useState<HousingApplication[]>([])
  const [profiles, setProfiles] = useState<AppProfile[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [theme, toggleTheme] = useTheme()

  // --- session -------------------------------------------------------------

  useEffect(() => {
    // Hooks run even on the render paths that never reach the app shell, and
    // every backend call throws without keys — so this has to bail out first.
    if (!configured()) return
    let alive = true
    setSessionReady(false)
    backend
      .getUser()
      .then((next) => alive && setUser(next))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setSessionReady(true))
    const unsubscribe = backend.subscribe((next) => alive && setUser(next))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  // --- data ----------------------------------------------------------------

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setWorkspace(await backend.loadWorkspace(month.year, month.month))
      if (can(user.role, 'manage_residents')) {
        // Applications are not tied to a month, and a viewer is denied by RLS.
        setApplications(await backend.listApplications().catch(() => []))
      } else {
        setApplications([])
      }
      if (user.role === 'admin') {
        const [nextProfiles, nextAudit] = await Promise.all([backend.listProfiles(), backend.listAudit()])
        setProfiles(nextProfiles)
        setAudit(nextAudit)
      } else {
        setProfiles([])
        setAudit([])
      }
    } catch (cause) {
      setWorkspace(null)
      setToast(cause instanceof Error ? cause.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }, [month.month, month.year, user])

  useEffect(() => {
    void reload()
  }, [reload])

  // A month with nothing in it is almost always a month nobody carried over yet.
  useEffect(() => {
    if (!user || !workspace || workspace.stays.length > 0) {
      setPreviousCount(0)
      return
    }
    let alive = true
    const previous = shiftMonth(month.year, month.month, -1)
    backend
      .loadWorkspace(previous.year, previous.month)
      .then((data) => alive && setPreviousCount(data.stays.filter((stay) => !stay.move_out).length))
      .catch(() => alive && setPreviousCount(0))
    return () => {
      alive = false
    }
  }, [month.month, month.year, user, workspace])

  /** Runs a mutation, refreshes the month, and reports the outcome once. */
  const run = useCallback(
    async (action: () => Promise<string | void>) => {
      setBusy(true)
      try {
        const message = await action()
        await reload()
        if (message) setToast(message)
      } catch (cause) {
        setToast(cause instanceof Error ? cause.message : 'Действие не выполнено')
        throw cause
      } finally {
        setBusy(false)
      }
    },
    [reload],
  )

  // --- derived -------------------------------------------------------------

  const properties = useMemo(() => workspace?.properties ?? [], [workspace])
  const stays = useMemo(() => workspace?.stays ?? [], [workspace])
  const debtors = useMemo(() => workspace?.debtors ?? [], [workspace])
  const expenses = useMemo(() => workspace?.expenses ?? [], [workspace])
  const agencies = useMemo(() => workspace?.agencies ?? [], [workspace])
  const agencyAllocations = useMemo(() => workspace?.agency_allocations ?? [], [workspace])
  const metrics = useMemo(
    () => calculateMetrics(properties, stays, debtors, expenses),
    [properties, stays, debtors, expenses],
  )
  const pendingApplications = applications.filter((item) => item.status === 'pending').length

  const visibleStays = useMemo(
    () =>
      stays.filter((stay) => {
        if (selectedProperty !== 'all' && stay.property_id !== selectedProperty) return false
        if (query) {
          const haystack = [stay.full_name, stay.phone, stay.property_name, stay.room_name, stay.bed_name, stay.workplace]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(query.trim().toLowerCase())) return false
        }
        switch (filter) {
          case 'debt':
            return remainingOf(stay) > 0
          case 'unassigned':
            return !stay.property_id
          case 'cash':
          case 'salary':
            return stay.payment_method === filter
          case 'external':
            return stay.person_kind === 'external'
          case 'departed':
            return Boolean(stay.move_out)
          default:
            return true
        }
      }),
    [stays, selectedProperty, query, filter],
  )

  const role = user?.role ?? 'viewer'
  const title = monthLabel(month.year, month.month)
  const previousMonth = shiftMonth(month.year, month.month, -1)
  const periodClosed = workspace?.period.is_closed ?? false

  // --- render --------------------------------------------------------------

  // Nothing works without a database, and a login form that cannot possibly
  // succeed is worse than saying so.
  if (!configured()) return <Setup />

  // The QR link is for people who have no account and never will.
  if (joinToken) return <PublicJoin token={joinToken} backend={backend} />

  if (!sessionReady) {
    return (
      <div className="splash">
        <Wordmark size={48} />
        <Loader label="Проверяем сессию…" />
      </div>
    )
  }

  if (!user) {
    return (
      <Login
        onSignIn={async (email, password) => {
          setUser(await backend.signIn(email, password))
        }}
      />
    )
  }

  const exportCsv = () => {
    const label = downloadStaysCsv(visibleStays, month.year, month.month)
    setToast(`Выгружено ${visibleStays.length} записей за ${label.toLowerCase()}`)
  }

  const shift = (delta: number) => setMonth((current) => shiftMonth(current.year, current.month, delta))

  return (
    <div className="app">
      <header className="topbar">
        <Wordmark size={34} />

        <div className="month-nav">
          <button type="button" className="icon-button" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
            <ChevronLeft size={18} />
          </button>
          <strong>{title}</strong>
          <button type="button" className="icon-button" onClick={() => shift(1)} aria-label="Следующий месяц">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="user-chip">
            <b>{user.display_name}</b>
            <small>{roleLabels[role]}</small>
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              void backend.signOut().then(() => setUser(null))
            }}
            aria-label="Выйти"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Разделы">
        {TABS.filter(([, , , permission]) => can(role, permission)).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={clsx(tab === key && 'active')}
            aria-current={tab === key}
            onClick={() => setTab(key)}
          >
            <Icon size={17} /> {label}
            {key === 'applications' && pendingApplications > 0 && (
              <span className="count-badge">{pendingApplications}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="content">
        {periodClosed && <p className="notice-bar">Период закрыт: изменения запрещены.</p>}

        {tab === 'residents' && (
          <>
            <StatStrip metrics={metrics} />

            {previousCount > 0 && can(role, 'copy_period') && !periodClosed && (
              <CarryOverBanner
                previousLabel={monthLabel(previousMonth.year, previousMonth.month)}
                count={previousCount}
                busy={busy}
                onCarry={() => {
                  void run(async () => {
                    const copied = await backend.copyPreviousMonth(month.year, month.month, true)
                    return `Перенесено жильцов: ${copied}`
                  }).catch(() => undefined)
                }}
              />
            )}

            <div className="toolbar">
              <label className="searchbox">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Имя, телефон, адрес, комната, работа…"
                  aria-label="Поиск жильцов"
                />
              </label>
              <select
                value={selectedProperty}
                onChange={(event) => setSelectedProperty(event.target.value)}
                aria-label="Фильтр по адресу"
              >
                <option value="all">Все адреса</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
              {can(role, 'export') && (
                <button type="button" className="button ghost" onClick={exportCsv}>
                  <Download size={17} /> CSV
                </button>
              )}
              {can(role, 'manage_residents') && !periodClosed && (
                <button type="button" className="button primary" onClick={() => setModal({ kind: 'resident' })}>
                  <Plus size={17} /> Жилец
                </button>
              )}
            </div>

            <div className="chips">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={clsx(filter === key && 'active')}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="result-count">
              {visibleStays.length} из {stays.length} записей · {title.toLowerCase()}
            </p>

            {loading ? (
              <Loader />
            ) : (
              <ResidentsView
                stays={visibleStays}
                properties={properties}
                role={role}
                grouped={selectedProperty === 'all' && filter === 'all' && !query}
                onPay={(stay) => setModal({ kind: 'payment', stay })}
                onQuickPay={(stay) => {
                  void run(async () => {
                    await backend.recordPayment(stay.id, remainingOf(stay))
                    return `${stay.full_name}: оплата закрыта`
                  }).catch(() => undefined)
                }}
                onEdit={(stay) => setModal({ kind: 'edit', stay })}
                onDeposit={(stay) => setModal({ kind: 'deposit', stay })}
                onProfile={(stay) => setModal({ kind: 'profile', stay })}
                onDelete={(stay) => setModal({ kind: 'delete', stay })}
                emptyAction={
                  can(role, 'manage_residents') && !periodClosed ? (
                    <button type="button" className="button primary" onClick={() => setModal({ kind: 'resident' })}>
                      <Plus size={17} /> Добавить жильца
                    </button>
                  ) : undefined
                }
              />
            )}
          </>
        )}

        {tab === 'properties' &&
          (loading ? (
            <Loader />
          ) : (
            <PropertiesView
              properties={properties}
              role={role}
              onAdd={() => setModal({ kind: 'property' })}
              onEdit={(property) => setModal({ kind: 'property', property })}
              onOpen={(property) => {
                setSelectedProperty(property.id)
                setFilter('all')
                setTab('residents')
              }}
            />
          ))}

        {tab === 'inventory' && workspace && (
          <InventoryView slots={workspace.inventory} properties={properties} periodClosed={periodClosed}
            onCreateRoom={async input => { await run(async () => { await backend.createRoom(input); return 'Комната создана' }) }}
            onCreateBed={async input => { await run(async () => { await backend.createBed(input); return 'Место создано' }) }}
          />
        )}

        {tab === 'applications' && can(role, 'manage_residents') && (
          <ApplicationsView
            applications={applications}
            canReview={!periodClosed}
            onApprove={(application) => setModal({ kind: 'approve', application })}
            onReject={(application) => setModal({ kind: 'reject', application })}
          />
        )}

        {tab === 'qr' && can(role, 'manage_properties') && (
          <QrView
            properties={properties}
            onRotate={(property) => {
              void run(async () => {
                await backend.rotatePropertyLink(property.id)
                return `Новый QR-код для «${property.name}». Старый больше не работает.`
              }).catch(() => undefined)
            }}
          />
        )}

        {tab === 'agencies' && can(role, 'view_finance') && workspace && (
          <AgencyStatementsView agencies={agencies} allocations={agencyAllocations} financials={workspace.agency_financials} payments={workspace.agency_payments} inventory={workspace.inventory} properties={properties} role={role} periodId={workspace.period.id} monthTitle={title} defaultStart={firstDayOf(month.year, month.month)} defaultEnd={new Date(Date.UTC(month.year, month.month, 0)).toISOString().slice(0, 10)} periodClosed={periodClosed}
            onCreateAgency={async (input) => { await run(async () => { await backend.createAgency(input); return `Агентура «${input.name}» создана` }) }}
            onCreateAllocation={async (periodId, input) => { await run(async () => { await backend.createAgencyAllocation(periodId, input); return 'Строка добавлена в ведомость' }) }}
            onDeleteAllocation={(allocation) => setModal({ kind: 'delete-allocation', allocation })}
            onRecordPayment={async (periodId, input) => { await run(async () => { await backend.recordAgencyPayment(periodId, input); return 'Оплата агентуры записана' }) }}
            onCopyPrevious={async () => { await run(async () => { const copied = await backend.copyAgencyPreviousMonth(month.year, month.month); return `Перенесено строк агентур: ${copied}` }) }}
          />
        )}

        {tab === 'admin' && role === 'admin' && (
          <AdministrationView profiles={profiles} audit={audit}
            onRoleChange={async (userId, nextRole) => { await run(async () => { await backend.updateUserRole(userId, nextRole); return 'Роль обновлена' }) }}
            onPurge={async () => { await run(async () => { const removed = await backend.purgeExpiredApplications(); return `Удалено просроченных анкет: ${removed}` }) }}
          />
        )}

        {tab === 'finance' &&
          (can(role, 'view_finance') ? (
            <FinanceView
              metrics={metrics}
              properties={properties}
              debtors={debtors}
              expenses={expenses}
              role={role}
              monthTitle={title}
              onExport={exportCsv}
              onAddExpense={() => setModal({ kind: 'expense' })}
              onDeleteExpense={(expense) => setModal({ kind: 'delete-expense', expense })}
            />
          ) : (
            <p className="notice-bar">Финансовый раздел доступен администратору, менеджеру и бухгалтеру.</p>
          ))}
      </main>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {modal?.kind === 'property' && (
        <Modal
          title={modal.property ? 'Изменить адрес' : 'Новый адрес'}
          subtitle={modal.property?.full_address}
          onClose={() => setModal(null)}
        >
          <PropertyForm
            property={modal.property}
            onSave={async (input) => {
              const target = modal.property
              await run(async () => {
                if (target) await backend.updateProperty(target.id, input)
                else await backend.createProperty(input)
                return target ? 'Адрес обновлён' : 'Адрес создан'
              })
              setModal(null)
            }}
          />
        </Modal>
      )}

      {modal?.kind === 'resident' && workspace && (
        <Modal title="Новый жилец" subtitle={`Период: ${title}`} onClose={() => setModal(null)} wide>
          <ResidentForm
            properties={properties}
            stays={stays}
            defaultPropertyId={selectedProperty === 'all' ? undefined : selectedProperty}
            defaultMoveIn={firstDayOf(month.year, month.month)}
            onSave={async (input) => {
              await run(async () => {
                await backend.createResident(workspace.period.id, input)
                return `${input.first_name} ${input.last_name} добавлен`
              })
              setModal(null)
            }}
          />
        </Modal>
      )}

      {modal?.kind === 'payment' && (
        <Modal title="Записать оплату" subtitle={modal.stay.full_name} onClose={() => setModal(null)}>
          <PaymentForm
            stay={modal.stay}
            onSave={async (amount) => {
              const stay = modal.stay
              await run(async () => {
                await backend.recordPayment(stay.id, amount)
                return `Оплата записана: ${stay.full_name}`
              })
              setModal(null)
            }}
          />
        </Modal>
      )}

      {modal?.kind === 'edit' && (
        <Modal title="Карточка жильца" subtitle={modal.stay.full_name} onClose={() => setModal(null)} wide>
          <StayEditForm
            stay={modal.stay}
            properties={properties}
            stays={stays}
            onSave={async (input) => {
              const stay = modal.stay
              await run(async () => {
                await backend.updateStay(stay.id, input)
                return 'Изменения сохранены'
              })
              setModal(null)
            }}
          />
        </Modal>
      )}


      {modal?.kind === 'deposit' && (
        <Modal title="Операция по залогу" subtitle={modal.stay.full_name} onClose={() => setModal(null)}>
          <DepositTransactionForm stay={modal.stay} onSave={async input => {
            const stay = modal.stay
            setModal(null)
            await run(async () => { await backend.recordDeposit(stay.id,input); return 'Операция по залогу записана' })
          }}/>
        </Modal>
      )}

      {modal?.kind === 'profile' && (
        <Modal title="Анкета жильца" subtitle={modal.stay.full_name} onClose={() => setModal(null)}>
          <ProfileSheet
            stay={modal.stay}
            canView={can(role, 'view_private_profiles')}
            load={backend.getPrivateProfile}
          />
        </Modal>
      )}

      {modal?.kind === 'approve' && workspace && (
        <Modal
          title="Заселить по заявке"
          subtitle={`${modal.application.first_name} ${modal.application.last_name}`}
          onClose={() => setModal(null)}
        >
          <ApprovalForm
            application={modal.application}
            stays={stays}
            onSave={async (input) => {
              const application = modal.application
              await run(async () => {
                await backend.approveApplication(application.id, workspace.period.id, input)
                return `${application.first_name} ${application.last_name} заселён`
              })
              setModal(null)
            }}
          />
        </Modal>
      )}

      {modal?.kind === 'reject' && (
        <Confirm
          title="Отклонить заявку"
          text={`Заявка «${modal.application.first_name} ${modal.application.last_name}» будет отмечена как отклонённая. Человек сможет подать её заново.`}
          confirmLabel="Отклонить"
          onCancel={() => setModal(null)}
          onConfirm={() => {
            const application = modal.application
            setModal(null)
            void run(async () => {
              await backend.rejectApplication(application.id, '')
              return 'Заявка отклонена'
            }).catch(() => undefined)
          }}
        />
      )}

      {modal?.kind === 'expense' && workspace && (
        <Modal title="Новый расход" subtitle={`Период: ${title}`} onClose={() => setModal(null)}>
          <ExpenseForm
            properties={properties}
            defaultPropertyId={selectedProperty === 'all' ? undefined : selectedProperty}
            onSave={async (input) => {
              await run(async () => {
                await backend.createExpense(workspace.period.id, input)
                return 'Расход записан'
              })
              setModal(null)
            }}
          />
        </Modal>
      )}

      {modal?.kind === 'delete-expense' && (
        <Confirm
          danger
          title="Удалить расход"
          text={`Расход на ${modal.expense.amount} Kč по адресу «${modal.expense.property_name ?? '—'}» будет удалён.`}
          confirmLabel="Удалить"
          onCancel={() => setModal(null)}
          onConfirm={() => {
            const expense = modal.expense
            setModal(null)
            void run(async () => {
              await backend.deleteExpense(expense.id)
              return 'Расход удалён'
            }).catch(() => undefined)
          }}
        />
      )}

      {modal?.kind === 'delete-allocation' && (
        <Confirm danger title="Удалить строку ведомости" text={`Аренда «${modal.allocation.full_address}${modal.allocation.room_name ? ` · ${modal.allocation.room_name}` : ''}» будет удалена.`} confirmLabel="Удалить" onCancel={() => setModal(null)} onConfirm={() => { const allocation = modal.allocation; setModal(null); void run(async () => { await backend.deleteAgencyAllocation(allocation.id); return 'Строка ведомости удалена' }).catch(() => undefined) }} />
      )}

      {modal?.kind === 'delete' && (
        <Confirm
          danger
          title="Удалить запись"
          text={`Запись «${modal.stay.full_name}» за ${title.toLowerCase()} будет удалена вместе с её оплатами. Данные за другие месяцы останутся.`}
          confirmLabel="Удалить"
          onCancel={() => setModal(null)}
          onConfirm={() => {
            const stay = modal.stay
            setModal(null)
            void run(async () => {
              await backend.deleteStay(stay.id)
              return 'Запись удалена'
            }).catch(() => undefined)
          }}
        />
      )}
    </div>
  )
}
