import type {
  AppProfile, AuditEntry, AuthUser, EntityAttachment, HousingApplication, PublicProperty, ResidentPrivateProfile, Workspace,
} from '../types'
import type {
  ApprovalInput, ExpenseInput, PropertyInput, PublicApplicationInput,
  ResidentInput, StayEditInput, AgencyInput, AgencyAllocationInput,
  AgencyPaymentInput, BedInput, DepositTransactionInput, RoomInput,
} from './schemas'
import { isSupabaseConfigured } from './supabase'
import { supabaseBackend } from './api'

/**
 * Everything the interface needs from the server, in one contract.
 *
 * The application never touches the Supabase client directly, so the whole app
 * can be exercised in tests against an in-memory double
 * (`src/test/fakeBackend.ts`) without a database.
 */
export interface Backend {
  getUser(): Promise<AuthUser | null>
  signIn(email: string, password: string): Promise<AuthUser>
  signOut(): Promise<void>
  /** Returns an unsubscribe function. */
  subscribe(onChange: (user: AuthUser | null) => void): () => void

  loadWorkspace(year: number, month: number): Promise<Workspace>
  createProperty(input: PropertyInput): Promise<void>
  updateProperty(propertyId: string, input: PropertyInput): Promise<void>
  createResident(periodId: string, input: ResidentInput): Promise<void>
  updateStay(stayId: string, input: StayEditInput): Promise<void>
  recordPayment(stayId: string, amount: number): Promise<void>
  reversePayment(paymentId: string, reason?: string): Promise<void>
  copyPreviousMonth(year: number, month: number, excludeDeparted: boolean): Promise<number>
  getPrivateProfile(personId: string): Promise<ResidentPrivateProfile>
  deleteStay(stayId: string): Promise<void>
  createRoom(input: RoomInput): Promise<void>
  createBed(input: BedInput): Promise<void>
  recordDeposit(stayId: string, input: DepositTransactionInput): Promise<void>

  // Self-service onboarding: a QR code at the door leads to a public form,
  // and staff turn the resulting application into a stay.
  /** Reachable without a session — this is what the QR code opens. */
  getPublicProperty(token: string): Promise<PublicProperty>
  submitApplication(token: string, input: PublicApplicationInput): Promise<void>
  listApplications(): Promise<HousingApplication[]>
  approveApplication(applicationId: string, periodId: string, input: ApprovalInput): Promise<void>
  rejectApplication(applicationId: string, reason: string): Promise<void>
  /** Invalidates the old QR code and returns the new token. */
  rotatePropertyLink(propertyId: string): Promise<string>

  createExpense(periodId: string, input: ExpenseInput): Promise<void>
  deleteExpense(expenseId: string): Promise<void>
  createAgency(input: AgencyInput): Promise<void>
  createAgencyAllocation(periodId: string, input: AgencyAllocationInput): Promise<void>
  deleteAgencyAllocation(allocationId: string): Promise<void>
  recordAgencyPayment(periodId: string, input: AgencyPaymentInput): Promise<void>
  copyAgencyPreviousMonth(year: number, month: number): Promise<number>

  listProfiles(): Promise<AppProfile[]>
  updateUserRole(userId: string, role: AppProfile['role']): Promise<void>
  listAudit(limit?: number): Promise<AuditEntry[]>
  purgeExpiredApplications(): Promise<number>
  listAttachments(entityType: EntityAttachment['entity_type'], entityId: string): Promise<EntityAttachment[]>
  createAttachmentMetadata(input: Omit<EntityAttachment, 'id' | 'created_at'>): Promise<void>
}

export const backend: Backend = supabaseBackend

/** False until `initSupabase()` has found a usable URL and key. */
export const configured = isSupabaseConfigured
