create table public.products (
  id            uuid          primary key default gen_random_uuid(),
  user_id       uuid          not null references auth.users(id) on delete cascade,
  name          text          not null,
  quantity      numeric(10,2) not null default 0 check (quantity >= 0),
  unit          text          not null,
  expiry_date   date,
  min_threshold numeric(10,2) not null default 0 check (min_threshold >= 0),
  add_to_list   boolean       not null default true,
  created_at    timestamptz   not null default now()
);

create index on public.products (user_id);

alter table public.products enable row level security;

create policy "products_select" on public.products
  for select using (auth.uid() = user_id);

create policy "products_insert" on public.products
  for insert with check (auth.uid() = user_id);

create policy "products_update" on public.products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "products_delete" on public.products
  for delete using (auth.uid() = user_id);
