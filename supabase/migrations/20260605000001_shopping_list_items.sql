create table public.shopping_list_items (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users(id) on delete cascade,
  name        text          not null,
  quantity    numeric(10,2) not null check (quantity > 0),
  unit        text          not null,
  expiry_date date,
  created_at  timestamptz   not null default now()
);

create index on public.shopping_list_items (user_id);

alter table public.shopping_list_items enable row level security;

create policy "shopping_list_items_select" on public.shopping_list_items
  for select using (auth.uid() = user_id);

create policy "shopping_list_items_insert" on public.shopping_list_items
  for insert with check (auth.uid() = user_id);

create policy "shopping_list_items_delete" on public.shopping_list_items
  for delete using (auth.uid() = user_id);
