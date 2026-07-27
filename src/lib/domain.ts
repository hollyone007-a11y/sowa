import type { Debtor, PaymentMethod, PaymentStatus, Property, Stay } from '../types'

/** Residents marked "не взимать" are tracked for occupancy but never billed. */
export const isBillable = (method: PaymentMethod) => method !== 'free'

export const expectedFrom = (stay: Pick<Stay, 'price' | 'payment_method'>) =>
  isBillable(stay.payment_method) ? stay.price : 0

export const remainingOf = (stay: Pick<Stay, 'price' | 'paid_amount' | 'payment_method'>) =>
  Math.max(0, expectedFrom(stay) - stay.paid_amount)

export function statusFor(price: number, paid: number, method: PaymentMethod): PaymentStatus {
  if (!isBillable(method)) return 'tracking'
  if (paid <= 0) return 'unpaid'
  return paid >= price ? 'paid' : 'partial'
}

export function applyPayment(stay: Stay, amount: number): Stay {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Сумма должна быть больше нуля')
  if (!isBillable(stay.payment_method)) throw new Error('Для этого жильца оплата не начисляется')
  const paid_amount = Math.round((stay.paid_amount + amount) * 100) / 100
  if (paid_amount > stay.price) throw new Error('Оплата превышает стоимость')
  return { ...stay, paid_amount, payment_status: statusFor(stay.price, paid_amount, stay.payment_method) }
}

export function prepareMonthCopy(stays: Stay[], targetPeriodId: string, excludeDeparted = true): Stay[] {
  return stays
    .filter((stay) => !excludeDeparted || !stay.move_out)
    .map((stay) => ({
      ...stay,
      id: `copy-${stay.id}`,
      period_id: targetPeriodId,
      paid_amount: 0,
      move_out: null,
      payment_status: statusFor(stay.price, 0, stay.payment_method),
    }))
}

/**
 * Occupancy and money per address, derived from the stays of one period.
 * The server ships the same numbers; recomputing keeps optimistic updates honest.
 */
export function summarizeProperties(properties: Property[], stays: Stay[]): Property[] {
  return properties.map((property) => {
    const own = stays.filter((stay) => stay.property_id === property.id)
    return {
      ...property,
      occupied: own.filter((stay) => !stay.move_out).length,
      collected: own.reduce((sum, stay) => sum + stay.paid_amount, 0),
      debt: own.reduce((sum, stay) => sum + remainingOf(stay), 0),
    }
  })
}

export const isOverfull = (property: Property) => property.occupied > property.capacity

/** Free places across active addresses, never negative. */
export function freePlaces(properties: Property[]): number {
  return properties
    .filter((property) => property.status === 'active')
    .reduce((sum, property) => sum + Math.max(0, property.capacity - property.occupied), 0)
}

/** Debtors of the *current* period, biggest first. */
export function currentDebtors(stays: Stay[]): Debtor[] {
  return stays
    .map((stay) => ({
      person_id: stay.person_id,
      full_name: stay.full_name,
      amount: remainingOf(stay),
      months: 1,
    }))
    .filter((debtor) => debtor.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

/** Merge current-period debt into the carried-over debt list. */
export function mergeDebtors(historic: Debtor[], current: Debtor[]): Debtor[] {
  const merged = new Map<string, Debtor>()
  for (const debtor of [...historic, ...current]) {
    const existing = merged.get(debtor.person_id)
    if (existing) {
      existing.amount += debtor.amount
      existing.months += debtor.months
    } else {
      merged.set(debtor.person_id, { ...debtor })
    }
  }
  return [...merged.values()].sort((a, b) => b.amount - a.amount)
}
