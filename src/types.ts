export type AppRole = 'admin' | 'manager' | 'accountant' | 'viewer'
export type PaymentMethod = 'cash' | 'salary' | 'free'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'tracking'
export type DepositStatus = 'none' | 'paid' | 'returned' | 'applied'
export type PersonKind = 'employee' | 'external'
export type AgencyPricingModel = 'per_person' | 'fixed'
export type LedgerEntryKind = 'paid' | 'refunded' | 'applied'
export type AgencyPaymentStatus = 'empty' | 'unpaid' | 'partial' | 'paid'

export interface AuthUser {
  id: string
  email: string
  display_name: string
  role: AppRole
}

export interface Property {
  id: string
  name: string
  full_address: string
  contact_name: string | null
  phone: string | null
  email: string | null
  capacity: number
  /** What the agency itself pays the landlord for this address every month. */
  monthly_cost: number
  status: 'active' | 'closed'
  /** Token behind the public QR link; only staff roles can read it. */
  public_token: string | null
  qr_auto_approve: boolean
  application_retention_days: number
  /** Residents living here in the selected period. */
  occupied: number
  /** Unpaid remainder for the selected period. */
  debt: number
  /** Money already received for the selected period. */
  collected: number
}

export interface Stay {
  id: string
  period_id: string
  person_id: string
  property_id: string | null
  room_id: string | null
  bed_id: string | null
  full_name: string
  phone: string | null
  workplace: string | null
  person_kind: PersonKind
  property_name: string | null
  room_name: string | null
  bed_name: string | null
  move_in: string
  move_out: string | null
  price: number
  paid_amount: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  deposit_status: DepositStatus
  comment: string | null
  agency_id: string | null
  agency_name: string | null
}

export interface Period {
  id: string
  year: number
  month: number
  is_closed: boolean
}

export interface Debtor {
  person_id: string
  full_name: string
  amount: number
  months: number
}

/** Everything one month needs, so the UI does a single load per period. */
export interface Workspace {
  period: Period
  properties: Property[]
  stays: Stay[]
  /** Residents still owing money from periods before this one. */
  debtors: Debtor[]
  /** Utilities, repairs and other costs booked against this month. */
  expenses: Expense[]
  agencies: Agency[]
  agency_allocations: AgencyAllocation[]
  inventory: InventorySlot[]
  agency_financials: AgencyFinancialSummary[]
  agency_payments: AgencyPayment[]
  deposit_transactions: DepositTransaction[]
}

export interface DashboardMetrics {
  occupied: number
  capacity: number
  free: number
  /** Billed this month. */
  expected: number
  collected: number
  monthDebt: number
  /** Carried over from earlier months. */
  historicDebt: number
  cash: number
  salary: number
  /** Rent the agency owes landlords for active addresses. */
  rentCost: number
  /** Utilities, repairs and everything else booked against the month. */
  expenses: number
  /** collected - rentCost - expenses. */
  margin: number
  /** Accrual result: billed - rent - expenses. */
  operatingProfit: number
  /** Cash result: collected - rent - expenses. */
  cashFlow: number
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected'
export type ExpenseCategory = 'utilities' | 'repairs' | 'services' | 'equipment' | 'other'

/** What a stranger sees after scanning the QR code at an address. */
export interface PublicProperty {
  property_id: string
  property_name: string
  full_address: string
}

export interface HousingApplication {
  id: string
  property_id: string
  property_name: string | null
  first_name: string
  last_name: string
  phone: string
  workplace: string | null
  passport_series: string | null
  passport_number: string
  ukraine_registration: string
  requested_move_in: string
  status: ApplicationStatus
  rejection_reason: string | null
  created_at: string
}

export interface Expense {
  id: string
  period_id: string
  property_id: string
  property_name: string | null
  category: ExpenseCategory
  amount: number
  description: string | null
  incurred_on: string
}

export interface ResidentPrivateProfile {
  person_id: string
  first_name: string
  last_name: string
  passport_series: string | null
  passport_number: string | null
  ukraine_registration: string | null
}

export interface Agency {
  id: string
  name: string
  company_id: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  note: string | null
  status: 'active' | 'closed'
}

export interface AgencyAllocation {
  id: string
  period_id: string
  agency_id: string
  agency_name: string
  property_id: string
  property_name: string
  full_address: string
  room_name: string | null
  bed_name: string | null
  people_count: number
  pricing_model: AgencyPricingModel
  unit_price: number
  start_date: string
  end_date: string
  billable_days: number
  days_in_month: number
  total_amount: number
  note: string | null
  room_id: string | null
  bed_id: string | null
}

export interface AgencyFinancialSummary {
  period_id: string
  agency_id: string
  agency_name: string
  billed: number
  paid: number
  debt: number
  payment_status: AgencyPaymentStatus
}

export interface AgencyPayment {
  id: string
  period_id: string
  agency_id: string
  amount: number
  paid_on: string
  method: 'bank' | 'cash' | 'salary' | 'other'
  note: string | null
}

export interface DepositTransaction {
  id: string
  stay_id: string
  period_id: string
  kind: LedgerEntryKind
  amount: number
  occurred_on: string
  note: string | null
}

export interface AppProfile {
  id: string
  display_name: string | null
  role: AppRole
}

export interface AuditEntry {
  id: number
  table_name: string
  record_id: string | null
  operation: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_by: string | null
  changed_at: string
}

export interface EntityAttachment {
  id: string
  entity_type: 'person' | 'stay' | 'property' | 'agency' | 'expense' | 'agency_payment'
  entity_id: string
  file_name: string
  storage_path: string
  mime_type: string
  size_bytes: number
  created_at: string
}
