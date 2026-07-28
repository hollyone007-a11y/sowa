-- Operational v2: canonical inventory, agency receivables, deposits, archives,
-- QR controls, attachments metadata and administration. No production seed data.

create type public.ledger_entry_kind as enum ('paid', 'refunded', 'applied');
create type public.attachment_entity as enum ('person', 'stay', 'property', 'agency', 'expense', 'agency_payment');

alter table public.properties
  add column qr_auto_approve boolean not null default false,
  add column application_retention_days integer not null default 90
    check (application_retention_days between 30 and 730);

alter table public.stays
  add column agency_id uuid references public.agencies(id) on delete set null,
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id);

alter table public.property_expenses
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id);

alter table public.agency_allocations
  add column room_id uuid references public.rooms(id) on delete restrict,
  add column bed_id uuid references public.beds(id) on delete restrict,
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id);

-- Best-effort canonicalisation of existing text allocations.
update public.agency_allocations allocation
set room_id = room.id
from public.rooms room
where room.property_id = allocation.property_id
  and lower(room.name) = lower(allocation.room_name)
  and allocation.room_name is not null
  and allocation.room_id is null;

update public.agency_allocations allocation
set bed_id = bed.id
from public.beds bed
where bed.room_id = allocation.room_id
  and lower(bed.name) = lower(allocation.bed_name)
  and allocation.bed_name is not null
  and allocation.bed_id is null;

create table public.agency_payments (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null,
  method text not null default 'bank' check (method in ('bank','cash','salary','other')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  check (note is null or length(note) <= 500)
);

create table public.deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null,
  period_id uuid not null,
  kind public.ledger_entry_kind not null,
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (stay_id, period_id) references public.stays(id, period_id) on delete restrict,
  check (note is null or length(note) <= 500)
);

create table public.entity_attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type public.attachment_entity not null,
  entity_id uuid not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (length(trim(file_name)) between 1 and 240),
  check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp'))
);

create index stays_period_agency_active_idx
  on public.stays(period_id, agency_id) where archived_at is null;
create index agency_allocations_canonical_space_idx
  on public.agency_allocations(period_id, property_id, room_id, bed_id)
  where archived_at is null;
create index agency_payments_period_agency_idx
  on public.agency_payments(period_id, agency_id) where archived_at is null;
create index deposit_transactions_stay_idx
  on public.deposit_transactions(stay_id, occurred_on desc);
create index entity_attachments_entity_idx
  on public.entity_attachments(entity_type, entity_id) where archived_at is null;

alter table public.agency_payments enable row level security;
alter table public.deposit_transactions enable row level security;
alter table public.entity_attachments enable row level security;

create policy agency_payments_read on public.agency_payments for select to authenticated
using (public.has_role(array['admin','manager','accountant']::public.app_role[]));
create policy agency_payments_manage on public.agency_payments for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy deposit_transactions_read on public.deposit_transactions for select to authenticated
using (public.has_role(array['admin','manager','accountant']::public.app_role[]));
create policy deposit_transactions_manage on public.deposit_transactions for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy entity_attachments_read on public.entity_attachments for select to authenticated
using (public.has_role(array['admin','manager','accountant']::public.app_role[]));
create policy entity_attachments_manage on public.entity_attachments for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

grant select, insert, update on public.agency_payments to authenticated;
grant select, insert on public.deposit_transactions to authenticated;
grant select, insert, update on public.entity_attachments to authenticated;

-- Canonical inventory. One active resident can occupy a bed in one period.
create unique index stays_active_bed_per_period_idx
  on public.stays(period_id, bed_id)
  where bed_id is not null and move_out is null and archived_at is null;

create or replace function public.validate_stay_inventory()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  room_property uuid;
  bed_room uuid;
  room_limit integer;
  active_in_room integer;
begin
  if new.property_id is null and (new.room_id is not null or new.bed_id is not null) then
    raise exception 'room requires a property';
  end if;

  if new.room_id is not null then
    select property_id, capacity into room_property, room_limit
    from public.rooms where id = new.room_id;
    if room_property is distinct from new.property_id then
      raise exception 'room does not belong to property';
    end if;
  end if;

  if new.bed_id is not null then
    select room_id into bed_room from public.beds where id = new.bed_id and is_active;
    if bed_room is distinct from new.room_id then
      raise exception 'bed does not belong to room';
    end if;
  end if;

  if new.room_id is not null and new.move_out is null and new.archived_at is null then
    select count(*) into active_in_room
    from public.stays stay
    where stay.period_id = new.period_id
      and stay.room_id = new.room_id
      and stay.move_out is null
      and stay.archived_at is null
      and stay.id is distinct from new.id;
    if active_in_room >= room_limit then
      raise exception 'room capacity exceeded';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_stay_inventory_before_write
before insert or update of property_id, room_id, bed_id, move_out, archived_at
on public.stays
for each row execute function public.validate_stay_inventory();

-- Archive operations preserve financial/audit history and are reversible by SQL.
create or replace function public.archive_stay(p_stay_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.app_role[]) then raise exception 'access denied'; end if;
  if exists (select 1 from public.stays s join public.periods p on p.id=s.period_id where s.id=p_stay_id and p.is_closed)
    then raise exception 'period is closed'; end if;
  update public.stays set archived_at=now(), archived_by=auth.uid(), updated_at=now()
  where id=p_stay_id and archived_at is null;
end; $$;

create or replace function public.archive_expense(p_expense_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then raise exception 'access denied'; end if;
  if exists (select 1 from public.property_expenses e join public.periods p on p.id=e.period_id where e.id=p_expense_id and p.is_closed)
    then raise exception 'period is closed'; end if;
  update public.property_expenses set archived_at=now(), archived_by=auth.uid(), updated_at=now()
  where id=p_expense_id and archived_at is null;
end; $$;

create or replace function public.archive_agency_allocation(p_allocation_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then raise exception 'access denied'; end if;
  if exists (select 1 from public.agency_allocations a join public.periods p on p.id=a.period_id where a.id=p_allocation_id and p.is_closed)
    then raise exception 'period is closed'; end if;
  update public.agency_allocations set archived_at=now(), archived_by=auth.uid(), updated_at=now()
  where id=p_allocation_id and archived_at is null;
end; $$;

create or replace function public.record_deposit_transaction(
  p_stay_id uuid, p_kind public.ledger_entry_kind, p_amount numeric,
  p_occurred_on date, p_note text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare current_stay public.stays; result uuid;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then raise exception 'access denied'; end if;
  select * into current_stay from public.stays where id=p_stay_id and archived_at is null for update;
  if current_stay.id is null then raise exception 'stay not found'; end if;
  if (select is_closed from public.periods where id=current_stay.period_id) then raise exception 'period is closed'; end if;
  insert into public.deposit_transactions(stay_id,period_id,kind,amount,occurred_on,note,created_by)
  values(current_stay.id,current_stay.period_id,p_kind,p_amount,p_occurred_on,nullif(trim(p_note),''),auth.uid()) returning id into result;
  update public.stays set deposit_status = case p_kind when 'paid' then 'paid' when 'refunded' then 'returned' else 'applied' end,
    updated_at=now() where id=current_stay.id;
  return result;
end; $$;

create or replace function public.record_agency_payment(
  p_period_id uuid, p_agency_id uuid, p_amount numeric, p_paid_on date,
  p_method text default 'bank', p_note text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare result uuid;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then raise exception 'access denied'; end if;
  if (select is_closed from public.periods where id=p_period_id) then raise exception 'period is closed'; end if;
  insert into public.agency_payments(period_id,agency_id,amount,paid_on,method,note,created_by)
  values(p_period_id,p_agency_id,p_amount,p_paid_on,p_method,nullif(trim(p_note),''),auth.uid()) returning id into result;
  return result;
end; $$;

create or replace function public.copy_agency_allocations(
  p_source_period_id uuid, p_target_period_id uuid
) returns integer language plpgsql security invoker set search_path = public as $$
declare copied integer; target_start date; target_end date;
begin
  if not public.has_role(array['admin','manager']::public.app_role[]) then raise exception 'access denied'; end if;
  if p_source_period_id=p_target_period_id then raise exception 'periods must differ'; end if;
  if (select is_closed from public.periods where id=p_target_period_id) then raise exception 'target period is closed'; end if;
  select make_date(year,month,1),(make_date(year,month,1)+interval '1 month - 1 day')::date
  into target_start,target_end from public.periods where id=p_target_period_id;
  insert into public.agency_allocations(period_id,agency_id,property_id,room_id,bed_id,room_name,bed_name,people_count,pricing_model,unit_price,start_date,end_date,note,created_by)
  select p_target_period_id,agency_id,property_id,room_id,bed_id,room_name,bed_name,people_count,pricing_model,unit_price,target_start,target_end,note,auth.uid()
  from public.agency_allocations where period_id=p_source_period_id and archived_at is null
  on conflict do nothing;
  get diagnostics copied=row_count; return copied;
end; $$;

create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_role(array['admin']::public.app_role[]) then raise exception 'access denied'; end if;
  if p_user_id=auth.uid() and p_role<>'admin' then raise exception 'cannot remove own admin role'; end if;
  update public.profiles set role=p_role,updated_at=now() where id=p_user_id;
end; $$;

create or replace function public.purge_expired_applications()
returns integer language plpgsql security invoker set search_path = public as $$
declare removed integer;
begin
  if not public.has_role(array['admin']::public.app_role[]) then raise exception 'access denied'; end if;
  delete from public.housing_applications application
  using public.properties property
  where property.id=application.property_id
    and application.status<>'pending'
    and application.created_at < now() - make_interval(days=>property.application_retention_days);
  get diagnostics removed=row_count; return removed;
end; $$;

-- Read models used by the dense operational UI.
create view public.inventory_status
with (security_invoker=true) as
select p.id period_id, pr.id property_id, pr.name property_name, pr.full_address,
  r.id room_id, r.name room_name, r.capacity room_capacity,
  b.id bed_id, b.name bed_name, b.is_active bed_active,
  s.id stay_id, concat_ws(' ',pe.first_name,pe.last_name) resident_name,
  s.agency_id, a.name agency_name
from public.periods p
cross join public.properties pr
left join public.rooms r on r.property_id=pr.id
left join public.beds b on b.room_id=r.id
left join public.stays s on s.period_id=p.id and s.bed_id=b.id and s.move_out is null and s.archived_at is null
left join public.people pe on pe.id=s.person_id
left join public.agencies a on a.id=s.agency_id;

create view public.agency_financial_summary
with (security_invoker=true) as
select period.id period_id, agency.id agency_id, agency.name agency_name,
  coalesce(charges.billed,0)::numeric billed,
  coalesce(payments.paid,0)::numeric paid,
  greatest(coalesce(charges.billed,0)-coalesce(payments.paid,0),0)::numeric debt,
  case when coalesce(charges.billed,0)=0 then 'empty'
       when coalesce(payments.paid,0)=0 then 'unpaid'
       when coalesce(payments.paid,0)<coalesce(charges.billed,0) then 'partial'
       else 'paid' end payment_status
from public.periods period
cross join public.agencies agency
left join lateral (
  select sum(round(allocation.unit_price * case when allocation.pricing_model='per_person' then allocation.people_count else 1 end
    * (allocation.end_date-allocation.start_date+1) / extract(day from (make_date(period.year,period.month,1)+interval '1 month - 1 day')),0)) billed
  from public.agency_allocations allocation
  where allocation.period_id=period.id and allocation.agency_id=agency.id and allocation.archived_at is null
) charges on true
left join lateral (
  select sum(payment.amount) paid from public.agency_payments payment
  where payment.period_id=period.id and payment.agency_id=agency.id and payment.archived_at is null
) payments on true
where public.has_role(array['admin','manager','accountant']::public.app_role[]);

grant select on public.inventory_status, public.agency_financial_summary to authenticated;
grant execute on function public.archive_stay(uuid) to authenticated;
grant execute on function public.archive_expense(uuid) to authenticated;
grant execute on function public.archive_agency_allocation(uuid) to authenticated;
grant execute on function public.record_deposit_transaction(uuid,public.ledger_entry_kind,numeric,date,text) to authenticated;
grant execute on function public.record_agency_payment(uuid,uuid,numeric,date,text,text) to authenticated;
grant execute on function public.copy_agency_allocations(uuid,uuid) to authenticated;
grant execute on function public.set_user_role(uuid,public.app_role) to authenticated;
grant execute on function public.purge_expired_applications() to authenticated;

-- Extend auditing to operational ledgers and attachment metadata.
create trigger agency_payments_audit after insert or update or delete on public.agency_payments
for each row execute function public.audit_changes();
create trigger deposit_transactions_audit after insert or update or delete on public.deposit_transactions
for each row execute function public.audit_changes();
create trigger entity_attachments_audit after insert or update or delete on public.entity_attachments
for each row execute function public.audit_changes();


-- Replace existing read models so archived records disappear and v2 fields are
-- available without additional round trips.
create or replace view public.stay_details
with (security_invoker = true)
as
select
  s.id, s.period_id, s.person_id, s.property_id, s.room_id, s.bed_id,
  concat_ws(' ', pe.first_name, pe.last_name) as full_name,
  pe.phone, pe.workplace, pe.kind as person_kind,
  pr.name as property_name, r.name as room_name, b.name as bed_name,
  s.move_in, s.move_out, s.price, s.paid_amount, s.payment_method,
  s.payment_status, s.deposit_status, s.comment,
  s.agency_id, agency.name as agency_name
from public.stays s
join public.people pe on pe.id = s.person_id
left join public.properties pr on pr.id = s.property_id
left join public.rooms r on r.id = s.room_id
left join public.beds b on b.id = s.bed_id
left join public.agencies agency on agency.id = s.agency_id
where s.archived_at is null;

create or replace view public.property_period_summary
with (security_invoker = true)
as
select
  p.id as period_id,
  pr.id, pr.name, pr.full_address, pr.contact_name, pr.phone, pr.email,
  pr.capacity, pr.monthly_cost, pr.status,
  count(s.id) filter (where s.move_out is null)::integer as occupied,
  coalesce(sum(case when s.payment_method = 'free' then 0 else greatest(s.price-s.paid_amount,0) end),0)::numeric as debt,
  coalesce(sum(s.paid_amount),0)::numeric as collected,
  link.public_token,
  pr.qr_auto_approve,
  pr.application_retention_days
from public.periods p
cross join public.properties pr
left join public.stays s on s.period_id=p.id and s.property_id=pr.id and s.archived_at is null
left join public.property_links link on link.property_id=pr.id and link.is_active
group by p.id,pr.id,link.public_token;

create or replace view public.property_financial_summary
with (security_invoker = true)
as
select
  p.id period_id, pr.id property_id, pr.name property_name,
  coalesce(sum(case when s.payment_method='free' then 0 else s.price end),0) charged,
  coalesce(sum(s.paid_amount),0) collected,
  coalesce(sum(case when s.payment_method='free' then 0 else greatest(s.price-s.paid_amount,0) end),0) debt,
  pr.monthly_cost base_cost,
  coalesce((select sum(e.amount) from public.property_expenses e where e.period_id=p.id and e.property_id=pr.id and e.archived_at is null),0) expenses,
  coalesce(sum(s.paid_amount),0)-pr.monthly_cost-
    coalesce((select sum(e.amount) from public.property_expenses e where e.period_id=p.id and e.property_id=pr.id and e.archived_at is null),0) profit,
  coalesce(sum(case when s.payment_method='free' then 0 else s.price end),0)-pr.monthly_cost-
    coalesce((select sum(e.amount) from public.property_expenses e where e.period_id=p.id and e.property_id=pr.id and e.archived_at is null),0) operating_profit,
  coalesce(sum(s.paid_amount),0)-pr.monthly_cost-
    coalesce((select sum(e.amount) from public.property_expenses e where e.period_id=p.id and e.property_id=pr.id and e.archived_at is null),0) cash_flow
from public.periods p
cross join public.properties pr
left join public.stays s on s.period_id=p.id and s.property_id=pr.id and s.archived_at is null
where public.has_role(array['admin','manager','accountant']::public.app_role[])
group by p.id,pr.id;

grant select on public.stay_details,public.property_period_summary,public.property_financial_summary to authenticated;


create or replace view public.agency_statement_rows
with (security_invoker=true) as
select allocation.id,allocation.period_id,allocation.agency_id,agency.name agency_name,
  allocation.property_id,property.name property_name,property.full_address,
  coalesce(room.name,allocation.room_name) room_name,
  coalesce(bed.name,allocation.bed_name) bed_name,
  allocation.people_count,allocation.pricing_model,allocation.unit_price,
  greatest(allocation.start_date,make_date(period.year,period.month,1)) start_date,
  least(allocation.end_date,(make_date(period.year,period.month,1)+interval '1 month - 1 day')::date) end_date,
  (least(allocation.end_date,(make_date(period.year,period.month,1)+interval '1 month - 1 day')::date)
   - greatest(allocation.start_date,make_date(period.year,period.month,1))+1)::integer billable_days,
  extract(day from (make_date(period.year,period.month,1)+interval '1 month - 1 day'))::integer days_in_month,
  round(allocation.unit_price * case when allocation.pricing_model='per_person' then allocation.people_count else 1 end
    * (least(allocation.end_date,(make_date(period.year,period.month,1)+interval '1 month - 1 day')::date)
       - greatest(allocation.start_date,make_date(period.year,period.month,1))+1)
    / extract(day from (make_date(period.year,period.month,1)+interval '1 month - 1 day')),0) total_amount,
  allocation.note,allocation.room_id,allocation.bed_id
from public.agency_allocations allocation
join public.agencies agency on agency.id=allocation.agency_id
join public.properties property on property.id=allocation.property_id
join public.periods period on period.id=allocation.period_id
left join public.rooms room on room.id=allocation.room_id
left join public.beds bed on bed.id=allocation.bed_id
where allocation.archived_at is null;

grant select on public.agency_statement_rows to authenticated;


create or replace function public.validate_agency_allocation()
returns trigger language plpgsql security invoker set search_path=public as $$
declare period_start date; period_end date; period_closed boolean; canonical_room uuid; canonical_bed uuid;
begin
  new.room_name:=nullif(trim(new.room_name),''); new.bed_name:=nullif(trim(new.bed_name),''); new.note:=nullif(trim(new.note),'');
  select make_date(year,month,1),(make_date(year,month,1)+interval '1 month - 1 day')::date,is_closed
  into period_start,period_end,period_closed from public.periods where id=new.period_id;
  if period_start is null then raise exception 'selected period does not exist'; end if;
  if period_closed then raise exception 'period is closed'; end if;
  if new.start_date<period_start or new.end_date>period_end then raise exception 'allocation dates are outside the selected period'; end if;

  if new.room_id is not null then
    select id into canonical_room from public.rooms where id=new.room_id and property_id=new.property_id;
    if canonical_room is null then raise exception 'room does not belong to property'; end if;
    select name into new.room_name from public.rooms where id=new.room_id;
  end if;
  if new.bed_id is not null then
    select id into canonical_bed from public.beds where id=new.bed_id and room_id=new.room_id and is_active;
    if canonical_bed is null then raise exception 'bed does not belong to room'; end if;
    select name into new.bed_name from public.beds where id=new.bed_id;
  end if;

  if exists(select 1 from public.agency_allocations existing
    where existing.period_id=new.period_id and existing.property_id=new.property_id
      and existing.archived_at is null and existing.id is distinct from new.id
      and (
        (existing.room_id is null and existing.room_name is null)
        or (new.room_id is null and new.room_name is null)
        or (
          coalesce(existing.room_id::text,lower(existing.room_name))=coalesce(new.room_id::text,lower(new.room_name))
          and (
            (existing.bed_id is null and existing.bed_name is null)
            or (new.bed_id is null and new.bed_name is null)
            or coalesce(existing.bed_id::text,lower(existing.bed_name))=coalesce(new.bed_id::text,lower(new.bed_name))
          )
        )
      )
  ) then raise exception 'housing space is already allocated in this period'; end if;
  new.updated_at:=now(); return new;
end; $$;


create or replace function public.submit_housing_application(
  p_token uuid,p_first_name text,p_last_name text,p_phone text,p_workplace text,
  p_passport_series text,p_passport_number text,p_ukraine_registration text,
  p_requested_move_in date,p_consent boolean,p_website text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare target_property public.properties; new_application_id uuid; new_person_id uuid; target_period_id uuid; occupied_count integer;
begin
  if coalesce(trim(p_website),'')<>'' then raise exception 'invalid submission'; end if;
  if not p_consent then raise exception 'consent required'; end if;
  if p_requested_move_in<current_date-7 or p_requested_move_in>current_date+365 then raise exception 'invalid move-in date'; end if;

  select property.* into target_property from public.property_links link
  join public.properties property on property.id=link.property_id
  where link.public_token=p_token and link.is_active and property.status='active';
  if target_property.id is null then raise exception 'link unavailable'; end if;

  if exists(select 1 from public.housing_applications
    where regexp_replace(upper(passport_number),'[^A-ZА-Я0-9]','','g')=
          regexp_replace(upper(trim(p_passport_number)),'[^A-ZА-Я0-9]','','g')
      and created_at>now()-interval '30 days')
    or exists(select 1 from public.resident_profiles_private
      where regexp_replace(upper(passport_number),'[^A-ZА-Я0-9]','','g')=
            regexp_replace(upper(trim(p_passport_number)),'[^A-ZА-Я0-9]','','g'))
  then raise exception 'application already submitted'; end if;

  insert into public.housing_applications(property_id,first_name,last_name,phone,workplace,passport_series,passport_number,ukraine_registration,requested_move_in,consent_at)
  values(target_property.id,trim(p_first_name),trim(p_last_name),trim(p_phone),nullif(trim(p_workplace),''),
    nullif(trim(p_passport_series),''),trim(p_passport_number),trim(p_ukraine_registration),p_requested_move_in,now())
  returning id into new_application_id;

  if target_property.qr_auto_approve then
    insert into public.periods(year,month) values(extract(year from p_requested_move_in)::integer,extract(month from p_requested_move_in)::integer)
    on conflict(year,month) do update set year=excluded.year returning id into target_period_id;

    select count(*) into occupied_count from public.stays
    where period_id=target_period_id and property_id=target_property.id and move_out is null and archived_at is null;
    if occupied_count<target_property.capacity then
      insert into public.people(first_name,last_name,phone,workplace,kind)
      values(trim(p_first_name),trim(p_last_name),trim(p_phone),nullif(trim(p_workplace),''),'external')
      returning id into new_person_id;
      insert into public.resident_profiles_private(person_id,first_name,last_name,passport_series,passport_number,ukraine_registration)
      values(new_person_id,trim(p_first_name),trim(p_last_name),nullif(trim(p_passport_series),''),trim(p_passport_number),trim(p_ukraine_registration));
      insert into public.stays(period_id,person_id,property_id,move_in,price,payment_method,payment_status,deposit_status,comment)
      values(target_period_id,new_person_id,target_property.id,p_requested_move_in,0,'free','tracking','none','Автоматически добавлен через QR; требуется назначить место и цену');
      update public.housing_applications set status='approved',person_id=new_person_id,reviewed_at=now()
      where id=new_application_id;
    end if;
  end if;
  return new_application_id;
end; $$;

grant execute on function public.submit_housing_application(uuid,text,text,text,text,text,text,text,date,boolean,text) to anon,authenticated;


alter table public.payments add column archived_at timestamptz, add column archived_by uuid references auth.users(id);
create policy payments_update on public.payments for update to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create or replace function public.reverse_payment(p_payment_id uuid,p_reason text default null)
returns void language plpgsql security invoker set search_path=public as $$
declare payment_row public.payments; stay_row public.stays; next_paid numeric;
begin
  if not public.has_role(array['admin']::public.app_role[]) then raise exception 'access denied'; end if;
  select * into payment_row from public.payments where id=p_payment_id and archived_at is null for update;
  if payment_row.id is null then raise exception 'payment not found'; end if;
  if (select is_closed from public.periods where id=payment_row.period_id) then raise exception 'period is closed'; end if;
  select * into stay_row from public.stays where id=payment_row.stay_id for update;
  next_paid:=greatest(stay_row.paid_amount-payment_row.amount,0);
  update public.stays set paid_amount=next_paid,payment_status=case
    when payment_method='free' then 'tracking'::public.payment_status
    when next_paid=0 then 'unpaid'::public.payment_status
    when next_paid>=price then 'paid'::public.payment_status else 'partial'::public.payment_status end,
    updated_at=now() where id=stay_row.id;
  update public.payments set archived_at=now(),archived_by=auth.uid(),
    note=concat_ws(' · ',note,nullif(trim(p_reason),'')) where id=payment_row.id;
end; $$;

grant update on public.payments to authenticated;
grant execute on function public.reverse_payment(uuid,text) to authenticated;


insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sowa-documents','sowa-documents',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy sowa_documents_read on storage.objects for select to authenticated
using(bucket_id='sowa-documents' and public.has_role(array['admin','manager','accountant']::public.app_role[]));
create policy sowa_documents_insert on storage.objects for insert to authenticated
with check(bucket_id='sowa-documents' and public.has_role(array['admin','manager']::public.app_role[]));
create policy sowa_documents_update on storage.objects for update to authenticated
using(bucket_id='sowa-documents' and public.has_role(array['admin','manager']::public.app_role[]))
with check(bucket_id='sowa-documents' and public.has_role(array['admin','manager']::public.app_role[]));
