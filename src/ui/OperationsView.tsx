import { useMemo, useState } from 'react'
import { BedDouble, Building2, History, Plus, ShieldCheck, UserCog } from 'lucide-react'
import { bedSchema, roomSchema, type BedInput, type RoomInput } from '../lib/schemas'
import { formatDate } from '../lib/format'
import { roleLabels } from '../lib/permissions'
import { useZodForm } from './useZodForm'
import type { AppProfile, AppRole, AuditEntry, InventorySlot, Property } from '../types'

export function InventoryView({
  slots, properties, periodClosed, onCreateRoom, onCreateBed,
}: {
  slots: InventorySlot[]
  properties: Property[]
  periodClosed: boolean
  onCreateRoom: (input: RoomInput) => Promise<void>
  onCreateBed: (input: BedInput) => Promise<void>
}) {
  const [mode, setMode] = useState<'room' | 'bed' | null>(null)
  const roomForm = useZodForm(roomSchema)
  const bedForm = useZodForm(bedSchema)
  const rooms = useMemo(() => {
    const unique = new Map<string, InventorySlot>()
    for (const slot of slots) if (slot.room_id) unique.set(slot.room_id, slot)
    return [...unique.values()]
  }, [slots])
  const grouped = useMemo(() => properties.map((property) => ({
    property,
    rows: slots.filter((slot) => slot.property_id === property.id),
  })), [properties, slots])

  return <div className="operations-page">
    <section className="panel operations-toolbar">
      <div><span className="eyebrow">Фактический инвентарь</span><h1>Комнаты и места</h1><p>Единый справочник исключает опечатки, двойное заселение и ручной пересчёт.</p></div>
      {!periodClosed && <div className="toolbar-actions">
        <button className="button ghost" onClick={() => setMode(mode === 'room' ? null : 'room')}><Building2 size={17}/> Комната</button>
        <button className="button primary" onClick={() => setMode(mode === 'bed' ? null : 'bed')} disabled={!rooms.length}><Plus size={17}/> Место</button>
      </div>}
    </section>

    {mode === 'room' && <form className="panel form-grid three" onSubmit={roomForm.submit(async input => { await onCreateRoom(input); setMode(null) })}>
      <label>Адрес<select name="property_id" defaultValue=""><option value="">Выберите адрес</option>{properties.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Название<input name="name" placeholder="Комната 1"/></label>
      <label>Вместимость<input name="capacity" type="number" min="1" defaultValue="2"/></label>
      {roomForm.formError && <p className="form-error">{roomForm.formError}</p>}
      <button className="button primary" disabled={roomForm.busy}>Создать комнату</button>
    </form>}

    {mode === 'bed' && <form className="panel form-grid three" onSubmit={bedForm.submit(async input => { await onCreateBed(input); setMode(null) })}>
      <label>Комната<select name="room_id" defaultValue=""><option value="">Выберите комнату</option>{rooms.map(item => <option key={item.room_id!} value={item.room_id!}>{item.property_name} · {item.room_name}</option>)}</select></label>
      <label>Название<input name="name" placeholder="Место A"/></label>
      {bedForm.formError && <p className="form-error">{bedForm.formError}</p>}
      <button className="button primary" disabled={bedForm.busy}>Создать место</button>
    </form>}

    <div className="inventory-grid">{grouped.map(({property,rows}) => {
      const beds = rows.filter(row => row.bed_id)
      const occupied = beds.filter(row => row.stay_id).length
      return <section className="panel inventory-property" key={property.id}>
        <header className="panel-head"><div><h2>{property.name}</h2><p>{property.full_address}</p></div><strong>{occupied}/{beds.length || property.capacity}</strong></header>
        {beds.length ? <div className="inventory-list">{beds.map(row => <article key={row.bed_id!} className={row.stay_id ? 'inventory-slot occupied' : 'inventory-slot free'}>
          <BedDouble size={18}/><div><strong>{row.room_name} · {row.bed_name}</strong><small>{row.resident_name || 'Свободно'}{row.agency_name ? ` · ${row.agency_name}` : ''}</small></div><span>{row.stay_id ? 'Занято' : 'Свободно'}</span>
        </article>)}</div> : <p className="empty-inline">Комнаты и места ещё не заведены. Общая вместимость: {property.capacity}.</p>}
      </section>
    })}</div>
  </div>
}

export function AdministrationView({
  profiles, audit, onRoleChange, onPurge,
}: {
  profiles: AppProfile[]
  audit: AuditEntry[]
  onRoleChange: (userId: string, role: AppRole) => Promise<void>
  onPurge: () => Promise<void>
}) {
  return <div className="operations-page admin-grid">
    <section className="panel">
      <header className="panel-head"><div><span className="eyebrow">Доступ</span><h2><UserCog size={20}/> Пользователи и роли</h2></div></header>
      <div className="admin-users">{profiles.map(profile => <label key={profile.id}><span><strong>{profile.display_name || 'Без имени'}</strong><small>{profile.id.slice(0,8)}…</small></span><select value={profile.role} onChange={event => void onRoleChange(profile.id,event.target.value as AppRole)}>{Object.entries(roleLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>)}</div>
      <button className="button ghost" type="button" onClick={() => void onPurge()}><ShieldCheck size={17}/> Удалить просроченные обработанные анкеты</button>
    </section>
    <section className="panel">
      <header className="panel-head"><div><span className="eyebrow">Контроль</span><h2><History size={20}/> Последние изменения</h2></div></header>
      <div className="audit-list">{audit.length ? audit.map(entry => <article key={entry.id}><strong>{entry.table_name} · {entry.operation}</strong><small>{formatDate(entry.changed_at)} · {entry.changed_by ? `${entry.changed_by.slice(0,8)}…` : 'система'}</small></article>) : <p className="empty-inline">История пока пуста.</p>}</div>
    </section>
  </div>
}
