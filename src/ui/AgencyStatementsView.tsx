import { useMemo, useState } from 'react'
import { Building2, Copy, Download, FileText, Pencil, Plus, Printer, Trash2, UsersRound, WalletCards } from 'lucide-react'
import { agencyAllocationSchema, agencyPaymentSchema, agencySchema } from '../lib/schemas'
import { downloadAgencyStatementCsv } from '../lib/csv'
import { formatDate, money } from '../lib/format'
import { can } from '../lib/permissions'
import { useZodForm } from './useZodForm'
import type { Agency, AgencyAllocation, AgencyFinancialSummary, AgencyPayment, AppRole, InventorySlot, Property, Stay } from '../types'
import type { AgencyAllocationInput, AgencyInput, AgencyPaymentInput } from '../lib/schemas'

function ErrorText({ value }: { value?: string }) {
  return value ? <small className="field-error">{value}</small> : null
}

export function AgencyStatementsView({
  agencies, allocations, financials, payments, inventory, properties, residents, role, periodId, monthTitle, defaultStart, defaultEnd,
  periodClosed, onCreateAgency, onUpdateAgency, onCreateAllocation, onUpdateAllocation, onDeleteAllocation, onRecordPayment, onCopyPrevious,
}: {
  agencies: Agency[]
  allocations: AgencyAllocation[]
  financials: AgencyFinancialSummary[]
  payments: AgencyPayment[]
  inventory: InventorySlot[]
  properties: Property[]
  residents: Stay[]
  role: AppRole
  periodId: string
  monthTitle: string
  defaultStart: string
  defaultEnd: string
  periodClosed: boolean
  onCreateAgency: (input: AgencyInput) => Promise<void>
  onUpdateAgency: (agencyId: string, input: AgencyInput) => Promise<void>
  onCreateAllocation: (periodId: string, input: AgencyAllocationInput) => Promise<void>
  onUpdateAllocation: (allocationId: string, input: AgencyAllocationInput) => Promise<void>
  onDeleteAllocation: (allocation: AgencyAllocation) => void
  onRecordPayment: (periodId: string, input: AgencyPaymentInput) => Promise<void>
  onCopyPrevious: () => Promise<void>
}) {
  const [agencyId, setAgencyId] = useState(agencies[0]?.id ?? 'all')
  const [showAgencyForm, setShowAgencyForm] = useState(false)
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null)
  const [showAllocationForm, setShowAllocationForm] = useState(false)
  const [editingAllocation, setEditingAllocation] = useState<AgencyAllocation | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [allocationPropertyId, setAllocationPropertyId] = useState('')
  const [allocationRoomId, setAllocationRoomId] = useState('')
  const agencyForm = useZodForm(agencySchema)
  const allocationForm = useZodForm(agencyAllocationSchema)
  const paymentForm = useZodForm(agencyPaymentSchema)

  const rows = useMemo(
    () => allocations.filter((item) => agencyId === 'all' || item.agency_id === agencyId),
    [allocations, agencyId],
  )
  const selectedAgency = agencies.find((item) => item.id === agencyId)
  const selectedFinancial = financials.find((item) => item.agency_id === agencyId)
  const selectedPayments = payments.filter((item) => item.agency_id === agencyId)
  const total = rows.reduce((sum, item) => sum + Number(item.total_amount), 0)
  const people = rows.reduce((sum, item) => sum + item.people_count, 0)

  const print = () => window.print()
  const download = () => downloadAgencyStatementCsv(rows, selectedAgency?.name ?? 'all-agencies', monthTitle)

  return <div className="agency-page">
    <section className="agency-toolbar no-print">
      <div>
        <span className="eyebrow">Раздельный учёт</span>
        <h1>Ведомости агентур</h1>
        <p>Кто арендует адрес, комнату или место и сколько должен за выбранный месяц.</p>
      </div>
      <div className="agency-toolbar-actions">
        <select value={agencyId} onChange={(event) => setAgencyId(event.target.value)} aria-label="Выбор агентуры">
          <option value="all">Все агентуры</option>
          {agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
        </select>
        {can(role, 'manage_properties') && !periodClosed && <>
          <button className="button ghost" type="button" onClick={() => { setEditingAgency(null); setShowAgencyForm((value) => !value) }}><Building2 size={17} /> Агентура</button>
          {selectedAgency && <button className="button ghost" type="button" onClick={() => { setEditingAgency(selectedAgency); setShowAgencyForm(true) }}><Pencil size={16}/> Изменить</button>}
          <button className="button ghost" type="button" onClick={() => void onCopyPrevious()}><Copy size={17} /> Прошлый месяц</button>
          <button className="button ghost" type="button" onClick={() => setShowPaymentForm((value) => !value)} disabled={agencyId === 'all'}><WalletCards size={17} /> Оплата</button>
          <button className="button primary" type="button" onClick={() => setShowAllocationForm((value) => !value)} disabled={!agencies.length || !properties.length}><Plus size={17} /> Строка аренды</button>
        </>}
      </div>
    </section>

    {showAgencyForm && <form className="panel agency-editor no-print" onSubmit={agencyForm.submit(async (input) => { if(editingAgency) await onUpdateAgency(editingAgency.id,input); else await onCreateAgency(input); setEditingAgency(null); setShowAgencyForm(false) })}>
      <header className="panel-head"><h2>{editingAgency ? 'Изменить агентуру' : 'Новая агентура'}</h2></header>
      <div className="form-grid three">
        <label>Название<input name="name" defaultValue={editingAgency?.name ?? ''} placeholder="Agentura Alfa" /><ErrorText value={agencyForm.errors.name} /></label>
        <label>IČO / код компании<input name="company_id" defaultValue={editingAgency?.company_id ?? ''} placeholder="12345678" /></label>
        <label>Контакт<input name="contact_name" defaultValue={editingAgency?.contact_name ?? ''} placeholder="Имя менеджера" /></label>
        <label>Телефон<input name="phone" inputMode="tel" defaultValue={editingAgency?.phone ?? ''} /></label>
        <label>E-mail<input name="email" type="email" defaultValue={editingAgency?.email ?? ''} /></label>
        <label>Комментарий<input name="note" defaultValue={editingAgency?.note ?? ''} /></label>
      </div>
      {agencyForm.formError && <p className="form-error">{agencyForm.formError}</p>}
      <button className="button primary" disabled={agencyForm.busy}>Создать агентуру</button>
    </form>}

    {showAllocationForm && <form className="panel agency-editor no-print" onSubmit={allocationForm.submit(async (input) => { if(editingAllocation) await onUpdateAllocation(editingAllocation.id,input); else await onCreateAllocation(periodId,input); setEditingAllocation(null); setShowAllocationForm(false) })}>
      <header className="panel-head"><div><h2>{editingAllocation ? 'Изменить строку ведомости' : 'Новая строка ведомости'}</h2><p>Если комната и место пустые, агентуре закрепляется весь адрес.</p></div></header>
      <div className="form-grid four">
        <label>Агентура<select name="agency_id" defaultValue={editingAllocation?.agency_id ?? (agencyId === 'all' ? agencies[0]?.id : agencyId)}>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select><ErrorText value={allocationForm.errors.agency_id} /></label>
        <label>Адрес<select name="property_id" value={allocationPropertyId} onChange={event => { setAllocationPropertyId(event.target.value); setAllocationRoomId('') }}><option value="">Выберите адрес</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><ErrorText value={allocationForm.errors.property_id} /></label>
        <label>Комната<select name="room_id" value={allocationRoomId} onChange={event => setAllocationRoomId(event.target.value)}><option value="">Весь адрес</option>{[...new Map(inventory.filter(item => item.property_id === allocationPropertyId && item.room_id).map(item => [item.room_id!, item])).values()].map(item => <option key={item.room_id!} value={item.room_id!}>{item.room_name}</option>)}</select><input type="hidden" name="room_name" value="" /></label>
        <label>Место<select name="bed_id" defaultValue=""><option value="">Вся комната</option>{inventory.filter(item => item.room_id === allocationRoomId && item.bed_id).map(item => <option key={item.bed_id!} value={item.bed_id!}>{item.bed_name}</option>)}</select><input type="hidden" name="bed_name" value="" /></label>
        <label>Количество людей<input name="people_count" type="number" min="1" defaultValue={editingAllocation?.people_count ?? 1} /><ErrorText value={allocationForm.errors.people_count} /></label>
        <label>Расчёт<select name="pricing_model" defaultValue={editingAllocation?.pricing_model ?? 'per_person'}><option value="per_person">За человека</option><option value="fixed">Фиксированная сумма</option></select></label>
        <label>Цена, Kč<input name="unit_price" type="number" min="0" step="1" defaultValue={editingAllocation?.unit_price ?? 7000} /><ErrorText value={allocationForm.errors.unit_price} /></label>
        <label>Начало<input name="start_date" type="date" defaultValue={editingAllocation?.start_date ?? defaultStart} /><ErrorText value={allocationForm.errors.start_date} /></label>
        <label>Окончание<input name="end_date" type="date" defaultValue={editingAllocation?.end_date ?? defaultEnd} /><ErrorText value={allocationForm.errors.end_date} /></label>
        <label className="span-two">Примечание<input name="note" defaultValue={editingAllocation?.note ?? ''} placeholder="Номер договора или пояснение" /></label>
      </div>
      {allocationForm.formError && <p className="form-error">{allocationForm.formError}</p>}
      <button className="button primary" disabled={allocationForm.busy}>Добавить в ведомость</button>
    </form>}


    {showPaymentForm && selectedAgency && <form className="panel agency-editor no-print" onSubmit={paymentForm.submit(async input => { await onRecordPayment(periodId,input); setShowPaymentForm(false) })}>
      <header className="panel-head"><div><h2>Оплата от {selectedAgency.name}</h2><p>Платёж уменьшает долг агентуры за выбранный месяц.</p></div></header>
      <div className="form-grid four">
        <input type="hidden" name="agency_id" value={selectedAgency.id}/>
        <label>Сумма, Kč<input name="amount" type="number" min="1" step="1"/></label>
        <label>Дата<input name="paid_on" type="date" defaultValue={defaultEnd}/></label>
        <label>Способ<select name="method" defaultValue="bank"><option value="bank">Банк</option><option value="cash">Наличные</option><option value="salary">Удержание</option><option value="other">Другое</option></select></label>
        <label>Комментарий<input name="note"/></label>
      </div>
      {paymentForm.formError && <p className="form-error">{paymentForm.formError}</p>}
      <button className="button primary" disabled={paymentForm.busy}>Записать оплату</button>
    </form>}

    {selectedFinancial && <section className="agency-finance-strip">
      <span><small>Начислено</small><strong>{money(selectedFinancial.billed)}</strong></span>
      <span><small>Оплачено</small><strong>{money(selectedFinancial.paid)}</strong></span>
      <span><small>Долг</small><strong>{money(selectedFinancial.debt)}</strong></span>
      <span><small>Платежей</small><strong>{selectedPayments.length}</strong></span>
    </section>}

    <section className="statement-sheet">
      <header className="statement-head">
        <div><WordmarkSmall /><div><span>SOWA AGENSY</span><h2>Ведомость проживания</h2><p>{selectedAgency?.name ?? 'Все агентуры'} · {monthTitle}</p></div></div>
        <div className="statement-actions no-print">
          <button className="button ghost" type="button" onClick={download} disabled={!rows.length}><Download size={17} /> CSV</button>
          <button className="button ghost" type="button" onClick={print} disabled={!rows.length}><Printer size={17} /> PDF / печать</button>
        </div>
      </header>

      {rows.length ? <>
        <div className="statement-summary"><span><UsersRound /> {people} чел.</span><span><FileText /> {rows.length} строк</span><strong>{money(total)}</strong></div>
        <div className="statement-table-wrap">
          <table className="statement-table">
            <thead><tr><th>Č.</th><th>Počet osob</th><th>Adresa</th><th>Celkem</th><th className="no-print" /></tr></thead>
            <tbody>{rows.map((row, index) => { const actualPeople = residents.filter(stay => !stay.move_out && stay.agency_id === row.agency_id && stay.property_id === row.property_id && (!row.room_id || stay.room_id === row.room_id) && (!row.bed_id || stay.bed_id === row.bed_id)).length; return <tr key={row.id}>
              <td data-label="№">{index + 1}</td>
              <td data-label="Людей">{row.people_count} {row.people_count === 1 ? 'osoba' : 'osoby'}</td>
              <td data-label="Адрес"><strong>{row.full_address}</strong><span>{row.room_name || 'Весь адрес'}{row.bed_name ? ` · ${row.bed_name}` : ''}</span><small>{row.pricing_model === 'per_person' ? `${money(row.unit_price)}/os` : `фиксировано ${money(row.unit_price)}`}{row.billable_days < row.days_in_month ? ` · ${formatDate(row.start_date)}–${formatDate(row.end_date)}` : ''}</small>{row.note && <em>{row.note}</em>}{actualPeople !== row.people_count && <em className="danger-text">Фактически жильцов: {actualPeople}</em>}</td>
              <td data-label="Сумма">{money(row.total_amount)}</td>
              <td className="no-print">{can(role, 'manage_properties') && !periodClosed && <><button type="button" className="icon-button" aria-label="Изменить строку" onClick={() => { setEditingAllocation(row); setAllocationPropertyId(row.property_id); setAllocationRoomId(row.room_id ?? ''); setShowAllocationForm(true) }}><Pencil size={16}/></button><button type="button" className="icon-button danger" aria-label="Удалить строку" onClick={() => onDeleteAllocation(row)}><Trash2 size={16} /></button></>}</td>
            </tr>})}</tbody>
            <tfoot><tr><td colSpan={3}>Celkem</td><td>{money(total)}</td><td className="no-print" /></tr></tfoot>
          </table>
        </div>
      </> : <div className="statement-empty"><FileText /><h2>Ведомость пока пустая</h2><p>Создайте агентуру и добавьте арендованный адрес, комнату или место.</p></div>}
    </section>
  </div>
}

function WordmarkSmall() {
  return <span className="statement-owl" aria-hidden="true">◉</span>
}
