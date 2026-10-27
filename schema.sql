-- Ghar Manager: Phase 2 schema. Paste into Supabase > SQL Editor > Run.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My home',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  primary key (household_id, user_id)
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  category text not null default 'Other',
  repeat_monthly boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete set null,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null default 'Other',
  paid_on date not null default current_date,
  prev_due date,
  repeat_monthly boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Paid plan status. Users can read it; only the server (payment webhook) can write it.
create table public.subscriptions (
  household_id uuid primary key references public.households(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','paid')),
  razorpay_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create index on public.household_members (user_id);
create index on public.bills (household_id, due_date);
create index on public.expenses (household_id, paid_on);

-- Helper: is the signed-in user in this household? (security definer avoids RLS recursion)
create function public.is_member(hid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- On signup: create a home, make the user its owner, start on the free plan.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  insert into public.households (name, created_by) values ('My home', new.id) returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, new.id, 'owner');
  insert into public.subscriptions (household_id) values (hid);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security: nobody sees another home's data.
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.bills enable row level security;
alter table public.expenses enable row level security;
alter table public.subscriptions enable row level security;

create policy "members read home" on public.households
  for select using (public.is_member(id));
create policy "owners rename home" on public.households
  for update using (public.is_member(id)) with check (public.is_member(id));

create policy "see own memberships" on public.household_members
  for select using (user_id = auth.uid() or public.is_member(household_id));

create policy "members manage bills" on public.bills
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy "members manage expenses" on public.expenses
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy "members read plan" on public.subscriptions
  for select using (public.is_member(household_id));
