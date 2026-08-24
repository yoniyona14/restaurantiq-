// types/enterprise.ts — Enterprise feature types

// ============================================
// SUPPLIERS
// ============================================
export interface Supplier {
  id: string
  restaurant_id: string
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  tax_number?: string
  payment_terms?: string
  notes?: string
  is_active: boolean
  created_at: string
  // computed
  total_orders?: number
  total_spent?: number
}

// ============================================
// INVENTORY MOVEMENTS
// ============================================
export type MovementReason =
  | 'purchase'
  | 'recipe_consumption'
  | 'prep_production'
  | 'waste'
  | 'spoilage'
  | 'expired'
  | 'staff_meal'
  | 'complimentary'
  | 'manual_adjustment'
  | 'transfer'
  | 'stock_count'
  | 'vendor_return'

export const MOVEMENT_REASONS: { value: MovementReason; label: string; sign: 1 | -1 }[] = [
  { value: 'purchase',           label: 'Purchase',            sign: 1  },
  { value: 'recipe_consumption', label: 'Recipe Consumption',  sign: -1 },
  { value: 'prep_production',    label: 'Prep Production',     sign: -1 },
  { value: 'waste',              label: 'Waste',               sign: -1 },
  { value: 'spoilage',           label: 'Spoilage',            sign: -1 },
  { value: 'expired',            label: 'Expired',             sign: -1 },
  { value: 'staff_meal',         label: 'Staff Meal',          sign: -1 },
  { value: 'complimentary',      label: 'Complimentary Meal',  sign: -1 },
  { value: 'manual_adjustment',  label: 'Manual Adjustment',   sign:  1 },
  { value: 'transfer',           label: 'Transfer',            sign: -1 },
  { value: 'stock_count',        label: 'Stock Count',         sign:  1 },
  { value: 'vendor_return',      label: 'Vendor Return',       sign:  1 },
]

export interface InventoryMovement {
  id: string
  restaurant_id: string
  inventory_id: string
  inventory_item?: { name: string; unit: string }
  reason: MovementReason
  quantity: number
  unit_cost?: number
  total_cost?: number
  stock_before: number
  stock_after: number
  reference_id?: string
  reference_type?: string
  performed_by?: string
  performer?: { name: string }
  notes?: string
  recorded_at: string
}

// ============================================
// PURCHASE ORDERS
// ============================================
export type POStatus = 'draft' | 'submitted' | 'approved' | 'received' | 'cancelled'

export interface PurchaseOrderItem {
  id?: string
  purchase_order_id?: string
  inventory_id?: string
  inventory_item?: { name: string; unit: string }
  item_name: string
  quantity_ordered: number
  quantity_received: number
  unit: string
  unit_cost: number
  tax_rate: number
  discount: number
  total: number
  notes?: string
}

export interface PurchaseOrder {
  id: string
  restaurant_id: string
  supplier_id?: string
  supplier?: Supplier
  po_number: string
  status: POStatus
  expected_delivery?: string
  received_at?: string
  subtotal: number
  tax: number
  discount: number
  shipping: number
  total: number
  notes?: string
  created_by?: string
  creator?: { name: string }
  items?: PurchaseOrderItem[]
  created_at: string
  updated_at: string
}

// ============================================
// PREP BATCHES
// ============================================
export interface PrepBatch {
  id: string
  restaurant_id: string
  batch_number: string
  inventory_id?: string
  inventory_item?: { name: string; unit: string }
  date: string
  raw_quantity: number
  usable_quantity: number
  waste_quantity: number
  yield_percentage: number
  performed_by?: string
  performer?: { name: string }
  notes?: string
  created_at: string
}

// ============================================
// RECIPE MANAGEMENT
// ============================================
export interface RecipeIngredient {
  id?: string
  recipe_version_id?: string
  inventory_id?: string
  inventory_item?: { name: string; unit: string; unit_cost: number }
  ingredient_name: string
  quantity: number
  unit: string
  prep_notes?: string
  is_optional: boolean
  waste_percentage: number
  yield_percentage: number
  // computed
  cost_contribution?: number
}

export interface RecipeInstruction {
  id?: string
  recipe_version_id?: string
  step_number: number
  title: string
  description: string
  duration_minutes?: number
  image_url?: string
}

export interface RecipeVersion {
  id: string
  menu_item_id: string
  version_number: number
  selling_price: number
  created_at: string
  created_by?: string
  is_current: boolean
  ingredients?: RecipeIngredient[]
  instructions?: RecipeInstruction[]
  // computed
  ingredient_cost?: number
  total_cost?: number
  gross_profit?: number
  profit_margin?: number
  food_cost_pct?: number
}

export interface Recipe {
  id: string // menu_item id
  restaurant_id: string
  name: string
  category_id?: string
  description?: string
  image_url?: string
  price: number
  is_available: boolean
  prep_time?: number
  cook_time?: number
  portion_size?: number
  portion_unit?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  allergens?: string[]
  notes?: string
  current_version?: number
  versions?: RecipeVersion[]
  current_recipe?: RecipeVersion
}

// ============================================
// BUSINESS HEALTH
// ============================================
export type HealthSeverity = 'info' | 'warning' | 'critical' | 'positive'

export interface HealthInsight {
  id: string
  title: string
  severity: HealthSeverity
  category: 'inventory' | 'kitchen' | 'profitability' | 'purchasing' | 'waste' | 'recipe' | 'cost'
  impact: string
  why: string
  metric?: string
  action: string
  link?: string
}
