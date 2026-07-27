import { z } from 'zod'

const optionalText = z.string().trim().optional().default('')

export const propertySchema = z.object({
  name: z.string().trim().min(2, 'Введите название'),
  full_address: z.string().trim().min(5, 'Введите полный адрес'),
  contact_name: optionalText,
  phone: optionalText,
  email: z.string().trim().email('Неверный e-mail').or(z.literal('')).default(''),
  capacity: z.coerce.number().int('Целое число').min(1, 'Минимум 1 место').max(500),
  monthly_cost: z.coerce.number().min(0, 'Не может быть отрицательной'),
})

export const residentSchema = z.object({
  first_name: z.string().trim().min(2, 'Введите имя'),
  last_name: z.string().trim().min(2, 'Введите фамилию'),
  phone: optionalText,
  workplace: optionalText,
  person_kind: z.enum(['employee', 'external']),
  property_id: optionalText,
  room_name: optionalText,
  bed_name: optionalText,
  move_in: z.string().min(1, 'Укажите дату заезда'),
  price: z.coerce.number().min(0, 'Не может быть отрицательной'),
  payment_method: z.enum(['cash', 'salary', 'free']),
  deposit_status: z.enum(['none', 'paid', 'returned', 'applied']).default('none'),
  passport_series: z.string().trim().max(16, 'Слишком длинно').optional().default(''),
  passport_number: z.string().trim().max(32, 'Слишком длинно').optional().default(''),
  ukraine_registration: z.string().trim().max(500, 'Слишком длинно').optional().default(''),
  comment: z.string().trim().max(1000, 'Слишком длинно').optional().default(''),
})

/** Editing an existing stay: identity stays put, placement and money can move. */
export const stayEditSchema = z.object({
  property_id: optionalText,
  room_name: optionalText,
  bed_name: optionalText,
  price: z.coerce.number().min(0, 'Не может быть отрицательной'),
  payment_method: z.enum(['cash', 'salary', 'free']),
  deposit_status: z.enum(['none', 'paid', 'returned', 'applied']),
  move_out: optionalText,
  comment: z.string().trim().max(1000, 'Слишком длинно').optional().default(''),
})

/**
 * Filled in by a stranger who scanned the QR code at an address, so every
 * field is validated again in the database. `website` is a honeypot: a real
 * person never sees it, a bot fills it in and the submission is rejected.
 */
export const publicApplicationSchema = z.object({
  first_name: z.string().trim().min(2, 'Введите имя').max(100),
  last_name: z.string().trim().min(2, 'Введите фамилию').max(100),
  phone: z.string().trim().min(7, 'Введите номер телефона').max(32),
  workplace: optionalText,
  passport_series: z.string().trim().max(16, 'Слишком длинно').optional().default(''),
  passport_number: z.string().trim().min(3, 'Введите номер паспорта').max(32),
  ukraine_registration: z.string().trim().min(3, 'Введите адрес прописки').max(500),
  requested_move_in: z.string().min(1, 'Укажите желаемую дату заезда'),
  consent: z.literal('on', { errorMap: () => ({ message: 'Без согласия заявку принять нельзя' }) }),
  website: z.string().max(0).optional().default(''),
})

/** Turning an accepted application into a real stay. */
export const approvalSchema = z.object({
  room_name: optionalText,
  bed_name: optionalText,
  price: z.coerce.number().min(0, 'Не может быть отрицательной'),
  payment_method: z.enum(['cash', 'salary', 'free']),
})

export const expenseSchema = z.object({
  property_id: z.string().min(1, 'Выберите адрес'),
  category: z.enum(['utilities', 'repairs', 'services', 'equipment', 'other']),
  amount: z.coerce.number().positive('Сумма должна быть больше нуля'),
  incurred_on: z.string().min(1, 'Укажите дату'),
  description: z.string().trim().max(500, 'Слишком длинно').optional().default(''),
})

export type PropertyInput = z.infer<typeof propertySchema>
export type ResidentInput = z.infer<typeof residentSchema>
export type StayEditInput = z.infer<typeof stayEditSchema>
export type PublicApplicationInput = z.infer<typeof publicApplicationSchema>
export type ApprovalInput = z.infer<typeof approvalSchema>
export type ExpenseInput = z.infer<typeof expenseSchema>
