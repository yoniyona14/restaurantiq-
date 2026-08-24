// ============================================
// RestaurantIQ — Global Types
// ============================================

export type UserRole = 'owner' | 'manager' | 'cashier' | 'kitchen'
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type PaymentMethod = 'cash' | 'telebirr' | 'cbe_birr' | 'bank_transfer'
export type MenuCategory = 'food' | 'drinks' | 'desserts' | 'specials'

export interface Restaurant {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'growth' | 'multi'
  timezone: string
  logo_url?: string
  address?: string
  phone?: string
  created_at: string
}

export interface User {
  id: string
  restaurant_id: string
  name: string
  email: string
  role: UserRole
  salary?: number
  phone?: string
  avatar_url?: string
  created_at: string
}

export interface MenuCategoryRecord {
  id: string
  restaurant_id: string
  name: string
  sort_order: number
}

export interface MenuItem {
  id: string
  restaurant_id: string
  category_id: string
  category?: MenuCategoryRecord
  name: string
  description?: string
  price: number
  image_url?: string
  is_available: boolean
  sales_count: number
  created_at: string
}

export interface Customer {
  id: string
  restaurant_id: string
  name: string
  phone?: string
  email?: string
  visit_count: number
  total_spent: number
  last_visit?: string
  created_at: string
}

export interface RestaurantTable {
  id: string
  restaurant_id: string
  table_number: number
  qr_code?: string
  status: 'available' | 'occupied' | 'reserved'
}

export interface Order {
  id: string
  restaurant_id: string
  cashier_id: string
  cashier?: User
  customer_id?: string
  customer?: Customer
  table_id?: string
  table?: RestaurantTable
  status: OrderStatus
  subtotal: number
  tax: number
  discount: number
  total: number
  notes?: string
  items?: OrderItem[]
  payments?: Payment[]
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  menu_item?: MenuItem
  quantity: number
  unit_price: number
  subtotal: number
  notes?: string
}

export interface Payment {
  id: string
  order_id: string
  method: PaymentMethod
  amount: number
  reference?: string
  paid_at: string
}

export interface InventoryItem {
  id: string
  restaurant_id: string
  name: string
  unit: string
  current_stock: number
  reorder_level: number
  unit_cost: number
  category?: string
  last_updated: string
}

export interface InventoryTransaction {
  id: string
  inventory_id: string
  inventory_item?: InventoryItem
  type: 'purchase' | 'usage' | 'waste' | 'adjustment'
  quantity: number
  unit_cost?: number
  notes?: string
  recorded_at: string
}

export interface StaffMember {
  id: string
  restaurant_id: string
  name: string
  email: string
  role: UserRole
  salary: number
  phone?: string
  avatar_url?: string
  orders_count?: number
  revenue_generated?: number
  created_at: string
}

// ---- Analytics Types ----

export interface DashboardSummary {
  today_revenue: number
  today_orders: number
  today_avg_order: number
  weekly_revenue: number
  monthly_revenue: number
  monthly_profit: number
  best_selling_item: string
  worst_selling_item: string
  low_stock_count: number
  revenue_trend: number // % change vs yesterday
  weekly_trend: number  // % change vs last week
}

export interface RevenueDataPoint {
  date: string
  revenue: number
  orders: number
  profit?: number
}

export interface ProductStat {
  id: string
  name: string
  category: string
  orders: number
  revenue: number
  trend: number // % change week-over-week
}

export interface StaffStat {
  id: string
  name: string
  role: UserRole
  orders: number
  revenue: number
  productivity_score: number
}

export interface HeatmapCell {
  day: number   // 0=Sun … 6=Sat
  hour: number  // 0-23
  value: number // order count
}

export interface SmartInsight {
  id: string
  type: 'positive' | 'warning' | 'danger' | 'info'
  message: string
  created_at: string
}

// ---- POS Cart Types ----

export interface CartItem {
  menu_item: MenuItem
  quantity: number
  notes?: string
}

export interface Cart {
  items: CartItem[]
  customer?: Customer
  table?: RestaurantTable
  discount: number
  payment_method: PaymentMethod
}
