-- SETUP REQUIRED before running `supabase db reset`:
-- 1. Sign up / sign in at your local Supabase project
-- 2. Find your user UUID: Supabase Dashboard → Authentication → Users → copy the UUID
-- 3. Replace every '00000000-0000-0000-0000-000000000000' below with your real UUID
-- 4. Run: supabase db reset
--
-- This file is local-development only.
-- `supabase db reset` applies it; `supabase db push` does NOT.

insert into public.products (user_id, name, quantity, unit, expiry_date, min_threshold, add_to_list) values
  -- 1. Below threshold + on list → appears on shopping list
  ('00000000-0000-0000-0000-000000000000', 'Milk',      0.50,   'l',   null,                  2.00,   true),

  -- 2. Above threshold + on list → does NOT appear on shopping list
  ('00000000-0000-0000-0000-000000000000', 'Flour',     1.50,   'kg',  null,                  0.50,   true),

  -- 3. Expired + below threshold → appears on shopping list (also expired)
  ('00000000-0000-0000-0000-000000000000', 'Yogurt',    0.00,   'g',   current_date - 3,      200.00, true),

  -- 4. Zero quantity + on list → appears on shopping list
  ('00000000-0000-0000-0000-000000000000', 'Eggs',      0.00,   'pcs', null,                  6.00,   true),

  -- 5. Above threshold + add_to_list=false → excluded from shopping list regardless of quantity
  ('00000000-0000-0000-0000-000000000000', 'Olive Oil', 0.80,   'l',   current_date + 180,    0.50,   false);
