-- CampusFlow PostgreSQL foundation. Apply with `supabase db push`.
-- Browser roles have no grants or policies. The server uses service_role only.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id text primary key,
  email text not null unique,
  full_name text not null check (char_length(trim(full_name)) between 2 and 80),
  avatar_url text,
  role text not null default 'student' check (role in ('student', 'organizer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text not null check (char_length(trim(description)) between 20 and 2000),
  category text not null check (category in ('Technology', 'Creative', 'Career', 'Community')),
  venue text not null check (char_length(trim(venue)) between 3 and 120),
  starts_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 10000),
  owner_id text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists events_starts_at_idx on public.events(starts_at);
create index if not exists events_owner_starts_at_idx on public.events(owner_id, starts_at);
create index if not exists events_category_starts_at_idx on public.events(category, starts_at);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);
create index if not exists registrations_event_status_idx on public.registrations(event_id, status);
create index if not exists registrations_user_status_idx on public.registrations(user_id, status);

create table if not exists public.saved_events (
  user_id text not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, event_id)
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_ciphertext text not null,
  status text not null default 'valid' check (status in ('valid', 'checked_in', 'cancelled')),
  issued_at timestamptz not null default now(), checked_in_at timestamptz,
  checked_in_by text references public.profiles(id) on delete set null,
  check ((status = 'checked_in') = (checked_in_at is not null)),
  check ((status = 'checked_in') = (checked_in_by is not null))
);
create index if not exists tickets_status_idx on public.tickets(status);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.saved_events enable row level security;
alter table public.tickets enable row level security;
revoke all on public.profiles, public.events, public.registrations, public.saved_events, public.tickets from anon, authenticated;
grant all on public.profiles, public.events, public.registrations, public.saved_events, public.tickets to service_role;
create policy "service role manages profiles" on public.profiles for all to service_role using (true) with check (true);
create policy "service role manages events" on public.events for all to service_role using (true) with check (true);
create policy "service role manages registrations" on public.registrations for all to service_role using (true) with check (true);
create policy "service role manages saved events" on public.saved_events for all to service_role using (true) with check (true);
create policy "service role manages tickets" on public.tickets for all to service_role using (true) with check (true);

create or replace function public.search_events(p_query text default '',p_category text default '',p_sort text default 'date',p_user_id text default null)
returns table(id uuid,title text,description text,category text,venue text,starts_at timestamptz,capacity integer,owner_id text,organizer text,booked bigint,registered boolean,saved boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select e.id,e.title,e.description,e.category,e.venue,e.starts_at,e.capacity,e.owner_id,p.full_name,
    (select count(*) from public.registrations r where r.event_id=e.id and r.status='confirmed'),
    exists(select 1 from public.registrations r where r.event_id=e.id and r.user_id=p_user_id and r.status='confirmed'),
    exists(select 1 from public.saved_events s where s.event_id=e.id and s.user_id=p_user_id)
  from public.events e join public.profiles p on p.id=e.owner_id
  where e.starts_at>now() and (coalesce(trim(p_query),'')='' or e.title ilike '%'||trim(p_query)||'%' or e.description ilike '%'||trim(p_query)||'%')
    and (coalesce(p_category,'')='' or e.category=p_category)
  order by case when p_sort='title' then lower(e.title) end asc,
    case when p_sort='seats' then e.capacity-(select count(*) from public.registrations r where r.event_id=e.id and r.status='confirmed') end desc,
    e.starts_at asc limit 100;
$$;

create or replace function public.register_for_event(p_user_id text,p_event_id uuid,p_token_hash text,p_token_ciphertext text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ev public.events%rowtype; reg public.registrations%rowtype; ticket_id uuid;
begin
  select * into ev from public.events where id=p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
  if ev.starts_at<=now() then raise exception 'registration_closed' using errcode='P0001'; end if;
  select * into reg from public.registrations where user_id=p_user_id and event_id=p_event_id for update;
  if found and reg.status='confirmed' then raise exception 'already_registered' using errcode='23505'; end if;
  if (select count(*) from public.registrations where event_id=p_event_id and status='confirmed')>=ev.capacity then raise exception 'event_full' using errcode='P0001'; end if;
  if reg.id is null then
    insert into public.registrations(user_id,event_id,status) values(p_user_id,p_event_id,'confirmed') returning * into reg;
  else
    update public.registrations set status='confirmed',updated_at=now() where id=reg.id returning * into reg;
  end if;
  insert into public.tickets(registration_id,token_hash,token_ciphertext,status,issued_at,checked_in_at,checked_in_by)
    values(reg.id,p_token_hash,p_token_ciphertext,'valid',now(),null,null)
    on conflict(registration_id) do update set token_hash=excluded.token_hash,token_ciphertext=excluded.token_ciphertext,status='valid',issued_at=now(),checked_in_at=null,checked_in_by=null
    returning id into ticket_id;
  return jsonb_build_object('registration_id',reg.id,'ticket_id',ticket_id);
end $$;

create or replace function public.cancel_registration(p_user_id text,p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare reg_id uuid;
begin
  select id into reg_id from public.registrations where user_id=p_user_id and event_id=p_event_id for update;
  if not found then return false; end if;
  update public.registrations set status='cancelled',updated_at=now() where id=reg_id and status='confirmed';
  update public.tickets set status='cancelled',checked_in_at=null,checked_in_by=null where registration_id=reg_id and status<>'cancelled';
  return true;
end $$;

create or replace function public.update_owned_event(p_owner_id text,p_event_id uuid,p_title text,p_description text,p_category text,p_venue text,p_starts_at timestamptz,p_capacity integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare ev public.events%rowtype; n bigint;
begin
  select * into ev from public.events where id=p_event_id for update;
  if not found or ev.owner_id<>p_owner_id then return false; end if;
  select count(*) into n from public.registrations where event_id=p_event_id and status='confirmed';
  if p_capacity<n then raise exception 'capacity_conflict' using errcode='P0001'; end if;
  update public.events set title=p_title,description=p_description,category=p_category,venue=p_venue,starts_at=p_starts_at,capacity=p_capacity,updated_at=now() where id=p_event_id;
  return true;
end $$;

create or replace function public.delete_owned_event(p_owner_id text,p_event_id uuid)
returns boolean language sql security definer set search_path=public,pg_temp as $$
  delete from public.events where id=p_event_id and owner_id=p_owner_id returning true
$$;

create or replace function public.check_in_ticket(p_token_hash text,p_actor_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tickets%rowtype; r public.registrations%rowtype; ev public.events%rowtype;
begin
  select tk.* into t from public.tickets tk where tk.token_hash=p_token_hash for update;
  if not found then raise exception 'ticket_invalid' using errcode='P0002'; end if;
  select * into r from public.registrations where id=t.registration_id for update;
  select * into ev from public.events where id=r.event_id for update;
  if ev.owner_id<>p_actor_id then raise exception 'not_event_owner' using errcode='42501'; end if;
  if t.status<>'valid' or r.status<>'confirmed' then raise exception 'ticket_inactive' using errcode='P0001'; end if;
  update public.tickets set status='checked_in',checked_in_at=now(),checked_in_by=p_actor_id where id=t.id;
  return jsonb_build_object('ticket_id',t.id,'event_id',ev.id,'event_title',ev.title,'checked_in_at',now());
end $$;

create or replace function public.organizer_analytics(p_owner_id text)
returns table(event_id uuid,title text,starts_at timestamptz,capacity integer,registrations bigint,attendance bigint)
language sql stable security definer set search_path=public,pg_temp as $$
  select e.id,e.title,e.starts_at,e.capacity,
    (select count(*) from public.registrations r where r.event_id=e.id and r.status='confirmed'),
    (select count(*) from public.tickets t join public.registrations r on r.id=t.registration_id where r.event_id=e.id and t.status='checked_in')
  from public.events e where e.owner_id=p_owner_id order by e.starts_at desc
$$;

revoke all on function public.search_events(text,text,text,text) from public,anon,authenticated;
revoke all on function public.register_for_event(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.cancel_registration(text,uuid) from public,anon,authenticated;
revoke all on function public.update_owned_event(text,uuid,text,text,text,text,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.delete_owned_event(text,uuid) from public,anon,authenticated;
revoke all on function public.check_in_ticket(text,text) from public,anon,authenticated;
revoke all on function public.organizer_analytics(text) from public,anon,authenticated;
grant execute on function public.search_events(text,text,text,text) to service_role;
grant execute on function public.register_for_event(text,uuid,text,text) to service_role;
grant execute on function public.cancel_registration(text,uuid) to service_role;
grant execute on function public.update_owned_event(text,uuid,text,text,text,text,timestamptz,integer) to service_role;
grant execute on function public.delete_owned_event(text,uuid) to service_role;
grant execute on function public.check_in_ticket(text,text) to service_role;
grant execute on function public.organizer_analytics(text) to service_role;
