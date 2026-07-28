import type { AgencyAllocation, Stay } from '../types'
import { remainingOf } from './domain'
import { methodText, monthLabel, statusText } from './format'

const HEADERS = [
  'Жилец', 'Телефон', 'Тип', 'Место работы', 'Адрес', 'Комната', 'Место',
  'Заезд', 'Выезд', 'Стоимость', 'Оплачено', 'Остаток', 'Способ', 'Статус', 'Комментарий',
]

/** Excel refuses to split on ";" unless told, and Czech Excel expects ";". */
const cell = (value: string | number | null) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function staysToCsv(stays: Stay[]): string {
  const rows = stays.map((stay) => [
    stay.full_name,
    stay.phone,
    stay.person_kind === 'external' ? 'Внешний' : 'Сотрудник',
    stay.workplace,
    stay.property_name,
    stay.room_name,
    stay.bed_name,
    stay.move_in,
    stay.move_out,
    stay.price,
    stay.paid_amount,
    remainingOf(stay),
    methodText[stay.payment_method],
    statusText[stay.payment_status],
    stay.comment,
  ])
  return [HEADERS, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')
}

export function downloadStaysCsv(stays: Stay[], year: number, month: number) {
  // The BOM is what makes Excel read the Cyrillic correctly.
  const blob = new Blob(['﻿', staysToCsv(stays)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sowa-agensy-${year}-${String(month).padStart(2, '0')}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return monthLabel(year, month)
}

export function agencyStatementToCsv(rows: AgencyAllocation[]) {
  const headers = ['Č.', 'Počet osob', 'Adresa', 'Pokoj / místo', 'Tarif', 'Od', 'Do', 'Celkem Kč']
  const body = rows.map((row, index) => [index + 1, row.people_count, row.full_address, [row.room_name, row.bed_name].filter(Boolean).join(' · ') || 'Celá adresa', row.pricing_model === 'per_person' ? `${row.unit_price}/os` : row.unit_price, row.start_date, row.end_date, row.total_amount])
  const total = rows.reduce((sum, row) => sum + Number(row.total_amount), 0)
  return [headers, ...body, ['', '', 'Celkem', '', '', '', '', total]].map((row) => row.map(cell).join(';')).join('\r\n')
}

export function downloadAgencyStatementCsv(rows: AgencyAllocation[], agencyName: string, monthTitle: string) {
  const blob = new Blob(['﻿', agencyStatementToCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = agencyName.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '')
  link.href = url
  link.download = `sowa-${safeName || 'agentury'}-${monthTitle.replace(/\s+/g, '-').toLowerCase()}.csv`
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url)
}
