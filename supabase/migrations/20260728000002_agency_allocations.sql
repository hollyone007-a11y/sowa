create type public.agency_pricing_model as enum ('per_person', 'fixed');

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  company_id text,
  contact_name text,
  phone text,
  email text,
  note text,
  status public.property_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 2 and 160)
);

create table public.agency_allocations (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  room_name text,
  bed_name text,
  people_count integer not null check (people_count between 1 and 500),
  pricing_model public.agency_pricing_model not null default 'per_person',
  unit_price numeric(12,2) not null check (unit_price >= 0),
  start_date date not null,
  end_date date not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (room_name is null or length(trim(room_name)) between 1 and 120),
  check (bed_name is null or length(trim(bed_name)) between 1 and 120),
  check (note is null or length(note) <= 500)
);

create index agency_allocations_period_agency_idx
  on public.agency_allocations(period_id, agency_id);
create index agency_allocations_space_idx
  on public.agency_allocations(period_id, property_id, room_name, bed_name);

alter table public.agencies enable row level security;
alter table public.agency_allocations enable row level security;

create policy agencies_read on public.agencies for select to authenticated
using (true);
create policy agencies_manage on public.agencies for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create policy agency_allocations_read on public.agency_allocations for select to authenticated
using (true);
create policy agency_allocations_manage on public.agency_allocations for all to authenticated
using (public.has_role(array['admin','manager']::public.app_role[]))
with check (public.has_role(array['admin','manager']::public.app_role[]));

create or replace function public.validate_agency_allocation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  period_start date;
  period_end date;
begin
  new.room_name := nullif(trim(new.room_name), '');
  new.bed_name := nullif(trim(new.bed_name), '');
  new.note := nullif(trim(new.note), '');

  select make_date(year, month, 1),
         (make_date(year, month, 1) + interval '1 month - 1 day')::date
  into period_start, period_end
  from public.periods
  where id = new.period_id;

  if new.end_date < period_start or new.start_date > period_end then
    raise exception 'allocation dates are outside the selected period';
  end if;

  if exists (
    select 1
    from public.agency_allocations existing
    where existing.period_id = new.period_id
      and existing.property_id = new.property_id
      and existing.id is distinct from new.id
      and (
        existing.room_name is null
        or new.room_name is null
        or (
          lower(existing.room_name) = lower(new.room_name)
          and (
            existing.bed_name is null
            or new.bed_name is null
            or lower(existing.bed_name) = lower(new.bed_name)
          )
        )
      )
  ) then
    raise exception 'housing space is already allocated in this period';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger validate_agency_allocation_before_write
before insert or update on public.agency_allocations
for each row execute function public.validate_agency_allocation();

create view public.agency_statement_rows
with (security_invoker = true)
as
select
  allocation.id,
  allocation.period_id,
  allocation.agency_id,
  agency.name as agency_name,
  allocation.property_id,
  property.name as property_name,
  property.full_address,
  allocation.room_name,
  allocation.bed_name,
  allocation.people_count,
  allocation.pricing_model,
  allocation.unit_price,
  greatest(allocation.start_date, make_date(period.year, period.month, 1)) as start_date,
  least(
    allocation.end_date,
    (make_date(period.year, period.month, 1) + interval '1 month - 1 day')::date
  ) as end_date,
  (
    least(
      allocation.end_date,
      (make_date(period.year, period.month, 1) + interval '1 month - 1 day')::date
    )
    - greatest(allocation.start_date, make_date(period.year, period.month, 1))
    + 1
  )::integer as billable_days,
  extract(day from (make_date(period.year, period.month, 1) + interval '1 month - 1 day'))::integer
    as days_in_month,
  round(
    allocation.unit_price
    * case when allocation.pricing_model = 'per_person' then allocation.people_count else 1 end
    * (
      least(
        allocation.end_date,
        (make_date(period.year, period.month, 1) + interval '1 month - 1 day')::date
      )
      - greatest(allocation.start_date, make_date(period.year, period.month, 1))
      + 1
    )
    / extract(day from (make_date(period.year, period.month, 1) + interval '1 month - 1 day')),
    0
  ) as total_amount,
  allocation.note
from public.agency_allocations allocation
join public.agencies agency on agency.id = allocation.agency_id
join public.properties property on property.id = allocation.property_id
join public.periods period on period.id = allocation.period_id;

grant select, insert, update, delete on public.agencies to authenticated;
grant select, insert, update, delete on public.agency_allocations to authenticated;
grant select on public.agency_statement_rows to authenticated;

comment on table public.agency_allocations is
  'Monthly housing spaces rented by a specific external agency. A whole property, room or bed can be allocated.';
comment on view public.agency_statement_rows is
  'Printable agency statement rows with inclusive day-prorated CZK totals.';
