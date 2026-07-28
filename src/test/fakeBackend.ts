import type {
  Agency, AgencyAllocation, AgencyPayment, AuthUser, Debtor, DepositStatus, DepositTransaction, Expense,
  HousingApplication, PaymentMethod, Period, PersonKind, Property, PublicProperty, ResidentPrivateProfile, Stay, Workspace,
} from '../types'
import type { Backend } from '../lib/backend'
import type { ApprovalInput, ExpenseInput, PublicApplicationInput } from '../lib/schemas'
import { proratedAgencyTotal, remainingOf, statusFor, summarizeProperties } from '../lib/domain'
import { currentMonth, firstDayOf, shiftMonth } from '../lib/format'

/**
 * An in-memory stand-in for the Supabase project.
 *
 * It lets the tests drive real flows — sign in, load a month, take a payment,
 * approve a QR application — against the same `Backend` contract the app uses,
 * without a database and without shipping a single line of it to production.
 * It enforces the same invariants the SQL functions do, so a rule that drifts
 * apart between the two shows up as a failing test.
 */

interface PropertyRow {
  id: string
  name: string
  full_address: string
  contact_name: string | null
  phone: string | null
  email: string | null
  capacity: number
  monthly_cost: number
  status: 'active' | 'closed'
  public_token: string
  qr_auto_approve: boolean
  application_retention_days: number
}

interface PersonRow {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  workplace: string | null
  kind: PersonKind
}

interface StayRow {
  id: string
  period_id: string
  person_id: string
  property_id: string | null
  room_name: string | null
  bed_name: string | null
  move_in: string
  move_out: string | null
  price: number
  paid_amount: number
  payment_method: PaymentMethod
  deposit_status: DepositStatus
  comment: string | null
  agency_id: string | null
}

interface FakeDb {
  periods: Period[]
  properties: PropertyRow[]
  people: PersonRow[]
  profiles: ResidentPrivateProfile[]
  stays: StayRow[]
  applications: HousingApplication[]
  expenses: Expense[]
  agencies: Agency[]
  agency_allocations: AgencyAllocation[]
  agency_payments: AgencyPayment[]
  deposit_transactions: DepositTransaction[]
}

export const fakeUsers: Array<AuthUser & { password: string }> = [
  { id: 'u-admin', email: 'admin@sowa.test', password: 'secret', display_name: 'Администратор', role: 'admin' },
  { id: 'u-manager', email: 'manager@sowa.test', password: 'secret', display_name: 'Менеджер', role: 'manager' },
  { id: 'u-buh', email: 'buh@sowa.test', password: 'secret', display_name: 'Бухгалтер', role: 'accountant' },
  { id: 'u-viewer', email: 'viewer@sowa.test', password: 'secret', display_name: 'Наблюдатель', role: 'viewer' },
]

export const fakeProperties: PropertyRow[] = [
  { id: 'pr-modrany', name: 'Praha 4 · Modřany', full_address: 'Komořanská 42, Praha 4', contact_name: 'Jan Novák', phone: '+420 777 123 456', email: null, capacity: 14, monthly_cost: 86000, status: 'active', qr_auto_approve: false, application_retention_days: 90, public_token: 'token-modrany' },
  { id: 'pr-cernymost', name: 'Praha 9 · Černý Most', full_address: 'Bryksova 18, Praha 9', contact_name: null, phone: null, email: null, capacity: 10, monthly_cost: 62000, status: 'active', qr_auto_approve: false, application_retention_days: 90, public_token: 'token-cernymost' },
  { id: 'pr-zidenice', name: 'Brno · Židenice', full_address: 'Gajdošova 31, Brno', contact_name: null, phone: null, email: null, capacity: 8, monthly_cost: 48000, status: 'active', qr_auto_approve: false, application_retention_days: 90, public_token: 'token-zidenice' },
]

/** [имя, фамилия, тип, адрес, комната, место, цена, способ] */
type SeedPerson = [string, string, PersonKind, string | null, string | null, string | null, number, PaymentMethod]

const SEED_PEOPLE: SeedPerson[] = [
  ['Олександр', 'Коваль', 'employee', 'pr-modrany', 'Комната 1', 'Место A', 6500, 'salary'],
  ['Максим', 'Шевченко', 'employee', 'pr-modrany', 'Комната 1', 'Место B', 6500, 'salary'],
  ['Ірина', 'Бондар', 'external', 'pr-modrany', 'Комната 2', 'Место A', 7000, 'cash'],
  ['Андрій', 'Ткаченко', 'employee', 'pr-cernymost', 'Комната 1', 'Место A', 6000, 'salary'],
  ['Софія', 'Мороз', 'external', 'pr-cernymost', 'Комната 1', 'Место B', 6800, 'cash'],
  ['Олена', 'Дяченко', 'employee', 'pr-zidenice', 'Комната 1', 'Место A', 5800, 'salary'],
  ['Ігор', 'Гончар', 'employee', null, null, null, 0, 'free'],
]

/** Share of the price each person paid, per seeded month. */
const PAID_RATIO = [
  [1, 1, 0.5],
  [1, 1, 1],
  [0.5, 1, 0],
  [1, 1, 1],
  [0, 0.5, 0],
  [1, 1, 0.5],
  [1, 1, 1],
]

let counter = 0
// The `x` matters: without it the first generated id is `person-1`, which the
// seed already uses, and a freshly created person silently shadows a seeded one.
const uid = (prefix: string) => `${prefix}-x${(counter += 1)}`

const rank = (period: { year: number; month: number }) => period.year * 12 + period.month

function buildDb(): FakeDb {
  counter = 0
  const anchor = currentMonth()
  const periods: Period[] = [-2, -1, 0].map((offset) => {
    const month = shiftMonth(anchor.year, anchor.month, offset)
    return { id: `period-${month.year}-${month.month}`, year: month.year, month: month.month, is_closed: false }
  })

  const people: PersonRow[] = []
  const profiles: ResidentPrivateProfile[] = []
  const stays: StayRow[] = []

  SEED_PEOPLE.forEach((seed, index) => {
    const [first, last, kind, propertyId, room, bed, price, method] = seed
    const personId = `person-${index + 1}`
    people.push({ id: personId, first_name: first, last_name: last, phone: `+420 700 000 ${100 + index}`, workplace: kind === 'employee' ? 'Stavmont CZ' : null, kind })
    profiles.push({
      person_id: personId,
      first_name: first,
      last_name: last,
      passport_series: 'КС',
      passport_number: String(430000 + index * 137),
      ukraine_registration: 'Україна, Львівська обл.',
    })

    periods.forEach((period, monthIndex) => {
      const ratio = PAID_RATIO[index]?.[monthIndex] ?? 1
      stays.push({
        id: `stay-${index + 1}-${monthIndex}`,
        period_id: period.id,
        person_id: personId,
        property_id: propertyId,
        room_name: room,
        bed_name: bed,
        move_in: firstDayOf(period.year, period.month),
        move_out: null,
        price,
        paid_amount: method === 'free' ? 0 : Math.round(price * ratio),
        payment_method: method,
        deposit_status: 'none',
        comment: null,
        agency_id: null,
      })
    })
  })

  const current = periods[periods.length - 1]
  const day = (offset: number) =>
    new Date(Date.UTC(current.year, current.month - 1, offset)).toISOString().slice(0, 10)

  return {
    periods,
    properties: fakeProperties.map((row) => ({ ...row })),
    people,
    profiles,
    stays,
    applications: [
      {
        id: 'app-1', property_id: 'pr-modrany', property_name: 'Praha 4 · Modřany',
        first_name: 'Катерина', last_name: 'Гриценко', phone: '+420 776 401 233',
        workplace: null, passport_series: 'КС', passport_number: '556231',
        ukraine_registration: 'Україна, м. Черкаси', requested_move_in: day(12),
        status: 'pending', rejection_reason: null, created_at: `${day(4)}T09:12:00Z`,
      },
    ],
    expenses: [
      { id: 'exp-1', period_id: current.id, property_id: 'pr-modrany', property_name: 'Praha 4 · Modřany', category: 'utilities', amount: 9400, description: 'Электричество', incurred_on: day(5) },
    ],
    agencies: [],
    agency_allocations: [],
    agency_payments: [],
    deposit_transactions: [],
  }
}

export interface FakeBackend extends Backend {
  reset(): void
  readonly db: FakeDb
}

export function createFakeBackend(): FakeBackend {
  let db = buildDb()
  let session: AuthUser | null = null
  let listener: ((user: AuthUser | null) => void) | null = null

  const stayOf = (row: StayRow): Stay => {
    const person = db.people.find((item) => item.id === row.person_id)
    const property = db.properties.find((item) => item.id === row.property_id)
    return {
      id: row.id,
      period_id: row.period_id,
      person_id: row.person_id,
      property_id: row.property_id,
      room_id: row.room_name,
      bed_id: row.bed_name,
      full_name: person ? `${person.first_name} ${person.last_name}` : 'Без имени',
      phone: person?.phone ?? null,
      workplace: person?.workplace ?? null,
      person_kind: person?.kind ?? 'employee',
      property_name: property?.name ?? null,
      room_name: row.room_name,
      bed_name: row.bed_name,
      move_in: row.move_in,
      move_out: row.move_out,
      price: row.price,
      paid_amount: row.paid_amount,
      payment_method: row.payment_method,
      payment_status: statusFor(row.price, row.paid_amount, row.payment_method),
      deposit_status: row.deposit_status,
      comment: row.comment,
      agency_id: row.agency_id,
      agency_name: db.agencies.find((item) => item.id === row.agency_id)?.name ?? null,
    }
  }

  const ensurePeriod = (year: number, month: number): Period => {
    const found = db.periods.find((item) => item.year === year && item.month === month)
    if (found) return found
    const created: Period = { id: `period-${year}-${month}`, year, month, is_closed: false }
    db.periods.push(created)
    return created
  }

  const assertOpen = (periodId: string) => {
    if (db.periods.find((item) => item.id === periodId)?.is_closed) {
      throw new Error('Период закрыт для изменений')
    }
  }

  const requireStay = (stayId: string) => {
    const row = db.stays.find((item) => item.id === stayId)
    if (!row) throw new Error('Запись не найдена')
    return row
  }

  const historicDebtors = (period: Period): Debtor[] => {
    const cutoff = rank(period)
    const byPerson = new Map<string, Debtor>()
    for (const row of db.stays) {
      const owner = db.periods.find((item) => item.id === row.period_id)
      if (!owner || rank(owner) >= cutoff) continue
      const amount = remainingOf(row)
      if (amount <= 0) continue
      const entry = byPerson.get(row.person_id)
      if (entry) {
        entry.amount += amount
        entry.months += 1
      } else {
        byPerson.set(row.person_id, {
          person_id: row.person_id,
          full_name: stayOf(row).full_name,
          amount,
          months: 1,
        })
      }
    }
    return [...byPerson.values()].sort((a, b) => b.amount - a.amount)
  }

  return {
    get db() {
      return db
    },

    reset() {
      db = buildDb()
      session = null
    },

    async getUser() {
      return session
    },

    async signIn(email, password) {
      const found = fakeUsers.find(
        (user) => user.email === email.trim().toLowerCase() && user.password === password,
      )
      if (!found) throw new Error('Неверный e-mail или пароль')
      session = { id: found.id, email: found.email, display_name: found.display_name, role: found.role }
      listener?.(session)
      return session
    },

    async signOut() {
      session = null
      listener?.(null)
    },

    subscribe(onChange) {
      listener = onChange
      return () => {
        if (listener === onChange) listener = null
      }
    },

    async loadWorkspace(year, month): Promise<Workspace> {
      const period = ensurePeriod(year, month)
      const stays = db.stays
        .filter((row) => row.period_id === period.id)
        .map(stayOf)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
      const properties: Property[] = summarizeProperties(
        db.properties.map((row) => ({ ...row, occupied: 0, debt: 0, collected: 0 })),
        stays,
      )
      return {
        period,
        properties,
        stays,
        debtors: historicDebtors(period),
        expenses: db.expenses.filter((expense) => expense.period_id === period.id),
        agencies: db.agencies.filter((agency) => agency.status === 'active'),
        agency_allocations: db.agency_allocations.filter((allocation) => allocation.period_id === period.id),
        inventory: [],
        agency_financials: [],
        agency_payments: db.agency_payments.filter((payment) => payment.period_id === period.id),
        deposit_transactions: db.deposit_transactions.filter((item) => item.period_id === period.id),
        payments: [],
      }
    },

    async createProperty(input) {
      db.properties.push({
        id: uid('pr'),
        name: input.name,
        full_address: input.full_address,
        contact_name: input.contact_name || null,
        phone: input.phone || null,
        email: input.email || null,
        capacity: input.capacity,
        monthly_cost: input.monthly_cost,
        status: 'active',
        public_token: uid('token'),
        qr_auto_approve: input.qr_auto_approve,
        application_retention_days: input.application_retention_days,
      })
    },

    async updateProperty(propertyId, input) {
      const property = db.properties.find((item) => item.id === propertyId)
      if (!property) throw new Error('Адрес не найден')
      Object.assign(property, {
        name: input.name,
        full_address: input.full_address,
        contact_name: input.contact_name || null,
        phone: input.phone || null,
        email: input.email || null,
        capacity: input.capacity,
        monthly_cost: input.monthly_cost,
        qr_auto_approve: input.qr_auto_approve,
        application_retention_days: input.application_retention_days,
      })
    },

    async createResident(periodId, input) {
      assertOpen(periodId)
      const personId = uid('person')
      db.people.push({
        id: personId,
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone || null,
        workplace: input.workplace || null,
        kind: input.person_kind,
      })
      db.profiles.push({
        person_id: personId,
        first_name: input.first_name,
        last_name: input.last_name,
        passport_series: input.passport_series || null,
        passport_number: input.passport_number || null,
        ukraine_registration: input.ukraine_registration || null,
      })
      db.stays.push({
        id: uid('stay'),
        period_id: periodId,
        person_id: personId,
        property_id: input.property_id || null,
        room_name: input.room_name || null,
        bed_name: input.bed_name || null,
        move_in: input.move_in,
        move_out: null,
        price: input.price,
        paid_amount: 0,
        payment_method: input.payment_method,
        deposit_status: input.deposit_status,
        comment: input.comment || null,
        agency_id: input.agency_id || null,
      })
    },

    async updateStay(stayId, input) {
      const row = requireStay(stayId)
      assertOpen(row.period_id)
      if (input.payment_method !== 'free' && input.price < row.paid_amount) {
        throw new Error('Стоимость меньше уже внесённой оплаты')
      }
      Object.assign(row, {
        property_id: input.property_id || null,
        room_name: input.room_name || null,
        bed_name: input.bed_name || null,
        price: input.price,
        payment_method: input.payment_method,
        deposit_status: input.deposit_status,
        move_out: input.move_out || null,
        comment: input.comment || null,
        agency_id: input.agency_id || null,
      })
    },

    async recordPayment(stayId, amount) {
      const row = requireStay(stayId)
      assertOpen(row.period_id)
      if (amount <= 0) throw new Error('Сумма должна быть больше нуля')
      if (row.payment_method === 'free') throw new Error('Для этого жильца оплата не начисляется')
      if (row.paid_amount + amount > row.price) throw new Error('Оплата превышает стоимость')
      row.paid_amount += amount
    },

    async reversePayment() {},

    async copyPreviousMonth(year, month, excludeDeparted) {
      const target = ensurePeriod(year, month)
      assertOpen(target.id)
      const previous = shiftMonth(year, month, -1)
      const source = db.periods.find((item) => item.year === previous.year && item.month === previous.month)
      if (!source) throw new Error('Предыдущий месяц ещё не заполнен')

      const present = new Set(
        db.stays.filter((row) => row.period_id === target.id).map((row) => row.person_id),
      )
      let copied = 0
      for (const row of db.stays.filter((item) => item.period_id === source.id)) {
        if (excludeDeparted && row.move_out) continue
        if (present.has(row.person_id)) continue
        db.stays.push({
          ...row,
          id: uid('stay'),
          period_id: target.id,
          move_in: firstDayOf(year, month),
          move_out: null,
          paid_amount: 0,
        })
        copied += 1
      }
      return copied
    },

    async getPrivateProfile(personId) {
      const profile = db.profiles.find((item) => item.person_id === personId)
      if (!profile) throw new Error('Анкета не найдена')
      return profile
    },

    async deleteStay(stayId) {
      const row = requireStay(stayId)
      assertOpen(row.period_id)
      db.stays = db.stays.filter((item) => item.id !== stayId)
    },

    async getPublicProperty(token): Promise<PublicProperty> {
      const property = db.properties.find(
        (item) => item.public_token === token && item.status === 'active',
      )
      if (!property) throw new Error('Ссылка недействительна или была отключена')
      return {
        property_id: property.id,
        property_name: property.name,
        full_address: property.full_address,
      }
    },

    async submitApplication(token, input: PublicApplicationInput) {
      const property = db.properties.find(
        (item) => item.public_token === token && item.status === 'active',
      )
      if (!property) throw new Error('Ссылка недействительна или была отключена')
      if (input.website) throw new Error('Заявка отклонена')
      const duplicate = db.applications.some(
        (item) => item.property_id === property.id && item.passport_number === input.passport_number,
      )
      if (duplicate) throw new Error('Заявка с этим паспортом уже отправлена — дождитесь ответа')

      db.applications.unshift({
        id: uid('app'),
        property_id: property.id,
        property_name: property.name,
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone,
        workplace: input.workplace || null,
        passport_series: input.passport_series || null,
        passport_number: input.passport_number,
        ukraine_registration: input.ukraine_registration,
        requested_move_in: input.requested_move_in,
        status: 'pending',
        rejection_reason: null,
        created_at: new Date().toISOString(),
      })
    },

    async listApplications() {
      return db.applications.slice()
    },

    async approveApplication(applicationId, periodId, input: ApprovalInput) {
      assertOpen(periodId)
      const application = db.applications.find((item) => item.id === applicationId)
      if (!application || application.status !== 'pending') throw new Error('Заявка уже обработана')

      const personId = uid('person')
      db.people.push({
        id: personId,
        first_name: application.first_name,
        last_name: application.last_name,
        phone: application.phone,
        workplace: application.workplace,
        kind: 'external',
      })
      db.profiles.push({
        person_id: personId,
        first_name: application.first_name,
        last_name: application.last_name,
        passport_series: application.passport_series,
        passport_number: application.passport_number,
        ukraine_registration: application.ukraine_registration,
      })
      db.stays.push({
        id: uid('stay'),
        period_id: periodId,
        person_id: personId,
        property_id: application.property_id,
        room_name: input.room_name || null,
        bed_name: input.bed_name || null,
        move_in: application.requested_move_in,
        move_out: null,
        price: input.price,
        paid_amount: 0,
        payment_method: input.payment_method,
        deposit_status: 'none',
        comment: 'Добавлен через QR-анкету',
        agency_id: null,
      })
      application.status = 'approved'
    },

    async rejectApplication(applicationId, reason) {
      const application = db.applications.find((item) => item.id === applicationId)
      if (!application || application.status !== 'pending') throw new Error('Заявка уже обработана')
      application.status = 'rejected'
      application.rejection_reason = reason || null
    },

    async rotatePropertyLink(propertyId) {
      const property = db.properties.find((item) => item.id === propertyId)
      if (!property) throw new Error('Адрес не найден')
      property.public_token = uid('token')
      return property.public_token
    },

    async createExpense(periodId, input: ExpenseInput) {
      assertOpen(periodId)
      const property = db.properties.find((item) => item.id === input.property_id)
      db.expenses.unshift({
        id: uid('exp'),
        period_id: periodId,
        property_id: input.property_id,
        property_name: property?.name ?? null,
        category: input.category,
        amount: input.amount,
        description: input.description || null,
        incurred_on: input.incurred_on,
      })
    },

    async deleteExpense(expenseId) {
      db.expenses = db.expenses.filter((item) => item.id !== expenseId)
    },

    async createAgency(input) {
      db.agencies.push({ id: uid('agency'), name: input.name, company_id: input.company_id || null, contact_name: input.contact_name || null, phone: input.phone || null, email: input.email || null, note: input.note || null, status: 'active' })
    },

    async updateAgency(agencyId, input) { const agency=db.agencies.find(item=>item.id===agencyId); if(agency) Object.assign(agency,input) },

    async createAgencyAllocation(periodId, input) {
      assertOpen(periodId)
      const period = db.periods.find((item) => item.id === periodId)
      const agency = db.agencies.find((item) => item.id === input.agency_id)
      const property = db.properties.find((item) => item.id === input.property_id)
      if (!period || !agency || !property) throw new Error('Агентура или адрес не найдены')
      const conflict = db.agency_allocations.some((item) => item.period_id === periodId && item.property_id === input.property_id && (!item.room_name || !input.room_name || (item.room_name.toLowerCase() === input.room_name.toLowerCase() && (!item.bed_name || !input.bed_name || item.bed_name.toLowerCase() === input.bed_name.toLowerCase()))))
      if (conflict) throw new Error('Это жильё уже закреплено за другой агентурой в выбранном месяце')
      const monthStart = new Date(Date.UTC(period.year, period.month - 1, 1))
      const monthEnd = new Date(Date.UTC(period.year, period.month, 0))
      const start = new Date(`${input.start_date}T00:00:00Z`) > monthStart ? new Date(`${input.start_date}T00:00:00Z`) : monthStart
      const end = new Date(`${input.end_date}T00:00:00Z`) < monthEnd ? new Date(`${input.end_date}T00:00:00Z`) : monthEnd
      const billableDays = end < start ? 0 : Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
      db.agency_allocations.push({ id: uid('allocation'), period_id: periodId, agency_id: agency.id, agency_name: agency.name, property_id: property.id, property_name: property.name, full_address: property.full_address, room_name: input.room_name || null, bed_name: input.bed_name || null, people_count: input.people_count, pricing_model: input.pricing_model, unit_price: input.unit_price, start_date: input.start_date, end_date: input.end_date, billable_days: billableDays, days_in_month: monthEnd.getUTCDate(), total_amount: proratedAgencyTotal(input.people_count, input.unit_price, input.pricing_model, input.start_date, input.end_date, period.year, period.month), note: input.note || null, room_id: input.room_id || null, bed_id: input.bed_id || null })
    },

    async updateAgencyAllocation(allocationId, input) { const row=db.agency_allocations.find(item=>item.id===allocationId); if(row) Object.assign(row,input) },

    async deleteAgencyAllocation(allocationId) {
      const allocation = db.agency_allocations.find((item) => item.id === allocationId)
      if (allocation) assertOpen(allocation.period_id)
      db.agency_allocations = db.agency_allocations.filter((item) => item.id !== allocationId)
    },

    async createRoom() {},
    async createBed() {},

    async recordDeposit(stayId, input) {
      const stay = requireStay(stayId)
      assertOpen(stay.period_id)
      db.deposit_transactions.push({ id: uid('deposit'), stay_id: stayId, period_id: stay.period_id, kind: input.kind, amount: input.amount, occurred_on: input.occurred_on, note: input.note || null })
      stay.deposit_status = input.kind === 'paid' ? 'paid' : input.kind === 'refunded' ? 'returned' : 'applied'
    },

    async recordAgencyPayment(periodId, input) {
      assertOpen(periodId)
      db.agency_payments.push({ id: uid('agency-payment'), period_id: periodId, agency_id: input.agency_id, amount: input.amount, paid_on: input.paid_on, method: input.method, note: input.note || null })
    },

    async copyAgencyPreviousMonth(year, month) {
      const target = ensurePeriod(year, month)
      assertOpen(target.id)
      const previous = shiftMonth(year, month, -1)
      const source = db.periods.find((item) => item.year === previous.year && item.month === previous.month)
      if (!source) return 0
      const rows = db.agency_allocations.filter((item) => item.period_id === source.id)
      for (const row of rows) db.agency_allocations.push({ ...row, id: uid('allocation'), period_id: target.id, start_date: firstDayOf(year, month), end_date: new Date(Date.UTC(year, month, 0)).toISOString().slice(0,10) })
      return rows.length
    },

    async listProfiles() {
      return fakeUsers.map(({ id, display_name, role }) => ({ id, display_name, role }))
    },
    async updateUserRole(userId, role) {
      const user = fakeUsers.find((item) => item.id === userId)
      if (user) user.role = role
    },
    async listAudit() { return [] },
    async purgeExpiredApplications() { return 0 },
    async listAttachments() { return [] },
    async createAttachmentMetadata() {},
    async uploadAttachment() {},
    async getAttachmentUrl() { return '#' },
  }
}
