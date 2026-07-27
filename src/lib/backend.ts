import type {
  AuthUser, HousingApplication, PublicProperty, ResidentPrivateProfile, Workspace,
} from '../types'
import type {
  ApprovalInput, ExpenseInput, PropertyInput, PublicApplicationInput,
  ResidentInput, StayEditInput,
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
  copyPreviousMonth(year: number, month: number, excludeDeparted: boolean): Promise<number>
  getPrivateProfile(personId: string): Promise<ResidentPrivateProfile>
  deleteStay(stayId: string): Promise<void>

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
}

export const backend: Backend = supabaseBackend

/** False until `initSupabase()` has found a usable URL and key. */
export const configured = isSupabaseConfigured
