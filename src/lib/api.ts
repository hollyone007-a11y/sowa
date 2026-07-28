import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { getClient } from './supabase'
import type { Backend } from './backend'
import type {
  Agency, AgencyAllocation, AgencyFinancialSummary, AgencyPayment, AppProfile, AppRole, AuditEntry,
  AuthUser, Debtor, DepositTransaction, EntityAttachment, Expense, HousingApplication, InventorySlot,
  PaymentEntry, Period, Property, PublicProperty, ResidentPrivateProfile, Stay, Workspace,
} from '../types'
import type { AgencyPaymentInput, ApprovalInput, BedInput, DepositTransactionInput, ExpenseInput, PublicApplicationInput, ResidentInput, RoomInput, StayEditInput } from './schemas'
import { shiftMonth } from './format'

const db = (): SupabaseClient => {
  const client = getClient()
  if (!client) throw new Error('База данных не подключена: заполните config.json')
  return client
}

/**
 * Turns the raw PostgREST error into something a manager can act on.
 * RLS denials arrive as generic 42501/PGRST codes that mean nothing to a user.
 */
function readable(error: { message?: string; code?: string } | null): Error {
  const message = error?.message ?? 'Неизвестная ошибка'
  if (error?.code === '42501' || /permission denied|row-level security/i.test(message)) {
    return new Error('Недостаточно прав для этого действия')
  }
  if (/access denied/i.test(message)) return new Error('Недостаточно прав для этого действия')
  if (/period is closed|target period is closed/i.test(message)) return new Error('Период закрыт для изменений')
  if (/housing space is already allocated/i.test(message)) return new Error('Это жильё уже закреплено за другой агентурой в выбранном месяце')
  if (/allocation dates are outside/i.test(message)) return new Error('Даты аренды не входят в выбранный месяц')
  if (/invalid payment amount/i.test(message)) return new Error('Некорректная сумма оплаты')
  if (/capacity exceeded|duplicate key.*active_bed/i.test(message)) return new Error('Выбранная комната или место уже заполнены')
  if (/Failed to fetch|NetworkError/i.test(message)) return new Error('Нет связи с сервером')
  return new Error(message)
}

/**
 * Resolves the signed-in user together with the role the database grants them.
 * A brand-new Auth user has no profile row yet, so ask the server to create one.
 */
async function resolveUser(session: Session | null): Promise<AuthUser | null> {
  if (!session) return null
  const client = db()
  const { data, error } = await client.rpc('ensure_profile').single<{ role: AppRole; display_name: string | null }>()
  if (error) {
    // A profile is not strictly required to look around; degrade to read-only.
    return {
      id: session.user.id,
      email: session.user.email ?? '',
      display_name: session.user.email ?? 'Пользователь',
      role: 'viewer',
    }
  }
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    display_name: data.display_name || session.user.email || 'Пользователь',
    role: data.role,
  }
}

/** PostgREST returns the joined address as a nested object or an array. */
function toExpenses(rows: unknown): Expense[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    const record = row as Record<string, unknown>
    const joined = record.properties as { name?: string } | Array<{ name?: string }> | null
    const nested = Array.isArray(joined) ? joined[0] : joined
    return {
      id: String(record.id),
      period_id: String(record.period_id),
      property_id: String(record.property_id),
      property_name: nested?.name ?? null,
      category: record.category as Expense['category'],
      amount: Number(record.amount),
      description: (record.description as string | null) ?? null,
      incurred_on: String(record.incurred_on),
    }
  })
}

async function loadPeriod(year: number, month: number): Promise<Period> {
  const { data, error } = await db().rpc('ensure_period', { p_year: year, p_month: month }).single<Period>()
  if (error) throw readable(error)
  return data
}

export const supabaseBackend: Backend = {
  async getUser() {
    const { data } = await db().auth.getSession()
    return resolveUser(data.session)
  },

  async signIn(email, password) {
    const { data, error } = await db().auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        throw new Error('Неверный e-mail или пароль')
      }
      if (/email not confirmed/i.test(error.message)) {
        throw new Error('E-mail не подтверждён')
      }
      // Everything else — a wrong project URL, no network — reads as gibberish
      // on a screen that has no other words on it.
      throw readable(error)
    }
    const user = await resolveUser(data.session)
    if (!user) throw new Error('Не удалось открыть сессию')
    return user
  },

  async signOut() {
    await db().auth.signOut()
  },

  subscribe(onChange) {
    const { data } = db().auth.onAuthStateChange((_event, session) => {
      // The role lives in the database, so it has to be re-read on every change.
      void resolveUser(session).then(onChange).catch(() => onChange(null))
    })
    return () => data.subscription.unsubscribe()
  },

  async loadWorkspace(year, month): Promise<Workspace> {
    const client = db()
    const period = await loadPeriod(year, month)
    const [properties, stays, debtors, expenses, agencies, allocations, inventory, agencyFinancials, agencyPayments, deposits, paymentHistory] = await Promise.all([
      client.from('property_period_summary').select('*').eq('period_id', period.id).order('name'),
      client.from('stay_details').select('*').eq('period_id', period.id).order('full_name'),
      client.rpc('historic_debt', { p_period_id: period.id }),
      client
        .from('property_expenses')
        .select('id,period_id,property_id,category,amount,description,incurred_on,properties(name)')
        .eq('period_id', period.id)
        .is('archived_at', null)
        .order('incurred_on', { ascending: false }),
      client.from('agencies').select('*').eq('status', 'active').order('name'),
      client.from('agency_statement_rows').select('*').eq('period_id', period.id).order('full_address'),
      client.from('inventory_status').select('*').eq('period_id', period.id).order('property_name').order('room_name').order('bed_name'),
      client.from('agency_financial_summary').select('*').eq('period_id', period.id).order('agency_name'),
      client.from('agency_payments').select('id,period_id,agency_id,amount,paid_on,method,note').eq('period_id', period.id).is('archived_at', null).order('paid_on', { ascending: false }),
      client.from('deposit_transactions').select('id,stay_id,period_id,kind,amount,occurred_on,note').eq('period_id', period.id).order('occurred_on', { ascending: false }),
      client.from('payments').select('id,stay_id,period_id,amount,method,paid_at,note').eq('period_id', period.id).is('archived_at', null).order('paid_at', { ascending: false }),
    ])
    if (properties.error) throw readable(properties.error)
    if (stays.error) throw readable(stays.error)
    return {
      period,
      properties: (properties.data ?? []) as Property[],
      stays: (stays.data ?? []) as Stay[],
      // Debt and expenses are finance data: a viewer is denied by RLS, and
      // that must leave the rest of the page working rather than blank it.
      debtors: debtors.error ? [] : ((debtors.data ?? []) as Debtor[]),
      expenses: expenses.error ? [] : toExpenses(expenses.data),
      agencies: agencies.error ? [] : ((agencies.data ?? []) as Agency[]),
      agency_allocations: allocations.error ? [] : ((allocations.data ?? []) as AgencyAllocation[]),
      inventory: inventory.error ? [] : ((inventory.data ?? []) as InventorySlot[]),
      agency_financials: agencyFinancials.error ? [] : ((agencyFinancials.data ?? []) as AgencyFinancialSummary[]),
      agency_payments: agencyPayments.error ? [] : ((agencyPayments.data ?? []) as AgencyPayment[]),
      deposit_transactions: deposits.error ? [] : ((deposits.data ?? []) as DepositTransaction[]),
      payments: paymentHistory.error ? [] : ((paymentHistory.data ?? []) as PaymentEntry[]),
    }
  },

  async createProperty(input) {
    // Creating the address and its public QR link is one operation, so an
    // address can never exist without a way to reach its application form.
    const { data, error } = await db().rpc('create_property_with_link', {
      p_name: input.name,
      p_full_address: input.full_address,
      p_contact_name: input.contact_name || null,
      p_phone: input.phone || null,
      p_email: input.email || null,
      p_capacity: input.capacity,
      p_monthly_cost: input.monthly_cost,
    })
    if (error) throw readable(error)
    const created = Array.isArray(data) ? data[0] : data
    const propertyId = (created as { property_id?: string } | null)?.property_id
    if (propertyId) {
      const { error: settingsError } = await db().from('properties').update({ qr_auto_approve: input.qr_auto_approve, application_retention_days: input.application_retention_days }).eq('id', propertyId)
      if (settingsError) throw readable(settingsError)
    }
  },

  async updateProperty(propertyId, input) {
    const { error } = await db().from('properties').update({
      name: input.name,
      full_address: input.full_address,
      contact_name: input.contact_name || null,
      phone: input.phone || null,
      email: input.email || null,
      capacity: input.capacity,
      monthly_cost: input.monthly_cost,
      qr_auto_approve: input.qr_auto_approve,
      application_retention_days: input.application_retention_days,
      updated_at: new Date().toISOString(),
    }).eq('id', propertyId)
    if (error) throw readable(error)
  },

  async createResident(periodId, input: ResidentInput) {
    const { data, error } = await db().rpc('create_resident_with_stay', {
      p_period_id: periodId,
      p_first_name: input.first_name,
      p_last_name: input.last_name,
      p_phone: input.phone || null,
      p_workplace: input.workplace || null,
      p_person_kind: input.person_kind,
      p_property_id: input.property_id || null,
      p_room_name: input.room_name || null,
      p_bed_name: input.bed_name || null,
      p_move_in: input.move_in,
      p_price: input.price,
      p_payment_method: input.payment_method,
      p_deposit_status: input.deposit_status,
      p_passport_series: input.passport_series || null,
      p_passport_number: input.passport_number || null,
      p_ukraine_registration: input.ukraine_registration || null,
      p_comment: input.comment || null,
    })
    if (error) throw readable(error)
    if (data) {
      const { error: agencyError } = await db().from('stays').update({ agency_id: input.agency_id || null }).eq('period_id', periodId).eq('person_id', String(data))
      if (agencyError) throw readable(agencyError)
    }
  },

  async updateStay(stayId, input: StayEditInput) {
    const { error } = await db().rpc('update_stay_details', {
      p_stay_id: stayId,
      p_property_id: input.property_id || null,
      p_room_name: input.room_name || null,
      p_bed_name: input.bed_name || null,
      p_price: input.price,
      p_payment_method: input.payment_method,
      p_deposit_status: input.deposit_status,
      p_move_out: input.move_out || null,
      p_comment: input.comment || null,
    })
    if (error) throw readable(error)
    const { error: agencyError } = await db().from('stays').update({ agency_id: input.agency_id || null }).eq('id', stayId)
    if (agencyError) throw readable(agencyError)
  },

  async recordPayment(stayId, amount) {
    const { error } = await db().rpc('record_payment', { p_stay_id: stayId, p_amount: amount })
    if (error) throw readable(error)
  },

  async reversePayment(paymentId, reason) {
    const { error } = await db().rpc('reverse_payment', { p_payment_id: paymentId, p_reason: reason || null })
    if (error) throw readable(error)
  },

  async copyPreviousMonth(year, month, excludeDeparted) {
    const previous = shiftMonth(year, month, -1)
    const [source, target] = await Promise.all([
      loadPeriod(previous.year, previous.month),
      loadPeriod(year, month),
    ])
    const { data, error } = await db().rpc('copy_period', {
      p_source_period_id: source.id,
      p_target_period_id: target.id,
      p_exclude_departed: excludeDeparted,
    })
    if (error) throw readable(error)
    return (data as number | null) ?? 0
  },

  async getPrivateProfile(personId) {
    const { data, error } = await db()
      .from('resident_profiles_private')
      .select('person_id,first_name,last_name,passport_series,passport_number,ukraine_registration')
      .eq('person_id', personId)
      .single()
    if (error) throw readable(error)
    return data as ResidentPrivateProfile
  },

  async deleteStay(stayId) {
    const { error } = await db().rpc('archive_stay', { p_stay_id: stayId })
    if (error) throw readable(error)
  },

  async createRoom(input: RoomInput) {
    const { error } = await db().from('rooms').insert(input)
    if (error) throw readable(error)
  },

  async createBed(input: BedInput) {
    const { error } = await db().from('beds').insert({ ...input, is_active: true })
    if (error) throw readable(error)
  },

  async recordDeposit(stayId, input: DepositTransactionInput) {
    const { error } = await db().rpc('record_deposit_transaction', { p_stay_id: stayId, p_kind: input.kind, p_amount: input.amount, p_occurred_on: input.occurred_on, p_note: input.note || null })
    if (error) throw readable(error)
  },

  async getPublicProperty(token) {
    const { data, error } = await db()
      .rpc('public_property_by_token', { p_token: token })
      .single<PublicProperty>()
    if (error) throw new Error('Ссылка недействительна или была отключена')
    return data
  },

  async submitApplication(token, input: PublicApplicationInput) {
    const { error } = await db().rpc('submit_housing_application', {
      p_token: token,
      p_first_name: input.first_name,
      p_last_name: input.last_name,
      p_phone: input.phone,
      p_workplace: input.workplace || null,
      p_passport_series: input.passport_series || null,
      p_passport_number: input.passport_number,
      p_ukraine_registration: input.ukraine_registration,
      p_requested_move_in: input.requested_move_in,
      p_consent: true,
      p_website: input.website || null,
    })
    if (error) {
      throw new Error(
        /already submitted/i.test(error.message)
          ? 'Заявка с этим паспортом уже отправлена — дождитесь ответа'
          : /link unavailable/i.test(error.message)
            ? 'Ссылка недействительна или была отключена'
            : error.message,
      )
    }
  },

  async listApplications() {
    const { data, error } = await db()
      .from('housing_applications')
      .select('*,properties(name)')
      .order('created_at', { ascending: false })
    if (error) throw readable(error)
    return (data ?? []).map((row) => {
      const record = row as Record<string, unknown>
      const joined = record.properties as { name?: string } | Array<{ name?: string }> | null
      const nested = Array.isArray(joined) ? joined[0] : joined
      return { ...record, property_name: nested?.name ?? null } as unknown as HousingApplication
    })
  },

  async approveApplication(applicationId, periodId, input: ApprovalInput) {
    const { error } = await db().rpc('approve_housing_application', {
      p_application_id: applicationId,
      p_period_id: periodId,
      p_price: input.price,
      p_payment_method: input.payment_method,
      p_room_name: input.room_name || null,
      p_bed_name: input.bed_name || null,
    })
    if (error) throw readable(error)
  },

  async rejectApplication(applicationId, reason) {
    const { error } = await db().rpc('reject_housing_application', {
      p_application_id: applicationId,
      p_reason: reason || null,
    })
    if (error) throw readable(error)
  },

  async rotatePropertyLink(propertyId) {
    const { data, error } = await db().rpc('rotate_property_link', { p_property_id: propertyId })
    if (error) throw readable(error)
    return String(data)
  },

  async createExpense(periodId, input: ExpenseInput) {
    const { error } = await db().from('property_expenses').insert({
      period_id: periodId,
      property_id: input.property_id,
      category: input.category,
      amount: input.amount,
      incurred_on: input.incurred_on,
      description: input.description || null,
      created_by: (await db().auth.getUser()).data.user?.id ?? null,
    })
    if (error) throw readable(error)
  },

  async deleteExpense(expenseId) {
    const { error } = await db().rpc('archive_expense', { p_expense_id: expenseId })
    if (error) throw readable(error)
  },

  async createAgency(input) {
    const { error } = await db().from('agencies').insert({ name: input.name, company_id: input.company_id || null, contact_name: input.contact_name || null, phone: input.phone || null, email: input.email || null, note: input.note || null })
    if (error) throw readable(error)
  },

  async updateAgency(agencyId, input) {
    const { error } = await db().from('agencies').update({ name:input.name, company_id:input.company_id||null, contact_name:input.contact_name||null, phone:input.phone||null, email:input.email||null, note:input.note||null, updated_at:new Date().toISOString() }).eq('id',agencyId)
    if (error) throw readable(error)
  },

  async createAgencyAllocation(periodId, input) {
    const { error } = await db().from('agency_allocations').insert({ period_id: periodId, agency_id: input.agency_id, property_id: input.property_id, room_id: input.room_id || null, bed_id: input.bed_id || null, room_name: input.room_name || null, bed_name: input.bed_name || null, people_count: input.people_count, pricing_model: input.pricing_model, unit_price: input.unit_price, start_date: input.start_date, end_date: input.end_date, note: input.note || null, created_by: (await db().auth.getUser()).data.user?.id ?? null })
    if (error) throw readable(error)
  },

  async updateAgencyAllocation(allocationId, input) {
    const { error } = await db().from('agency_allocations').update({ agency_id:input.agency_id, property_id:input.property_id, room_id:input.room_id||null, bed_id:input.bed_id||null, room_name:input.room_name||null, bed_name:input.bed_name||null, people_count:input.people_count, pricing_model:input.pricing_model, unit_price:input.unit_price, start_date:input.start_date, end_date:input.end_date, note:input.note||null }).eq('id',allocationId)
    if (error) throw readable(error)
  },

  async deleteAgencyAllocation(allocationId) {
    const { error } = await db().rpc('archive_agency_allocation', { p_allocation_id: allocationId })
    if (error) throw readable(error)
  },

  async recordAgencyPayment(periodId, input: AgencyPaymentInput) {
    const { error } = await db().rpc('record_agency_payment', { p_period_id: periodId, p_agency_id: input.agency_id, p_amount: input.amount, p_paid_on: input.paid_on, p_method: input.method, p_note: input.note || null })
    if (error) throw readable(error)
  },

  async copyAgencyPreviousMonth(year, month) {
    const previous = shiftMonth(year, month, -1)
    const [source, target] = await Promise.all([loadPeriod(previous.year, previous.month), loadPeriod(year, month)])
    const { data, error } = await db().rpc('copy_agency_allocations', { p_source_period_id: source.id, p_target_period_id: target.id })
    if (error) throw readable(error)
    return Number(data ?? 0)
  },

  async listProfiles() {
    const { data, error } = await db().from('profiles').select('id,display_name,role').order('display_name')
    if (error) throw readable(error)
    return (data ?? []) as AppProfile[]
  },

  async updateUserRole(userId, role) {
    const { error } = await db().rpc('set_user_role', { p_user_id: userId, p_role: role })
    if (error) throw readable(error)
  },

  async listAudit(limit = 200) {
    const { data, error } = await db().from('audit_log').select('*').order('changed_at', { ascending: false }).limit(limit)
    if (error) throw readable(error)
    return (data ?? []) as AuditEntry[]
  },

  async purgeExpiredApplications() {
    const { data, error } = await db().rpc('purge_expired_applications')
    if (error) throw readable(error)
    return Number(data ?? 0)
  },

  async listAttachments(entityType, entityId) {
    const { data, error } = await db().from('entity_attachments').select('*').eq('entity_type', entityType).eq('entity_id', entityId).is('archived_at', null).order('created_at', { ascending: false })
    if (error) throw readable(error)
    return (data ?? []) as EntityAttachment[]
  },

  async uploadAttachment(entityType, entityId, file) {
    const allowed = ['application/pdf','image/jpeg','image/png','image/webp']
    if (!allowed.includes(file.type) || file.size <= 0 || file.size > 15 * 1024 * 1024) throw new Error('Допустимы PDF/JPG/PNG/WEBP до 15 МБ')
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-120)
    const storagePath = `${entityType}/${entityId}/${crypto.randomUUID()}-${cleanName}`
    const { error: uploadError } = await db().storage.from('sowa-documents').upload(storagePath,file,{ upsert:false, contentType:file.type })
    if (uploadError) throw readable(uploadError)
    try {
      await this.createAttachmentMetadata({ entity_type:entityType, entity_id:entityId, file_name:file.name, storage_path:storagePath, mime_type:file.type, size_bytes:file.size })
    } catch (cause) {
      await db().storage.from('sowa-documents').remove([storagePath])
      throw cause
    }
  },

  async createAttachmentMetadata(input) {
    const userId = (await db().auth.getUser()).data.user?.id
    if (!userId) throw new Error('Сессия истекла')
    const { error } = await db().from('entity_attachments').insert({ ...input, uploaded_by: userId })
    if (error) throw readable(error)
  },
}
