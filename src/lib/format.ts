import type { DepositStatus, ExpenseCategory, PaymentMethod, PaymentStatus } from '../types'

const czk = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
})

export const money = (value: number) => czk.format(Math.round(value))

export const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export const monthLabel = (year: number, month: number) => `${monthNames[month - 1]} ${year}`

/** Shift a {year, month} pair by whole months, keeping month 1-based. */
export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}

export const currentMonth = () => {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Months the period picker offers: a year back and half a year forward. */
export function selectableMonths(anchor = currentMonth()) {
  return Array.from({ length: 19 }, (_, index) => shiftMonth(anchor.year, anchor.month, index - 12))
}

export const firstDayOf = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-01`

export const today = () => new Date().toISOString().slice(0, 10)

export function formatDate(value: string | null) {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

export function initials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}

export const statusText: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачено',
  partial: 'Частично',
  paid: 'Оплачено',
  tracking: 'Только учёт',
}

export const methodText: Record<PaymentMethod, string> = {
  cash: 'Наличные',
  salary: 'Из зарплаты',
  free: 'Не взимать',
}

export const depositText: Record<DepositStatus, string> = {
  none: 'Нет залога',
  paid: 'Залог внесён',
  returned: 'Залог возвращён',
  applied: 'Залог зачтён',
}

export const categoryText: Record<ExpenseCategory, string> = {
  utilities: 'Коммунальные',
  repairs: 'Ремонт',
  services: 'Услуги',
  equipment: 'Оборудование',
  other: 'Прочее',
}

/** Public URL a QR code points at, correct under any deploy base path. */
export const joinUrl = (token: string) =>
  `${window.location.origin}${import.meta.env.BASE_URL}join/${token}`
