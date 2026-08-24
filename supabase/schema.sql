-- ============================================
-- RestaurantIQ — Complete Database Schema
-- Run this entire file in Supabase SQL Editor
-- (Dashboard > SQL Editor > New Query > paste > Run)
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

create table restaurants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  plan text default 'starter',
  timezone text default 'Africa/Addis_Ababa',
  logo_url text,
  address text,
  phone text,
  created_at timestamptz default now()
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  email text not null,
  role text not null check (role in ('owner','manager','cashier','kitchen')),
  salary numeric default 0,
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);

create table menu_categories (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  sort_order int default 0
);

create table menu_items (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  description text,
  price numeric not null default 0,
  image_url text,
  is_available boolean default true,
  sales_count int default 0,
  created_at timestamptz default now()
);

create table customers (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  phone text,
  email text,
  visit_count int default 0,
  total_spent numeric default 0,
  last_visit timestamptz,
  created_at timestamptz default now()
);

create table tables (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  table_number int not null,
  qr_code text,
  status text default 'available' check (status in ('available','occupied','reserved'))
);

create table orders (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  cashier_id uuid references users(id),
  customer_id uuid references customers(id),
  table_id uuid references tables(id),
  status text not null default 'pending' check (status in ('pending','preparing','ready','completed','cancelled')),
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade not null,
  menu_item_id uuid references menu_items(id),
  quantity int not null default 1,
  unit_price numeric not null,
  subtotal numeric not null,
  notes text
);

create table payments (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade not null,
  method text not null check (method in ('cash','telebirr','cbe_birr','bank_transfer')),
  amount numeric not null,
  reference text,
  paid_at timestamptz default now()
);

create table inventory_items (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  unit text not null default 'kg',
  current_stock numeric not null default 0,
  reorder_level numeric not null default 0,
  unit_cost numeric default 0,
  category text,
  last_updated timestamptz default now()
);

create table inventory_transactions (
  id uuid primary key default uuid_generate_v4(),
  inventory_id uuid references inventory_items(id) on delete cascade not null,
  type text not null check (type in ('purchase','usage','waste','adjustment')),
  quantity numeric not null,
  unit_cost numeric,
  notes text,
  recorded_at timestamptz default now()
);

create table menu_views (
  id uuid primary key default uuid_generate_v4(),
  table_id uuid references tables(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  device_type text,
  viewed_at timestamptz default now()
);

-- ============================================
-- INDEXES for performance
-- ============================================
create index idx_orders_restaurant_status on orders(restaurant_id, status);
create index idx_orders_created_at on orders(created_at);
create index idx_order_items_order on order_items(order_id);
create index idx_menu_items_restaurant on menu_items(restaurant_id);
create index idx_users_restaurant on users(restaurant_id);

-- ============================================
-- ROW LEVEL SECURITY (multi-tenant isolation)
-- ============================================

alter table restaurants enable row level security;
alter table users enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table customers enable row level security;
alter table tables enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table inventory_items enable row level security;
alter table inventory_transactions enable row level security;
alter table menu_views enable row level security;

-- Helper function: get current user's restaurant_id
create or replace function get_my_restaurant_id()
returns uuid as $$
  select restaurant_id from users where id = auth.uid()
$$ language sql security definer stable;

-- Restaurants: users can see their own restaurant
create policy "Users can view own restaurant" on restaurants
  for select using (id = get_my_restaurant_id());

-- Users: can view colleagues in same restaurant
create policy "Users can view colleagues" on users
  for select using (restaurant_id = get_my_restaurant_id());
create policy "Users can update own profile" on users
  for update using (id = auth.uid());

-- Generic tenant-isolation policy for all data tables
create policy "Tenant isolation: menu_categories" on menu_categories
  for all using (restaurant_id = get_my_restaurant_id());

create policy "Tenant isolation: menu_items select" on menu_items
  for select using (restaurant_id = get_my_restaurant_id());
create policy "Tenant isolation: menu_items write" on menu_items
  for insert with check (restaurant_id = get_my_restaurant_id());
create policy "Tenant isolation: menu_items update" on menu_items
  for update using (restaurant_id = get_my_restaurant_id());
create policy "Tenant isolation: menu_items delete" on menu_items
  for delete using (restaurant_id = get_my_restaurant_id());

create policy "Tenant isolation: customers" on customers
  for all using (restaurant_id = get_my_restaurant_id());

create policy "Tenant isolation: tables" on tables
  for all using (restaurant_id = get_my_restaurant_id());

create policy "Tenant isolation: orders" on orders
  for all using (restaurant_id = get_my_restaurant_id());

create policy "Tenant isolation: order_items" on order_items
  for all using (
    order_id in (select id from orders where restaurant_id = get_my_restaurant_id())
  );

create policy "Tenant isolation: payments" on payments
  for all using (
    order_id in (select id from orders where restaurant_id = get_my_restaurant_id())
  );

create policy "Tenant isolation: inventory_items" on inventory_items
  for all using (restaurant_id = get_my_restaurant_id());

create policy "Tenant isolation: inventory_transactions" on inventory_transactions
  for all using (
    inventory_id in (select id from inventory_items where restaurant_id = get_my_restaurant_id())
  );

create policy "Tenant isolation: menu_views" on menu_views
  for all using (restaurant_id = get_my_restaurant_id());

-- ============================================
-- PUBLIC ACCESS for QR Digital Menu (no auth required)
-- ============================================
create policy "Public can view available menu items" on menu_items
  for select using (is_available = true);

create policy "Public can view menu categories" on menu_categories
  for select using (true);

create policy "Public can view restaurant info" on restaurants
  for select using (true);

create policy "Public can log menu views" on menu_views
  for insert with check (true);

-- ============================================
-- SEED DATA — Demo restaurant for testing
-- ============================================
-- After creating your first user via Supabase Auth dashboard,
-- run this (replace YOUR_AUTH_USER_ID with the UUID from Authentication tab):

-- insert into restaurants (id, name, slug) values
--   ('11111111-1111-1111-1111-111111111111', 'Addis Kitchen', 'addis-kitchen');

-- insert into users (id, restaurant_id, name, email, role) values
--   ('YOUR_AUTH_USER_ID', '11111111-1111-1111-1111-111111111111', 'Dawit Tesfaye', 'you@email.com', 'owner');

-- insert into menu_categories (restaurant_id, name, sort_order) values
--   ('11111111-1111-1111-1111-111111111111', 'Food', 1),
--   ('11111111-1111-1111-1111-111111111111', 'Drinks', 2),
--   ('11111111-1111-1111-1111-111111111111', 'Desserts', 3),
--   ('11111111-1111-1111-1111-111111111111', 'Specials', 4);
