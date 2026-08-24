-- ============================================
-- RestaurantIQ Enterprise Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. SUPPLIERS
-- ============================================
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  tax_number text,
  payment_terms text default 'net_30',
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============================================
-- 2. UPGRADE INVENTORY ITEMS
-- ============================================
alter table inventory_items
  add column if not exists supplier_id uuid references suppliers(id) on delete set null,
  add column if not exists barcode text,
  add column if not exists storage_location text,
  add column if not exists expiry_days int,
  add column if not exists notes text;

-- ============================================
-- 3. INVENTORY MOVEMENTS (replaces basic transactions)
-- ============================================
create table if not exists inventory_movements (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  inventory_id uuid references inventory_items(id) on delete cascade not null,
  reason text not null check (reason in (
    'purchase','recipe_consumption','prep_production',
    'waste','spoilage','expired','staff_meal',
    'complimentary','manual_adjustment','transfer',
    'stock_count','vendor_return'
  )),
  quantity numeric not null, -- positive = in, negative = out
  unit_cost numeric,
  total_cost numeric,
  stock_before numeric not null default 0,
  stock_after numeric not null default 0,
  reference_id uuid, -- order_id, purchase_order_id, prep_batch_id
  reference_type text, -- 'order','purchase_order','prep_batch'
  performed_by uuid references users(id) on delete set null,
  notes text,
  recorded_at timestamptz default now()
);

-- ============================================
-- 4. PURCHASE ORDERS
-- ============================================
create table if not exists purchase_orders (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  supplier_id uuid references suppliers(id) on delete set null,
  po_number text not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','received','cancelled')),
  expected_delivery date,
  received_at timestamptz,
  subtotal numeric default 0,
  tax numeric default 0,
  discount numeric default 0,
  shipping numeric default 0,
  total numeric default 0,
  notes text,
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists purchase_order_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_order_id uuid references purchase_orders(id) on delete cascade not null,
  inventory_id uuid references inventory_items(id) on delete set null,
  item_name text not null,
  quantity_ordered numeric not null,
  quantity_received numeric default 0,
  unit text not null,
  unit_cost numeric not null,
  tax_rate numeric default 0,
  discount numeric default 0,
  total numeric not null,
  notes text
);

-- ============================================
-- 5. PREP BATCHES
-- ============================================
create table if not exists prep_batches (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  batch_number text not null,
  inventory_id uuid references inventory_items(id) on delete set null,
  date date not null default current_date,
  raw_quantity numeric not null,
  usable_quantity numeric not null,
  waste_quantity numeric not null default 0,
  yield_percentage numeric not null default 100,
  performed_by uuid references users(id) on delete set null,
  notes text,
  created_at timestamptz default now()
);

-- ============================================
-- 6. RECIPE MANAGEMENT
-- ============================================
-- Extended menu_items columns
alter table menu_items
  add column if not exists prep_time int default 0,
  add column if not exists cook_time int default 0,
  add column if not exists portion_size numeric,
  add column if not exists portion_unit text,
  add column if not exists difficulty text check (difficulty in ('easy','medium','hard')),
  add column if not exists allergens text[] default '{}',
  add column if not exists notes text,
  add column if not exists current_version int default 1;

-- Recipe versions (for historical accuracy)
create table if not exists recipe_versions (
  id uuid primary key default uuid_generate_v4(),
  menu_item_id uuid references menu_items(id) on delete cascade not null,
  version_number int not null,
  selling_price numeric not null,
  created_at timestamptz default now(),
  created_by uuid references users(id) on delete set null,
  is_current boolean default true
);

-- Recipe ingredients
create table if not exists recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  recipe_version_id uuid references recipe_versions(id) on delete cascade not null,
  inventory_id uuid references inventory_items(id) on delete set null,
  ingredient_name text not null,
  quantity numeric not null,
  unit text not null,
  prep_notes text,
  is_optional boolean default false,
  waste_percentage numeric default 0,
  yield_percentage numeric default 100
);

-- Recipe instructions
create table if not exists recipe_instructions (
  id uuid primary key default uuid_generate_v4(),
  recipe_version_id uuid references recipe_versions(id) on delete cascade not null,
  step_number int not null,
  title text not null,
  description text not null,
  duration_minutes int,
  image_url text
);

-- Link order_items to recipe version used at time of sale
alter table order_items
  add column if not exists recipe_version_id uuid references recipe_versions(id) on delete set null;

-- ============================================
-- 7. INDEXES
-- ============================================
create index if not exists idx_inventory_movements_inventory on inventory_movements(inventory_id);
create index if not exists idx_inventory_movements_restaurant on inventory_movements(restaurant_id);
create index if not exists idx_inventory_movements_recorded on inventory_movements(recorded_at);
create index if not exists idx_purchase_orders_restaurant on purchase_orders(restaurant_id);
create index if not exists idx_purchase_orders_status on purchase_orders(status);
create index if not exists idx_recipe_versions_menu_item on recipe_versions(menu_item_id);
create index if not exists idx_recipe_ingredients_version on recipe_ingredients(recipe_version_id);
create index if not exists idx_prep_batches_restaurant on prep_batches(restaurant_id);
create index if not exists idx_suppliers_restaurant on suppliers(restaurant_id);

-- ============================================
-- 8. ROW LEVEL SECURITY
-- ============================================
alter table suppliers enable row level security;
alter table inventory_movements enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table prep_batches enable row level security;
alter table recipe_versions enable row level security;
alter table recipe_ingredients enable row level security;
alter table recipe_instructions enable row level security;

create policy "Tenant: suppliers" on suppliers for all using (restaurant_id = get_my_restaurant_id());
create policy "Tenant: inventory_movements" on inventory_movements for all using (restaurant_id = get_my_restaurant_id());
create policy "Tenant: purchase_orders" on purchase_orders for all using (restaurant_id = get_my_restaurant_id());
create policy "Tenant: purchase_order_items" on purchase_order_items for all using (
  purchase_order_id in (select id from purchase_orders where restaurant_id = get_my_restaurant_id())
);
create policy "Tenant: prep_batches" on prep_batches for all using (restaurant_id = get_my_restaurant_id());
create policy "Tenant: recipe_versions" on recipe_versions for all using (
  menu_item_id in (select id from menu_items where restaurant_id = get_my_restaurant_id())
);
create policy "Tenant: recipe_ingredients" on recipe_ingredients for all using (
  recipe_version_id in (
    select rv.id from recipe_versions rv
    join menu_items mi on rv.menu_item_id = mi.id
    where mi.restaurant_id = get_my_restaurant_id()
  )
);
create policy "Tenant: recipe_instructions" on recipe_instructions for all using (
  recipe_version_id in (
    select rv.id from recipe_versions rv
    join menu_items mi on rv.menu_item_id = mi.id
    where mi.restaurant_id = get_my_restaurant_id()
  )
);

-- ============================================
-- 9. AUTO-DEDUCT INVENTORY ON ORDER COMPLETION
-- This function fires when an order status changes to 'completed'
-- ============================================
create or replace function handle_order_completion()
returns trigger as $$
declare
  v_order_item record;
  v_ingredient record;
  v_stock_before numeric;
  v_stock_after numeric;
  v_deduct numeric;
begin
  -- Only fire when status changes TO 'completed'
  if new.status = 'completed' and old.status != 'completed' then
    -- Loop through every item in this order
    for v_order_item in
      select oi.*, oi.recipe_version_id
      from order_items oi
      where oi.order_id = new.id
    loop
      -- If no recipe version linked, skip
      if v_order_item.recipe_version_id is null then
        continue;
      end if;

      -- Loop through every ingredient in the recipe
      for v_ingredient in
        select ri.*
        from recipe_ingredients ri
        where ri.recipe_version_id = v_order_item.recipe_version_id
        and ri.is_optional = false
        and ri.inventory_id is not null
      loop
        -- Calculate actual deduction accounting for waste and yield
        v_deduct := (v_ingredient.quantity * (1 + v_ingredient.waste_percentage / 100))
                    / (v_ingredient.yield_percentage / 100)
                    * v_order_item.quantity;

        -- Get current stock
        select current_stock into v_stock_before
        from inventory_items where id = v_ingredient.inventory_id;

        v_stock_after := greatest(0, v_stock_before - v_deduct);

        -- Deduct from inventory
        update inventory_items
        set current_stock = v_stock_after, last_updated = now()
        where id = v_ingredient.inventory_id;

        -- Record movement
        insert into inventory_movements (
          restaurant_id, inventory_id, reason, quantity,
          stock_before, stock_after,
          reference_id, reference_type, notes
        ) values (
          new.restaurant_id, v_ingredient.inventory_id,
          'recipe_consumption', -v_deduct,
          v_stock_before, v_stock_after,
          new.id, 'order',
          'Auto-deducted: Order ' || new.id
        );
      end loop;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to orders table
drop trigger if exists on_order_completed on orders;
create trigger on_order_completed
  after update on orders
  for each row execute function handle_order_completion();

-- ============================================
-- 10. AUTO-GENERATE PO NUMBER
-- ============================================
create or replace function generate_po_number(p_restaurant_id uuid)
returns text as $$
declare
  v_count int;
begin
  select count(*) + 1 into v_count
  from purchase_orders
  where restaurant_id = p_restaurant_id;
  return 'PO-' || to_char(now(), 'YYYY') || '-' || lpad(v_count::text, 4, '0');
end;
$$ language plpgsql security definer;
