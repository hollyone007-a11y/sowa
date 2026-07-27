import type { DashboardMetrics, Debtor, Expense, Property, Stay } from '../types'
import { expectedFrom, freePlaces, remainingOf } from './domain'

export function calculateMetrics(
  properties: Property[],
  stays: Stay[],
  historicDebtors: Debtor[] = [],
  expenses: Expense[] = [],
): DashboardMetrics {
  const active = properties.filter((property) => property.status === 'active')
  // Only placed residents occupy a place, so "occupied + free" always equals
  // capacity; people still waiting for an address show up under their own filter.
  const living = stays.filter((stay) => !stay.move_out && stay.property_id)
  const collected = stays.reduce((sum, stay) => sum + stay.paid_amount, 0)
  const rentCost = active.reduce((sum, property) => sum + property.monthly_cost, 0)
  const extraCost = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  return {
    occupied: living.length,
    capacity: active.reduce((sum, property) => sum + property.capacity, 0),
    free: freePlaces(properties),
    expected: stays.reduce((sum, stay) => sum + expectedFrom(stay), 0),
    collected,
    monthDebt: stays.reduce((sum, stay) => sum + remainingOf(stay), 0),
    historicDebt: historicDebtors.reduce((sum, debtor) => sum + debtor.amount, 0),
    cash: stays.filter((stay) => stay.payment_method === 'cash').reduce((sum, stay) => sum + stay.paid_amount, 0),
    salary: stays.filter((stay) => stay.payment_method === 'salary').reduce((sum, stay) => sum + stay.paid_amount, 0),
    rentCost,
    expenses: extraCost,
    margin: collected - rentCost - extraCost,
  }
}

/** Expenses booked against one address in the loaded month. */
export const expensesFor = (expenses: Expense[], propertyId: string) =>
  expenses.filter((expense) => expense.property_id === propertyId).reduce((sum, expense) => sum + expense.amount, 0)
