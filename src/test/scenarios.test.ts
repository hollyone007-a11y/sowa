import { beforeEach, describe, expect, it } from 'vitest'
import { propertySchema, residentSchema, stayEditSchema } from '../lib/schemas'
import { applyPayment, prepareMonthCopy, remainingOf, summarizeProperties } from '../lib/domain'
import { calculateMetrics } from '../lib/metrics'
import { can } from '../lib/permissions'
import { staysToCsv } from '../lib/csv'
import { currentMonth, shiftMonth } from '../lib/format'
import { createFakeBackend, fakeProperties, fakeUsers, type FakeBackend } from './fakeBackend'
import type { Property, Stay } from '../types'

const stay: Stay = {
  id: 'stay-1', period_id: 'period-1', person_id: 'person-1', property_id: 'property-1',
  room_id: null, bed_id: null, full_name: 'Іван Коваль', phone: null, workplace: null,
  person_kind: 'employee', property_name: 'Praha 4', room_name: 'Комната 3', bed_name: 'Место B',
  move_in: '2026-08-01', move_out: null, price: 6500, paid_amount: 0,
  payment_method: 'salary', payment_status: 'unpaid', deposit_status: 'none', comment: null,
}

const property: Property = {
  id: 'property-1', name: 'Praha 4', full_address: 'Komořanská 42', contact_name: null,
  phone: null, email: null, capacity: 4, monthly_cost: 20000, status: 'active',
  public_token: null, occupied: 0, debt: 0, collected: 0,
}

describe('валидация форм', () => {
  it('принимает корректный адрес и отклоняет пустой', () => {
    expect(propertySchema.safeParse({
      name: 'Praha 4', full_address: 'Komořanská 42, Praha',
      contact_name: '', phone: '', email: '', capacity: '14', monthly_cost: '86000',
    }).success).toBe(true)

    expect(propertySchema.safeParse({
      name: 'P', full_address: '', contact_name: '', phone: '', email: 'не-почта',
      capacity: '0', monthly_cost: '-5',
    }).success).toBe(false)
  })

  it('собирает жильца вместе с анкетой из строк формы', () => {
    const parsed = residentSchema.safeParse({
      first_name: 'Іван', last_name: 'Коваль', phone: '', workplace: 'Stavmont',
      person_kind: 'employee', property_id: 'property-1', room_name: 'Комната 3', bed_name: 'Место B',
      move_in: '2026-08-01', price: '6500', payment_method: 'salary', deposit_status: 'paid',
      passport_series: 'КС', passport_number: '123456', ukraine_registration: 'м. Львів', comment: '',
    })
    expect(parsed.success).toBe(true)
    // FormData delivers strings; the schema is what turns them into numbers.
    expect(parsed.success && parsed.data.price).toBe(6500)
  })

  it('разрешает выселение через ту же форму, что и переселение', () => {
    const parsed = stayEditSchema.safeParse({
      property_id: '', room_name: '', bed_name: '', price: '0',
      payment_method: 'free', deposit_status: 'returned', move_out: '2026-08-22', comment: '',
    })
    expect(parsed.success && parsed.data.move_out).toBe('2026-08-22')
  })
})

describe('расчёт оплат и долгов', () => {
  it('переводит запись из частичной оплаты в полную', () => {
    const partial = applyPayment(stay, 3000)
    expect(partial.payment_status).toBe('partial')
    expect(applyPayment(partial, 3500).payment_status).toBe('paid')
  })

  it('не даёт переплатить и не начисляет на бесплатное проживание', () => {
    expect(() => applyPayment(stay, 9000)).toThrow(/превышает/)
    expect(() => applyPayment({ ...stay, payment_method: 'free' }, 100)).toThrow(/не начисляется/)
  })

  it('не считает долгом проживание без начисления', () => {
    expect(remainingOf({ ...stay, payment_method: 'free' })).toBe(0)
    expect(remainingOf(stay)).toBe(6500)
  })

  it('разделяет долг текущего месяца и долг прошлых месяцев', () => {
    const metrics = calculateMetrics(
      summarizeProperties([property], [stay]),
      [stay],
      [{ person_id: 'person-9', full_name: 'Старый должник', amount: 4000, months: 2 }],
    )
    expect(metrics.monthDebt).toBe(6500)
    expect(metrics.historicDebt).toBe(4000)
    expect(metrics.occupied).toBe(1)
    expect(metrics.free).toBe(3)
    expect(metrics.margin).toBe(-20000)
  })

  it('переносит месяц без съехавших и с обнулённой оплатой', () => {
    const departed = { ...stay, id: 'stay-2', move_out: '2026-08-20' }
    const copied = prepareMonthCopy([stay, departed], 'period-2')
    expect(copied).toHaveLength(1)
    expect(copied[0]).toMatchObject({ period_id: 'period-2', paid_amount: 0, payment_status: 'unpaid' })
  })
})

describe('права ролей', () => {
  it('защищает паспортные данные и опасные действия', () => {
    expect(can('admin', 'delete')).toBe(true)
    expect(can('manager', 'delete')).toBe(false)
    expect(can('manager', 'view_private_profiles')).toBe(true)
    expect(can('accountant', 'view_private_profiles')).toBe(false)
    expect(can('accountant', 'export')).toBe(true)
    expect(can('viewer', 'manage_payments')).toBe(false)
    expect(can('viewer', 'view_finance')).toBe(false)
  })
})

describe('экспорт', () => {
  it('выгружает CSV с разделителем ; и экранированием', () => {
    const csv = staysToCsv([{ ...stay, comment: 'Долг; уточнить' }])
    const [header, row] = csv.split('\r\n')
    expect(header.startsWith('Жилец;Телефон')).toBe(true)
    expect(row).toContain('"Долг; уточнить"')
    expect(row).toContain('6500')
  })
})

describe('рабочие сценарии через контракт Backend', () => {
  let backend: FakeBackend

  beforeEach(() => {
    backend = createFakeBackend()
  })

  it('пускает по паролю и отклоняет неверный', async () => {
    await expect(backend.signIn(fakeUsers[0].email, 'wrong')).rejects.toThrow()
    const user = await backend.signIn(fakeUsers[0].email, 'secret')
    expect(user.role).toBe('admin')
    expect(await backend.getUser()).toMatchObject({ id: user.id })
  })

  it('отдаёт месяц с адресами, жильцами и старыми долгами', async () => {
    const now = currentMonth()
    const workspace = await backend.loadWorkspace(now.year, now.month)
    expect(workspace.properties.length).toBeGreaterThan(0)
    expect(workspace.stays.length).toBeGreaterThan(0)
    expect(workspace.debtors.length).toBeGreaterThan(0)

    const occupied = workspace.properties.reduce((sum, item) => sum + item.occupied, 0)
    expect(occupied).toBe(workspace.stays.filter((item) => item.property_id && !item.move_out).length)
  })

  it('записывает оплату и закрывает остаток', async () => {
    const now = currentMonth()
    const before = await backend.loadWorkspace(now.year, now.month)
    const target = before.stays.find((item) => remainingOf(item) > 0)
    expect(target).toBeDefined()

    await backend.recordPayment(target!.id, remainingOf(target!))
    const after = await backend.loadWorkspace(now.year, now.month)
    const updated = after.stays.find((item) => item.id === target!.id)
    expect(updated?.payment_status).toBe('paid')
    expect(remainingOf(updated!)).toBe(0)
  })

  it('открывает адрес по QR-токену и отклоняет чужой', async () => {
    const found = await backend.getPublicProperty(fakeProperties[0].public_token)
    expect(found.property_name).toBe(fakeProperties[0].name)
    await expect(backend.getPublicProperty('нет-такого')).rejects.toThrow(/недействительна/)
  })

  it('принимает заявку по QR, ловит бота и не берёт дубликат', async () => {
    const token = fakeProperties[2].public_token
    const application = {
      first_name: 'Оксана', last_name: 'Литвин', phone: '+420 777 000 111',
      workplace: '', passport_series: 'КС', passport_number: '909090',
      ukraine_registration: 'Україна, м. Київ', requested_move_in: '2026-09-01',
      consent: 'on' as const, website: '',
    }
    await backend.submitApplication(token, application)
    const list = await backend.listApplications()
    expect(list.find((item) => item.passport_number === '909090')?.status).toBe('pending')

    await expect(backend.submitApplication(token, application)).rejects.toThrow(/уже отправлена/)
    await expect(
      backend.submitApplication(token, { ...application, passport_number: '11', website: 'spam' }),
    ).rejects.toThrow()
  })

  it('превращает одобренную заявку в жильца текущего месяца', async () => {
    const now = currentMonth()
    const workspace = await backend.loadWorkspace(now.year, now.month)
    const pending = (await backend.listApplications()).find((item) => item.status === 'pending')
    expect(pending).toBeDefined()

    await backend.approveApplication(pending!.id, workspace.period.id, {
      room_name: 'Комната 5', bed_name: 'Место A', price: 6000, payment_method: 'cash',
    })

    const after = await backend.loadWorkspace(now.year, now.month)
    const moved = after.stays.find((item) => item.full_name === `${pending!.first_name} ${pending!.last_name}`)
    expect(moved).toMatchObject({ room_name: 'Комната 5', price: 6000, payment_status: 'unpaid' })
    expect((await backend.listApplications()).find((item) => item.id === pending!.id)?.status).toBe('approved')
  })

  it('обновление QR-кода выводит старую ссылку из строя', async () => {
    const target = fakeProperties[1]
    const next = await backend.rotatePropertyLink(target.id)
    expect(next).not.toBe(target.public_token)
    await expect(backend.getPublicProperty(target.public_token)).rejects.toThrow()
    await expect(backend.getPublicProperty(next)).resolves.toMatchObject({ property_id: target.id })
  })

  it('расходы уменьшают разницу по объекту', async () => {
    const now = currentMonth()
    const workspace = await backend.loadWorkspace(now.year, now.month)
    const before = calculateMetrics(workspace.properties, workspace.stays, [], workspace.expenses)

    await backend.createExpense(workspace.period.id, {
      property_id: fakeProperties[0].id, category: 'repairs',
      amount: 5000, incurred_on: '2026-07-10', description: 'Тест',
    })

    const after = await backend.loadWorkspace(now.year, now.month)
    const metrics = calculateMetrics(after.properties, after.stays, [], after.expenses)
    expect(metrics.expenses).toBe(before.expenses + 5000)
    expect(metrics.margin).toBe(before.margin - 5000)
  })

  it('переносит жильцов в следующий месяц с нулевыми оплатами', async () => {
    const now = currentMonth()
    const next = shiftMonth(now.year, now.month, 1)
    const copied = await backend.copyPreviousMonth(next.year, next.month, true)
    expect(copied).toBeGreaterThan(0)

    const workspace = await backend.loadWorkspace(next.year, next.month)
    expect(workspace.stays).toHaveLength(copied)
    expect(workspace.stays.every((item) => item.paid_amount === 0)).toBe(true)
    // Повторный перенос ничего не дублирует.
    expect(await backend.copyPreviousMonth(next.year, next.month, true)).toBe(0)
  })
})
